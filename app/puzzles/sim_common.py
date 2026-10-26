"""Shared bits of the TV-simulated rooms (platformer, red light): report guard and penalty gate.

The TV owns the physics; the server only keeps `epoch` + `level` and validates the outcomes the TV reports:
- a report must carry the current epoch and level, otherwise it is stale (ActionRejected, no mutation);
- sim penalties are rate-limited per room (SIM_PENALTY_COOLDOWN_MS) and capped per puzzle instance
  (ROOM_PENALTY_CAP). Excess penalties are ignored, never an error: the TV cannot know the cap.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional

from app.core import brainrot
from app.core.effects import AddBrainrot, Effect
from app.core.puzzle import ActionRejected, PuzzleCtx

MAX_REASON_LEN = 24


def _is_int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


@dataclass
class SimGuard:
    """epoch/level + penalty bookkeeping, embedded in each sim puzzle's state."""

    epoch: int = 1
    level: int = 0
    seed: int = 0
    penalty_total: float = 0.0
    last_penalty_ms: Optional[int] = None

    # --- report guard ---------------------------------------------------------------
    def check(self, data: dict) -> None:
        """Raise ActionRejected unless the report is for the current epoch and level."""
        if not _is_int(data.get("epoch")) or not _is_int(data.get("level")):
            raise ActionRejected("bad_action", "el informe necesita epoch y level")
        if data["epoch"] != self.epoch or data["level"] != self.level:
            raise ActionRejected("stale", "informe obsoleto")

    def restart(self, level: int, seed: int) -> None:
        """New epoch (the TV rebuilds its sim); the penalty budget of the room is kept."""
        self.epoch += 1
        self.level = level
        self.seed = seed

    # --- penalties ----------------------------------------------------------------------
    def penalty(self, ctx: PuzzleCtx, reason: str) -> List[Effect]:
        """Brainrot effect for a reported fall/catch, or [] when rate-limited or over the room cap."""
        now = ctx.clock.now_ms()
        if self.last_penalty_ms is not None and 0 <= now - self.last_penalty_ms < brainrot.SIM_PENALTY_COOLDOWN_MS:
            return []
        amount = brainrot.capped(self.penalty_total, brainrot.SIM_PENALTY, brainrot.ROOM_PENALTY_CAP)
        if amount <= 0:
            return []
        self.penalty_total += amount
        self.last_penalty_ms = now
        return [AddBrainrot(amount, reason)]

    # --- persistence -----------------------------------------------------------------------
    def to_dict(self) -> dict:
        return {
            "epoch": self.epoch,
            "level": self.level,
            "seed": self.seed,
            "penalty_total": self.penalty_total,
            "last_penalty_ms": self.last_penalty_ms,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "SimGuard":
        last = d.get("last_penalty_ms")
        return cls(
            epoch=int(d.get("epoch", 1)),
            level=int(d.get("level", 0)),
            seed=int(d.get("seed", 0)),
            penalty_total=float(d.get("penalty_total", 0.0)),
            last_penalty_ms=int(last) if last is not None else None,
        )


def reason_of(data: dict, default: str) -> str:
    """Short, safe reason label for the brainrot log (the TV supplies `why`)."""
    why = data.get("why")
    if isinstance(why, str) and why.isidentifier():
        return f"sim_{why[:MAX_REASON_LEN]}"
    return f"sim_{default}"
