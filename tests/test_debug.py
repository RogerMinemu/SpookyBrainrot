"""Host debug toggle: engine commands, /admin/api debug endpoints, ADMIN_KEY protection, UI hooks."""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import create_app
from app.content import CAMEOS
from app.core import brainrot
from app.core.engine import (
    Advance,
    DebugComplete,
    DebugEvent,
    DebugJump,
    DebugReset,
    DebugSetBrainrot,
    Engine,
)
from app.core.game import (
    PHASE_INTRO,
    PHASE_PUZZLE,
    PHASE_SEARCH,
    PHASE_UNLOCKED,
    STATUS_FINISHED,
    STATUS_LOBBY,
    STATUS_RUNNING,
    Game,
    Player,
)
from app.puzzles import build_registry
from tests.conftest import make_settings
from tests.fakes import FakeClock, seeded_rng

STATIC = Path(__file__).resolve().parent.parent / "static"


# --- engine level ---------------------------------------------------------------------
def make_game(n=2):
    g = Game(id="g1", code="ABCD", name="G")
    for i in range(n):
        g.players.append(Player(f"p{i}", f"P{i}", True))
    return g


def make_engine():
    return Engine(build_registry(), FakeClock(), seeded_rng(), min_players=1)


def test_jump_to_each_room_and_phase():
    e, g = make_engine(), make_game()
    rooms = [(0, "intro"), (0, "puzzle"), (0, "unlocked"), (1, "puzzle"), (1, "unlocked"), (2, "intro"),
             (2, "puzzle"), (2, "search"), (6, "intro"), (6, "puzzle"), (6, "search")]
    for room, phase in rooms:
        out = e.apply(g, DebugJump(room, phase))
        assert out.ok and out.changed, (room, phase)
        assert g.room_no == room and g.phase == phase and g.status == STATUS_RUNNING
        assert (g.puzzle_id is not None) == (phase == PHASE_PUZZLE)


def test_jump_default_phase_is_intro():
    e, g = make_engine(), make_game()
    assert e.apply(g, DebugJump(2)).ok
    assert g.phase == PHASE_INTRO and g.room_no == 2


def test_jump_to_puzzle_reinitializes_state():
    e, g = make_engine(), make_game()
    e.apply(g, DebugJump(1, "puzzle"))
    first = g.puzzle_state
    first.level = 3
    e.apply(g, DebugJump(1, "puzzle"))
    assert g.puzzle_state is not first and g.puzzle_state.level == 0
    # leaving the puzzle drops its state, and Room 0 gets its own fresh state
    e.apply(g, DebugJump(0, "intro"))
    assert g.puzzle_id is None and g.puzzle_state is None
    e.apply(g, DebugJump(0, "puzzle"))
    assert g.puzzle_id == "hold_together" and g.puzzle_state is not None


def test_jump_puzzle_with_nobody_connected_still_starts():
    e, g = make_engine(), make_game()
    for p in g.players:
        p.connected = False
    assert e.apply(g, DebugJump(2, "puzzle")).ok
    assert g.puzzle_state is not None


def test_jump_lobby_and_ending():
    e, g = make_engine(), make_game()
    g.brainrot = 55
    e.apply(g, DebugJump(2, "puzzle"))
    assert e.apply(g, DebugJump("ending")).ok
    assert g.status == STATUS_FINISHED and g.puzzle_id is None
    assert g.ending["band"] == brainrot.band(55) and g.ending["brainrot"] == 55
    # leaving the ending clears it
    assert e.apply(g, DebugJump(0, "intro")).ok
    assert g.status == STATUS_RUNNING and g.ending is None
    assert e.apply(g, DebugJump("lobby")).ok
    assert g.status == STATUS_LOBBY and g.room_idx == 0 and g.phase == PHASE_INTRO
    assert g.brainrot == 55  # a jump never touches the meter


@pytest.mark.parametrize(
    "room,phase,code",
    [
        (9, None, "unknown_room"),
        ("nope", None, "unknown_room"),
        (True, None, "unknown_room"),
        (None, None, "unknown_room"),
        (0, "bogus", "unknown_phase"),
        (0, "search", "unknown_phase"),  # Room 0 has no anchor
        (6, "unlocked", "unknown_phase"),  # the last room ends via the ending
        ("lobby", "puzzle", "unknown_phase"),
        ("ending", "intro", "unknown_phase"),
    ],
)
def test_jump_validation(room, phase, code):
    e, g = make_engine(), make_game()
    e.apply(g, DebugJump(2, "puzzle"))
    before = (g.room_idx, g.phase, g.status, g.puzzle_state)
    out = e.apply(g, DebugJump(room, phase))
    assert out.error and out.error[0] == code and not out.changed
    assert (g.room_idx, g.phase, g.status, g.puzzle_state) == before


