"""Puzzle registry. Core never imports concrete puzzles; bootstrap injects this."""
from __future__ import annotations

from typing import Dict

from app.core.puzzle import Puzzle
from app.puzzles.backrooms_trivia import BackroomsTrivia
from app.puzzles.bomb_defusal import BombDefusal
from app.puzzles.coop_platformer import CoopPlatformer
from app.puzzles.hold_together import HoldTogether
from app.puzzles.red_light import RedLight
from app.puzzles.sahur_dice import SahurDice
from app.puzzles.shape_count import ShapeCount


def build_registry() -> Dict[str, Puzzle]:
    puzzles = (HoldTogether(), CoopPlatformer(), RedLight(), ShapeCount(), BackroomsTrivia(), BombDefusal(), SahurDice())
    return {p.id: p for p in puzzles}
