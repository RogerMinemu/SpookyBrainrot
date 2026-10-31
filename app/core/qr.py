"""QR registry primitives and the pure game resolver (no IO, no framework).

Tokens are generated ONCE (the printed QR codes depend on them) and are never
regenerated. Persistence lives in `app.db.repos.QrRepo`.
"""
from __future__ import annotations

import itertools
import secrets
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

ANCHOR_COUNT = 7
DECOY_COUNT = 8
TOKEN_LEN = 20  # >= 16 url-safe chars (R7.1)
# Unambiguous alphanumerics (no 0, O, 1, I, L, B), url-safe.
TOKEN_ALPHABET = "ACDEFGHJKMNPQRSTUVWXYZ23456789"

KIND_ANCHOR = "anchor"
KIND_DECOY = "decoy"

# Typed fallback when a phone camera cannot read a printed QR: 4 letters under each QR on the sheet.
CODE_LEN = 4
CODE_LETTERS = "".join(c for c in TOKEN_ALPHABET if c.isalpha())  # no digits to switch keyboards for, no O/I/L/B


@dataclass(frozen=True)
class QrEntry:
    token: str
    kind: str  # "anchor" | "decoy"
    idx: int  # anchor level 1..7 / decoy number 1..8


def new_token(choice: Callable[[str], str] = secrets.choice) -> str:
    return "".join(choice(TOKEN_ALPHABET) for _ in range(TOKEN_LEN))


def generate_entries(choice: Callable[[str], str] = secrets.choice) -> List[QrEntry]:
    """7 anchors (levels 1..7) + 8 decoys, all with distinct tokens."""
    seen = set()
    entries: List[QrEntry] = []
    plan = [(KIND_ANCHOR, i) for i in range(1, ANCHOR_COUNT + 1)] + [
        (KIND_DECOY, i) for i in range(1, DECOY_COUNT + 1)
    ]
    for kind, idx in plan:
        token = new_token(choice)
        while token in seen:
            token = new_token(choice)
        seen.add(token)
        entries.append(QrEntry(token, kind, idx))
    return entries


def qr_url(public_url: str, token: str) -> str:
    """R7.2: every QR encodes {PUBLIC_URL}/k/<token>."""
    return f"{public_url.rstrip('/')}/k/{token}"


def short_codes(entries: Sequence["QrEntry"]) -> Dict[str, str]:
    """token -> its 4-letter code. Derived from the tokens, which never change, so a printed code never changes either:
    in token order, each QR takes the first run of 4 letters of its token that no earlier QR took."""
    out: Dict[str, str] = {}
    taken = set()
    for e in sorted(entries, key=lambda x: x.token):
        letters = [c for c in e.token if c in CODE_LETTERS]
        runs = ("".join(letters[i:i + CODE_LEN]) for i in range(len(letters) - CODE_LEN + 1))
        code = next((r for r in runs if r not in taken), None)
        if code is None:  # practically never (22^4 codes, 15 QRs): the first free code in alphabetical order
            code = next("".join(t) for t in itertools.product(CODE_LETTERS, repeat=CODE_LEN) if "".join(t) not in taken)
        taken.add(code)
        out[e.token] = code
    return out


def normalize_code(text: str) -> str:
    """What the player typed, as a code: upper case, letters only ("abc d" -> "ABCD")."""
    return "".join(c for c in str(text).upper() if c.isalpha())


def entry_for_code(entries: Sequence["QrEntry"], text: str) -> Optional["QrEntry"]:
    code = normalize_code(text)
    if len(code) != CODE_LEN:
        return None
    by_code = {c: t for t, c in short_codes(entries).items()}
    token = by_code.get(code)
    return next((e for e in entries if e.token == token), None) if token else None


def room_keys(entries: Sequence[QrEntry], rooms: Sequence[Any]) -> List[Tuple[Any, QrEntry]]:
    """(room, its anchor) for every room with a key, in the rooms' order: the printed sheet, one QR per real room.
    Decoys and anchors no room uses are left out."""
    anchors = {e.idx: e for e in entries if e.kind == KIND_ANCHOR}
    return [(r, anchors[r.anchor]) for r in rooms if r.anchor in anchors]


# --- which game does a scan belong to? (R7.4) -----------------------------------
@dataclass(frozen=True)
class GameRef:
    id: str
    name: str
    status: str
    has_tv: bool = False


RESOLVED = "game"
CHOOSE = "list"
NO_GAME = "none"


@dataclass(frozen=True)
class Resolution:
    kind: str  # RESOLVED | CHOOSE | NO_GAME
    game_id: Optional[str] = None
    candidates: Tuple[GameRef, ...] = ()


def resolve_game(
    requested_id: Optional[str],
    cookie_game_id: Optional[str],
    games: Sequence[GameRef],
) -> Resolution:
    """1) ?g= (running) 2) the cookie player's running game 3) the sole running game
    with a TV, else the sole running game 4) several -> list 5) none -> no game."""
    running = [g for g in games if g.status == "running"]
    by_id = {g.id: g for g in running}
    if requested_id and requested_id in by_id:
        return Resolution(RESOLVED, requested_id)
    if cookie_game_id and cookie_game_id in by_id:
        return Resolution(RESOLVED, cookie_game_id)
    with_tv = [g for g in running if g.has_tv]
    if len(with_tv) == 1:
        return Resolution(RESOLVED, with_tv[0].id)
    if len(running) == 1:
        return Resolution(RESOLVED, running[0].id)
    if len(running) > 1:
        return Resolution(CHOOSE, None, tuple(running))
    # Nothing running: a player of a finished game re-scanning gets the idempotent page.
    finished = {g.id for g in games if g.status == "finished"}
    if cookie_game_id and cookie_game_id in finished:
        return Resolution(RESOLVED, cookie_game_id)
    return Resolution(NO_GAME)
