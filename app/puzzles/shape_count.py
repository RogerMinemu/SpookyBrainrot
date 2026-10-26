"""Room 3, "Contad las formas": every phone counts ONE kind of shape on the TV.

Rules:
- ROUNDS rounds. Each round the TV shows a fresh field of shapes generated here (kind, colour, position, size,
  tilt), so a TV that reloads draws the very same field. Colours are a distractor: only the kind counts.
- Every connected phone is dealt one kind to count (distinct kinds while there are enough of them; with more
  players than kinds a kind is shared and every holder must get it right). A phone that connects mid-round
  gets a kind too.
- A phone has two buttons only: +1 and -1 on its own counter (0..MAX_COUNT). Counters restart at 0 each round.
- State machine on ctx.clock, driven by tick(): count (COUNT_MS[round]) -> check. At the check the counters of
  the CONNECTED players with a kind are compared with the truth: all right -> pass (next round, Complete after
  the last one); any wrong -> fail (capped brainrot penalty) and the same round restarts with a new field.
- Nobody sees anybody's counter during the count; the truth per kind only reaches the views at the check.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from random import Random
from typing import Dict, List, Optional

from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Effect, Emit, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx

ROUNDS = 3
KINDS = ("circle", "triangle", "square", "star", "heart", "cross", "moon", "diamond")
KIND_NAMES = {
    "circle": "círculos",
    "triangle": "triángulos",
    "square": "cuadrados",
    "star": "estrellas",
    "heart": "corazones",
    "cross": "cruces",
    "moon": "lunas",
    "diamond": "rombos",
}
UPRIGHT = frozenset({"square", "diamond"})  # never tilted: a tilted square would read as a diamond
MIN_KINDS = (4, 6, 8)  # kinds on the field per round (more when more players need one)
COUNT_RANGE = ((3, 7), (5, 10), (7, 12))  # how many shapes of each kind, per round
COUNT_MS = (30000, 35000, 40000)
DRIFT_FROM_ROUND = 2  # 0-based: from this round on the shapes drift on the TV
COLS, ROWS = 16, 9  # one shape per cell at most
COLORS = 8
MAX_COUNT = 99
CHECK_MS = 5000

PHASE_COUNT = "count"
PHASE_PASS = "pass"
PHASE_FAIL = "fail"


# --- pure helpers -----------------------------------------------------------------
def kinds_for(rng: Random, round_idx: int, players: int) -> List[str]:
    n = min(len(KINDS), max(MIN_KINDS[round_idx], players))
    return rng.sample(list(KINDS), n)


def make_field(rng: Random, kinds: List[str], lo: int, hi: int) -> List[dict]:
    """[{kind, x, y, size, rot, color}] on a COLS x ROWS grid (one per cell, jittered). x, y in 0..1."""
    pieces = [k for k in kinds for _ in range(rng.randint(lo, hi))]
    cells = sorted(rng.sample(range(COLS * ROWS), len(pieces)))
    rng.shuffle(pieces)
    out = []
    for kind, cell in zip(pieces, cells):
        cx, cy = cell % COLS, cell // COLS
        out.append(
            {
                "kind": kind,
                "x": round((cx + 0.4 + rng.random() * 0.2) / COLS, 4),
                "y": round((cy + 0.4 + rng.random() * 0.2) / ROWS, 4),
                "size": round(0.7 + rng.random() * 0.4, 2),
                "rot": 0 if kind in UPRIGHT else rng.randint(-35, 35),
                "color": rng.randrange(COLORS),
            }
        )
    return out


def tally(shapes: List[dict]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for sh in shapes:
        out[sh["kind"]] = out.get(sh["kind"], 0) + 1
    return out


def deal(pids: List[str], kinds: List[str], rng: Random) -> Dict[str, str]:
    """pid -> kind. Distinct kinds while they last, then they repeat."""
    order = list(kinds)
    rng.shuffle(order)
    return {pid: order[i % len(order)] for i, pid in enumerate(pids)} if order else {}


@dataclass
class ShapeState:
    names: Dict[str, str] = field(default_factory=dict)
    connected: List[str] = field(default_factory=list)  # as of the last presence check, join order
    round: int = 0  # 0-based
    phase: str = PHASE_COUNT
    since_ms: int = 0
    epoch: int = 0
    left: int = 0  # whole seconds left in the count (views have no clock)
    kinds: List[str] = field(default_factory=list)
    shapes: List[dict] = field(default_factory=list)
    assign: Dict[str, str] = field(default_factory=dict)  # pid -> kind
    answers: Dict[str, int] = field(default_factory=dict)
    results: List[dict] = field(default_factory=list)  # filled at the check
    penalty_total: float = 0.0


class ShapeCount:
    id = "shape_count"
    title = "Contad las formas"
    min_players = 1
    levels = ROUNDS

    # --- helpers ---------------------------------------------------------------------
    @staticmethod
    def _sync(ctx: PuzzleCtx, s: ShapeState) -> None:
        for p in ctx.players:
            s.names[p.id] = p.name
        s.connected = [p.id for p in ctx.players if p.connected]

    def _new_round(self, ctx: PuzzleCtx, s: ShapeState, fallback: Optional[List[str]] = None) -> None:
        pids = s.connected or list(fallback or [])
        s.kinds = kinds_for(ctx.rng, s.round, len(pids))
        lo, hi = COUNT_RANGE[s.round]
        s.shapes = make_field(ctx.rng, s.kinds, lo, hi)
        s.assign = deal(pids, s.kinds, ctx.rng)
        s.answers = {pid: 0 for pid in s.assign}
        s.results = []
        s.epoch += 1
        s.phase, s.since_ms = PHASE_COUNT, ctx.clock.now_ms()
        s.left = COUNT_MS[s.round] // 1000

    @staticmethod
    def _assign_missing(s: ShapeState) -> None:
        """A phone that connects mid-round counts the kind with the fewest connected holders."""
        for pid in s.connected:
            if pid in s.assign or not s.kinds:
                continue
            load = {k: 0 for k in s.kinds}
            for other in s.connected:
                if s.assign.get(other) in load:
                    load[s.assign[other]] += 1
            s.assign[pid] = min(s.kinds, key=lambda k: load[k])
            s.answers[pid] = 0

    def _check(self, ctx: PuzzleCtx, s: ShapeState) -> List[Effect]:
        players = [pid for pid in s.connected if pid in s.assign]
        if not players:  # nobody left to check: same round, new field, no penalty
            self._new_round(ctx, s)
            return [Touch()]
        truth = tally(s.shapes)
        s.results = []
        for pid in players:
            want = truth.get(s.assign[pid], 0)
            got = s.answers.get(pid, 0)
            s.results.append({"pid": pid, "kind": s.assign[pid], "answer": got, "truth": want, "ok": got == want})
        s.left = 0
        s.since_ms = ctx.clock.now_ms()
        if all(r["ok"] for r in s.results):
            s.phase = PHASE_PASS
            return [Touch()]
        s.phase = PHASE_FAIL
        amount = brainrot.capped(s.penalty_total, brainrot.SHAPE_FAIL_PENALTY, brainrot.ROOM_PENALTY_CAP)
        s.penalty_total += amount
        wrong = sum(1 for r in s.results if not r["ok"])
        text = "Una cuenta no cuadra." if wrong == 1 else f"{wrong} cuentas no cuadran."
        effects: List[Effect] = [
            Touch(),
            Emit("round_failed", {"penalty": amount, "title": "¡Mal contado!", "text": f"{text} Nuevas formas."}, "all"),
        ]
        if amount > 0:
            effects.append(AddBrainrot(amount, "shape_fail"))
        return effects

    # --- Puzzle protocol ---------------------------------------------------------------
    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> ShapeState:
        s = ShapeState()
        self._sync(ctx, s)
        self._new_round(ctx, s, player_ids)
        return s

    def jump_level(self, ctx: PuzzleCtx, s: ShapeState, level: int) -> None:
        s.round = level
        self._new_round(ctx, s, list(s.assign))

    def handle(self, ctx: PuzzleCtx, s: ShapeState, pid: str, action: dict) -> List[Effect]:
        delta = action.get("delta")
        if action.get("type") != "adjust" or isinstance(delta, bool) or delta not in (1, -1):
            raise ActionRejected("bad_action", "se esperaba {type: adjust, delta: 1 | -1}")
        if s.phase != PHASE_COUNT:
            raise ActionRejected("wrong_phase", "ahora no se cuenta")
        if pid not in s.assign:
            raise ActionRejected("no_shape", "todavía no tienes ninguna forma que contar")
        value = max(0, min(MAX_COUNT, s.answers.get(pid, 0) + delta))
        if value == s.answers.get(pid, 0):
            return []
        s.answers[pid] = value
        return [Touch()]

    def on_presence(self, ctx: PuzzleCtx, s: ShapeState) -> List[Effect]:
        before = (list(s.connected), dict(s.assign), dict(s.names))
        self._sync(ctx, s)
        if s.phase == PHASE_COUNT:
            self._assign_missing(s)
        return [Touch()] if (s.connected, s.assign, s.names) != before else []

    def tick(self, ctx: PuzzleCtx, s: ShapeState) -> List[Effect]:
        elapsed = ctx.clock.now_ms() - s.since_ms
        if s.phase == PHASE_COUNT:
            total = COUNT_MS[s.round]
            if elapsed >= total:
                return self._check(ctx, s)
            left = math.ceil((total - elapsed) / 1000)
            if left == s.left:
                return []
            s.left = left
            return [Touch()]
        if elapsed < CHECK_MS:
            return []
        if s.phase == PHASE_PASS:
            if s.round >= ROUNDS - 1:
                return [Complete()]
            s.round += 1
        self._sync(ctx, s)
        self._new_round(ctx, s)
        return [Touch()]

    # --- views -----------------------------------------------------------------------------
    def _common(self, s: ShapeState) -> dict:
        return {
            "kind": self.id,
            "phase": s.phase,
            "round": s.round + 1,
            "rounds": ROUNDS,
            "left": s.left,
            "count_s": COUNT_MS[s.round] // 1000,
            "epoch": s.epoch,
        }

    def view_tv(self, s: ShapeState) -> dict:
        view = self._common(s)
        view.update(
            {
                "drift": s.round >= DRIFT_FROM_ROUND,
                "shapes": [dict(sh) for sh in s.shapes],
                # who counts what, never how many (until the check)
                "counters": [
                    {"name": s.names.get(pid, ""), "shape": s.assign[pid], "shape_name": KIND_NAMES[s.assign[pid]]}
                    for pid in s.connected
                    if pid in s.assign
                ],
                "results": [
                    {
                        "name": s.names.get(r["pid"], ""),
                        "shape": r["kind"],
                        "shape_name": KIND_NAMES[r["kind"]],
                        "answer": r["answer"],
                        "truth": r["truth"],
                        "ok": r["ok"],
                    }
                    for r in s.results
                ],
            }
        )
        return view

    def view_player(self, s: ShapeState, pid: str) -> dict:
        view = self._common(s)
        shape = s.assign.get(pid)
        mine = next((r for r in s.results if r["pid"] == pid), None)
        view.update(
            {
                "shape": shape,
                "shape_name": KIND_NAMES[shape] if shape else "",
                "answer": s.answers.get(pid, 0),
                "result": {"truth": mine["truth"], "ok": mine["ok"]} if mine else None,
            }
        )
        return view

    def debug_peek(self, s: ShapeState) -> str:
        counts = tally(s.shapes)
        return "Formas: " + ", ".join(f"{counts.get(k, 0)} {KIND_NAMES[k]}" for k in s.kinds)

    # --- persistence --------------------------------------------------------------------------
    def serialize(self, s: ShapeState) -> dict:
        return {
            "v": 1,
            "names": dict(s.names),
            "connected": list(s.connected),
            "round": s.round,
            "phase": s.phase,
            "since_ms": s.since_ms,
            "epoch": s.epoch,
            "left": s.left,
            "kinds": list(s.kinds),
            "shapes": [dict(sh) for sh in s.shapes],
            "assign": dict(s.assign),
            "answers": dict(s.answers),
            "results": [dict(r) for r in s.results],
            "penalty_total": s.penalty_total,
        }

    def deserialize(self, d: dict) -> ShapeState:
        kinds = [k for k in d.get("kinds", []) if k in KIND_NAMES]
        return ShapeState(
            names=dict(d.get("names", {})),
            connected=list(d.get("connected", [])),
            round=max(0, min(int(d.get("round", 0)), ROUNDS - 1)),
            phase=d.get("phase", PHASE_COUNT) if d.get("phase") in (PHASE_COUNT, PHASE_PASS, PHASE_FAIL) else PHASE_COUNT,
            since_ms=int(d.get("since_ms", 0)),
            epoch=int(d.get("epoch", 0)),
            left=int(d.get("left", 0)),
            kinds=kinds,
            shapes=[
                {
                    "kind": str(sh["kind"]),
                    "x": float(sh["x"]),
                    "y": float(sh["y"]),
                    "size": float(sh["size"]),
                    "rot": int(sh["rot"]),
                    "color": int(sh["color"]),
                }
                for sh in d.get("shapes", [])
                if sh.get("kind") in KIND_NAMES
            ],
            assign={str(p): k for p, k in d.get("assign", {}).items() if k in KIND_NAMES},
            answers={str(p): int(v) for p, v in d.get("answers", {}).items()},
            results=[
                {
                    "pid": str(r["pid"]),
                    "kind": str(r["kind"]),
                    "answer": int(r["answer"]),
                    "truth": int(r["truth"]),
                    "ok": bool(r["ok"]),
                }
                for r in d.get("results", [])
                if r.get("kind") in KIND_NAMES
            ],
            penalty_total=float(d.get("penalty_total", 0.0)),
        )
