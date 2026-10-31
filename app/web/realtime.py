"""Realtime lane helpers: rate limiting and the in-memory phone-input relay.

Nothing here touches the room lock, persistence or game state: input masks live and die in memory.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

MASK_BITS = 0x0F  # L=1 R=2 J=4 A=8

MAX_FRAME_BYTES = 8192  # any frame above this is dropped before parsing
FRAME_LIMITS = {"input": 128, "fx": 512, "sim": 512, "story": 256}  # per-type caps, checked on the raw frame
# type -> (burst, refill per second). "sim" is one report per arrival / fall: a whole group of 12 reaching the end of
# Tralalero's pool in the same instant must fit, or a dropped arrival leaves the room waiting forever.
BUCKET_SPECS = {"input": (30, 30.0), "fx": (30, 30.0), "sim": (32, 10.0), "story": (4, 2.0)}

FX_KIND = re.compile(r"^[a-z_]{1,16}$")


class TokenBucket:
    """Classic token bucket on an injectable millisecond clock (FakeClock => buckets never refill)."""

    def __init__(self, burst: int, per_second: float, now_ms: Callable[[], int]) -> None:
        self.burst = float(burst)
        self.rate = per_second / 1000.0
        self.now_ms = now_ms
        self.tokens = float(burst)
        self.last = now_ms()

    def allow(self) -> bool:
        now = self.now_ms()
        self.tokens = min(self.burst, self.tokens + max(0, now - self.last) * self.rate)
        self.last = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


def clean_mask(value) -> Optional[int]:
    """Valid bits of a client mask, or None when the value is not a plain int (bool is not)."""
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value & MASK_BITS


def frame_ok(kind: str, raw: str) -> bool:
    """Size gate for a realtime frame (the raw text length, before JSON parsing of the payload)."""
    return len(raw) <= FRAME_LIMITS.get(kind, MAX_FRAME_BYTES)


@dataclass
class InputRelay:
    """Last mask per game/pid, plus the per-connection buckets."""

    now_ms: Callable[[], int] = field(default=lambda: int(time.time() * 1000))
    masks: Dict[str, Dict[str, int]] = field(default_factory=dict)

    def bucket(self, owner: dict, kind: str) -> TokenBucket:
        """`owner` is the connection's own bucket dict."""
        b = owner.get(kind)
        if b is None:
            burst, rate = BUCKET_SPECS[kind]
            b = owner[kind] = TokenBucket(burst, rate, self.now_ms)
        return b

    def set(self, game_id: str, pid: str, mask: int) -> None:
        self.masks.setdefault(game_id, {})[pid] = mask

    def zero(self, game_id: str, pid: str) -> bool:
        """Forget the pid's mask. True when there was one to zero (the TV must be told)."""
        game = self.masks.get(game_id)
        if not game or pid not in game:
            return False
        del game[pid]
        if not game:
            self.masks.pop(game_id, None)
        return True

    def replay(self, game_id: str, connected: List[str]) -> List[Tuple[str, int]]:
        game = self.masks.get(game_id, {})
        return [(pid, game[pid]) for pid in connected if game.get(pid)]

    def drop_game(self, game_id: str) -> None:
        self.masks.pop(game_id, None)
