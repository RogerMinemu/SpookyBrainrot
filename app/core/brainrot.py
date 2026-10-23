"""Brainrot meter: tunable penalties, clamping, ending bands, visual levels."""
from __future__ import annotations

# Tuning placeholders (Brainrot percentage points).
WRONG_ATTEMPT = 3
DECOY_PENALTY = 8
ROUND_FAIL_PENALTY = 10

BRAINROT_MIN = 0.0
BRAINROT_MAX = 100.0

BAND_ESCAPE = "escape"
BAND_PASSENGER = "escape_with_passenger"
BAND_BRAINROTS = "brainrots"

# Degradation steps: 0..MAX_DEGRADATION_LEVEL
DEGRADATION_STEP = 20
MAX_DEGRADATION_LEVEL = 5


def clamp(value: float) -> float:
    return max(BRAINROT_MIN, min(BRAINROT_MAX, value))


def add(current: float, amount: float) -> float:
    return clamp(current + amount)


def band(value: float) -> str:
    if value < 40:
        return BAND_ESCAPE
    if value <= 75:
        return BAND_PASSENGER
    return BAND_BRAINROTS


def degradation_level(value: float) -> int:
    return min(MAX_DEGRADATION_LEVEL, int(clamp(value) // DEGRADATION_STEP))
