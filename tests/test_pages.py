def test_home_and_play_pages(client):
    for path in ("/", "/play"):
        r = client.get(path)
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]
        assert r.headers["cache-control"] == "no-cache"


def test_tv_page_known_and_unknown(client):
    gid = client.post("/api/games", json={"name": "G"}).json()["id"]
    r = client.get(f"/tv/{gid}")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert client.get("/tv/unknown").status_code == 404


def test_static_no_cache_header(client):
    r = client.get("/static/js/shared/ws.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"
    assert client.get("/static/css/base.css").headers["cache-control"] == "no-cache"


def test_static_missing_404(client):
    assert client.get("/static/nope.js").status_code == 404
