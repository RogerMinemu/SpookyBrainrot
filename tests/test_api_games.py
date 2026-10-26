from fastapi.testclient import TestClient

from app.bootstrap import create_app
from tests.fakes import FakeClock, seeded_rng


def test_list_empty(client):
    r = client.get("/api/games")
    assert r.status_code == 200 and r.json() == []


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}


def test_join_url_matches_qr(client, monkeypatch):
    game = client.post("/api/games", json={"name": "G"}).json()
    url = f"http://play.test/play?code={game['code']}"
    assert client.get(f"/api/games/{game['id']}/join-url").json() == {"url": url}
    encoded = []
    monkeypatch.setattr("app.web.routes_api.svg_for_url", lambda value: encoded.append(value) or "<svg/>")
    assert client.get(f"/api/games/{game['id']}/join-qr.svg").status_code == 200
    assert encoded == [url]
    assert client.get("/api/games/unknown/join-url").status_code == 404


def test_create_trims_name_and_lists(client):
    r = client.post("/api/games", json={"name": "  Casa Embrujada  "})
    assert r.status_code == 201
    g = r.json()
    assert g["name"] == "Casa Embrujada"
    assert g["status"] == "lobby" and g["room_no"] == 0
    listed = client.get("/api/games").json()
    assert [x["id"] for x in listed] == [g["id"]]
    assert set(listed[0]) == {"id", "name", "status", "room_no", "updated_at"}


def test_create_invalid_names_422(client):
    assert client.post("/api/games", json={"name": ""}).status_code == 422
    assert client.post("/api/games", json={"name": "   "}).status_code == 422
    assert client.post("/api/games", json={"name": "x" * 41}).status_code == 422
    assert client.post("/api/games", json={"name": "x" * 40}).status_code == 201
    assert client.post("/api/games", json={}).status_code == 422


def test_delete_then_404(client):
    gid = client.post("/api/games", json={"name": "A"}).json()["id"]
    assert client.delete(f"/api/games/{gid}").status_code == 204
    assert client.get(f"/tv/{gid}").status_code == 404
    assert client.delete(f"/api/games/{gid}").status_code == 404
    assert client.get("/api/games").json() == []


def test_delete_unknown_404(client):
    assert client.delete("/api/games/nope").status_code == 404


def test_persistence_across_new_app_instance(settings):
    with TestClient(create_app(settings, FakeClock(), seeded_rng())) as c1:
        gid = c1.post("/api/games", json={"name": "Persist"}).json()["id"]
    with TestClient(create_app(settings, FakeClock(), seeded_rng())) as c2:
        listed = c2.get("/api/games").json()
        assert [g["id"] for g in listed] == [gid]
        assert c2.get(f"/tv/{gid}").status_code == 200
