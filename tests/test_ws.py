import json

import pytest
from starlette.websockets import WebSocketDisconnect


def env(t, payload=None, v=1):
    return json.dumps({"v": v, "t": t, "payload": payload or {}})


def recv(ws):
    return json.loads(ws.receive_text())


def setup_game(client, names=("Ana",)):
    g = client.post("/api/games", json={"name": "G"}).json()
    tokens = [client.post("/api/join", json={"code": g["code"], "name": n}).json()["token"] for n in names]
    return g["id"], g["code"], tokens


def test_tv_hello_welcome_state(client):
    gid, code, _ = setup_game(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "tv", "game_id": gid}))
        w = recv(ws)
        assert w["t"] == "welcome" and w["v"] == 1 and w["payload"]["game_id"] == gid
        s = recv(ws)
        assert s["t"] == "state"
        assert s["payload"]["game"]["code"] == code
        assert s["payload"]["view"]["kind"] == "lobby"
        assert "seq" in s and "ts" in s


def test_player_state_has_no_join_code_and_welcome_identity(client):
    gid, code, (tok,) = setup_game(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player", "player_token": tok}))
        w = recv(ws)
        assert w["payload"]["name"] == "Ana" and w["payload"]["player_id"]
        s = recv(ws)
        assert s["t"] == "state" and "code" not in s["payload"]["game"]
        me = [p for p in s["payload"]["game"]["players"] if p["id"] == w["payload"]["player_id"]][0]
        assert me["connected"] is True


def test_player_token_from_cookie_fallback(client):
    gid, code, (tok,) = setup_game(client)
    client.cookies.set("sb_pt", tok)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player"}))
        assert recv(ws)["t"] == "welcome"


def test_ping_pong(client):
    gid, _, _ = setup_game(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "tv", "game_id": gid}))
        recv(ws), recv(ws)
        ws.send_text(env("ping"))
        assert recv(ws)["t"] == "pong"


def test_malformed_json_keeps_socket_open(client):
    gid, _, _ = setup_game(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "tv", "game_id": gid}))
        recv(ws), recv(ws)
        ws.send_text("{not json")
        e = recv(ws)
        assert e["t"] == "error" and e["payload"]["code"] == "malformed"
        ws.send_text(env("ping"))
        assert recv(ws)["t"] == "pong"


def test_malformed_before_hello_keeps_socket_open(client):
    gid, _, _ = setup_game(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text("garbage")
        assert recv(ws)["t"] == "error"
        ws.send_text(env("hello", {"role": "tv", "game_id": gid}))
        assert recv(ws)["t"] == "welcome"


def test_wrong_version_closes_4000(client):
    gid, _, _ = setup_game(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "tv", "game_id": gid}, v=2))
        with pytest.raises(WebSocketDisconnect) as ei:
            ws.receive_text()
        assert ei.value.code == 4000


def test_wrong_version_after_hello_closes_4000(client):
    gid, _, _ = setup_game(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "tv", "game_id": gid}))
        recv(ws), recv(ws)
        ws.send_text(env("ping", v=9))
        with pytest.raises(WebSocketDisconnect) as ei:
            ws.receive_text()
        assert ei.value.code == 4000


def test_second_tv_replaces_first(client):
    gid, _, _ = setup_game(client)
    with client.websocket_connect("/ws") as tv1:
        tv1.send_text(env("hello", {"role": "tv", "game_id": gid}))
        recv(tv1), recv(tv1)
        with client.websocket_connect("/ws") as tv2:
            tv2.send_text(env("hello", {"role": "tv", "game_id": gid}))
            assert recv(tv2)["t"] == "welcome"
            with pytest.raises(WebSocketDisconnect) as ei:
                tv1.receive_text()
            assert ei.value.code == 4001
            assert ei.value.reason == "replaced"
            assert client.app.state.hub.tv_count(gid) == 1


def test_hello_timeout_4002(client):
    client.app.state.hello_timeout = 0.1
    with client.websocket_connect("/ws") as ws:
        with pytest.raises(WebSocketDisconnect) as ei:
            ws.receive_text()
        assert ei.value.code == 4002


def test_unknown_game_and_token_4004(client):
    for hello in ({"role": "tv", "game_id": "nope"}, {"role": "player", "player_token": "nope"}):
        with client.websocket_connect("/ws") as ws:
            ws.send_text(env("hello", hello))
            with pytest.raises(WebSocketDisconnect) as ei:
                ws.receive_text()
            assert ei.value.code == 4004


def test_delete_closes_sockets_4010(client):
    gid, _, (tok,) = setup_game(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "tv", "game_id": gid}))
        recv(ws), recv(ws)
        assert client.delete(f"/api/games/{gid}").status_code == 204
        msgs = []
        with pytest.raises(WebSocketDisconnect) as ei:
            while True:
                msgs.append(recv(ws))
        assert ei.value.code == 4010
        assert any(m["t"] == "event" and m["payload"]["name"] == "game_deleted" for m in msgs)
