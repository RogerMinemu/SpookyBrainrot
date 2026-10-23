"""Puzzle registry. Core never imports concrete puzzles; bootstrap injects this."""
from __future__ import annotations

from typing import Dict

from app.core.puzzle import Puzzle
from app.puzzles.cursed_wordle import CursedWordle
from app.puzzles.hold_together import HoldTogether


def build_registry() -> Dict[str, Puzzle]:
    return {HoldTogether.id: HoldTogether(), CursedWordle.id: CursedWordle()}
