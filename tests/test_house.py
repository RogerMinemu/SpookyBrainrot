from app.content import RIDDLE_PLACEHOLDER
from app.core.game import PHASE_SEARCH, STATUS_RUNNING


def test_get_house_defaults_unconfigured(client):
    data = client.get("/api/house").json()
    assert [a["idx"] for a in data["anchors"]] == list(range(1, 8))
    assert not any(a["configured"] for a in data["anchors"])
    # room 5 was dropped: its printed anchor has no job (the house page says it needs no hiding)
    assert [a["idx"] for a in data["anchors"] if not a["in_use"]] == [5]


def test_put_then_get(client):
    r = client.put("/api/house/2", json={"riddle": "  Bajo la cama.  ", "place": " Dormitorio "})
    assert r.status_code == 200
    a2 = client.get("/api/house").json()["anchors"][1]
    assert a2["riddle"] == "Bajo la cama." and a2["place"] == "Dormitorio" and a2["configured"]


def test_put_without_place_is_ok_and_overwrites(client):
    client.put("/api/house/3", json={"riddle": "uno", "place": "x"})
    client.put("/api/house/3", json={"riddle": "dos"})
    a3 = client.get("/api/house").json()["anchors"][2]
    assert a3["riddle"] == "dos" and a3["place"] == ""


def test_empty_riddle_422(client):
    assert client.put("/api/house/1", json={"riddle": "   "}).status_code == 422
    assert client.put("/api/house/1", json={"riddle": ""}).status_code == 422


def test_idx_outside_range_422(client):
    for idx in (0, 8, -1):
        assert client.put(f"/api/house/{idx}", json={"riddle": "x"}).status_code == 422


def test_placeholder_then_configured_riddle_in_state(client):
    g = client.post("/api/games", json={"name": "G"}).json()
    rt = client.app.state.manager.get(g["id"])
    rt.game.status, rt.game.room_idx, rt.game.phase = STATUS_RUNNING, 2, PHASE_SEARCH  # room 2, anchor 2
    assert rt.state_payload("tv")["game"]["riddle"] == RIDDLE_PLACEHOLDER
    client.put("/api/house/2", json={"riddle": "Mirad tras el espejo"})
    assert rt.state_payload("tv")["game"]["riddle"] == "Mirad tras el espejo"
    assert rt.state_payload("player", "x")["game"]["riddle"] == "Mirad tras el espejo"


def test_house_is_global_across_app_instances(tmp_path):
    from fastapi.testclient import TestClient
    from app.bootstrap import create_app
    from tests.conftest import make_settings
    from tests.fakes import FakeClock, seeded_rng

    s = make_settings(tmp_path)
    with TestClient(create_app(s, FakeClock(), seeded_rng())) as c:
        c.put("/api/house/5", json={"riddle": "persistente"})
    with TestClient(create_app(s, FakeClock(), seeded_rng())) as c:
        assert c.get("/api/house").json()["anchors"][4]["riddle"] == "persistente"


def test_house_pages_served(client):
    r = client.get("/admin/house")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert client.get("/static/js/house.js").status_code == 200
