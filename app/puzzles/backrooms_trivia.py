"""Room 4, "Trivia de las Backrooms": the whole group answers together.

Rules:
- Questions come from content.TRIVIA (Spanish, Backrooms lore), drawn at random without repeats until the
  bank runs out. The four options are shuffled per question (the content keeps the right one first).
- Every connected phone votes one option and may change its vote. The answer only goes in when EVERY connected
  player has voted the SAME option; after LOCK_MS of unbroken agreement it is checked. Changing a vote (or a
  phone connecting) during the lock cancels it.
- Right answer: one more toward GOAL. Wrong answer: capped brainrot penalty. Either way the right option and a
  short fact are revealed for REVEAL_MS; then the next question, or Complete once GOAL answers were right.
- The right option never reaches a view before the reveal.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from app.content import TRIVIA, TriviaQuestion
from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Effect, Emit, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx

GOAL = 6
LOCK_MS = 2500
REVEAL_MS = 6000
OPTIONS = 4
LETTERS = "ABCD"

PHASE_VOTE = "vote"
PHASE_REVEAL = "reveal"


@dataclass
class TriviaState:
    names: Dict[str, str] = field(default_factory=dict)
    connected: List[str] = field(default_factory=list)  # as of the last presence check, join order
    order: List[int] = field(default_factory=list)  # question indices into the bank, in play order
    pos: int = 0  # current question = order[pos]
    perm: List[int] = field(default_factory=list)  # display slot -> option index in the bank (0 = right)
    phase: str = PHASE_VOTE
    since_ms: int = 0
    lock_since: Optional[int] = None
    lock_choice: Optional[int] = None
    votes: Dict[str, int] = field(default_factory=dict)  # pid -> display slot
    right: int = 0
    wrong: int = 0
    last: Optional[dict] = None  # {"choice", "ok", "penalty"} of the revealed answer
    penalty_total: float = 0.0
    epoch: int = 0


class BackroomsTrivia:
    id = "backrooms_trivia"
    title = "Trivia de las Backrooms"
    min_players = 1
    levels = GOAL  # debug: start with N right answers

    def __init__(self, bank: Optional[Sequence[TriviaQuestion]] = None) -> None:
        self.bank: Sequence[TriviaQuestion] = bank if bank is not None else TRIVIA

    # --- helpers ---------------------------------------------------------------------
    @staticmethod
    def _sync(ctx: PuzzleCtx, s: TriviaState) -> None:
        for p in ctx.players:
            s.names[p.id] = p.name
        s.connected = [p.id for p in ctx.players if p.connected]

    def _question(self, s: TriviaState) -> TriviaQuestion:
        return self.bank[s.order[s.pos]]

    @staticmethod
    def _answer(s: TriviaState) -> int:
        return s.perm.index(0)

    def _ask(self, ctx: PuzzleCtx, s: TriviaState) -> None:
        s.perm = ctx.rng.sample(range(OPTIONS), OPTIONS)
        s.votes, s.lock_since, s.lock_choice, s.last = {}, None, None, None
        s.phase, s.since_ms = PHASE_VOTE, ctx.clock.now_ms()
        s.epoch += 1

    def _next_question(self, ctx: PuzzleCtx, s: TriviaState) -> None:
        s.pos += 1
        if s.pos >= len(s.order):  # bank exhausted: reshuffle, never the same question twice in a row
            last = s.order[-1] if s.order else None
            s.order = ctx.rng.sample(range(len(self.bank)), len(self.bank))
            if len(s.order) > 1 and s.order[0] == last:
                s.order.append(s.order.pop(0))
            s.pos = 0
        self._ask(ctx, s)

    @staticmethod
    def _unanimous(s: TriviaState) -> Optional[int]:
        if not s.connected:
            return None
        picks = {s.votes.get(pid) for pid in s.connected}
        return picks.pop() if len(picks) == 1 and None not in picks else None

    def _relock(self, ctx: PuzzleCtx, s: TriviaState) -> None:
        choice = self._unanimous(s)
        if choice is None:
            s.lock_since, s.lock_choice = None, None
        elif choice != s.lock_choice:  # a new agreement starts its own countdown
            s.lock_since, s.lock_choice = ctx.clock.now_ms(), choice

    def _resolve(self, ctx: PuzzleCtx, s: TriviaState) -> List[Effect]:
        choice = s.lock_choice if s.lock_choice is not None else -1
        answer = self._answer(s)
        ok = choice == answer
        s.phase, s.since_ms = PHASE_REVEAL, ctx.clock.now_ms()
        s.lock_since, s.lock_choice = None, None
        if ok:
            s.right += 1
            s.last = {"choice": choice, "ok": True, "penalty": 0.0}
            return [Touch()]
        s.wrong += 1
        amount = brainrot.capped(s.penalty_total, brainrot.TRIVIA_FAIL_PENALTY, brainrot.ROOM_PENALTY_CAP)
        s.penalty_total += amount
        s.last = {"choice": choice, "ok": False, "penalty": amount}
        text = f"La buena era la {LETTERS[answer]}."
        effects: List[Effect] = [
            Touch(),
            Emit("round_failed", {"penalty": amount, "title": "¡Respuesta incorrecta!", "text": text}, "all"),
        ]
        if amount > 0:
            effects.append(AddBrainrot(amount, "trivia_fail"))
        return effects

    # --- Puzzle protocol ---------------------------------------------------------------
    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> TriviaState:
        s = TriviaState()
        self._sync(ctx, s)
        s.order = ctx.rng.sample(range(len(self.bank)), len(self.bank))
        self._ask(ctx, s)
        return s

    def jump_level(self, ctx: PuzzleCtx, s: TriviaState, level: int) -> None:
        s.right, s.wrong = level, 0
        self._ask(ctx, s)

    def handle(self, ctx: PuzzleCtx, s: TriviaState, pid: str, action: dict) -> List[Effect]:
        option = action.get("option")
        if action.get("type") != "vote" or not isinstance(option, int) or isinstance(option, bool):
            raise ActionRejected("bad_action", "se esperaba {type: vote, option: int}")
        if not 0 <= option < OPTIONS:
            raise ActionRejected("bad_option", "esa opción no existe")
        if s.phase != PHASE_VOTE:
            raise ActionRejected("wrong_phase", "ahora no se vota")
        self._sync(ctx, s)
        if s.votes.get(pid) == option:
            return []
        s.votes[pid] = option
        self._relock(ctx, s)
        return [Touch()]

    def on_presence(self, ctx: PuzzleCtx, s: TriviaState) -> List[Effect]:
        before = (list(s.connected), s.lock_since, dict(s.names))
        self._sync(ctx, s)
        if s.phase == PHASE_VOTE and s.connected != before[0]:
            s.lock_since, s.lock_choice = None, None  # a different group: any agreement restarts its countdown
            self._relock(ctx, s)
        return [Touch()] if (s.connected, s.lock_since, s.names) != before else []

    def tick(self, ctx: PuzzleCtx, s: TriviaState) -> List[Effect]:
        now = ctx.clock.now_ms()
        if s.phase == PHASE_VOTE:
            if s.lock_since is not None and now - s.lock_since >= LOCK_MS:
                return self._resolve(ctx, s)
            return []
        if now - s.since_ms < REVEAL_MS:
            return []
        if s.right >= GOAL:
            return [Complete()]
        self._next_question(ctx, s)
        return [Touch()]

    # --- views -----------------------------------------------------------------------------
    def _common(self, s: TriviaState) -> dict:
        q = self._question(s)
        view = {
            "kind": self.id,
            "phase": s.phase,
            "number": s.right + s.wrong + (1 if s.phase == PHASE_VOTE else 0),
            "goal": GOAL,
            "right": s.right,
            "wrong": s.wrong,
            "question": q.q,
            "options": [q.options[i] for i in s.perm],
            "locking": s.lock_since is not None,
            "lock_choice": s.lock_choice,
            "lock_ms": LOCK_MS,
            "epoch": s.epoch,
            "voted": sum(1 for pid in s.connected if pid in s.votes),
            "total": len(s.connected),
            "reveal": None,
        }
        if s.phase == PHASE_REVEAL and s.last is not None:
            view["reveal"] = {
                "answer": self._answer(s),
                "choice": s.last["choice"],
                "ok": s.last["ok"],
                "penalty": s.last["penalty"],
                "fact": q.fact,
            }
        return view

    def view_tv(self, s: TriviaState) -> dict:
        view = self._common(s)
        view["votes"] = [
            [s.names.get(pid, "") for pid in s.connected if s.votes.get(pid) == slot] for slot in range(OPTIONS)
        ]
        view["waiting"] = [s.names.get(pid, "") for pid in s.connected if pid not in s.votes]
        return view

    def view_player(self, s: TriviaState, pid: str) -> dict:
        view = self._common(s)
        view["mine"] = s.votes.get(pid)
        return view

    def debug_peek(self, s: TriviaState) -> str:
        answer = self._answer(s)
        return f"Respuesta: {LETTERS[answer]}) {self._question(s).options[0]}"

    # --- persistence --------------------------------------------------------------------------
    def serialize(self, s: TriviaState) -> dict:
        return {
            "v": 1,
            "names": dict(s.names),
            "connected": list(s.connected),
            "order": list(s.order),
            "pos": s.pos,
            "perm": list(s.perm),
            "phase": s.phase,
            "since_ms": s.since_ms,
            "lock_since": s.lock_since,
            "lock_choice": s.lock_choice,
            "votes": dict(s.votes),
            "right": s.right,
            "wrong": s.wrong,
            "last": dict(s.last) if s.last is not None else None,
            "penalty_total": s.penalty_total,
            "epoch": s.epoch,
        }

    def deserialize(self, d: dict) -> TriviaState:
        n = len(self.bank)
        order = [int(i) for i in d.get("order", []) if 0 <= int(i) < n]
        perm = [int(i) for i in d.get("perm", [])]
        if not order or sorted(perm) != list(range(OPTIONS)):
            raise ValueError("trivia state does not match the question bank")
        last = d.get("last")
        lock_since = d.get("lock_since")
        lock_choice = d.get("lock_choice")
        return TriviaState(
            names=dict(d.get("names", {})),
            connected=list(d.get("connected", [])),
            order=order,
            pos=max(0, min(int(d.get("pos", 0)), len(order) - 1)),
            perm=perm,
            phase=d.get("phase") if d.get("phase") in (PHASE_VOTE, PHASE_REVEAL) else PHASE_VOTE,
            since_ms=int(d.get("since_ms", 0)),
            lock_since=int(lock_since) if lock_since is not None else None,
            lock_choice=int(lock_choice) if lock_choice is not None else None,
            votes={str(p): int(v) for p, v in d.get("votes", {}).items() if 0 <= int(v) < OPTIONS},
            right=max(0, int(d.get("right", 0))),
            wrong=max(0, int(d.get("wrong", 0))),
            last=(
                {"choice": int(last["choice"]), "ok": bool(last["ok"]), "penalty": float(last["penalty"])}
                if isinstance(last, dict)
                else None
            ),
            penalty_total=float(d.get("penalty_total", 0.0)),
            epoch=int(d.get("epoch", 0)),
        )
