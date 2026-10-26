"""Room 1, "Nivel 0": four cooperative single-screen levels simulated on the TV.

The server stores only the sub-level, an epoch and a seed. The TV sim reports outcomes through
handle_tv (TvAction): `clear` (level done) and `penalty` (a player fell). Both carry epoch + level; stale
or duplicate reports are rejected with no state change. Clearing the last level completes the puzzle and
the room goes on to the normal riddle/anchor search phase.
"""
from __future__ import annotations

from typing import List

from app.core.effects import Complete, Effect, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx
from app.puzzles.sim_common import SimGuard, reason_of

LEVELS = 4


class CoopPlatformer:
    id = "coop_platformer"
    title = "Nivel 0"
    min_players = 1
    levels = LEVELS

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
            if s.level >= LEVELS - 1:
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
        return {"kind": self.id, "level": s.level, "levels": LEVELS, "epoch": s.epoch}

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