def test_complete_current_puzzle():
    e, g = make_engine(), make_game()
    e.apply(g, DebugJump(2, "puzzle"))
    out = e.apply(g, DebugComplete())
    assert out.ok and g.phase == PHASE_SEARCH and g.puzzle_id is None
    assert ("puzzle_solved", {"room_no": 2}, "all") in out.events
    e.apply(g, DebugJump(0, "puzzle"))
    assert e.apply(g, DebugComplete()).ok and g.phase == PHASE_UNLOCKED
    # then the normal flow continues
    assert e.apply(g, Advance()).ok and g.room_no == 1


def test_jump_to_sub_level():
    e, g = make_engine(), make_game()
    assert e.apply(g, DebugJump(1, "puzzle", level=2)).ok
    assert g.puzzle_state.level == 2 and g.puzzle_state.epoch == 2  # jumping restarts the TV sim
    assert e.apply(g, DebugJump(6, "puzzle", level=1)).ok  # Room 6: Sahur's platformer levels
    assert g.puzzle_id == "sahur_platformer" and g.puzzle_state.level == 1 and g.puzzle_state.epoch == 2
    assert e.apply(g, DebugJump(1, "puzzle", level=0)).ok and g.puzzle_state.level == 0


@pytest.mark.parametrize(
    "room,phase,level",
    [(1, "puzzle", 4), (1, "puzzle", -1), (1, "puzzle", "2"), (1, "puzzle", True), (1, "puzzle", 1.5),
     (6, "puzzle", 5), (2, "puzzle", 0), (0, "puzzle", 0), (1, "intro", 0), (1, None, 0),
     ("lobby", None, 0), ("ending", None, 0)],
)
def test_jump_bad_level_is_rejected_without_mutation(room, phase, level):
    e, g = make_engine(), make_game()
    e.apply(g, DebugJump(1, "puzzle", level=1))
    snap = (g.room_idx, g.phase, g.status, g.puzzle_id, g.puzzle_state, g.seq)
    state = e.puzzles["coop_platformer"].serialize(g.puzzle_state)
    out = e.apply(g, DebugJump(room, phase, level))
    assert out.error and out.error[0] == "unknown_level" and not out.changed
    assert (g.room_idx, g.phase, g.status, g.puzzle_id, g.puzzle_state, g.seq) == snap
    assert e.puzzles["coop_platformer"].serialize(g.puzzle_state) == state


def test_complete_without_puzzle_rejected():
    e, g = make_engine(), make_game()
    out = e.apply(g, DebugComplete())
    assert out.error and out.error[0] == "no_puzzle" and not out.changed


@pytest.mark.parametrize("value,expected", [(0, 0), (37, 37), (100, 100), (250, 100), (-5, 0), (42.5, 42.5)])
def test_set_brainrot_clamps(value, expected):
    e, g = make_engine(), make_game()
    out = e.apply(g, DebugSetBrainrot(value))
    assert out.ok and out.changed and g.brainrot == expected
    assert g.brainrot_log[-1]["reason"] == "debug"


@pytest.mark.parametrize("bad", ["50", None, True, float("nan"), float("inf"), [1], {}])
def test_set_brainrot_rejects_non_numbers(bad):
    e, g = make_engine(), make_game()
    g.brainrot = 12
    out = e.apply(g, DebugSetBrainrot(bad))
    assert out.error and out.error[0] == "bad_value" and g.brainrot == 12


def test_set_brainrot_drives_degradation_levels():
    levels = []
    for v in (0, 20, 40, 60, 80, 100):
        e, g = make_engine(), make_game()
        e.apply(g, DebugSetBrainrot(v))
        levels.append(brainrot.degradation_level(g.brainrot))
    assert levels == [0, 1, 2, 3, 4, 5]


def test_events_use_the_normal_channel_without_changing_state():
    e, g = make_engine(), make_game()
    snap = g.serialize_state(e.puzzles)
    out = e.apply(g, DebugEvent("jumpscare", CAMEOS[2]))
    assert out.ok and not out.changed
    assert out.events == [("jumpscare", {"decoy": 3, "cameo": CAMEOS[2]}, "tv")]
    assert e.apply(g, DebugEvent("jumpscare")).events[0][1]["cameo"] == "???"  # the default
    assert e.apply(g, DebugEvent("splash")).events[0][0] == "splash"
    failed = e.apply(g, DebugEvent("round_failed")).events[0][1]
    assert failed["penalty"] == brainrot.ROUND_FAIL_PENALTY and failed["title"] and failed["text"]
    assert e.apply(g, DebugEvent("anchor_unlocked")).events[0][0] == "anchor_unlocked"
    assert g.serialize_state(e.puzzles) == snap


