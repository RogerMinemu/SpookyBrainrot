from app.config import Settings, resolve_port


def test_server_port_wins_over_port():
    assert resolve_port({"SERVER_PORT": "9000", "PORT": "8100"}) == 9000


def test_default_port_when_none_set():
    assert resolve_port({}) == 8000


def test_invalid_server_port_is_skipped():
    assert resolve_port({"SERVER_PORT": "abc", "PORT": "8100"}) == 8100


def test_public_url_trailing_slash_trimmed():
    s = Settings.from_env({"PUBLIC_URL": "https://x.example.com/"})
    assert s.public_url == "https://x.example.com"
    assert not s.public_url_defaulted


def test_public_url_defaults_to_lan_port(monkeypatch):
    monkeypatch.setattr("app.config.detect_lan_ipv4", lambda: "192.168.1.42")
    s = Settings.from_env({"PORT": "8100"})
    assert s.public_url == "http://192.168.1.42:8100"
    assert s.public_url_defaulted
    assert s.host == "0.0.0.0"


def test_explicit_localhost_url_uses_lan_ip(monkeypatch):
    monkeypatch.setattr("app.config.detect_lan_ipv4", lambda: "192.168.1.42")
    for host in ("localhost", "127.0.0.1", "0.0.0.0", "[::1]"):
        s = Settings.from_env({"PUBLIC_URL": f"http://{host}:9000/"})
        assert s.public_url == "http://192.168.1.42:9000"


def test_lan_detection_without_network(monkeypatch):
    from app.config import detect_lan_ipv4

    def unavailable(*args):
        raise OSError("offline")

    monkeypatch.setattr("app.config.socket.socket", unavailable)
    monkeypatch.setattr("app.config.socket.gethostbyname_ex", lambda host: (host, [], ["127.0.0.1", "192.168.1.42"]))
    assert detect_lan_ipv4() == "192.168.1.42"
    monkeypatch.setattr("app.config.socket.gethostbyname_ex", unavailable)
    assert detect_lan_ipv4() == "127.0.0.1"


def test_min_players_parse_and_default():
    assert Settings.from_env({"MIN_PLAYERS": "1"}).min_players == 1
    assert Settings.from_env({"MIN_PLAYERS": "x"}).min_players == 2
    assert Settings.from_env({}).min_players == 2


def test_db_dir_autocreated(tmp_path):
    s = Settings.from_env({"DB_PATH": str(tmp_path / "sub" / "x.db")})
    s.ensure_db_dir()
    assert (tmp_path / "sub").is_dir()
