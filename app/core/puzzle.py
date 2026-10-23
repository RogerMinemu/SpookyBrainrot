"""Puzzle plugin contract. Plugins are stateless; state lives in the game."""
from __future__ import annotations

from dataclasses import dataclass, field
from random import Random
from typing import Any, List, Protocol

from app.core.clock import Clock
from app.core.effects import Effect


class ActionRejected(Exception):
    """Raised by a plugin for an invalid action. Carries a machine code."""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message or code


@dataclass
class PlayerInfo:
    id: str
    name: str
    connected: bool = False


@dataclass
class PuzzleCtx:
    clock: Clock
    rng: Random
    players: List[PlayerInfo] = field(default_factory=list)  # join order


class Puzzle(Protocol):
    id: str
    title: str
    min_players: int

    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> Any: ...

    def handle(self, ctx: PuzzleCtx, s: Any, pid: str, action: dict) -> List[Effect]: ...

    def on_presence(self, ctx: PuzzleCtx, s: Any) -> List[Effect]: ...

    def tick(self, ctx: PuzzleCtx, s: Any) -> List[Effect]: ...

    def view_tv(self, s: Any) -> dict: ...

    def view_player(self, s: Any, pid: str) -> dict: ...

    def serialize(self, s: Any) -> dict: ...

    def deserialize(self, d: dict) -> Any: ...
