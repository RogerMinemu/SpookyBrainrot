"""Room 2, "La palabra maldita": a Wordle played together, one guess per turn.

Rules (spec section 6 + tasks resolutions 2 and 4):
- 6 shared attempts; each one is typed by the turn player, rotating over the
  CONNECTED players in join order (a disconnected player's turn is skipped).
- standard two-pass Wordle scoring (duplicate letters handled by counts).
- every miss adds WRONG_ATTEMPT brainrot; the 6th miss also adds
  ROUND_FAIL_PENALTY and starts a new round (new word, attempts back to 0).
- each phone privately holds one letter that is NOT in the word. It lives only
  in view_player(); the TV view and other players never see it.
- salpicon: after attempts 2 and 4 one revealed cell is covered (display only).
"""
from __future__ import annotations

import string
import unicodedata
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from app.content import WORDLE_WORDS
from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Effect, Emit, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx

MAX_ATTEMPTS = 6
SPLASH_AFTER = (2, 4)

CORRECT = "correct"
PRESENT = "present"
ABSENT = "absent"
COVERED = "covered"

ALPHABET = string.ascii_uppercase


# --- pure helpers -----------------------------------------------------------------
def normalize(raw: object) -> str:
    """Strip accents, uppercase. Raises ActionRejected if not A-Z or empty."""
    if not isinstance(raw, str):
        raise ActionRejected("bad_word", "la palabra no es valida")
    decomposed = unicodedata.normalize("NFKD", raw.strip())
    word = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).upper()
    if not word or not all(ch in ALPHABET for ch in word):
        raise ActionRejected("bad_word", "solo se admiten letras de la A a la Z")
    return word


def score(target: str, guess: str) -> List[str]:
    """Two-pass Wordle scoring; len(target) must equal len(guess)."""
    result = [ABSENT] * len(guess)
    remaining: Dict[str, int] = {}
    for t, g in zip(target, guess):
        if t == g:
            continue
        remaining[t] = remaining.get(t, 0) + 1
    for i, (t, g) in enumerate(zip(target, guess)):
        if t == g:
            result[i] = CORRECT
    for i, g in enumerate(guess):
        if result[i] == CORRECT:
            continue
        if remaining.get(g, 0) > 0:
            result[i] = PRESENT
            remaining[g] -= 1
    return result


@dataclass
class Attempt:
    guess: str
    by: str  # player name (display only)
    marks: List[str] = field(default_factory=list)


@dataclass
class WordleState:
    target: str = ""
    attempts: List[Attempt] = field(default_factory=list)
    turn: Optional[str] = None  # player id whose turn it is
    letters: Dict[str, str] = field(default_factory=dict)  # pid -> private absent letter
    hidden: List[Tuple[int, int]] = field(default_factory=list)  # (row, col), display only
    names: Dict[str, str] = field(default_factory=dict)


