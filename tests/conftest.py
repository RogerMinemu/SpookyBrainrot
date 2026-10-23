import pytest
from fastapi.testclient import TestClient

from app.bootstrap import create_app
from app.config import Settings
from tests.fakes import FakeClock, seeded_rng


def make_settings(tmp_path, **env):
    base = {"DB_PATH": str(tmp_path / "data" / "t.db"), "PUBLIC_URL": "http://play.test", "MIN_PLAYERS": "1"}
    base.update(env)
    return Settings.from_env(base)


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def app(settings, clock):
    return create_app(settings, clock=clock, rng=seeded_rng(), tick_interval=None)


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c
