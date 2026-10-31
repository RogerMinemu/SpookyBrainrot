"""Game aggregate: identity, players and gameplay state, with (de)serialization.

Players are stored in their own table (identity); `state_json` holds gameplay
only (see Game.serialize_state).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Sequence

from app.content import ROOM_PLAN, RoomSpec
from app.core.puzzle import PlayerInfo, Puzzle

STATE_VERSION = 3
# v1 saves stored only room_idx over the old two-room plan: idx 0 = room 0, idx 1 = room 2 (Wordle).
LEGACY_V1_ROOM_NOS = (0, 2)
# v2 saves numbered the rooms 0..4, 6, 7 (room 5 had been dropped); v3 closes the gap. A v2 room 5 has no room.
LEGACY_V2_ROOM_NOS = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 6: 5, 7: 6}
MAX_NAME_LEN = 24

STATUS_LOBBY = "lobby"
STATUS_RUNNING = "running"
STATUS_FINISHED = "finished"

PHASE_INTRO = "intro"
PHASE_PUZZLE = "puzzle"
PHASE_SEARCH = "search"
PHASE_UNLOCKED = "unlocked"


def resolve_room_idx(state: Mapping[str, Any], plan: Optional[Sequence[RoomSpec]] = None) -> int:
    """Index into the room plan for a stored state blob (any version). Never raises, always in range.

    v3 saves carry `room_no` and are looked up by it; v2 ones too, renumbered through LEGACY_V2_ROOM_NOS; v1 saves
    only have the old plan's index, which maps through LEGACY_V1_ROOM_NOS. Anything unknown clamps into the plan.
    """
    plan = ROOM_PLAN if plan is None else plan
    last = len(plan) - 1
    raw = state.get("room_idx", 0)
    idx = raw if isinstance(raw, int) and not isinstance(raw, bool) else 0
    version = state.get("v", 1)
    version = version if isinstance(version, int) and not isinstance(version, bool) else 1
    if version >= 3:
        room_no = state.get("room_no")
    elif version == 2:
        old = state.get("room_no")
        room_no = LEGACY_V2_ROOM_NOS.get(old) if isinstance(old, int) and not isinstance(old, bool) else None
    else:
        room_no = LEGACY_V1_ROOM_NOS[max(0, min(idx, len(LEGACY_V1_ROOM_NOS) - 1))]
    if room_no is not None:
        for i, spec in enumerate(plan):
            if spec.room_no == room_no:
                return i
    return max(0, min(idx, last))


def resolve_room(state: Mapping[str, Any]) -> RoomSpec:
    return ROOM_PLAN[resolve_room_idx(state)]


@dataclass
class Player:
    id: str
    name: str
    connected: bool = False


def normalize_name(raw: str) -> str:
    return " ".join((raw or "").split())[:MAX_NAME_LEN].strip()


def same_name(a: str, b: str) -> bool:
    """Names match ignoring case and extra spaces ("  roger " is Roger)."""
    return normalize_name(a).casefold() == normalize_name(b).casefold()


@dataclass
class Game:
    id: str
    code: str
    name: str
    status: str = STATUS_LOBBY
    room_idx: int = 0
    phase: str = PHASE_INTRO
    brainrot: float = 0.0
    brainrot_log: List[dict] = field(default_factory=list)
    decoys_hit: List[int] = field(default_factory=list)
    clock_ms: int = 0
    seq: int = 0
    puzzle_id: Optional[str] = None
    puzzle_state: Any = None
    ending: Optional[dict] = None
    players: List[Player] = field(default_factory=list)  # join order
    # Transient (never serialized): play-clock bookkeeping.
    tv_connected: int = field(default=0, compare=False)
    last_tick_ms: Optional[int] = field(default=None, compare=False)

    # --- room helpers -------------------------------------------------
    @property
    def room(self) -> RoomSpec:
        return ROOM_PLAN[min(self.room_idx, len(ROOM_PLAN) - 1)]

    @property
    def room_no(self) -> int:
        return self.room.room_no

    # --- players ------------------------------------------------------
    def player(self, pid: str) -> Optional[Player]:
        return next((p for p in self.players if p.id == pid), None)

    def player_named(self, raw: str) -> Optional[Player]:
        """The player who already goes by this name: joining with it again resumes that seat."""
        return next((p for p in self.players if same_name(p.name, raw)), None)

    def add_player(self, pid: str, name: str) -> Player:
        p = Player(id=pid, name=name, connected=False)
        self.players.append(p)
        return p

    def connected_players(self) -> List[Player]:
        return [p for p in self.players if p.connected]

    def player_infos(self) -> List[PlayerInfo]:
        return [PlayerInfo(p.id, p.name, p.connected) for p in self.players]

    # --- (de)serialization ---------------------------------------------
    def serialize_state(self, puzzles: Mapping[str, Puzzle]) -> Dict[str, Any]:
        puzzle: Optional[dict] = None
        if self.puzzle_id is not None:
            puzzle = {"id": self.puzzle_id, "state": puzzles[self.puzzle_id].serialize(self.puzzle_state)}
        return {
            "v": STATE_VERSION,
            "room_idx": self.room_idx,
            "room_no": self.room_no,
            "phase": self.phase,
            "brainrot": self.brainrot,
            "brainrot_log": list(self.brainrot_log),
            "decoys_hit": list(self.decoys_hit),
            "clock_ms": self.clock_ms,
            "seq": self.seq,
            "puzzle": puzzle,
            "ending": self.ending,
        }

    @classmethod
    def from_state(
        cls,
        id: str,
        code: str,
        name: str,
        status: str,
        state: Mapping[str, Any],
        players: List[Player],
        puzzles: Mapping[str, Puzzle],
    ) -> "Game":
        g = cls(
            id=id,
            code=code,
            name=name,
            status=status,
            room_idx=resolve_room_idx(state),
            phase=state.get("phase", PHASE_INTRO),
            brainrot=state.get("brainrot", 0.0),
            brainrot_log=list(state.get("brainrot_log", [])),
            decoys_hit=list(state.get("decoys_hit", [])),
            clock_ms=state.get("clock_ms", 0),
            seq=state.get("seq", 0),
            ending=state.get("ending"),
            players=players,
        )
        for p in g.players:
            p.connected = False  # R1.4: players always start disconnected
        if status == STATUS_FINISHED:
            g.room_idx = len(ROOM_PLAN) - 1  # a finished game always sits on the last room
        pz = state.get("puzzle")
        if pz:
            # Unknown id, a puzzle that does not belong to this room, or a blob that no longer
            # deserializes (older/newer plugin) all fall back to the room intro instead of raising.
            plugin = puzzles.get(pz.get("id")) if isinstance(pz, Mapping) else None
            if plugin is not None and pz.get("id") == g.room.puzzle_id:
                try:
                    g.puzzle_state = plugin.deserialize(pz.get("state"))
                    g.puzzle_id = pz["id"]
                except Exception:
                    g.puzzle_id, g.puzzle_state = None, None
        if g.phase == PHASE_PUZZLE and g.puzzle_state is None:
            g.phase = PHASE_INTRO
        return g