def test_events_validation():
    e, g = make_engine(), make_game()
    assert e.apply(g, DebugEvent("nuke")).error[0] == "unknown_event"
    assert e.apply(g, DebugEvent("jumpscare", "Nadie")).error[0] == "unknown_cameo"


def test_reset_keeps_players_and_clears_progress():
    e, g = make_engine(), make_game(3)
    e.apply(g, DebugJump(2, "puzzle"))
    g.brainrot, g.decoys_hit, g.clock_ms = 70, [1, 2], 9000
    g.brainrot_log.append({"amount": 1, "reason": "x", "total": 70})
    out = e.apply(g, DebugReset())
    assert out.ok and out.changed
    assert [p.id for p in g.players] == ["p0", "p1", "p2"] and all(p.connected for p in g.players)
    assert (g.status, g.room_idx, g.phase) == (STATUS_LOBBY, 0, PHASE_INTRO)
    assert g.puzzle_id is None and g.puzzle_state is None and g.ending is None
    assert g.brainrot == 0 and g.brainrot_log == [] and g.decoys_hit == [] and g.clock_ms == 0
    assert e.apply(g, Advance()).ok and g.phase == PHASE_INTRO  # the game is playable again: prologue,
    assert e.apply(g, Advance()).ok and g.phase == PHASE_PUZZLE  # then room 0


def test_debug_rooms_listing():
    rooms = make_engine().debug_rooms()
    assert [r["key"] for r in rooms] == ["lobby", 0, 1, 2, 3, 4, 5, 6, "ending"]
    assert rooms[1]["phases"] == ["intro", "puzzle", "unlocked"]
    assert rooms[2]["phases"] == ["intro", "puzzle", "search", "unlocked"]
    assert rooms[7]["phases"] == ["intro", "puzzle", "search"]  # the last room ends via the ending
    # platformer levels, shape rounds, trivia "start with N right answers", Sahur's platformer levels; the bomb has none
    assert [r["levels"] for r in rooms] == [[], [], [0, 1, 2, 3], [], [0, 1, 2], [0, 1, 2, 3, 4, 5], [], [0, 1, 2, 3, 4], []]


# --- HTTP level -----------------------------------------------------------------------------
def new_game(client, players=("Ana", "Bea")):
    g = client.post("/api/games", json={"name": "G"}).json()
    for n in players:
        client.post("/api/join", json={"code": g["code"], "name": n})
    return g["id"]


def url(gid, tail=""):
    return f"/admin/api/games/{gid}/debug{tail}"


def test_info_lists_rooms_cameos_presets(client):
    gid = new_game(client)
    r = client.get(url(gid))
    assert r.status_code == 200
    d = r.json()
    assert [x["key"] for x in d["rooms"]] == ["lobby", 0, 1, 2, 3, 4, 5, 6, "ending"]
    assert d["tv_view"] is None and d["peek"] == ""
    assert d["cameos"] == CAMEOS and d["presets"] == [0, 20, 40, 60, 80, 100]
    assert d["game"]["room"] == "lobby" and d["game"]["players"] == 2


def test_games_list_has_live_and_saved(client):
    gid = new_game(client)
    rows = client.get("/admin/api/games").json()
    assert [r["id"] for r in rows] == [gid] and rows[0]["live"] is True
    assert rows[0]["room"] == "lobby" and rows[0]["code"]
    client.app.state.manager._live.clear()  # simulate a restart: only the saved row remains
    rows = client.get("/admin/api/games").json()
    assert rows[0]["id"] == gid and rows[0]["live"] is False


def test_jump_http_persists_and_changes_seq(client):
    gid = new_game(client)
    seq0 = client.get(url(gid)).json()["game"]["seq"]
    r = client.post(url(gid, "/jump"), json={"room": 1, "phase": "puzzle", "level": 2})
    assert r.status_code == 200
    d = r.json()
    assert d["room"] == 1 and d["phase"] == "puzzle" and d["seq"] > seq0
    row = client.app.state.manager.games.get(gid)
    st = json.loads(row.state_json)
    assert st["room_idx"] == 1 and st["room_no"] == 1 and st["phase"] == "puzzle"
    assert st["puzzle"]["id"] == "coop_platformer" and st["puzzle"]["state"]["level"] == 2
    rt = client.app.state.manager.get(gid)
    assert rt.state_payload("tv")["view"]["kind"] == "coop_platformer"
    assert client.get(url(gid)).json()["tv_view"]["level"] == 2
    for target, kind in [("ending", "ending"), ("lobby", "lobby")]:
        assert client.post(url(gid, "/jump"), json={"room": target}).status_code == 200
        assert rt.state_payload("tv")["view"]["kind"] == kind


