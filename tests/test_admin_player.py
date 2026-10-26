"""Admin player (Roger unless ADMIN_PLAYER says otherwise): the phone menu drives its own game's debug API with its
player token, sends TV actions over /ws, and joining again with a taken name resumes that seat instead of duplicating."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.bootstrap import create_app
from app.config import DEFAULT_ADMIN_PLAYER, Settings
from tests.conftest import make_settings
from tests.fakes import FakeClock, seeded_rng
from tests.test_realtime_ws import drain, env, of, phone, recv, tv_socket

STATIC = Path(__file__).resolve().parent.parent / "static"


def new_game(c):
    g = c.post("/api/games", json={"name": "G"}).json()
    return g["id"], g["code"]


def join(c, code, name):
    return c.post("/api/join", json={"code": code, "name": name}).json()


def welcome(c, token):
    with c.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player", "player_token": token}))
        return recv(ws)["payload"]


def keyed(tmp_path, **extra):
    return TestClient(create_app(make_settings(tmp_path, **extra), FakeClock(), seeded_rng()))


def as_player(token):
    return {"X-Player-Token": token}


# --- who is the admin ---------------------------------------------------------------------------
def test_admin_player_defaults_to_roger():
    assert DEFAULT_ADMIN_PLAYER == "Roger"
    assert Settings.from_env({}).admin_player == "Roger"
    assert Settings.from_env({"ADMIN_PLAYER": "  "}).admin_player == "Roger"
    assert Settings.from_env({"ADMIN_PLAYER": " Marta "}).admin_player == "Marta"


def test_welcome_flags_only_the_admin_player(client):
    _, code = new_game(client)
    assert welcome(client, join(client, code, "  roger ")["token"])["admin"] is True  # case and spaces do not matter
    assert welcome(client, join(client, code, "Ana")["token"])["admin"] is False
    assert welcome(client, join(client, code, "Rogelio")["token"])["admin"] is False


def test_admin_player_comes_from_the_setting(tmp_path):
    with keyed(tmp_path, ADMIN_PLAYER="Marta") as c:
        _, code = new_game(c)
        assert welcome(c, join(c, code, "Marta")["token"])["admin"] is True
        assert welcome(c, join(c, code, "Roger")["token"])["admin"] is False


# --- debug API with the player token ------------------------------------------------------------------
def test_admin_phone_drives_only_its_own_game_debug_api(tmp_path):
    with keyed(tmp_path, ADMIN_KEY="s3cret") as c:
        gid, code = new_game(c)
        _, other_code = new_game(c)
        roger, ana = join(c, code, "Roger")["token"], join(c, code, "Ana")["token"]
        roger_elsewhere = join(c, other_code, "Roger")["token"]
        base = f"/admin/api/games/{gid}/debug"

        assert c.get(base, headers=as_player(roger)).status_code == 200
        r = c.post(f"{base}/jump", json={"room": 1}, headers=as_player(roger))
        assert r.status_code == 200 and r.json()["room"] == 1
        assert c.post(f"{base}/brainrot", json={"value": 30}, headers=as_player(roger)).json()["brainrot"] == 30
        assert c.post(f"{base}/reset", headers=as_player(roger)).json()["room"] == "lobby"

        # anyone else, the admin of another game and a made-up token still need the key
        for token in (ana, roger_elsewhere, "nope"):
            assert c.get(base, headers=as_player(token)).status_code == 401
            assert c.post(f"{base}/complete", headers=as_player(token)).status_code == 401
        # the token opens the debug API of its game and nothing else under /admin
        for path in ("/admin/debug", "/admin/api/games", "/admin/api/anchors", "/admin/qr-key", "/api/house"):
            assert c.get(path, headers=as_player(roger)).status_code == 401, path
        assert c.get(f"{base}?key=s3cret").status_code == 200  # the host key keeps working


def test_admin_phone_needs_no_token_when_admin_key_is_unset(client):
    gid, _ = new_game(client)
    assert client.get(f"/admin/api/games/{gid}/debug").status_code == 200


# --- TV actions over /ws ------------------------------------------------------------------------------------
def test_tv_actions_come_from_the_admin_phone_only(client):
    gid, code = new_game(client)
    roger, ana = join(client, code, "Roger")["token"], join(client, code, "Ana")["token"]
    rt = client.app.state.manager.get(gid)
    with tv_socket(client, gid) as tv, phone(client, roger) as r, phone(client, ana) as a:
        drain(tv), drain(r), drain(a)
        seq = rt.game.seq
        r.send_text(env("admin", {"action": "story_skip"}))
        r.send_text(env("admin", {"action": "tv_refresh"}))
        assert not of(drain(r), "error")
        assert [m["payload"] for m in of(drain(tv), "admin")] == [{"action": "story_skip"}, {"action": "tv_refresh"}]
        assert not of(drain(a), "admin")  # only the TV gets them

        a.send_text(env("admin", {"action": "story_skip"}))
        assert [m["payload"]["code"] for m in of(drain(a), "error")] == ["not_admin"]
        r.send_text(env("admin", {"action": "reboot"}))
        assert [m["payload"]["code"] for m in of(drain(r), "error")] == ["unknown_action"]
        tv.send_text(env("admin", {"action": "story_skip"}))
        msgs = drain(tv)
        assert [m["payload"]["code"] for m in of(msgs, "error")] == ["not_admin"] and not of(msgs, "admin")
        assert rt.game.seq == seq  # nothing of this touches the game state


# --- rejoin by name ---------------------------------------------------------------------------------------------
def test_rejoining_with_the_same_name_takes_the_old_seat_over(client):
    gid, code = new_game(client)
    first = join(client, code, "Ana")
    rt = client.app.state.manager.get(gid)
    with phone(client, first["token"]) as old:
        drain(old)
        seq = rt.game.seq
        again = join(client, code, "ana")  # a new browser: no cookie, same name
        assert (again["player_id"], again["token"]) == (first["player_id"], first["token"])
        assert rt.game.seq == seq  # resuming changes nothing in the game
        with phone(client, again["token"]) as new:
            assert new.pid == old.pid
            with pytest.raises(WebSocketDisconnect) as e:  # the old screen is replaced, not duplicated
                while True:
                    old.receive_text()
            assert e.value.code == 4001
            players = of(drain(new), "state")[-1]["payload"]["game"]["players"]
            assert [(p["name"], p["connected"]) for p in players] == [("Ana", True)]


# --- UI wiring -----------------------------------------------------------------------------------------------------
def test_phone_admin_menu_wiring():
    main = (STATIC / "js" / "play" / "main.js").read_text(encoding="utf-8")
    assert "syncAdmin" in main and "/static/js/play/admin.js" in main and 'socket.send("admin"' in main
    admin = (STATIC / "js" / "play" / "admin.js").read_text(encoding="utf-8")
    for needle in ("/static/js/admin/debug-panel.js", "spoilers: false", "story_skip", "tv_refresh",
                   "Saltar escena", "Refrescar tele"):
        assert needle in admin, needle
    assert "window.p5" not in admin and "/js/art/" not in admin
    assert "X-Player-Token" in (STATIC / "js" / "admin" / "debug-panel.js").read_text(encoding="utf-8")
    assert 'm.t === "admin"' in (STATIC / "js" / "shared" / "ws.js").read_text(encoding="utf-8")
    tv = (STATIC / "js" / "tv" / "main.js").read_text(encoding="utf-8")
    assert "onAdmin" in tv and "story.skip()" in tv and '"tv_refresh"' in tv
    assert ".admin-toggle" in (STATIC / "css" / "play.css").read_text(encoding="utf-8")
