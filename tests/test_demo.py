"""/admin/demo: seat mode (no shared cookie), admin protection, page wiring."""
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.bootstrap import create_app
from tests.conftest import make_settings
from tests.fakes import FakeClock, seeded_rng

STATIC = Path(__file__).resolve().parent.parent / "static"


def env(t, payload=None):
    return json.dumps({"v": 1, "t": t, "payload": payload or {}})


def new_game(client):
    r = client.post("/api/games", json={"name": "Demo"}).json()
    return r["id"], r["code"]


def test_seat_join_does_not_set_the_shared_cookie(client):
    _, code = new_game(client)
    r = client.post("/api/join", json={"code": code, "name": "Ana", "seat": True})
    assert r.status_code == 200 and r.json()["token"]
    assert "set-cookie" not in r.headers
    assert "sb_pt" not in client.cookies
    # the normal join (home page) still sets it
    r = client.post("/api/join", json={"code": code, "name": "Biel"})
    assert "sb_pt=" in r.headers["set-cookie"]


def test_seat_hello_never_falls_back_to_the_cookie(client):
    gid, code = new_game(client)
    other = client.post("/api/join", json={"code": code, "name": "Otra persona"}).json()["token"]
    client.cookies.set("sb_pt", other)
    # a fresh seat (no token yet) must not hijack the player that owns the cookie
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player", "seat": True}))
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
        assert exc.value.code == 4004
    # without the seat flag the cookie fallback still works (real phones)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player"}))
        assert json.loads(ws.receive_text())["t"] == "welcome"


def test_seat_hello_with_its_own_token_works_even_with_a_foreign_cookie(client):
    gid, code = new_game(client)
    foreign = client.post("/api/join", json={"code": code, "name": "Otra persona"}).json()["token"]
    seat = client.post("/api/join", json={"code": code, "name": "Ana", "seat": True}).json()
    client.cookies.set("sb_pt", foreign)
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player", "player_token": seat["token"], "seat": True}))
        w = json.loads(ws.receive_text())
        assert w["t"] == "welcome" and w["payload"]["player_id"] == seat["player_id"]


# ---- admin protection ---------------------------------------------------------------------------------------------------
@pytest.fixture
def guarded(tmp_path):
    app = create_app(make_settings(tmp_path, ADMIN_KEY="s3cret"), FakeClock(), seeded_rng())
    with TestClient(app) as c:
        yield c


@pytest.mark.parametrize("path", ["/admin/demo", "/admin/api/anchors"])
def test_demo_routes_need_the_admin_key(guarded, path):
    assert guarded.get(path).status_code == 401
    assert guarded.get(f"{path}?key=nope").status_code == 403
    assert guarded.get(f"{path}?key=s3cret").status_code == 200


def test_demo_page_and_anchors_when_open(client):
    r = client.get("/admin/demo")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"] and r.headers["cache-control"] == "no-cache"
    anchors = client.get("/admin/api/anchors").json()["anchors"]
    assert sorted(anchors, key=int) == [str(i) for i in range(1, 8)]
    assert len(set(anchors.values())) == 7
    # the token is the real one: the public scan route accepts it
    gid, code = new_game(client)
    assert client.get(f"/k/{anchors['1']}?g={gid}").status_code == 200


def test_anchor_tokens_are_not_on_any_public_route(client):
    token = client.get("/admin/api/anchors").json()["anchors"]["1"]
    for path in ("/", "/play", "/api/games", "/api/house"):
        assert token not in client.get(path).text


def test_debug_page_links_to_the_demo():
    assert "/admin/demo" in (STATIC / "debug.html").read_text(encoding="utf-8")


# ---- static wiring ---------------------------------------------------------------------------------------------------------
def test_demo_files_are_plain_and_cdn_free():
    html = (STATIC / "demo.html").read_text(encoding="utf-8")
    assert "<canvas" not in html and "demo.js" in html and "demo.css" in html
    for rel in ("demo.html", "css/demo.css", "js/admin/demo.js", "js/admin/demo-bots.js"):
        src = (STATIC / rel).read_text(encoding="utf-8")
        assert not re.search(r"https?://(?:cdn\.|unpkg|fonts\.g|cdnjs|ajax\.googleapis|jsdelivr)", src, re.I), rel
        assert "painter" not in src and "createCanvas" not in src, rel


def test_demo_bots_module_is_pure():
    src = (STATIC / "js" / "admin" / "demo-bots.js").read_text(encoding="utf-8")
    for bad in ("document.", "window.", "localStorage", "fetch(", "Date.now", "performance.now"):
        assert bad not in src, bad


def test_phone_seat_mode_wiring():
    play = (STATIC / "js" / "play" / "main.js").read_text(encoding="utf-8")
    assert "sb_seat_" in play and "seat: true" in play and "setMuted(true)" in play and "window.__sb" in play
    # the shared cookie is written for normal phones only
    assert "if (!SEAT) document.cookie" in play
    audio = (STATIC / "js" / "shared" / "audio.js").read_text(encoding="utf-8")
    assert "export function setMuted" in audio


def test_demo_page_uses_real_viewports_and_scaling():
    js = (STATIC / "js" / "admin" / "demo.js").read_text(encoding="utf-8")
    assert "TV_W = 1920" in js and "TV_H = 1080" in js and "PH_W = 390" in js and "PH_H = 844" in js
    assert "scale(" in js and "/admin/api/anchors" in js and "(atajo)" in js and "seat: true" in js