def test_http_errors(client):
    gid = new_game(client)
    assert client.get(url("nope")).status_code == 404
    for tail, body in [
        ("/jump", {"room": 0}),
        ("/complete", None),
        ("/brainrot", {"value": 5}),
        ("/event", {"name": "splash"}),
        ("/reset", None),
    ]:
        r = client.post(url("nope", tail), json=body) if body is not None else client.post(url("nope", tail))
        assert r.status_code == 404, tail
    bad = [
        ("/jump", {"room": 9}),
        ("/jump", {"room": 0, "phase": "search"}),
        ("/jump", {"room": 0, "phase": "bogus"}),
        ("/jump", {"room": 1, "phase": "puzzle", "level": 9}),
        ("/jump", {"room": 1, "phase": "puzzle", "level": "x"}),
        ("/jump", {"room": 2, "phase": "puzzle", "level": 0}),
        ("/brainrot", {"value": "mucho"}),
        ("/event", {"name": "nuke"}),
        ("/event", {"name": "jumpscare", "cameo": "Nadie"}),
    ]
    for tail, body in bad:
        r = client.post(url(gid, tail), json=body)
        assert r.status_code == 422 and r.json()["detail"], (tail, body)
    assert client.post(url(gid, "/complete")).status_code == 422  # nothing to complete in the lobby
    assert client.post(url(gid, "/jump"), json={}).status_code == 422  # missing field (pydantic)


def test_bad_level_http_does_not_mutate(client):
    gid = new_game(client)
    client.post(url(gid, "/jump"), json={"room": 1, "phase": "puzzle", "level": 1})
    before = client.get(url(gid)).json()
    r = client.post(url(gid, "/jump"), json={"room": 1, "phase": "puzzle", "level": 7})
    assert r.status_code == 422
    after = client.get(url(gid)).json()
    assert after["game"] == before["game"] and after["tv_view"] == before["tv_view"]


def test_complete_http(client):
    gid = new_game(client)
    client.post(url(gid, "/jump"), json={"room": 2, "phase": "puzzle"})
    r = client.post(url(gid, "/complete"))
    assert r.status_code == 200 and r.json()["phase"] == "search"


def test_brainrot_http_is_clamped(client):
    gid = new_game(client)
    assert client.post(url(gid, "/brainrot"), json={"value": 500}).json()["brainrot"] == 100
    assert client.post(url(gid, "/brainrot"), json={"value": -3}).json()["brainrot"] == 0
    d = client.post(url(gid, "/brainrot"), json={"value": 60}).json()
    assert d["brainrot"] == 60 and d["degradation"] == 3
    rt = client.app.state.manager.get(gid)
    assert rt.state_payload("tv")["game"]["degradation"] == 3


def test_event_http_reaches_the_hub(client):
    gid = new_game(client)
    sent = []

    async def spy(rt, name, data, to):
        sent.append((name, data, to))

    client.app.state.hub.send_event = spy
    seq0 = client.get(url(gid)).json()["game"]["seq"]
    r = client.post(url(gid, "/event"), json={"name": "jumpscare", "cameo": CAMEOS[0]})
    assert r.status_code == 200 and r.json()["seq"] == seq0  # events never bump the state
    client.post(url(gid, "/event"), json={"name": "jumpscare"})
    client.post(url(gid, "/event"), json={"name": "splash"})
    client.post(url(gid, "/event"), json={"name": "round_failed"})
    client.post(url(gid, "/event"), json={"name": "anchor_unlocked"})
    assert [s[0] for s in sent] == ["jumpscare", "jumpscare", "splash", "round_failed", "anchor_unlocked"]
    assert sent[0][1]["cameo"] == CAMEOS[0] and sent[1][1]["cameo"] == "???"


def test_reset_http_keeps_players(client):
    gid = new_game(client, ("Ana", "Bea", "Cai"))
    client.post(url(gid, "/jump"), json={"room": 2, "phase": "puzzle"})
    client.post(url(gid, "/brainrot"), json={"value": 80})
    d = client.post(url(gid, "/reset")).json()
    assert d["status"] == "lobby" and d["room"] == "lobby" and d["brainrot"] == 0 and d["players"] == 3
    rt = client.app.state.manager.get(gid)
    assert [p.name for p in rt.game.players] == ["Ana", "Bea", "Cai"]
    assert len(client.app.state.manager.players.list_for_game(gid)) == 3


