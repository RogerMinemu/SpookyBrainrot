"""In-app QR camera: the phone sends {"t": "scan", token} over /ws and gets the /k/<token> outcome back, to itself only."""
from app.content import CAMEOS
from app.core import brainrot
from app.core.game import PHASE_PUZZLE, PHASE_UNLOCKED
from tests.test_k_route import running_game, tokens
from tests.test_realtime_ws import drain, env, of, phone, recv, tv_socket


def scan(ws, token):
    ws.send_text(env("scan", {"token": token}))
    got = drain(ws)
    replies = of(got, "scan")
    assert len(replies) == 1, got
    return replies[0]["payload"], got


def test_right_anchor_unlocks_and_answers_the_scanner(client):
    rt, tok = running_game(client)
    anchors, _ = tokens(client)
    rt.game.room_idx -= 1  # not the last room: the door opens instead of the ending
    rt.persist()
    with phone(client, tok) as a:
        drain(a)
        reply, got = scan(a, anchors[rt.game.room.anchor])
        assert reply == {"result": "unlocked", "cameo": None}
        assert rt.game.phase == PHASE_UNLOCKED
        # the new phase reaches the phone before the answer, plus the usual anchor event
        assert [m["t"] for m in got].index("state") < [m["t"] for m in got].index("scan")
        assert "anchor_unlocked" in [m["payload"]["name"] for m in of(got, "event")]


def test_last_anchor_finishes_then_is_already_done(client):
    rt, tok = running_game(client)
    anchors, _ = tokens(client)
    with phone(client, tok) as a:
        drain(a)
        assert scan(a, anchors[6])[0]["result"] == "finished" and rt.game.status == "finished"
        assert scan(a, anchors[6])[0]["result"] == "already_done"


def test_anchor_sleeps_outside_its_search_phase(client):
    rt, tok = running_game(client, PHASE_PUZZLE)
    anchors, _ = tokens(client)
    with phone(client, tok) as a:
        drain(a)
        assert scan(a, anchors[6])[0]["result"] == "sleeping"
        assert scan(a, anchors[3])[0]["result"] == "already_done"  # an earlier room's anchor
        assert rt.game.phase == PHASE_PUZZLE and rt.game.brainrot == 0


def test_decoy_names_its_cameo_once_then_laughs(client):
    rt, tok = running_game(client)
    _, decoys = tokens(client)
    with phone(client, tok) as a:
        drain(a)
        reply, got = scan(a, decoys[3])
        assert reply == {"result": "jumpscare", "cameo": CAMEOS[2]}
        assert rt.game.brainrot == brainrot.DECOY_PENALTY
        assert "toast" in [m["payload"]["name"] for m in of(got, "event")]
        assert scan(a, decoys[3])[0]["result"] == "laugh" and rt.game.brainrot == brainrot.DECOY_PENALTY


def test_unknown_or_malformed_tokens_change_nothing(client):
    rt, tok = running_game(client)
    with phone(client, tok) as a:
        drain(a)
        seq = rt.game.seq
        for bad in ("NOPE", "", "X" * 65, 42, None, ["A"]):
            assert scan(a, bad)[0] == {"result": "unknown"}, bad
        assert rt.game.seq == seq and rt.game.status == "running"


def test_only_players_scan_and_the_answer_is_private(client):
    rt, tok = running_game(client)
    anchors, _ = tokens(client)
    with tv_socket(client, rt.game.id) as tv, phone(client, tok) as a:
        drain(tv), drain(a)
        tv.send_text(env("scan", {"token": anchors[6]}))
        err = recv(tv)
        assert err["t"] == "error" and err["payload"]["code"] == "not_player"
        assert rt.game.status == "running"
        scan(a, anchors[6])
        assert not of(drain(tv), "scan")  # the TV sees the state and the events, never the scan answer
