import pytest

from app.content import ROOM_PLAN
from app.core import brainrot
from app.core.engine import Scan
from app.core.game import PHASE_SEARCH, STATUS_RUNNING


def finish(client, value):
    g = client.post("/api/games", json={"name": "G"}).json()
    rt = client.app.state.manager.get(g["id"])
    rt.game.status, rt.game.room_idx, rt.game.phase = STATUS_RUNNING, len(ROOM_PLAN) - 1, PHASE_SEARCH  # room 6: the last
    rt.game.brainrot = value

    async def go():
        return await rt.apply(Scan("anchor", 6))

    return rt, client.portal.call(go)


@pytest.mark.parametrize(
    "value,band",
    [(10, brainrot.BAND_ESCAPE), (50, brainrot.BAND_PASSENGER), (90, brainrot.BAND_BRAINROTS)],
)
def test_finished_payload_carries_band(client, value, band):
    rt, out = finish(client, value)
    assert out.scan_result == "finished"
    for payload in (rt.state_payload("tv"), rt.state_payload("player", "x")):
        assert payload["view"]["kind"] == "ending"
        assert payload["view"]["band"] == band
        assert payload["game"]["ending"]["band"] == band
        assert payload["view"]["brainrot"] == value
        assert "degradation" in payload["game"]


def test_ending_band_is_frozen_after_finish(client):
    rt, _ = finish(client, 30)
    rt.game.brainrot = 99
    assert rt.state_payload("tv")["view"]["band"] == brainrot.BAND_ESCAPE


def test_degradation_levels_are_monotonic():
    levels = [brainrot.degradation_level(v) for v in range(0, 101, 5)]
    assert levels == sorted(levels) and levels[-1] == brainrot.MAX_DEGRADATION_LEVEL


def test_front_end_assets_served(client):
    for path in ("/static/js/tv/effects.js", "/static/js/play/toast.js", "/static/js/tv/screens.js"):
        assert client.get(path).status_code == 200
