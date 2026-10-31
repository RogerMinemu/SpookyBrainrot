"""End-to-end over WebSocket: room 1 (platformer) -> 2 (red light) -> 3, 4, 6 -> 7 (Sahur's platformer) -> ending.

The TV sim is simulated by sending `sim` reports; rooms 3, 4 and 6 are solved with the host "complete" (their play is
covered by tests/test_new_rooms_ws.py).
"""
from tests.test_k_route import tokens
from tests.test_room0_ws import env, hello, next_of, recv, setup, state_until


def sim(ws, view, action, **extra):
    ws.send_text(env("sim", {"action": action, "epoch": view["epoch"], "level": view["level"], **extra}))


def jump(client, gid, room, phase):
    r = client.post(f"/admin/api/games/{gid}/debug/jump", json={"room": room, "phase": phase})
    assert r.status_code == 200, r.text


def complete(client, gid):
    r = client.post(f"/admin/api/games/{gid}/debug/complete")
    assert r.status_code == 200, r.text


def drain(ws):
    """Read everything queued on a socket we did not watch (a ping is answered after it)."""
    ws.send_text(env("ping"))
    next_of(ws, "pong", limit=1000)


def scan(client, token, anchor):
    client.cookies.set("sb_pt", token)
    r = client.get(f"/k/{anchor}")
    assert r.status_code == 200 and "Ancla encontrada" in r.text


def test_room1_to_room2_to_rooms_3_4_6_to_room7_to_ending(client, clock):
    gid, (ta, tb) = setup(client)
    rt = client.app.state.manager.get(gid)
    anchors, _ = tokens(client)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa, \
            client.websocket_connect("/ws") as wb:
        pids = {}
        for name, ws, tok in (("Ana", wa, ta), ("Bea", wb, tb)):
            pids[name] = hello(ws, {"role": "player", "player_token": tok})["player_id"]
        hello(tv, {"role": "tv", "game_id": gid})
        tv.send_text(env("advance"))  # lobby -> room 0 intro (prologue)
        state_until(tv, lambda p: p["game"]["status"] == "running")
        tv.send_text(env("advance"))  # -> room 0 puzzle
        state_until(tv, lambda p: p["game"]["phase"] == "puzzle")

        # --- room 1: four sub-levels, one clear each; a stale report is ignored -----------------
        jump(client, gid, 1, "puzzle")
        s = state_until(tv, lambda p: p["view"].get("kind") == "coop_platformer")
        for level in range(4):
            view = s["view"]
            assert view["level"] == level and view["levels"] == 4
            if level == 0:  # (the sim bucket is 8 reports and FakeClock never refills it)
                sim(tv, {**view, "epoch": view["epoch"] + 5}, "clear")
                assert next_of(tv, "error")["payload"]["code"] == "stale"
                assert rt.game.puzzle_state.level == 0  # the stale report changed nothing
            sim(tv, view, "clear")
            if level < 3:
                s = state_until(tv, lambda p, lv=level: p["view"].get("level") == lv + 1)
        s = state_until(tv, lambda p: p["game"]["phase"] == "search")
        assert s["game"]["room_no"] == 1

        # a duplicate clear of the last level cannot advance anything
        sim(tv, {"epoch": 1, "level": 3}, "clear")
        tv.send_text(env("ping"))
        next_of(tv, "pong")
        assert rt.game.phase == "search" and rt.game.room_no == 1
        scan(client, ta, anchors[1])
        state_until(tv, lambda p: p["game"]["phase"] == "unlocked")
        tv.send_text(env("advance"))  # -> room 2 intro
        s = state_until(tv, lambda p: p["game"]["room_no"] == 2)
        assert s["game"]["phase"] == "intro"
        tv.send_text(env("advance"))
        s = state_until(tv, lambda p: p["view"].get("kind") == "red_light")

        # --- room 2: everybody must arrive; the TV reconnects mid-room and keeps the progress ----
        view = s["view"]
        sim(tv, view, "clear")  # nobody arrived yet
        assert next_of(tv, "error")["payload"]["code"] == "not_all_arrived"
        sim(tv, view, "arrive", pid=pids["Ana"])
        state_until(tv, lambda p: p["view"].get("arrived") == [pids["Ana"]])
        with client.websocket_connect("/ws") as tv2:
            hello(tv2, {"role": "tv", "game_id": gid})
            s2 = state_until(tv2, lambda p: p["view"].get("kind") == "red_light")
            assert s2["view"]["arrived"] == [pids["Ana"]] and s2["view"]["epoch"] == view["epoch"]
            sim(tv2, view, "arrive", pid=pids["Bea"])
            state_until(tv2, lambda p: p["game"]["phase"] == "search")
            scan(client, tb, anchors[2])
            state_until(tv2, lambda p: p["game"]["phase"] == "unlocked")

            # --- rooms 3, 4 and 6 (room 5 was dropped): intro -> puzzle -> host complete -> their own anchor -------
            for room_no, kind in ((3, "shape_count"), (4, "backrooms_trivia"), (6, "bomb_defusal")):
                tv2.send_text(env("advance"))
                s = state_until(tv2, lambda p, r=room_no: p["game"]["room_no"] == r)
                assert s["game"]["phase"] == "intro"
                tv2.send_text(env("advance"))
                state_until(tv2, lambda p, k=kind: p["view"].get("kind") == k)
                complete(client, gid)
                state_until(tv2, lambda p: p["game"]["phase"] == "search")
                assert client.get(f"/k/{anchors[5]}").status_code == 200 and rt.game.phase == "search"  # anchor 5 sleeps
                scan(client, ta, anchors[room_no])
                state_until(tv2, lambda p: p["game"]["phase"] == "unlocked")

            tv2.send_text(env("advance"))
            s = state_until(tv2, lambda p: p["game"]["room_no"] == 7)
            assert s["game"]["phase"] == "intro"
            tv2.send_text(env("advance"))
            s = state_until(tv2, lambda p: p["view"].get("kind") == "sahur_platformer")

            # --- room 7: Sahur's five platformer levels, the same TV reports as room 1 ----------------
            for level in range(5):
                view = s["view"]
                assert view["level"] == level and view["levels"] == 5 and view["set"] == "sahur"
                sim(tv2, view, "clear")
                if level < 4:
                    s = state_until(tv2, lambda p, lv=level: p["view"].get("level") == lv + 1)
            s = state_until(tv2, lambda p: p["game"]["phase"] == "search")
            assert s["game"]["room_no"] == 7

            scan(client, ta, anchors[7])
            s = state_until(tv2, lambda p: p["game"]["status"] == "finished")
            assert s["game"]["status"] == "finished"


def test_room7_spikes_cost_brainrot_and_stale_reports_change_nothing(client, clock):
    gid, (ta, tb) = setup(client)
    rt = client.app.state.manager.get(gid)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa:
        pid = hello(wa, {"role": "player", "player_token": ta})["player_id"]
        hello(tv, {"role": "tv", "game_id": gid})
        tv.send_text(env("advance"))
        state_until(tv, lambda p: p["game"]["status"] == "running")
        jump(client, gid, 7, "puzzle")
        view = state_until(tv, lambda p: p["view"].get("kind") == "sahur_platformer")["view"]
        before = rt.game.brainrot
        sim(tv, view, "penalty", pid=pid, why="spikes")
        state_until(tv, lambda p: p["game"]["brainrot"] > before)
        assert rt.game.brainrot > before
        sim(tv, {**view, "level": view["level"] + 1}, "clear")
        assert next_of(tv, "error")["payload"]["code"] == "stale"
        assert rt.game.puzzle_state.level == 0
