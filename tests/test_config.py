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


def test_public_url_defaults_to_localhost_port():
    s = Settings.from_env({"PORT": "8100"})
    assert s.public_url == "http://localhost:8100"
    assert s.public_url_defaulted
    assert s.host == "0.0.0.0"


def test_min_players_parse_and_default():
    assert Settings.from_env({"MIN_PLAYERS": "1"}).min_players == 1
    assert Settings.from_env({"MIN_PLAYERS": "x"}).min_players == 2
    assert Settings.from_env({}).min_players == 2


def test_db_dir_autocreated(tmp_path):
    s = Settings.from_env({"DB_PATH": str(tmp_path / "sub" / "x.db")})
    s.ensure_db_dir()
    assert (tmp_path / "sub").is_dir()
