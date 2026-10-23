"""Room 0, "Agarraos fuerte": every connected player holds for 5 s together.

Rules (see tasks resolution 11):
- required set = CONNECTED players; the timer runs while all of them hold (>= 1).
- a holder releasing resets the timer; a new/reconnecting player joins as a
  non-holder and resets it; a holder disconnecting only leaves the required set.
- duplicate hold_start and hold_end from a non-holder are ignored.
- time is read from ctx.clock (never real sleeps); tick() evaluates completion.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from app.core.effects import Complete, Effect, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx

HOLD_MS = 5000
PROGRESS_DECIMALS = 2


@dataclass
class HoldState:
    holders: Set[str] = field(default_factory=set)
    seen: Set[str] = field(default_factory=set)  # connected ids as of the last presence check
    names: Dict[str, str] = field(default_factory=dict)  # id -> name, join order
    since_ms: Optional[int] = None  # when everybody started holding (None = not running)
    progress: float = 0.0


class HoldTogether:
    id = "hold_together"
    title = "Agarraos fuerte"
    min_players = 1

    # --- helpers -------------------------------------------------------------------
    @staticmethod
    def _connected(ctx: PuzzleCtx) -> Set[str]:
        return {p.id for p in ctx.players if p.connected}

    @staticmethod
    def _sync_names(ctx: PuzzleCtx, s: HoldState) -> None:
        for p in ctx.players:
            s.names[p.id] = p.name

    def _recheck(self, ctx: PuzzleCtx, s: HoldState) -> bool:
        """Start/stop the timer from the current holders. Returns True if state changed."""
        required = self._connected(ctx)
        everybody = bool(required) and required <= s.holders
        changed = False
        if everybody and s.since_ms is None:
            s.since_ms = ctx.clock.now_ms()
            changed = True
        elif not everybody and s.since_ms is not None:
            s.since_ms = None
            changed = True
        if s.since_ms is None and s.progress != 0.0:
            s.progress = 0.0
            changed = True
        return changed

    # --- Puzzle protocol ---------------------------------------------------------------
    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> HoldState:
        s = HoldState(seen=self._connected(ctx))
        self._sync_names(ctx, s)
        return s

    def handle(self, ctx: PuzzleCtx, s: HoldState, pid: str, action: dict) -> List[Effect]:
        if action.get("type") != "hold" or not isinstance(action.get("down"), bool):
            raise ActionRejected("bad_action", "se esperaba {type: hold, down: bool}")
        self._sync_names(ctx, s)
        if action["down"]:
            if pid in s.holders or pid not in self._connected(ctx):
                return []
            s.holders.add(pid)
            self._recheck(ctx, s)
            return [Touch()]
        if pid not in s.holders:
            return []
        s.holders.discard(pid)
        s.since_ms = None  # any release resets the timer
        s.progress = 0.0
        self._recheck(ctx, s)
        return [Touch()]

    def on_presence(self, ctx: PuzzleCtx, s: HoldState) -> List[Effect]:
        current = self._connected(ctx)
        new = current - s.seen
        gone = s.seen - current
        self._sync_names(ctx, s)
        changed = bool(new or gone)
        s.holders -= gone
        s.holders -= new  # (re)connecting players start as non-holders
        if new and s.since_ms is not None:
            s.since_ms = None
            s.progress = 0.0
        s.seen = current
        changed = self._recheck(ctx, s) or changed
        return [Touch()] if changed else []

    def tick(self, ctx: PuzzleCtx, s: HoldState) -> List[Effect]:
        if s.since_ms is None:
            return []
        elapsed = ctx.clock.now_ms() - s.since_ms
        if elapsed >= HOLD_MS:
            s.progress = 1.0
            return [Complete()]
        progress = round(max(0.0, elapsed) / HOLD_MS, PROGRESS_DECIMALS)
        if progress == s.progress:
            return []
        s.progress = progress
        return [Touch()]

    def _common(self, s: HoldState) -> dict:
        return {"kind": self.id, "progress": s.progress, "hold_ms": HOLD_MS}

    def view_tv(self, s: HoldState) -> dict:
        view = self._common(s)
        view["players"] = [
            {"name": name, "holding": pid in s.holders} for pid, name in s.names.items() if pid in s.seen
        ]
        return view

    def view_player(self, s: HoldState, pid: str) -> dict:
        view = self._common(s)
        view["holding"] = pid in s.holders
        return view

    def serialize(self, s: HoldState) -> dict:
        return {"v": 1}

    def deserialize(self, d: dict) -> HoldState:
        return HoldState()  # holders are cleared on restore
