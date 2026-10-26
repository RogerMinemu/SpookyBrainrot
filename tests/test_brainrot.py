from app.core import brainrot as b


def test_clamp_ceiling_and_floor():
    assert b.add(95, 20) == 100
    assert b.add(5, -20) == 0


def test_bands_at_boundaries():
    assert b.band(39.99) == "escape"
    assert b.band(40) == "escape_with_passenger"
    assert b.band(75) == "escape_with_passenger"
    assert b.band(75.01) == "brainrots"
    assert b.band(0) == "escape"
    assert b.band(100) == "brainrots"


def test_degradation_level_monotonic():
    levels = [b.degradation_level(v / 2) for v in range(0, 201)]
    assert levels == sorted(levels)
    assert levels[0] == 0
    assert levels[-1] == b.MAX_DEGRADATION_LEVEL
    assert b.degradation_level(-5) == 0
    assert b.degradation_level(500) == b.MAX_DEGRADATION_LEVEL


def test_penalties_are_positive_constants():
    assert b.DECOY_PENALTY > 0 and b.ROUND_FAIL_PENALTY > 0
    assert b.SIM_PENALTY > 0 and b.SAHUR_FAIL_PENALTY > 0
    assert b.SIM_PENALTY_COOLDOWN_MS > 0 and b.ROOM_PENALTY_CAP >= b.SIM_PENALTY
    assert not hasattr(b, "WRONG_ATTEMPT")


def test_capped_limits_to_remaining_room():
    assert b.capped(0, 2, 12) == 2
    assert b.capped(11, 2, 12) == 1
    assert b.capped(12, 2, 12) == 0
    assert b.capped(20, 2, 12) == 0  # over the cap already: never negative


def test_capped_penalty_never_leaves_meter_bounds():
    value = 99.0
    value = b.add(value, b.capped(0, b.SIM_PENALTY, b.ROOM_PENALTY_CAP))
    assert value == 100.0
    value = b.add(value, b.capped(b.ROOM_PENALTY_CAP, b.SIM_PENALTY, b.ROOM_PENALTY_CAP))
    assert 0.0 <= value <= 100.0
