"""Pure synchronous engine: Engine.apply(game, command) -> Outcome.

No asyncio, no IO. Time comes from the injected Clock, randomness from the
injected Random. The async runtime wraps this under a per-game lock.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from random import Random
from typing import Any, List, Mapping, Optional, Sequence, Tuple

from app.content import CAMEOS, ROOM_PLAN, RoomSpec
from app.core import brainrot
from app.core.clock import Clock
from app.core.effects import AddBrainrot, Complete, Effect, Emit, Touch
from app.core.game import (
    PHASE_INTRO,
    PHASE_PUZZLE,
    PHASE_SEARCH,
    PHASE_UNLOCKED,
    STATUS_FINISHED,
    STATUS_LOBBY,
    STATUS_RUNNING,
    Game,
)
from app.core.puzzle import ActionRejected, Puzzle, PuzzleCtx

BRAINROT_LOG_MAX = 50

SCAN_UNLOCKED = "unlocked"
SCAN_FINISHED = "finished"
SCAN_SLEEPING = "sleeping"
SCAN_ALREADY = "already_done"
SCAN_UNSUPPORTED = "unsupported"
SCAN_JUMPSCARE = "jumpscare"
SCAN_LAUGH = "laugh"


# --- commands -----------------------------------------------------------------
@dataclass
class Join:
    pid: str


@dataclass
class Presence:
    pid: str
    connected: bool


@dataclass
class TvPresence:
    count: int


@dataclass
class Advance:
    pid: Optional[str] = None  # None = the TV


@dataclass
class PuzzleAction:
    pid: str
    data: dict = field(default_factory=dict)


@dataclass
class Scan:
    kind: str  # "anchor" | "decoy"
    idx: int


@dataclass
class Tick:
    pass


Command = Any


@dataclass
class Outcome:
    changed: bool = False
    events: List[Tuple[str, dict, str]] = field(default_factory=list)  # (name, data, to)
    scan_result: Optional[str] = None
    error: Optional[Tuple[str, str]] = None  # (code, message): goes to the sender only
    persist: bool = False  # persist without bumping seq (clock bookkeeping)

    @property
    def ok(self) -> bool:
        return self.error is None


def _reject(code: str, message: str = "") -> Outcome:
    return Outcome(changed=False, error=(code, message or code))


class Engine:
    def __init__(
        self,
        puzzles: Mapping[str, Puzzle],
        clock: Clock,
        rng: Random,
        min_players: int = 2,
        room_plan: Optional[Sequence[RoomSpec]] = None,
    ) -> None:
        self.puzzles = puzzles
        self.clock = clock
        self.rng = rng
        self.min_players = min_players
        self.plan: Sequence[RoomSpec] = room_plan if room_plan is not None else ROOM_PLAN

    # --- entry point --------------------------------------------------------------
    def apply(self, game: Game, cmd: Command) -> Outcome:
        self._settle_clock(game)
        if isinstance(cmd, Join):
            return self._join(game, cmd)
        if isinstance(cmd, Presence):
            return self._presence(game, cmd)
        if isinstance(cmd, TvPresence):
            return self._tv_presence(game, cmd)
        if isinstance(cmd, Advance):
            return self._advance(game, cmd)
        if isinstance(cmd, PuzzleAction):
            return self._puzzle_action(game, cmd)
        if isinstance(cmd, Scan):
            return self._scan(game, cmd)
        if isinstance(cmd, Tick):
            return self._tick(game)
        return _reject("unknown_command", type(cmd).__name__)

    # --- play clock (R3.4) -------------------------------------------------------------
    def _settle_clock(self, game: Game) -> None:
        """Accumulate elapsed play time only while running with a TV connected."""
        now = self.clock.now_ms()
        if game.last_tick_ms is not None and game.status == STATUS_RUNNING and game.tv_connected > 0:
            game.clock_ms += max(0, now - game.last_tick_ms)
        game.last_tick_ms = now

    # --- helpers ---------------------------------------------------------------------------
    def _ctx(self, game: Game) -> PuzzleCtx:
        return PuzzleCtx(clock=self.clock, rng=self.rng, players=game.player_infos())

    def _active_puzzle(self, game: Game) -> Optional[Puzzle]:
        if game.phase == PHASE_PUZZLE and game.puzzle_id is not None and game.puzzle_state is not None:
            return self.puzzles.get(game.puzzle_id)
        return None

    def _apply_effects(self, game: Game, effects: Sequence[Effect], out: Outcome) -> None:
        if not effects:
            return
        out.changed = True
        for eff in effects:
            if isinstance(eff, Emit):
                out.events.append((eff.name, dict(eff.data), eff.to))
            elif isinstance(eff, AddBrainrot):
                self._add_brainrot(game, eff.amount, eff.reason)
            elif isinstance(eff, Complete):
                self._complete(game, out)
            # Touch: nothing beyond changed=True

    def _add_brainrot(self, game: Game, amount: float, reason: str) -> None:
        game.brainrot = brainrot.add(game.brainrot, amount)
        game.brainrot_log.append({"amount": amount, "reason": reason, "total": game.brainrot})
        del game.brainrot_log[:-BRAINROT_LOG_MAX]

    def _complete(self, game: Game, out: Outcome) -> None:
        """Puzzle solved: Room without anchor -> unlocked; otherwise search for the anchor."""
        game.puzzle_id = None
        game.puzzle_state = None
        game.phase = PHASE_UNLOCKED if game.room.anchor is None else PHASE_SEARCH
        out.events.append(("puzzle_solved", {"room_no": game.room_no}, "all"))

    # --- join / presence ------------------------------------------------------------------------
    def _join(self, game: Game, cmd: Join) -> Outcome:
        out = Outcome(changed=True)
        puzzle = self._active_puzzle(game)
        if puzzle is not None:
            self._apply_effects(game, puzzle.on_presence(self._ctx(game), game.puzzle_state), out)
        return out

    def _presence(self, game: Game, cmd: Presence) -> Outcome:
        p = game.player(cmd.pid)
        if p is None or p.connected == cmd.connected:
            return Outcome()
        p.connected = cmd.connected
        out = Outcome(changed=True)
        puzzle = self._active_puzzle(game)
        if puzzle is not None:
            self._apply_effects(game, puzzle.on_presence(self._ctx(game), game.puzzle_state), out)
        return out

    def _tv_presence(self, game: Game, cmd: TvPresence) -> Outcome:
        count = max(0, cmd.count)
        if count == game.tv_connected:
            return Outcome()
        game.tv_connected = count  # clock was already settled with the old count
        return Outcome(changed=False, persist=True)

    # --- advance (resolution 3) ---------------------------------------------------------------------
    def _advance(self, game: Game, cmd: Advance) -> Outcome:
        if game.status == STATUS_FINISHED or game.phase not in (PHASE_INTRO, PHASE_UNLOCKED):
            return _reject("wrong_phase", "advance is not allowed now")
        if cmd.pid is not None and game.player(cmd.pid) is None:
            return _reject("unknown_player")

        if game.phase == PHASE_UNLOCKED:
            if game.room_idx >= len(self.plan) - 1:
                return _reject("wrong_phase", "no next room")
            game.room_idx += 1
            game.phase = PHASE_INTRO
            return Outcome(changed=True)

        # phase == INTRO
        if game.status == STATUS_LOBBY and len(game.connected_players()) < self.min_players:
            return _reject("not_enough_players", f"hacen falta al menos {self.min_players} jugadores conectados")
        puzzle = self.puzzles.get(game.room.puzzle_id)
        if puzzle is None:
            return _reject("puzzle_unavailable", game.room.puzzle_id)
        if game.status == STATUS_LOBBY:
            game.status = STATUS_RUNNING
        game.puzzle_id = game.room.puzzle_id
        game.puzzle_state = puzzle.start(self._ctx(game), [p.id for p in game.connected_players()])
        game.phase = PHASE_PUZZLE
        return Outcome(changed=True)

    # --- puzzle actions ---------------------------------------------------------------------------------
    def _puzzle_action(self, game: Game, cmd: PuzzleAction) -> Outcome:
        puzzle = self._active_puzzle(game)
        if puzzle is None:
            return _reject("no_puzzle", "no hay ningun puzzle activo")
        if game.player(cmd.pid) is None:
            return _reject("unknown_player")
        try:
            effects = puzzle.handle(self._ctx(game), game.puzzle_state, cmd.pid, cmd.data)
        except ActionRejected as e:
            return _reject(e.code, e.message)
        out = Outcome()
        self._apply_effects(game, effects, out)
        return out

    # --- tick ----------------------------------------------------------------------------------------------
    def _tick(self, game: Game) -> Outcome:
        out = Outcome()
        puzzle = self._active_puzzle(game)
        if puzzle is not None:
            self._apply_effects(game, puzzle.tick(self._ctx(game), game.puzzle_state), out)
        return out

    # --- QR scans (anchors; decoys arrive in batch D) ---------------------------------------------------------
    def _passed_anchors(self, game: Game) -> List[int]:
        passed: List[int] = []
        for i, room in enumerate(self.plan):
            if room.anchor is None:
                continue
            if game.status == STATUS_FINISHED or i < game.room_idx or (
                i == game.room_idx and game.phase == PHASE_UNLOCKED
            ):
                passed.append(room.anchor)
        return passed

    def _scan_decoy(self, game: Game, idx: int) -> Outcome:
        """R7.6: first scan of a decoy -> penalty + jumpscare; repeats only laugh."""
        if game.status != STATUS_RUNNING:
            return Outcome(scan_result=SCAN_SLEEPING)
        cameo = CAMEOS[idx - 1] if 1 <= idx <= len(CAMEOS) else "???"
        if idx in game.decoys_hit:
            return Outcome(scan_result=SCAN_LAUGH)
        game.decoys_hit.append(idx)
        self._add_brainrot(game, brainrot.DECOY_PENALTY, "decoy")
        out = Outcome(changed=True, scan_result=SCAN_JUMPSCARE)
        out.events.append(("jumpscare", {"decoy": idx, "cameo": cameo}, "tv"))
        out.events.append(("toast", {"text": f"{cameo} os ha encontrado..."}, "all"))
        return out

    def _scan(self, game: Game, cmd: Scan) -> Outcome:
        if cmd.kind == "decoy":
            return self._scan_decoy(game, cmd.idx)
        if cmd.kind != "anchor":
            return Outcome(scan_result=SCAN_UNSUPPORTED)
        if cmd.idx in self._passed_anchors(game):
            return Outcome(scan_result=SCAN_ALREADY)
        if game.status != STATUS_RUNNING or game.phase != PHASE_SEARCH or game.room.anchor != cmd.idx:
            return Outcome(scan_result=SCAN_SLEEPING)
        out = Outcome(changed=True)
        out.events.append(("anchor_unlocked", {"level": cmd.idx}, "all"))
        if game.room_idx >= len(self.plan) - 1:
            game.status = STATUS_FINISHED
            game.phase = PHASE_UNLOCKED
            game.ending = {"band": brainrot.band(game.brainrot), "brainrot": game.brainrot, "clock_ms": game.clock_ms}
            out.scan_result = SCAN_FINISHED
        else:
            game.phase = PHASE_UNLOCKED
            out.scan_result = SCAN_UNLOCKED
        return out
