"""Test doubles: deterministic clock and seeded RNG."""
from __future__ import annotations

import random


class FakeClock:
    """Manually advanced clock. now_ms() is milliseconds, now() is seconds."""

    def __init__(self, start_ms: int = 1_000_000) -> None:
        self._ms = start_ms

    def now_ms(self) -> int:
        return self._ms

    def now(self) -> float:
        return self._ms / 1000.0

    def advance(self, seconds: float) -> None:
        self._ms += int(round(seconds * 1000))


def seeded_rng(seed: int = 1234) -> random.Random:
    return random.Random(seed)
