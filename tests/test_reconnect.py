import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.bootstrap import create_app
from tests.fakes import FakeClock, seeded_rng


def env(t, payload=None):
    return json.dumps({"v": 1, "t": t, "payload": payload or {}})


def recv(ws):
    return json.loads(ws.receive_text())


def hello_player(ws, tok):
    ws.send_text(env("hello", {"role": "player", "player_token": tok}))
    w = recv(ws)
    assert w["t"] == "welcome"
    return w["payload"]


def next_state(ws):
    while True:
        m = recv(ws)
        if m["t"] == "state":
            return m


def presence(state, pid):
    return [p for p in state["payload"]["game"]["players"] if p["id"] == pid][0]["connected"]


def two_players(client):
    g = client.post("/api/games", json={"name": "G"}).json()
    toks = [client.post("/api/join", json={"code": g["code"], "name": n}).json()["token"] for n in ("Ana", "Bea")]
    return g, toks


def test_drop_and_return_same_player_and_presence_broadcast(client):
    g, (ta, tb) = two_players(client)
    with client.websocket_connect("/ws") as wb:
        hb = hello_player(wb, tb)
        first_b = next_state(wb)
        with client.websocket_connect("/ws") as wa:
            ha = hello_player(wa, ta)
            sa1 = next_state(wa)
            assert presence(next_state(wb), ha["player_id"]) is True
        # A dropped
        dropped = next_state(wb)
        assert presence(dropped, ha["player_id"]) is False
        # A is still in the roster (never removed)
        assert len(dropped["payload"]["game"]["players"]) == 2
        with client.websocket_connect("/ws") as wa2:
            ha2 = hello_player(wa2, ta)
            assert ha2["player_id"] == ha["player_id"] and ha2["name"] == "Ana"
            snap = next_state(wa2)  # full snapshot right away
            assert presence(snap, ha["player_id"]) is True
            assert presence(next_state(wb), ha["player_id"]) is True
        assert snap["seq"] > sa1["seq"] or snap["seq"] >= first_b["seq"]


def test_seq_increases_with_presence_changes(client):
    g, (ta, tb) = two_players(client)
    with client.websocket_connect("/ws") as wb:
        hello_player(wb, tb)
        s0 = next_state(wb)
        with client.websocket_connect("/ws") as wa:
            hello_player(wa, ta)
            s1 = next_state(wb)
        s2 = next_state(wb)
        assert s0["seq"] < s1["seq"] < s2["seq"]


def test_second_socket_for_same_player_closes_old_4001_and_stays_connected(client):
    g, (ta, _) = two_players(client)
    with client.websocket_connect("/ws") as old:
        pid = hello_player(old, ta)["player_id"]
        next_state(old)
        with client.websocket_connect("/ws") as new:
            hello_player(new, ta)
            assert presence(next_state(new), pid) is True
            with pytest.raises(WebSocketDisconnect) as ei:
                while True:
                    old.receive_text()
            assert ei.value.code == 4001
            # old handler cleanup must not flip presence off while the new socket lives
            rt = client.app.state.manager.get(g["id"])
            assert rt.game.player(pid).connected is True


def test_unknown_token_4004(client):
    two_players(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player", "player_token": "bogus"}))
        with pytest.raises(WebSocketDisconnect) as ei:
            ws.receive_text()
        assert ei.value.code == 4004


def test_players_start_disconnected_after_restart(settings):
    with TestClient(create_app(settings, FakeClock(), seeded_rng())) as c1:
        g, (ta, _) = two_players(c1)
        with c1.websocket_connect("/ws") as ws:
            hello_player(ws, ta)
            next_state(ws)
            assert c1.app.state.manager.get(g["id"]).game.players[0].connected
    with TestClient(create_app(settings, FakeClock(), seeded_rng())) as c2:
        rt = c2.app.state.manager.get(g["id"])
        assert [p.name for p in rt.game.players] == ["Ana", "Bea"]
        assert all(not p.connected for p in rt.game.players)
        with c2.websocket_connect("/ws") as ws:
            w = hello_player(ws, ta)
            assert w["name"] == "Ana"
            assert presence(next_state(ws), w["player_id"]) is True


def test_a_token_of_another_game_is_not_resumed_from_a_new_invite(client):
    """/play?code=<new game> with the cookie of an older game: 4004 (the phone shows the join form) instead of resuming."""
    g, (ta, _) = two_players(client)
    new = client.post("/api/games", json={"name": "Nueva"}).json()
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player", "player_token": ta, "code": new["code"]}))
        with pytest.raises(WebSocketDisconnect) as ei:
            ws.receive_text()
        assert ei.value.code == 4004
    with client.websocket_connect("/ws") as ws:  # the invite of its own game (any case) resumes as before
        ws.send_text(env("hello", {"role": "player", "player_token": ta, "code": g["code"].lower()}))
        assert recv(ws)["t"] == "welcome"