class CursedWordle:
    id = "cursed_wordle"
    title = "La palabra maldita"
    min_players = 1

    def __init__(self, words: Optional[Sequence[str]] = None) -> None:
        self.words: List[str] = list(words) if words is not None else list(WORDLE_WORDS)

    # --- helpers -------------------------------------------------------------------
    @staticmethod
    def _sync_names(ctx: PuzzleCtx, s: WordleState) -> None:
        for p in ctx.players:
            s.names[p.id] = p.name

    def _pick_word(self, ctx: PuzzleCtx, avoid: Optional[str] = None) -> str:
        pool = [w for w in self.words if w != avoid] or list(self.words)
        return ctx.rng.choice(pool)

    @staticmethod
    def _next_connected(ctx: PuzzleCtx, after: Optional[str]) -> Optional[str]:
        """Next connected player after `after` in join order (cyclic); may return `after`."""
        ids = [p.id for p in ctx.players]
        if not ids:
            return None
        connected = {p.id for p in ctx.players if p.connected}
        idx = ids.index(after) if after in ids else -1
        for i in range(1, len(ids) + 1):
            cand = ids[(idx + i) % len(ids)]
            if cand in connected:
                return cand
        return None

    @staticmethod
    def _deal(ctx: PuzzleCtx, s: WordleState, pids: Sequence[str]) -> bool:
        """Give each pid in `pids` a private letter not in the target. Distinct where possible."""
        base = [c for c in ALPHABET if c not in s.target]
        changed = False
        for pid in pids:
            taken = {s.letters[o] for o in s.letters if o != pid}
            pool = [c for c in base if c not in taken] or base
            s.letters[pid] = ctx.rng.choice(pool)
            changed = True
        return changed

    def _new_round(self, ctx: PuzzleCtx, s: WordleState, avoid: Optional[str] = None) -> None:
        s.target = self._pick_word(ctx, avoid)
        s.attempts = []
        s.hidden = []
        s.letters = {}
        self._deal(ctx, s, [p.id for p in ctx.players if p.connected])

    # --- Puzzle protocol ---------------------------------------------------------------
    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> WordleState:
        s = WordleState()
        self._sync_names(ctx, s)
        self._new_round(ctx, s)
        s.turn = self._next_connected(ctx, None)
        return s

    def handle(self, ctx: PuzzleCtx, s: WordleState, pid: str, action: dict) -> List[Effect]:
        if action.get("type") != "guess":
            raise ActionRejected("bad_action", "se esperaba {type: guess, word: str}")
        self._sync_names(ctx, s)
        connected = {p.id for p in ctx.players if p.connected}
        turn = s.turn if s.turn in connected else self._next_connected(ctx, s.turn)
        if pid not in connected or pid != turn:
            raise ActionRejected("not_your_turn", "no es tu turno")
        word = normalize(action.get("word"))
        if len(word) != len(s.target):
            raise ActionRejected("bad_length", f"la palabra tiene {len(s.target)} letras")

        # --- validated: mutate from here ---
        s.turn = turn
        marks = score(s.target, word)
        s.attempts.append(Attempt(guess=word, by=s.names.get(pid, ""), marks=marks))
        effects: List[Effect] = [Touch()]
        if word == s.target:
            effects.append(Complete())
            return effects

        effects.append(AddBrainrot(brainrot.WRONG_ATTEMPT, "wordle_wrong_attempt"))
        n = len(s.attempts)
        if n >= MAX_ATTEMPTS:
            effects.append(AddBrainrot(brainrot.ROUND_FAIL_PENALTY, "wordle_round_fail"))
            effects.append(Emit("round_failed", {"penalty": brainrot.ROUND_FAIL_PENALTY}, "all"))
            self._new_round(ctx, s, avoid=s.target)
        elif n in SPLASH_AFTER:
            cell = self._splash(ctx, s)
            if cell is not None:
                effects.append(Emit("splash", {"row": cell[0], "col": cell[1]}, "all"))
        s.turn = self._next_connected(ctx, pid)
        return effects

    def _splash(self, ctx: PuzzleCtx, s: WordleState) -> Optional[Tuple[int, int]]:
        candidates = [
            (r, c)
            for r, att in enumerate(s.attempts)
            for c, mark in enumerate(att.marks)
            if mark in (CORRECT, PRESENT) and (r, c) not in s.hidden
        ]
        if not candidates:
            return None
        cell = ctx.rng.choice(candidates)
        s.hidden.append(cell)
        return cell

    def on_presence(self, ctx: PuzzleCtx, s: WordleState) -> List[Effect]:
        self._sync_names(ctx, s)
        changed = False
        connected = {p.id for p in ctx.players if p.connected}
        if s.turn not in connected:
            new_turn = self._next_connected(ctx, s.turn)
            if new_turn != s.turn:
                s.turn = new_turn
                changed = True
        missing = [p.id for p in ctx.players if p.connected and p.id not in s.letters]
        if missing and self._deal(ctx, s, missing):
            changed = True
        return [Touch()] if changed else []

    def tick(self, ctx: PuzzleCtx, s: WordleState) -> List[Effect]:
        return []

    # --- views -----------------------------------------------------------------------------
    def _rows(self, s: WordleState) -> List[dict]:
        rows = []
        for r, att in enumerate(s.attempts):
            cells = []
            for c, (ch, mark) in enumerate(zip(att.guess, att.marks)):
                if (r, c) in s.hidden:
                    cells.append({"l": "", "s": COVERED})
                else:
                    cells.append({"l": ch, "s": mark})
            rows.append({"cells": cells, "by": att.by})
        return rows

    def _common(self, s: WordleState) -> dict:
        return {
            "kind": self.id,
            "length": len(s.target),
            "max_attempts": MAX_ATTEMPTS,
            "rows": self._rows(s),
            "turn_name": s.names.get(s.turn, "") if s.turn else "",
        }

    def view_tv(self, s: WordleState) -> dict:
        return self._common(s)

    def view_player(self, s: WordleState, pid: str) -> dict:
        view = self._common(s)
        view["your_turn"] = s.turn is not None and s.turn == pid
        view["letter"] = s.letters.get(pid, "")
        return view

    # --- persistence --------------------------------------------------------------------------
    def serialize(self, s: WordleState) -> dict:
        return {
            "v": 1,
            "target": s.target,
            "attempts": [{"guess": a.guess, "by": a.by} for a in s.attempts],
            "turn": s.turn,
            "letters": dict(s.letters),
            "hidden": [[r, c] for r, c in s.hidden],
            "names": dict(s.names),
        }

    def deserialize(self, d: dict) -> WordleState:
        target = d.get("target", "")
        attempts = [
            Attempt(guess=a["guess"], by=a.get("by", ""), marks=score(target, a["guess"]))
            for a in d.get("attempts", [])
        ]
        return WordleState(
            target=target,
            attempts=attempts,
            turn=d.get("turn"),
            letters=dict(d.get("letters", {})),
            hidden=[(int(r), int(c)) for r, c in d.get("hidden", [])],
            names=dict(d.get("names", {})),
        )
