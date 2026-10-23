"""Plain-data content for the vertical slice: room plan, cameos, lore words."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class RoomSpec:
    room_no: int
    puzzle_id: str
    anchor: Optional[int]  # anchor level that unlocks the room (None = no anchor)
    title: str


# Room 0 has no anchor; scanning the last room's anchor ends the game.
ROOM_PLAN: List[RoomSpec] = [
    RoomSpec(room_no=0, puzzle_id="hold_together", anchor=None, title="Agarraos fuerte"),
    RoomSpec(room_no=2, puzzle_id="cursed_wordle", anchor=2, title="La palabra maldita"),
]

# Shown while the host has not written the riddle for an anchor yet (batch D).
RIDDLE_PLACEHOLDER = "La pista aún no ha sido escrita... buscad el ancla por vuestra cuenta."

# 8 decoys, each with a brainrot cameo shown on jumpscare.
CAMEOS: List[str] = [
    "Tung Tung Tung Sahur",
    "Tralalero Tralala",
    "Bombardiro Crocodilo",
    "Ballerina Cappuccina",
    "Lirili Larila",
    "Brr Brr Patapim",
    "Chimpanzini Bananini",
    "Trippi Troppi",
]

# Lore words for the cursed wordle: only 5-6 letters, A-Z.
WORDLE_WORDS: List[str] = [
    "NOCLIP",
    "SMILER",
    "KETER",
    "SAHUR",
    "GYATT",
    "ENTITY",
    "WRAITH",
    "SPOOKY",
    "CURSED",
    "GHOULS",
    "HAUNT",
    "SPIRIT",
    "SHADOW",
    "MIMIC",
]
WORDLE_WORDS = [w for w in WORDLE_WORDS if 5 <= len(w) <= 6 and w.isalpha() and w.isupper()]
