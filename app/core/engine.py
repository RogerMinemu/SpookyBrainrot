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
class TvAction:
    """An outcome reported by the TV (sim clear / penalty, replay request...). Never player-bound."""

    data: dict = field(default_factory=dict)


@dataclass
class Scan:
    kind: str  # "anchor" | "decoy"
    idx: int


@dataclass
class Tick:
    pass


@dataclass
class DebugJump:
    """Host debug: move to "lobby", "ending" or a room_no, optionally at a phase and (0-based) sub-level."""

    room: Any
    phase: Optional[str] = None
    level: Any = None


@dataclass
class DebugComplete:
    """Host debug: solve the running puzzle (as if the players had won it)."""


@dataclass
class DebugSetBrainrot:
    value: Any


@dataclass
class DebugEvent:
    """Host debug: fire a test event through the normal event channel (no state change)."""

    name: str
    cameo: Optional[str] = None


@dataclass
class DebugReset:
    """Host debug: back to a pristine lobby, keeping the players."""


Command = Any

DEBUG_ROOM_LOBBY = "lobby"
DEBUG_ROOM_ENDING = "ending"
DEBUG_EVENTS = ("jumpscare", "splash", "round_failed", "anchor_unlocked")
_ALL_PHASES = (PHASE_INTRO, PHASE_PUZZLE, PHASE_SEARCH, PHASE_UNLOCKED)