def test_private_views_do_not_leak_after_a_jump(client):
    gid = new_game(client, ("Ana", "Bea", "Cai"))
    rt = client.app.state.manager.get(gid)

    async def connect():
        for p in rt.game.players:
            await rt.set_presence(p.id, True)

    client.portal.call(connect)
    assert client.post(url(gid, "/jump"), json={"room": 5, "phase": "puzzle"}).status_code == 200
    s = rt.game.puzzle_state
    assert "bomb" not in rt.state_payload("tv")["view"]  # the TV never sees the bomb
    for p in rt.game.players:
        view = rt.state_payload("player", p.id)["view"]
        assert (view["bomb"] is not None) == (p.id == s.defuser), p.name  # only the defuser's phone holds it
    # the host-only debug peek shows the TV view; it never exposes tokens
    body = json.dumps(client.get(url(gid)).json()) + json.dumps(client.get("/admin/api/games").json())
    assert '"defuser"' in body and "token" not in body


# --- ADMIN_KEY ---------------------------------------------------------------------------------
def keyed_client(tmp_path, key):
    env = {"ADMIN_KEY": key} if key else {}
    return TestClient(create_app(make_settings(tmp_path, **env), FakeClock(), seeded_rng()))


DEBUG_GETS = ["/admin/debug", "/admin/api/games", "/admin/api/games/x/debug"]
DEBUG_POSTS = [
    ("/admin/api/games/x/debug/jump", {"room": 0}),
    ("/admin/api/games/x/debug/complete", None),
    ("/admin/api/games/x/debug/brainrot", {"value": 5}),
    ("/admin/api/games/x/debug/event", {"name": "splash"}),
    ("/admin/api/games/x/debug/reset", None),
]


def test_debug_open_without_admin_key(tmp_path):
    with keyed_client(tmp_path, "") as c:
        assert c.get("/admin/debug").status_code == 200
        assert c.get("/admin/api/games").status_code == 200


def test_debug_requires_admin_key(tmp_path):
    with keyed_client(tmp_path, "s3cret") as c:
        for p in DEBUG_GETS:
            assert c.get(p).status_code == 401, p
        for p, body in DEBUG_POSTS:
            assert c.post(p, json=body).status_code == 401, p
        c.cookies.set("sb_admin", "bad")
        for p in DEBUG_GETS:
            assert c.get(p).status_code == 403, p
        for p, body in DEBUG_POSTS:
            assert c.post(p, json=body).status_code == 403, p
        c.cookies.clear()
        r = c.get("/admin/debug?key=s3cret")
        assert r.status_code == 200 and "sb_admin=s3cret" in r.headers["set-cookie"]
        gid = c.post("/api/games", json={"name": "G"}).json()["id"]  # /api/games stays open
        assert c.post(f"/admin/api/games/{gid}/debug/brainrot", json={"value": 10}).status_code == 200  # cookie alone


# --- UI wiring ------------------------------------------------------------------------------------
def test_debug_page_is_art_free_and_linked(client):
    r = client.get("/admin/debug")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert r.headers["cache-control"] == "no-cache"
    assert "p5" not in r.text and "/static/js/art" not in r.text and "<canvas" not in r.text
    assert "/static/css/paper.css" in r.text and "/static/js/admin/debug.js" in r.text
    for rel in ("js/admin/debug.js", "js/admin/debug-panel.js"):
        src = (STATIC / rel).read_text(encoding="utf-8")
        assert "painter" not in src and "window.p5" not in src and "createCanvas" not in src and "/js/art/" not in src
    assert 'href="/admin/debug"' in client.get("/").text
    assert 'href="/admin/debug"' in (STATIC / "house.html").read_text(encoding="utf-8")
    assert "/admin/debug" in client.get("/admin/qr-key").text
    for path in ("/static/js/admin/debug-panel.js", "/static/css/debug.css"):
        assert client.get(path).status_code == 200


def test_tv_drawer_is_hidden_by_default_and_toggled_by_shift_d(client):
    gid = new_game(client)
    html = client.get(f"/tv/{gid}").text
    assert "debug" not in html.lower() and "dbg-" not in html  # nothing in the page itself
    main = (STATIC / "js" / "tv" / "main.js").read_text(encoding="utf-8")
    assert "shiftKey" in main and "debug-panel.js" in main and "installDrawer" in main
    panel = (STATIC / "js" / "admin" / "debug-panel.js").read_text(encoding="utf-8")
    for label in ("Saltar", "Completar puzzle", "Reiniciar al lobby", "Jumpscare", '"debug"'):
        assert label in panel, label
