from fastapi.testclient import TestClient

from app.bootstrap import create_app
from tests.conftest import make_settings
from tests.fakes import FakeClock, seeded_rng

GUARDED = ["/admin/house", "/admin/qr-sheet", "/admin/qr-key", "/api/house"]


def make_client(tmp_path, key):
    env = {"ADMIN_KEY": key} if key else {}
    return TestClient(create_app(make_settings(tmp_path, **env), FakeClock(), seeded_rng()))


def test_unset_key_is_open(tmp_path):
    with make_client(tmp_path, "") as c:
        for p in GUARDED:
            assert c.get(p).status_code == 200


def test_missing_key_401(tmp_path):
    with make_client(tmp_path, "s3cret") as c:
        for p in GUARDED:
            assert c.get(p).status_code == 401
        assert c.put("/api/house/1", json={"riddle": "x"}).status_code == 401


def test_wrong_key_denied(tmp_path):
    with make_client(tmp_path, "s3cret") as c:
        assert c.get("/admin/qr-key?key=nope").status_code == 403
        c.cookies.set("sb_admin", "bad")
        assert c.get("/api/house").status_code == 403


def test_query_key_ok_and_sets_cookie_then_cookie_alone_works(tmp_path):
    with make_client(tmp_path, "s3cret") as c:
        r = c.get("/admin/qr-sheet?key=s3cret")
        assert r.status_code == 200 and "sb_admin=s3cret" in r.headers["set-cookie"]
        assert c.get("/api/house").status_code == 200  # cookie alone
        assert c.put("/api/house/1", json={"riddle": "x"}).status_code == 200


def test_non_admin_routes_stay_open(tmp_path):
    with make_client(tmp_path, "s3cret") as c:
        assert c.get("/healthz").status_code == 200
        assert c.get("/").status_code == 200
        assert c.get("/api/games").status_code == 200
        assert c.get("/k/unknown").status_code == 404  # reaches the route, not the guard
