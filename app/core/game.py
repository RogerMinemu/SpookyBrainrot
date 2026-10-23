"""Game aggregate: identity, players and gameplay state, with (de)serialization.

Players are stored in their own table (identity); `state_json` holds gameplay
only (see Game.serialize_state).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional

from app.content import ROOM_PLAN, RoomSpec
from app.core.puzzle import PlayerInfo, Puzzle

STATE_VERSION = 1
MAX_NAME_LEN = 24

STATUS_LOBBY = "lobby"
STATUS_RUNNING = "running"
STATUS_FINISHED = "finished"

PHASE_INTRO = "intro"
PHASE_PUZZLE = "puzzle"
PHASE_SEARCH = "search"
PHASE_UNLOCKED = "unlocked"


@dataclass
class Player:
    id: str
    name: str
    connected: bool = False


def normalize_name(raw: str) -> str:
    return " ".join((raw or "").split())[:MAX_NAME_LEN].strip()


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

    def unique_name(self, raw: str) -> str:
        base = normalize_name(raw)
        taken = {p.name.lower() for p in self.players}
        if base.lower() not in taken:
            return base
        n = 2
        while True:
            suffix = f" {n}"
            candidate = base[: MAX_NAME_LEN - len(suffix)].rstrip() + suffix
            if candidate.lower() not in taken:
                return candidate
            n += 1

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
            room_idx=state.get("room_idx", 0),
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
        pz = state.get("puzzle")
        if pz:
            g.puzzle_id = pz["id"]
            g.puzzle_state = puzzles[pz["id"]].deserialize(pz["state"])
        return g
