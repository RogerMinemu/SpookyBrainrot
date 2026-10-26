"""Rooms 3, 4 and 6 over WebSocket: a short real play, and what each screen gets (and never gets)."""
import json

from app.puzzles import backrooms_trivia as bt
from app.puzzles import shape_count as sc
from app.puzzles.bomb_defusal import wire_to_cut
from tests.test_room0_ws import env, hello, next_of, setup, state_until
from tests.test_room_flow_ws import jump


def kind_is(kind):
    return lambda p: p["view"].get("kind") == kind


def test_room3_each_phone_counts_its_own_shape_and_the_round_passes(client, clock):
    gid, (ta, tb) = setup(client)
    rt = client.app.state.manager.get(gid)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa, \
            client.websocket_connect("/ws") as wb:
        hello(wa, {"role": "player", "player_token": ta})
        hello(wb, {"role": "player", "player_token": tb})
        hello(tv, {"role": "tv", "game_id": gid})
        jump(client, gid, 3, "puzzle")
        tv_view = state_until(tv, kind_is("shape_count"))["view"]
        phones = {"wa": (wa, state_until(wa, kind_is("shape_count"))["view"]), "wb": (wb, state_until(wb, kind_is("shape_count"))["view"])}
        assert len(tv_view["shapes"]) > 0 and len(tv_view["counters"]) == 2
        for ws, view in phones.values():
            assert view["shape"] in sc.KIND_NAMES and view["answer"] == 0
            assert "shapes" not in view and "counters" not in view  # a phone only knows its own shape
            target = sum(1 for s in tv_view["shapes"] if s["kind"] == view["shape"])
            for _ in range(target):
                ws.send_text(env("puzzle", {"type": "adjust", "delta": 1}))
        for ws, _ in phones.values():  # a socket is handled in order: its pong comes after all its taps
            ws.send_text(env("ping"))
            next_of(ws, "pong", limit=200)
        clock.advance(sc.COUNT_MS[0] / 1000)
        client.portal.call(rt.tick)
        s = state_until(tv, lambda p: p["view"].get("phase") == "pass")
        assert all(r["ok"] for r in s["view"]["results"]) and len(s["view"]["results"]) == 2


def test_room4_answer_goes_in_only_with_unanimity_and_stays_hidden_until_the_reveal(client, clock):
    gid, (ta, tb) = setup(client)
    rt = client.app.state.manager.get(gid)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa, \
            client.websocket_connect("/ws") as wb:
        hello(wa, {"role": "player", "player_token": ta})
        hello(wb, {"role": "player", "player_token": tb})
        hello(tv, {"role": "tv", "game_id": gid})
        jump(client, gid, 4, "puzzle")
        tv_view = state_until(tv, kind_is("backrooms_trivia"))["view"]
        st = rt.game.puzzle_state
        fact = rt.puzzles["backrooms_trivia"].bank[st.order[st.pos]].fact
        answer = st.perm.index(0)
        pv = state_until(wa, kind_is("backrooms_trivia"))["view"]
        for view in (tv_view, pv):
            assert view["reveal"] is None and fact not in json.dumps(view, ensure_ascii=False)
        wa.send_text(env("puzzle", {"type": "vote", "option": answer}))
        wb.send_text(env("puzzle", {"type": "vote", "option": (answer + 1) % 4}))
        s = state_until(tv, lambda p: sum(len(v) for v in p["view"].get("votes", [])) == 2)
        assert not s["view"]["locking"]  # they disagree
        wb.send_text(env("puzzle", {"type": "vote", "option": answer}))
        s = state_until(tv, lambda p: p["view"].get("locking"))
        assert s["view"]["lock_choice"] == answer and s["view"]["reveal"] is None
        clock.advance(bt.LOCK_MS / 1000)
        client.portal.call(rt.tick)
        s = state_until(tv, lambda p: p["view"].get("phase") == "reveal")
        assert s["view"]["reveal"]["ok"] and s["view"]["reveal"]["fact"] == fact and s["view"]["right"] == 1


def test_room6_only_the_artificiero_gets_the_bomb_and_the_tv_never_does(client, clock):
    gid, (ta, tb) = setup(client)
    rt = client.app.state.manager.get(gid)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa, \
            client.websocket_connect("/ws") as wb:
        hello(wa, {"role": "player", "player_token": ta})
        hello(wb, {"role": "player", "player_token": tb})
        hello(tv, {"role": "tv", "game_id": gid})
        jump(client, gid, 6, "puzzle")
        tv_view = state_until(tv, kind_is("bomb_defusal"))["view"]
        va = state_until(wa, kind_is("bomb_defusal"))["view"]
        vb = state_until(wb, kind_is("bomb_defusal"))["view"]
        st = rt.game.puzzle_state
        assert "bomb" not in tv_view and st.word not in json.dumps(tv_view)
        assert sorted([va["role"], vb["role"]]) == ["defuser", "expert"]
        (dws, dview), (ews, eview) = sorted(((wa, va), (wb, vb)), key=lambda x: x[1]["role"])
        assert dview["bomb"]["serial"].replace("-", "") == st.serial and dview["manual"] == []
        assert eview["bomb"] is None and len(eview["manual"]) == 14  # one expert holds the whole manual

        ews.send_text(env("puzzle", {"type": "cut", "wire": 0}))
        assert next_of(ews, "error")["payload"]["code"] == "not_defuser"

        dws.send_text(env("puzzle", {"type": "cut", "wire": wire_to_cut(st.wires, st.serial)}))
        s = state_until(tv, lambda p: any(m["solved"] for m in p["view"].get("modules", [])))
        assert [m["id"] for m in s["view"]["modules"] if m["solved"]] == ["wires"]
        ev = next_of(ews, "event")
        assert ev["payload"]["name"] == "toast" and "Cables" in ev["payload"]["data"]["text"]
