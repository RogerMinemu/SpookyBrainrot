"""Cooperative platformer levels simulated on the TV: Room 1 "Nivel 0" (single screens) and Room 7 "La salida de Sahur"
(long levels that scroll).

The two rooms are the same puzzle with a different level set (static/puzzles/coop_platformer/levels.js): the view
carries `set` and the TV builds that set's sim. The server stores only the sub-level, an epoch and a seed. The TV
sim reports outcomes through handle_tv (TvAction): `clear` (level done) and `penalty` (a player fell or touched the
spikes). Both carry epoch + level; stale or duplicate reports are rejected with no state change. Clearing the last
level completes the puzzle and the room goes on to the normal riddle/anchor search phase.
"""
from __future__ import annotations

from typing import List

from app.core.effects import Complete, Effect, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx
from app.puzzles.sim_common import SimGuard, reason_of

LEVELS = 4  # Room 1
SAHUR_LEVELS = 5  # Room 7: the long scrolling levels


class CoopPlatformer:
    min_players = 1

    def __init__(self, id: str = "coop_platformer", title: str = "Nivel 0", level_set: str = "nivel0",
                 levels: int = LEVELS) -> None:
        self.id = id
        self.title = title
        self.level_set = level_set  # the key of LEVEL_SETS in levels.js
        self.levels = levels

    # --- Puzzle protocol ---------------------------------------------------------------
    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> SimGuard:
        return SimGuard(epoch=1, level=0, seed=ctx.rng.randrange(1 << 31))

    def handle(self, ctx: PuzzleCtx, s: SimGuard, pid: str, action: dict) -> List[Effect]:
        raise ActionRejected("bad_action", "este puzzle se juega con los mandos, no con acciones")

    def handle_tv(self, ctx: PuzzleCtx, s: SimGuard, data: dict) -> List[Effect]:
        action = data.get("action")
        if action not in ("clear", "penalty"):
            raise ActionRejected("bad_action", "se esperaba {action: clear|penalty}")
        s.check(data)
        if action == "clear":
            if s.level >= self.levels - 1:
                return [Complete()]
            s.level += 1
            return [Touch()]
        pid = data.get("pid")
        if pid is not None and pid not in {p.id for p in ctx.players}:
            raise ActionRejected("unknown_player")
        return s.penalty(ctx, reason_of(data, "fall"))

    def jump_level(self, ctx: PuzzleCtx, s: SimGuard, level: int) -> None:
        s.restart(level, ctx.rng.randrange(1 << 31))

    def on_presence(self, ctx: PuzzleCtx, s: SimGuard) -> List[Effect]:
        return []  # the TV sim recomputes thresholds from the connected roster itself

    def tick(self, ctx: PuzzleCtx, s: SimGuard) -> List[Effect]:
        return []

    # --- views -----------------------------------------------------------------------------
    def _common(self, s: SimGuard) -> dict:
        return {"kind": self.id, "title": self.title, "set": self.level_set, "level": s.level, "levels": self.levels,
                "epoch": s.epoch}

    def view_tv(self, s: SimGuard) -> dict:
        view = self._common(s)
        view["seed"] = s.seed
        return view

    def view_player(self, s: SimGuard, pid: str) -> dict:
        return self._common(s)

    # --- persistence --------------------------------------------------------------------------
    def serialize(self, s: SimGuard) -> dict:
        return {"v": 1, **s.to_dict()}

    def deserialize(self, d: dict) -> SimGuard:
        return SimGuard.from_dict(d)


def sahur_platformer() -> CoopPlatformer:
    """Room 7: Sahur's five scrolling levels (drums, small buttons, lifts, lanterns and his chase, with Room 1's pieces)."""
    return CoopPlatformer(id="sahur_platformer", title="La salida de Sahur", level_set="sahur", levels=SAHUR_LEVELS)
