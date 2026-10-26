"""Room 2, "Un, dos, tres... ¡Tralalero!": swim to Tralalero while he is not looking.

The TV sim owns lanes, cues and catches. It reports through handle_tv (TvAction), all with epoch + level
(level is always 0 here):
- `arrive {pid}`: that player reached the end. The server keeps the arrived set.
- `clear`: the TV believes everybody is in. Accepted only if every CONNECTED player has arrived.
- `penalty {pid}`: a player was caught (rate-limited and capped like every sim penalty).

All-must-arrive: the room clears once every connected player has arrived. A disconnect removes that player
from the requirement (their arrival is remembered if they come back); a joiner must arrive too.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Set

from app.core.effects import Complete, Effect, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx
from app.puzzles.sim_common import SimGuard, reason_of


@dataclass
class RedLightState:
    guard: SimGuard = field(default_factory=SimGuard)
    arrived: Set[str] = field(default_factory=set)  # kept across disconnects


class RedLight:
    id = "red_light"
    title = "Un, dos, tres... ¡Tralalero!"
    min_players = 1
    levels = 0  # no sub-levels: nothing to jump to in the debug panel

    # --- helpers ---------------------------------------------------------------------
    @staticmethod
    def _connected(ctx: PuzzleCtx) -> Set[str]:
        return {p.id for p in ctx.players if p.connected}

    def _everybody_in(self, ctx: PuzzleCtx, s: RedLightState) -> bool:
        required = self._connected(ctx)
        return bool(required) and required <= s.arrived

    # --- Puzzle protocol ---------------------------------------------------------------
    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> RedLightState:
        return RedLightState(guard=SimGuard(epoch=1, level=0, seed=ctx.rng.randrange(1 << 31)))

    def handle(self, ctx: PuzzleCtx, s: RedLightState, pid: str, action: dict) -> List[Effect]:
        raise ActionRejected("bad_action", "este puzzle se juega con los mandos, no con acciones")

    def handle_tv(self, ctx: PuzzleCtx, s: RedLightState, data: dict) -> List[Effect]:
        action = data.get("action")
        if action not in ("arrive", "clear", "penalty"):
            raise ActionRejected("bad_action", "se esperaba {action: arrive|clear|penalty}")
        s.guard.check(data)
        pid = data.get("pid")
        if action != "clear":
            if not isinstance(pid, str) or pid not in {p.id for p in ctx.players}:
                raise ActionRejected("unknown_player")
        if action == "penalty":
            if pid in s.arrived:
                return []  # finishers can never be caught
            return s.guard.penalty(ctx, reason_of(data, "caught"))
        if action == "arrive":
            if pid in s.arrived:
                return []  # duplicate
            s.arrived.add(pid)
            return [Complete()] if self._everybody_in(ctx, s) else [Touch()]
        if not self._everybody_in(ctx, s):
            raise ActionRejected("not_all_arrived", "faltan jugadores por llegar")
        return [Complete()]

    def on_presence(self, ctx: PuzzleCtx, s: RedLightState) -> List[Effect]:
        # A disconnect may leave only finishers connected; a joiner is simply a new requirement.
        return [Complete()] if self._everybody_in(ctx, s) else []

    def tick(self, ctx: PuzzleCtx, s: RedLightState) -> List[Effect]:
        return []

    # --- views -----------------------------------------------------------------------------
    def _common(self, s: RedLightState) -> dict:
        return {"kind": self.id, "level": s.guard.level, "epoch": s.guard.epoch}

    def view_tv(self, s: RedLightState) -> dict:
        view = self._common(s)
        view["seed"] = s.guard.seed
        view["arrived"] = sorted(s.arrived)
        return view

    def view_player(self, s: RedLightState, pid: str) -> dict:
        view = self._common(s)
        view["you_arrived"] = pid in s.arrived  # phones only learn about themselves
        return view

    # --- persistence --------------------------------------------------------------------------
    def serialize(self, s: RedLightState) -> dict:
        return {"v": 1, **s.guard.to_dict(), "arrived": sorted(s.arrived)}

    def deserialize(self, d: dict) -> RedLightState:
        return RedLightState(guard=SimGuard.from_dict(d), arrived={str(p) for p in d.get("arrived", [])})