@dataclass
class Outcome:
    changed: bool = False
    events: List[Tuple[str, dict, str]] = field(default_factory=list)  # (name, data, to)
    scan_result: Optional[str] = None
    error: Optional[Tuple[str, str]] = None  # (code, message): goes to the sender only
    persist: bool = False  # persist without bumping seq (clock bookkeeping)
    broadcast: bool = False  # push the state to everyone without bumping seq (e.g. TV presence)

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
        if isinstance(cmd, TvAction):
            return self._tv_action(game, cmd)
        if isinstance(cmd, Scan):
            return self._scan(game, cmd)
        if isinstance(cmd, Tick):
            return self._tick(game)
        if isinstance(cmd, DebugJump):
            return self._debug_jump(game, cmd)
        if isinstance(cmd, DebugComplete):
            return self._debug_complete(game)
        if isinstance(cmd, DebugSetBrainrot):
            return self._debug_set_brainrot(game, cmd)
        if isinstance(cmd, DebugEvent):
            return self._debug_event(game, cmd)
        if isinstance(cmd, DebugReset):
            return self._debug_reset(game)
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
        return Outcome(changed=False, persist=True, broadcast=True)  # phones show tv_online

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
        if game.status == STATUS_LOBBY:
            if len(game.connected_players()) < self.min_players:
                return _reject("not_enough_players", f"hacen falta al menos {self.min_players} jugadores conectados")
            # the game starts in room 0's intro (the TV plays the prologue there); the next advance starts the puzzle
            game.status = STATUS_RUNNING
            return Outcome(changed=True)
        puzzle = self.puzzles.get(game.room.puzzle_id)
        if puzzle is None:
            return _reject("puzzle_unavailable", game.room.puzzle_id)
        game.puzzle_id = game.room.puzzle_id
        game.puzzle_state = puzzle.start(self._ctx(game), [p.id for p in game.connected_players()])
        game.phase = PHASE_PUZZLE
        return Outcome(changed=True)

    # --- puzzle actions ---------------------------------------------------------------------------------
    def _puzzle_action(self, game: Game, cmd: PuzzleAction) -> Outcome:
        puzzle = self._active_puzzle(game)
        if puzzle is None:
            return _reject("no_puzzle", "no hay ningún puzzle activo")
        if game.player(cmd.pid) is None:
            return _reject("unknown_player")
        try:
            effects = puzzle.handle(self._ctx(game), game.puzzle_state, cmd.pid, cmd.data)
        except ActionRejected as e:
            return _reject(e.code, e.message)
        out = Outcome()
        self._apply_effects(game, effects, out)
        return out

    def _tv_action(self, game: Game, cmd: TvAction) -> Outcome:
        puzzle = self._active_puzzle(game)
        if puzzle is None:
            return _reject("no_puzzle", "no hay ningún puzzle activo")
        handler = getattr(puzzle, "handle_tv", None)
        if handler is None:
            return _reject("no_tv_actions", "este puzzle no admite acciones de la tele")
        try:
            effects = handler(self._ctx(game), game.puzzle_state, cmd.data)
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

    # --- host debug commands (the engine stays the single source of truth) -------------------
    def debug_rooms(self) -> List[dict]:
        """Jump targets: [{key, room_no, title, phases, levels}]. `key` is what DebugJump.room accepts.

        `levels` lists the 0-based sub-levels DebugJump.level accepts for the puzzle phase (empty = none).
        """
        last = len(self.plan) - 1
        rooms: List[dict] = [{"key": DEBUG_ROOM_LOBBY, "room_no": None, "title": "Lobby", "phases": [], "levels": []}]
        for i, spec in enumerate(self.plan):
            phases = [PHASE_INTRO, PHASE_PUZZLE]
            if spec.anchor is not None:
                phases.append(PHASE_SEARCH)
            if i < last:
                phases.append(PHASE_UNLOCKED)  # the last room ends via the ending, not "unlocked"
            rooms.append(
                {
                    "key": spec.room_no,
                    "room_no": spec.room_no,
                    "title": spec.title,
                    "phases": phases,
                    "levels": self._levels_of(spec),
                }
            )
        rooms.append({"key": DEBUG_ROOM_ENDING, "room_no": None, "title": "Final", "phases": [], "levels": []})
        return rooms

    def _levels_of(self, spec: RoomSpec) -> List[int]:
        puzzle = self.puzzles.get(spec.puzzle_id)
        n = getattr(puzzle, "levels", 0) if puzzle is not None else 0
        return list(range(n)) if isinstance(n, int) and not isinstance(n, bool) and n > 0 else []

    def _clear_puzzle(self, game: Game) -> None:
        game.puzzle_id = None
        game.puzzle_state = None

    def _debug_jump(self, game: Game, cmd: DebugJump) -> Outcome:
        room, phase, level = cmd.room, cmd.phase, cmd.level
        if room in (DEBUG_ROOM_LOBBY, DEBUG_ROOM_ENDING) and not isinstance(room, bool) and level is not None:
            return _reject("unknown_level", "esta sala no tiene niveles")
        if room == DEBUG_ROOM_LOBBY and not isinstance(room, bool):
            if phase not in (None, PHASE_INTRO):
                return _reject("unknown_phase", "el lobby no tiene fases")
            self._clear_puzzle(game)
            game.status, game.room_idx, game.phase, game.ending = STATUS_LOBBY, 0, PHASE_INTRO, None
            return Outcome(changed=True)
        if room == DEBUG_ROOM_ENDING and not isinstance(room, bool):
            if phase is not None:
                return _reject("unknown_phase", "el final no tiene fases")
            self._clear_puzzle(game)
            game.status, game.room_idx, game.phase = STATUS_FINISHED, len(self.plan) - 1, PHASE_UNLOCKED
            game.ending = {"band": brainrot.band(game.brainrot), "brainrot": game.brainrot, "clock_ms": game.clock_ms}
            return Outcome(changed=True)

        idx = next(
            (i for i, s in enumerate(self.plan) if not isinstance(room, bool) and s.room_no == room), None
        )
        if idx is None:
            return _reject("unknown_room", f"sala desconocida: {room!r}")
        target = phase if phase is not None else PHASE_INTRO
        if target not in _ALL_PHASES:
            return _reject("unknown_phase", f"fase desconocida: {target!r}")
        spec = self.plan[idx]
        info = next(r for r in self.debug_rooms() if r["key"] == spec.room_no)
        if target not in info["phases"]:
            return _reject("unknown_phase", f"la sala {spec.room_no} no tiene la fase {target}")
        puzzle = self.puzzles.get(spec.puzzle_id) if target == PHASE_PUZZLE else None
        if target == PHASE_PUZZLE and puzzle is None:
            return _reject("puzzle_unavailable", spec.puzzle_id)
        if level is not None:  # validated before anything is touched: a bad level mutates nothing
            if target != PHASE_PUZZLE or not isinstance(level, int) or isinstance(level, bool) or level not in info["levels"]:
                return _reject("unknown_level", f"nivel desconocido: {level!r}")

        self._clear_puzzle(game)
        game.status, game.room_idx, game.phase, game.ending = STATUS_RUNNING, idx, target, None
        if puzzle is not None:
            pids = [p.id for p in game.connected_players()] or [p.id for p in game.players]
            game.puzzle_id = spec.puzzle_id
            ctx = self._ctx(game)
            game.puzzle_state = puzzle.start(ctx, pids)
            if level is not None:
                puzzle.jump_level(ctx, game.puzzle_state, level)
        return Outcome(changed=True)

    def _debug_complete(self, game: Game) -> Outcome:
        if self._active_puzzle(game) is None:
            return _reject("no_puzzle", "no hay ningún puzzle activo")
        out = Outcome(changed=True)
        self._complete(game, out)
        return out

    def _debug_set_brainrot(self, game: Game, cmd: DebugSetBrainrot) -> Outcome:
        v = cmd.value
        if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or v in (float("inf"), float("-inf")):
            return _reject("bad_value", "el brainrot debe ser un número entre 0 y 100")
        game.brainrot = brainrot.clamp(float(v))
        game.brainrot_log.append({"amount": 0, "reason": "debug", "total": game.brainrot})
        del game.brainrot_log[:-BRAINROT_LOG_MAX]
        return Outcome(changed=True)

    def _debug_event(self, game: Game, cmd: DebugEvent) -> Outcome:
        if cmd.name not in DEBUG_EVENTS:
            return _reject("unknown_event", f"evento desconocido: {cmd.name!r}")
        out = Outcome()
        if cmd.name == "jumpscare":
            cameo = cmd.cameo
            if cameo is not None and cameo not in CAMEOS:
                return _reject("unknown_cameo", f"brainrot desconocido: {cameo!r}")
            idx = CAMEOS.index(cameo) + 1 if cameo else 0
            out.events.append(("jumpscare", {"decoy": idx, "cameo": cameo or "???"}, "tv"))
        elif cmd.name == "splash":
            out.events.append(("splash", {"row": 0, "col": 0}, "all"))
        elif cmd.name == "round_failed":
            out.events.append(
                (
                    "round_failed",
                    {
                        "penalty": brainrot.ROUND_FAIL_PENALTY,
                        "title": "¡Ronda fallida!",
                        "text": "Algo ha salido mal... probad otra vez.",
                    },
                    "all",
                )
            )
        else:
            out.events.append(("anchor_unlocked", {"level": game.room.anchor or 1}, "all"))
        return out

    def _debug_reset(self, game: Game) -> Outcome:
        self._clear_puzzle(game)
        game.status, game.room_idx, game.phase, game.ending = STATUS_LOBBY, 0, PHASE_INTRO, None
        game.brainrot, game.brainrot_log, game.decoys_hit, game.clock_ms = 0.0, [], [], 0
        return Outcome(changed=True)

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
