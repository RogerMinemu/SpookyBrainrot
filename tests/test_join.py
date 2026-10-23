def new_game(client):
    r = client.post("/api/games", json={"name": "G"}).json()
    return r["id"], r["code"]


def join(client, code, name):
    return client.post("/api/join", json={"code": code, "name": name})


def test_join_sets_cookie_and_returns_player(client):
    _, code = new_game(client)
    r = join(client, code, "  Ana  ")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Ana" and body["token"]
    set_cookie = r.headers["set-cookie"].lower()
    assert f"sb_pt={body['token']}".lower() in set_cookie
    assert "samesite=lax" in set_cookie
    assert "max-age=604800" in set_cookie
    assert "secure" not in set_cookie


def test_join_code_is_case_insensitive(client):
    _, code = new_game(client)
    assert join(client, code.lower(), "Ana").status_code == 200


def test_name_truncated_to_24(client):
    _, code = new_game(client)
    assert len(join(client, code, "x" * 40).json()["name"]) == 24


def test_empty_name_422(client):
    _, code = new_game(client)
    assert join(client, code, "   ").status_code == 422


def test_duplicate_names_get_suffix(client):
    _, code = new_game(client)
    names = [join(client, code, "Ana").json()["name"] for _ in range(3)]
    assert names == ["Ana", "Ana 2", "Ana 3"]


def test_bad_code_404(client):
    new_game(client)
    assert join(client, "ZZZZ", "Ana").status_code == 404


def test_join_qr_svg_contains_url(client):
    gid, code = new_game(client)
    r = client.get(f"/api/games/{gid}/join-qr.svg")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in r.text
    # The SVG encodes exactly {PUBLIC_URL}/play?code=XXXX (rendering is deterministic)
    from app.web.qr_svg import svg_for_url
    assert r.text == svg_for_url(f"http://play.test/play?code={code}")
    assert r.text != svg_for_url("http://play.test/play?code=AAAA")


def test_join_qr_unknown_game_404(client):
    assert client.get("/api/games/nope/join-qr.svg").status_code == 404
