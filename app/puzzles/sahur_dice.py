"""Room 7, "Sahur dice": a Simon where only some prompts are real.

Rules:
- ROUNDS rounds with growing sequences (SEQ_LEN). The TV flashes the drums one by one; from round 2 some
  prompts are TRAPS (shown without "¡Sahur dice!"). Players must repeat, in order, only the real prompts.
  Repeating a trap, a wrong drum, a wrong order or hitting a drum you do not own fails the round.
- Drums are dealt across the connected phones (every drum has an owner, every phone owns at least one) and
  redealt whenever presence changes. The sequence lives ONLY in view_tv(): view_player() never carries it.
- State machine on ctx.clock, driven by tick(): show -> input -> (pass -> show | Complete) / (fail -> show).
  A failure costs a capped brainrot penalty and restarts the round with a fresh sequence of the same length.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from random import Random
from typing import Dict, List, Optional

from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Effect, Emit, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx

ROUNDS = 3
SEQ_LEN = (4, 5, 6)
TRAP_CHANCE = 0.25
MIN_DRUMS, MAX_DRUMS = 4, 6
SHOW_LEAD_MS = 1500
SHOW_STEP_MS = 900
SHOW_TAIL_MS = 600
FAIL_MS = 2500
PASS_MS = 1500

PHASE_SHOW = "show"
PHASE_INPUT = "input"
PHASE_PASS = "pass"
PHASE_FAIL = "fail"


# --- pure helpers -----------------------------------------------------------------
def drum_count(players: int) -> int:
    return min(MAX_DRUMS, max(MIN_DRUMS, players))


def deal(pids: List[str], drums: int) -> Dict[int, List[str]]:
    """Owners per drum. Every drum gets an owner and every pid owns a drum (for >= 1 pid)."""
    owners: Dict[int, List[str]] = {d: [] for d in range(drums)}
    if not pids:
        return owners
    for k in range(max(len(pids), drums)):
        owner = pids[k % len(pids)]
        if owner not in owners[k % drums]:
            owners[k % drums].append(owner)
    return owners


def make_sequence(rng: Random, length: int, drums: int, traps: bool) -> List[dict]:
    """[{drum, trap}]. Traps: never first or last, never two in a row, at least one when enabled,
    and a trap drum never equals the real prompt that follows it."""
    trap_at = set()
    if traps:
        for i in range(1, length - 1):
            if (i - 1) not in trap_at and rng.random() < TRAP_CHANCE:
                trap_at.add(i)
        if not trap_at:
            trap_at.add(rng.randrange(1, length - 1))
    seq = [{"drum": rng.randrange(drums), "trap": i in trap_at} for i in range(length)]
    for i in sorted(trap_at):
        nxt = seq[i + 1]["drum"]
        if seq[i]["drum"] == nxt:
            seq[i]["drum"] = rng.choice([d for d in range(drums) if d != nxt])
    return seq


@dataclass
class SahurState:
    names: Dict[str, str] = field(default_factory=dict)
    round: int = 0  # 0-based
    phase: str = PHASE_SHOW
    since_ms: int = 0
    epoch: int = 0
    drums: int = MIN_DRUMS
    seq: List[dict] = field(default_factory=list)
    pos: int = 0  # how many real prompts were repeated
    hits: List[int] = field(default_factory=list)
    owners: Dict[int, List[str]] = field(default_factory=dict)
    penalty_total: float = 0.0

    @property
    def expected(self) -> List[int]:
        return [st["drum"] for st in self.seq if not st["trap"]]


class SahurDice:
    id = "sahur_dice"
    title = "Sahur dice"
    min_players = 1
    levels = ROUNDS

    # --- helpers ---------------------------------------------------------------------
    @staticmethod
    def _sync_names(ctx: PuzzleCtx, s: SahurState) -> None:
        for p in ctx.players:
            s.names[p.id] = p.name

    @staticmethod
    def _connected(ctx: PuzzleCtx, fallback: Optional[List[str]] = None) -> List[str]:
        pids = [p.id for p in ctx.players if p.connected]
        return pids or list(fallback or [])

    def _new_sequence(self, ctx: PuzzleCtx, s: SahurState, fallback: Optional[List[str]] = None) -> None:
        pids = self._connected(ctx, fallback)
        s.drums = drum_count(len(pids))
        s.owners = deal(pids, s.drums)
        s.seq = make_sequence(ctx.rng, SEQ_LEN[s.round], s.drums, traps=s.round >= 1)
        s.pos, s.hits = 0, []
        s.epoch += 1
        s.phase, s.since_ms = PHASE_SHOW, ctx.clock.now_ms()

    def _fail(self, ctx: PuzzleCtx, s: SahurState, title: str, text: str) -> List[Effect]:
        amount = brainrot.capped(s.penalty_total, brainrot.SAHUR_FAIL_PENALTY, brainrot.ROOM_PENALTY_CAP)
        s.penalty_total += amount
        s.phase, s.since_ms = PHASE_FAIL, ctx.clock.now_ms()
        effects: List[Effect] = [Touch(), Emit("round_failed", {"penalty": amount, "title": title, "text": text}, "all")]
        if amount > 0:
            effects.append(AddBrainrot(amount, "sahur_fail"))
        return effects

    # --- Puzzle protocol ---------------------------------------------------------------
    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> SahurState:
        s = SahurState()
        self._sync_names(ctx, s)
        self._new_sequence(ctx, s, player_ids)
        return s

    def jump_level(self, ctx: PuzzleCtx, s: SahurState, level: int) -> None:
        s.round = level
        self._new_sequence(ctx, s)

    def handle(self, ctx: PuzzleCtx, s: SahurState, pid: str, action: dict) -> List[Effect]:
        drum = action.get("drum")
        if action.get("type") != "hit" or not isinstance(drum, int) or isinstance(drum, bool):
            raise ActionRejected("bad_action", "se esperaba {type: hit, drum: int}")
        if not 0 <= drum < s.drums:
            raise ActionRejected("bad_drum", "ese tambor no existe")
        if s.phase != PHASE_INPUT:
            raise ActionRejected("wrong_phase", "ahora no se toca")
        self._sync_names(ctx, s)

        expected = s.expected
        if pid not in s.owners.get(drum, []):
            return self._fail(ctx, s, "¡Ese tambor no era tuyo!", "Cada uno toca solo sus tambores. Vuelta a empezar.")
        if drum != expected[s.pos]:
            trap_hit = any(st["trap"] and st["drum"] == drum for st in s.seq)
            if trap_hit:
                return self._fail(ctx, s, "¡Sahur no lo había dicho!", "Aquello era una trampa. Vuelta a empezar.")
            return self._fail(ctx, s, "¡Tambor equivocado!", "Ese no era el tambor. Vuelta a empezar.")
        s.hits.append(drum)
        s.pos += 1
        if s.pos < len(expected):
            return [Touch()]
        if s.round >= ROUNDS - 1:
            return [Complete()]
        s.phase, s.since_ms = PHASE_PASS, ctx.clock.now_ms()
        return [Touch()]

    def handle_tv(self, ctx: PuzzleCtx, s: SahurState, data: dict) -> List[Effect]:
        if data.get("action") != "replay":
            raise ActionRejected("bad_action", "se esperaba {action: replay}")
        if data.get("epoch") != s.epoch:
            raise ActionRejected("stale", "informe obsoleto")
        if s.phase != PHASE_SHOW:
            return []
        s.since_ms = ctx.clock.now_ms()  # a TV that mounts mid-show watches the sequence from the start
        return [Touch()]

    def on_presence(self, ctx: PuzzleCtx, s: SahurState) -> List[Effect]:
        self._sync_names(ctx, s)
        owners = deal(self._connected(ctx), s.drums)
        if owners == s.owners:
            return []
        s.owners = owners
        return [Touch()]

    def tick(self, ctx: PuzzleCtx, s: SahurState) -> List[Effect]:
        elapsed = ctx.clock.now_ms() - s.since_ms
        if s.phase == PHASE_SHOW and elapsed >= SHOW_LEAD_MS + len(s.seq) * SHOW_STEP_MS + SHOW_TAIL_MS:
            s.phase, s.since_ms = PHASE_INPUT, ctx.clock.now_ms()
            return [Touch()]
        if s.phase == PHASE_FAIL and elapsed >= FAIL_MS:
            self._new_sequence(ctx, s)
            return [Touch()]
        if s.phase == PHASE_PASS and elapsed >= PASS_MS:
            s.round += 1
            self._new_sequence(ctx, s)
            return [Touch()]
        return []

    # --- views -----------------------------------------------------------------------------
    def _common(self, s: SahurState) -> dict:
        return {
            "kind": self.id,
            "phase": s.phase,
            "round": s.round + 1,
            "rounds": ROUNDS,
            "epoch": s.epoch,
        }

    def view_tv(self, s: SahurState) -> dict:
        view = self._common(s)
        view.update(
            {
                "drums": [
                    {"id": d, "owners": [s.names.get(pid, "") for pid in s.owners.get(d, [])]}
                    for d in range(s.drums)
                ],
                "seq": [{"drum": st["drum"], "trap": st["trap"]} for st in s.seq],
                "hits": list(s.hits),
                "timing": {"lead": SHOW_LEAD_MS, "step": SHOW_STEP_MS, "tail": SHOW_TAIL_MS},
            }
        )
        return view

    def view_player(self, s: SahurState, pid: str) -> dict:
        view = self._common(s)  # no sequence, no hits: a phone only knows its own drums
        view["drums"] = [d for d in range(s.drums) if pid in s.owners.get(d, [])]
        return view

    # --- persistence --------------------------------------------------------------------------
    def serialize(self, s: SahurState) -> dict:
        return {
            "v": 1,
            "names": dict(s.names),
            "round": s.round,
            "phase": s.phase,
            "since_ms": s.since_ms,
            "epoch": s.epoch,
            "drums": s.drums,
            "seq": [{"drum": st["drum"], "trap": bool(st["trap"])} for st in s.seq],
            "pos": s.pos,
            "hits": list(s.hits),
            "owners": {str(d): list(p) for d, p in s.owners.items()},
            "penalty_total": s.penalty_total,
        }

    def deserialize(self, d: dict) -> SahurState:
        return SahurState(
            names=dict(d.get("names", {})),
            round=max(0, min(int(d.get("round", 0)), ROUNDS - 1)),
            phase=d.get("phase", PHASE_SHOW),
            since_ms=int(d.get("since_ms", 0)),
            epoch=int(d.get("epoch", 0)),
            drums=int(d.get("drums", MIN_DRUMS)),
            seq=[{"drum": int(st["drum"]), "trap": bool(st["trap"])} for st in d.get("seq", [])],
            pos=int(d.get("pos", 0)),
            hits=[int(h) for h in d.get("hits", [])],
            owners={int(k): list(v) for k, v in d.get("owners", {}).items()},
            penalty_total=float(d.get("penalty_total", 0.0)),
        )
