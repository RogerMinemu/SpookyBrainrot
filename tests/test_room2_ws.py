"""End-to-end Room 0 -> Room 2 over WebSocket: win -> search phase with the riddle in state."""
import json

from app.content import RIDDLE_PLACEHOLDER
from app.core import brainrot
from tests.test_room0_ws import env, hello, next_of, recv, setup, state_until


def to_wordle(client, clock, gid, tv, wa, wb, rt):
    tv.send_text(env("advance"))
    state_until(tv, lambda p: p["game"]["phase"] == "puzzle")
    wa.send_text(env("puzzle", {"type": "hold", "down": True}))
    wb.send_text(env("puzzle", {"type": "hold", "down": True}))
    state_until(tv, lambda p: p["view"].get("players") and all(x["holding"] for x in p["view"]["players"]))
    clock.advance(5.1)
    client.portal.call(rt.tick)
    state_until(tv, lambda p: p["game"]["phase"] == "unlocked")
    wa.send_text(env("advance"))
    state_until(tv, lambda p: p["game"]["room_no"] == 2 and p["game"]["phase"] == "intro")
    wa.send_text(env("advance"))
    return state_until(tv, lambda p: p["view"]["kind"] == "cursed_wordle")


def test_room0_to_room2_win_reaches_search_with_riddle(client, clock):
    gid, (ta, tb) = setup(client)
    rt = client.app.state.manager.get(gid)
    with client.websocket_connect("/ws") as tv, client.websocket_connect("/ws") as wa, \
            client.websocket_connect("/ws") as wb:
        hello(tv, {"role": "tv", "game_id": gid})
        pa = hello(wa, {"role": "player", "player_token": ta})
        pb = hello(wb, {"role": "player", "player_token": tb})
        s = to_wordle(client, clock, gid, tv, wa, wb, rt)
        target = rt.game.puzzle_state.target
        assert target not in json.dumps(s)  # answer never reaches the TV

        sa = state_until(wa, lambda p: p["view"]["kind"] == "cursed_wordle")
        sb = state_until(wb, lambda p: p["view"]["kind"] == "cursed_wordle")
        first, second = (wa, wb) if sa["view"]["your_turn"] else (wb, wa)
        assert (sa["view"]["your_turn"], sb["view"]["your_turn"]).count(True) == 1
        assert sa["view"]["letter"] != sb["view"]["letter"]

        # out of turn -> error to sender only
        second.send_text(env("puzzle", {"type": "guess", "word": target}))
        assert next_of(second, "error")["payload"]["code"] == "not_your_turn"

        # wrong length is rejected without consuming an attempt
        first.send_text(env("puzzle", {"type": "guess", "word": "ZZ"}))
        assert next_of(first, "error")["payload"]["code"] == "bad_length"

        # a miss then the other player wins
        miss = "Z" * len(target)
        first.send_text(env("puzzle", {"type": "guess", "word": miss}))
        s = state_until(tv, lambda p: p["view"].get("rows") and len(p["view"]["rows"]) == 1)
        assert s["game"]["brainrot"] == brainrot.WRONG_ATTEMPT
        second.send_text(env("puzzle", {"type": "guess", "word": target.lower()}))
        s = state_until(tv, lambda p: p["game"]["phase"] == "search")
        assert s["game"]["room_no"] == 2
        assert s["game"]["riddle"] == RIDDLE_PLACEHOLDER
        assert s["view"]["kind"] == "search"


def test_wordle_client_modules_are_served(client):
    for name in ("tv.js", "controller.js", "grid.js"):
        r = client.get(f"/static/puzzles/cursed_wordle/{name}")
        assert r.status_code == 200 and "export function" in r.text
