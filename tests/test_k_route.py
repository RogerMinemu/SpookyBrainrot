"""/k/<token> over HTTP: each scan outcome, applied under the runtime lock, WS pushes."""
import json

from app.content import CAMEOS
from app.core import brainrot
from app.core.game import PHASE_PUZZLE, PHASE_SEARCH, STATUS_RUNNING
from tests.test_room0_ws import env, hello, next_of, recv, state_until


def tokens(client):
    entries = client.app.state.qr_repo.entries()
    anchors = {e.idx: e.token for e in entries if e.kind == "anchor"}
    decoys = {e.idx: e.token for e in entries if e.kind == "decoy"}
    return anchors, decoys


def running_game(client, phase=PHASE_SEARCH, name="G"):
    g = client.post("/api/games", json={"name": name}).json()
    tok = client.post("/api/join", json={"code": g["code"], "name": "Ana"}).json()["token"]
    rt = client.app.state.manager.get(g["id"])
    rt.game.status = STATUS_RUNNING
    rt.game.room_idx = 1
    rt.game.phase = phase
    rt.persist()
    return rt, tok


def test_unknown_token_404_no_state_change(client):
    rt, _ = running_game(client)
    seq = rt.game.seq
    r = client.get("/k/NOPE")
    assert r.status_code == 404 and "text/html" in r.headers["content-type"]
    assert rt.game.seq == seq and rt.game.phase == PHASE_SEARCH


def test_no_game_page(client):
    anchors, _ = tokens(client)
    r = client.get(f"/k/{anchors[2]}")
    assert r.status_code == 200 and "No hay ninguna partida" in r.text


def test_anchor_sleeping_when_puzzle_active(client):
    rt, _ = running_game(client, PHASE_PUZZLE)
    anchors, _ = tokens(client)
    r = client.get(f"/k/{anchors[2]}")
    assert "aún duerme" in r.text
    assert rt.game.brainrot == 0 and rt.game.status == STATUS_RUNNING


def test_anchor_unlocks_and_ends_game_then_idempotent(client):
    rt, tok = running_game(client)
    anchors, _ = tokens(client)
    client.cookies.set("sb_pt", tok)
    r = client.get(f"/k/{anchors[2]}")
    assert "Ancla encontrada" in r.text and rt.game.status == "finished"
    assert "ya está estable" in client.get(f"/k/{anchors[2]}").text
    assert client.get(f"/k/{anchors[2]}").status_code == 200  # still harmless


def test_decoy_penalty_once_then_laugh(client):
    rt, _ = running_game(client)
    _, decoys = tokens(client)
    first = client.get(f"/k/{decoys[1]}")
    assert CAMEOS[0] in first.text and rt.game.brainrot == brainrot.DECOY_PENALTY
    second = client.get(f"/k/{decoys[1]}")
    assert "Ja, ja" in second.text and rt.game.brainrot == brainrot.DECOY_PENALTY


def test_two_games_no_cookie_lists_then_cookie_or_g_resolves(client):
    rt_a, tok_a = running_game(client, name="A")
    rt_b, tok_b = running_game(client, name="B")
    anchors, _ = tokens(client)
    url = f"/k/{anchors[2]}"
    client.cookies.clear()
    r = client.get(url)
    assert f"?g={rt_a.game.id}" in r.text and f"?g={rt_b.game.id}" in r.text
    assert rt_a.game.status == STATUS_RUNNING and rt_b.game.status == STATUS_RUNNING
    # cookie of game B -> resolves B
    client.cookies.set("sb_pt", tok_b)
    client.get(url)
    assert rt_b.game.status == "finished" and rt_a.game.status == STATUS_RUNNING
    # explicit ?g= for A
    client.cookies.clear()
    client.get(f"{url}?g={rt_a.game.id}")
    assert rt_a.game.status == "finished"


def test_decoy_pushes_jumpscare_to_tv_only(client):
    rt, tok = running_game(client)
    _, decoys = tokens(client)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as ph:
        hello(tv, {"role": "tv", "game_id": rt.game.id})
        hello(ph, {"role": "player", "player_token": tok})
        state_until(tv, lambda p: True)
        client.get(f"/k/{decoys[2]}")
        ev = next_of(tv, "event")
        names = []
        while ev["payload"]["name"] != "jumpscare":
            names.append(ev["payload"]["name"])
            ev = next_of(tv, "event")
        assert ev["payload"]["data"]["cameo"] == CAMEOS[1]
        # the player gets the toast but no jumpscare
        seen = []
        for _ in range(10):
            m = recv(ph)
            if m["t"] == "event":
                seen.append(m["payload"]["name"])
                if m["payload"]["name"] == "toast":
                    break
        assert "jumpscare" not in seen and "toast" in seen


def test_anchor_pushes_anchor_unlocked(client):
    rt, tok = running_game(client)
    anchors, _ = tokens(client)
    with client.websocket_connect("/ws") as tv:
        hello(tv, {"role": "tv", "game_id": rt.game.id})
        state_until(tv, lambda p: True)
        client.get(f"/k/{anchors[2]}")
        assert next_of(tv, "event")["payload"]["name"] == "anchor_unlocked"
