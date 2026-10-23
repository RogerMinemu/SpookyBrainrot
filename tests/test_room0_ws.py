"""End-to-end Room 0 over WebSocket: two players hold, FakeClock advances, game moves to Room 2 intro."""
import json


def env(t, payload=None):
    return json.dumps({"v": 1, "t": t, "payload": payload or {}})


def recv(ws):
    return json.loads(ws.receive_text())


def hello(ws, payload):
    ws.send_text(env("hello", payload))
    w = recv(ws)
    assert w["t"] == "welcome"
    return w["payload"]


def state_until(ws, pred, limit=50):
    for _ in range(limit):
        m = recv(ws)
        if m["t"] == "state" and pred(m["payload"]):
            return m["payload"]
    raise AssertionError("expected state never arrived")


def next_of(ws, t, limit=50):
    for _ in range(limit):
        m = recv(ws)
        if m["t"] == t:
            return m
    raise AssertionError(f"no {t} message")


def setup(client, names=("Ana", "Bea")):
    g = client.post("/api/games", json={"name": "G"}).json()
    toks = [client.post("/api/join", json={"code": g["code"], "name": n}).json()["token"] for n in names]
    return g["id"], toks


def test_two_players_hold_together_and_reach_room2_intro(client, clock):
    gid, (ta, tb) = setup(client)
    rt = client.app.state.manager.get(gid)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa, \
            client.websocket_connect("/ws") as wb:
        hello(tv, {"role": "tv", "game_id": gid})
        hello(wa, {"role": "player", "player_token": ta})
        hello(wb, {"role": "player", "player_token": tb})
        state_until(tv, lambda p: all(x["connected"] for x in p["game"]["players"]))

        # TV starts the game
        tv.send_text(env("advance"))
        s = state_until(tv, lambda p: p["game"]["phase"] == "puzzle")
        assert s["view"]["kind"] == "hold_together" and s["game"]["status"] == "running"
        state_until(wa, lambda p: p["view"]["kind"] == "hold_together")

        # both hold
        wa.send_text(env("puzzle", {"type": "hold", "down": True}))
        wb.send_text(env("puzzle", {"type": "hold", "down": True}))
        s = state_until(tv, lambda p: p["view"].get("players") and all(x["holding"] for x in p["view"]["players"]))
        assert s["view"]["progress"] == 0.0

        # not yet 5 s
        clock.advance(4.9)
        client.portal.call(rt.tick)
        s = state_until(tv, lambda p: p["view"].get("progress", 0) > 0.9)
        assert s["game"]["phase"] == "puzzle"

        # 5.0 s -> solved, Room 0 has no anchor: unlocked right away
        clock.advance(0.1)
        client.portal.call(rt.tick)
        s = state_until(tv, lambda p: p["game"]["phase"] == "unlocked")
        assert s["game"]["room_no"] == 0
        assert next_of(tv, "event")["payload"]["name"] == "puzzle_solved"

        # advance -> Room 2 intro (the wordle plugin arrives in batch C)
        wa.send_text(env("advance"))
        s = state_until(tv, lambda p: p["game"]["room_no"] == 2)
        assert s["game"]["phase"] == "intro" and s["view"]["kind"] == "intro"


def test_advance_in_wrong_phase_returns_error_to_sender_only(client):
    gid, (ta, tb) = setup(client)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa:
        hello(tv, {"role": "tv", "game_id": gid})
        hello(wa, {"role": "player", "player_token": ta})
        wa.send_text(env("advance"))
        state_until(wa, lambda p: p["game"]["phase"] == "puzzle")
        wa.send_text(env("advance"))
        err = next_of(wa, "error")
        assert err["payload"]["code"] == "wrong_phase"


def test_tv_cannot_send_puzzle_actions(client):
    gid, _ = setup(client)
    with client.websocket_connect("/ws") as tv:
        hello(tv, {"role": "tv", "game_id": gid})
        tv.send_text(env("puzzle", {"type": "hold", "down": True}))
        assert next_of(tv, "error")["payload"]["code"] == "not_player"


def test_release_over_ws_resets_progress_and_release_by_other_is_ignored(client, clock):
    gid, (ta, tb) = setup(client)
    rt = client.app.state.manager.get(gid)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa, \
            client.websocket_connect("/ws") as wb:
        hello(tv, {"role": "tv", "game_id": gid})
        hello(wa, {"role": "player", "player_token": ta})
        hello(wb, {"role": "player", "player_token": tb})
        tv.send_text(env("advance"))
        state_until(tv, lambda p: p["game"]["phase"] == "puzzle")
        wa.send_text(env("puzzle", {"type": "hold", "down": True}))
        wb.send_text(env("puzzle", {"type": "hold", "down": True}))
        state_until(tv, lambda p: p["view"].get("players") and all(x["holding"] for x in p["view"]["players"]))
        clock.advance(3)
        client.portal.call(rt.tick)
        state_until(tv, lambda p: p["view"].get("progress", 0) >= 0.6)
        wb.send_text(env("puzzle", {"type": "hold", "down": False}))
        s = state_until(tv, lambda p: p["view"].get("progress") == 0.0 and any(
            not x["holding"] for x in p["view"].get("players", [])))
        assert s["game"]["phase"] == "puzzle"


def test_room0_client_modules_are_served(client):
    for name in ("tv.js", "controller.js"):
        r = client.get(f"/static/puzzles/hold_together/{name}")
        assert r.status_code == 200 and "export function mount" in r.text
