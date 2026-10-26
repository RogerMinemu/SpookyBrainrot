"""Brainrot meter: tunable penalties, clamping, ending bands, visual levels."""
from __future__ import annotations

# Tuning placeholders (Brainrot percentage points).
DECOY_PENALTY = 8
ROUND_FAIL_PENALTY = 10
SIM_PENALTY = 2  # a fall / getting caught reported by the TV sim
SIM_PENALTY_COOLDOWN_MS = 2500  # min gap between sim penalties, per room
ROOM_PENALTY_CAP = 12  # max total sim penalty per puzzle instance
SAHUR_FAIL_PENALTY = 3
SHAPE_FAIL_PENALTY = 3  # room 3: somebody miscounted
TRIVIA_FAIL_PENALTY = 3  # room 4: a wrong group answer
BOMB_STRIKE_PENALTY = 1  # room 6: a wrong cut / press / password
BOMB_BOOM_PENALTY = 5  # room 6: the bomb went off

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


def capped(total: float, amount: float, cap: float) -> float:
    """Part of `amount` that still fits under `cap` given `total` already applied (never negative)."""
    return max(0.0, min(amount, cap - total))


def band(value: float) -> str:
    if value < 40:
        return BAND_ESCAPE
    if value <= 75:
        return BAND_PASSENGER
    return BAND_BRAINROTS


def degradation_level(value: float) -> int:
    return min(MAX_DEGRADATION_LEVEL, int(clamp(value) // DEGRADATION_STEP))
