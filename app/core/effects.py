"""Effects a puzzle plugin returns; the engine applies them in order."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Union


@dataclass
class Emit:
    name: str
    data: dict = field(default_factory=dict)
    to: str = "all"  # "tv" | "all" | player_id


@dataclass
class AddBrainrot:
    amount: float
    reason: str = ""


@dataclass
class Complete:
    pass


@dataclass
class Touch:
    """Marks the puzzle state as changed without any other effect.

    Plugin contract: an EMPTY effect list means "nothing changed".
    """


Effect = Union[Emit, AddBrainrot, Complete, Touch]
