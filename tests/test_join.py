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


def test_same_name_resumes_the_old_seat(client):
    gid, code = new_game(client)
    first = join(client, code, "Ana").json()
    for again in ("Ana", "  ana  ", "ANA"):  # ignoring case and extra spaces
        body = join(client, code, again).json()
        assert (body["player_id"], body["token"], body["name"]) == (first["player_id"], first["token"], "Ana")
    other = join(client, code, "Beto").json()
    assert other["player_id"] != first["player_id"] and other["token"] != first["token"]
    names = [p.name for p in client.app.state.manager.get(gid).game.players]
    assert names == ["Ana", "Beto"]  # no duplicates
    assert len(client.app.state.manager.players.list_for_game(gid)) == 2


def test_same_name_in_another_game_is_another_player(client):
    _, code_a = new_game(client)
    _, code_b = new_game(client)
    a, b = join(client, code_a, "Ana").json(), join(client, code_b, "Ana").json()
    assert a["player_id"] != b["player_id"] and a["token"] != b["token"]


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
