"""Restart simulation: a new app instance on the same DB shows identical state, players disconnected."""
from fastapi.testclient import TestClient

from app.bootstrap import create_app
from tests.conftest import make_settings
from tests.fakes import FakeClock, seeded_rng
from tests.test_room0_ws import env, hello, setup, state_until


def new_app(settings):
    return create_app(settings, FakeClock(), seeded_rng())


def test_continue_after_restart_identical_state_players_disconnected(tmp_path):
    s = make_settings(tmp_path)
    with TestClient(new_app(s)) as c1:
        gid, (ta, tb) = setup(c1)
        qr_before = [(e.token, e.kind, e.idx) for e in c1.app.state.qr_repo.entries()]
        with c1.websocket_connect("/ws") as tv, c1.websocket_connect("/ws") as wa, \
                c1.websocket_connect("/ws") as wb:
            hello(tv, {"role": "tv", "game_id": gid})
            hello(wa, {"role": "player", "player_token": ta})
            hello(wb, {"role": "player", "player_token": tb})
            tv.send_text(env("advance"))
            before = state_until(tv, lambda p: p["game"]["phase"] == "puzzle")
        rt = c1.app.state.manager.get(gid)
        rt.game.brainrot = 20
        rt.persist()

    with TestClient(new_app(s)) as c2:
        assert [(e.token, e.kind, e.idx) for e in c2.app.state.qr_repo.entries()] == qr_before
        assert c2.get("/api/games").json()[0]["id"] == gid
        assert c2.get(f"/tv/{gid}").status_code == 200
        with c2.websocket_connect("/ws") as tv:
            hello(tv, {"role": "tv", "game_id": gid})
            after = state_until(tv, lambda p: True)
        assert after["game"]["phase"] == "puzzle" and after["game"]["status"] == "running"
        assert after["game"]["room_no"] == before["game"]["room_no"]
        assert after["game"]["brainrot"] == 20
        assert after["view"]["kind"] == "hold_together"
        assert [p["name"] for p in after["game"]["players"]] == ["Ana", "Bea"]
        assert not any(p["connected"] for p in after["game"]["players"])


def test_home_page_has_continue_and_delete_controls(client):
    js = client.get("/static/js/home.js").text
    assert "Continuar" in js and "/tv/" in js and "confirm(" in js and "DELETE" in js
