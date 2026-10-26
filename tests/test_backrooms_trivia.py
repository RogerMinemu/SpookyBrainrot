"""Room 4 plugin: the Spanish Backrooms bank, unanimity lock, reveal, goal, presence, private answer."""
import json

import pytest

from app.content import TRIVIA, TriviaQuestion
from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Emit, Touch
from app.core.puzzle import ActionRejected, PlayerInfo, PuzzleCtx
from app.puzzles import backrooms_trivia as bt
from app.puzzles.backrooms_trivia import BackroomsTrivia
from tests.fakes import FakeClock, seeded_rng


class Rig:
    def __init__(self, n=3, seed=1234, bank=None):
        self.clock = FakeClock()
        self.p = BackroomsTrivia(bank)
        self.players = [PlayerInfo(f"p{i}", f"P{i}", True) for i in range(n)]
        self.ctx = PuzzleCtx(self.clock, seeded_rng(seed), self.players)
        self.s = self.p.start(self.ctx, [x.id for x in self.players])

    def vote(self, pid, option):
        return self.p.handle(self.ctx, self.s, pid, {"type": "vote", "option": option})

    def all_vote(self, option):
        for x in self.players:
            if x.connected:
                self.vote(x.id, option)

    @property
    def answer(self):
        return self.s.perm.index(0)

    def wrong(self):
        return (self.answer + 1) % 4

    def tick_after(self, ms):
        self.clock.advance(ms / 1000)
        return self.p.tick(self.ctx, self.s)


def kinds(effects):
    return [type(e) for e in effects]


# --- the bank ---------------------------------------------------------------------------------------
def test_the_bank_is_big_spanish_and_well_formed():
    assert len(TRIVIA) >= 25 and bt.GOAL <= len(TRIVIA)
    assert len({q.q for q in TRIVIA}) == len(TRIVIA)
    for q in TRIVIA:
        assert len(q.options) == 4 and len(set(q.options)) == 4 and all(o.strip() for o in q.options), q.q
        assert q.q.strip() and q.fact.strip()
    text = " ".join(q.q + q.fact for q in TRIVIA)
    assert "Backrooms" in text and any(ch in text for ch in "áéíóúñ¿")


def test_start_shuffles_the_bank_and_the_options():
    r = Rig()
    assert sorted(r.s.order) == list(range(len(TRIVIA)))
    assert sorted(r.s.perm) == [0, 1, 2, 3] and r.s.phase == bt.PHASE_VOTE
    view = r.p.view_player(r.s, "p0")
    q = TRIVIA[r.s.order[0]]
    assert view["question"] == q.q and view["options"] == [q.options[i] for i in r.s.perm]


# --- voting and the unanimity lock -------------------------------------------------------------------------
def test_the_answer_only_locks_when_everybody_votes_the_same():
    r = Rig()
    r.vote("p0", 1)
    r.vote("p1", 1)
    assert r.s.lock_since is None  # p2 has not voted
    r.vote("p2", 2)
    assert r.s.lock_since is None  # disagreement
    assert r.vote("p2", 1) == [Touch()] and r.s.lock_since is not None and r.s.lock_choice == 1
    assert r.vote("p2", 1) == []  # same vote again: nothing changes


def test_breaking_the_agreement_cancels_the_lock_and_a_new_one_restarts_the_countdown():
    r = Rig()
    r.all_vote(0)
    r.clock.advance(1.0)
    r.vote("p1", 2)
    assert r.s.lock_since is None
    r.all_vote(2)
    started = r.s.lock_since
    assert r.tick_after(bt.LOCK_MS - 1) == [] and r.s.phase == bt.PHASE_VOTE
    assert r.tick_after(1) != [] and r.s.phase == bt.PHASE_REVEAL
    assert started is not None


def test_a_lone_player_switching_options_restarts_the_lock():
    r = Rig(n=1)
    r.vote("p0", 0)
    r.clock.advance(2.0)
    r.vote("p0", 3)
    assert r.s.lock_choice == 3 and r.tick_after(bt.LOCK_MS - 2000) == []
    r.tick_after(2000)
    assert r.s.phase == bt.PHASE_REVEAL and r.s.last["choice"] == 3


def test_right_answer_counts_without_penalty():
    r = Rig()
    r.all_vote(r.answer)
    assert r.tick_after(bt.LOCK_MS) == [Touch()]
    assert r.s.right == 1 and r.s.wrong == 0 and r.s.last["ok"] and r.s.penalty_total == 0


def test_wrong_answer_costs_a_capped_penalty_and_names_the_right_letter():
    r = Rig()
    letter = bt.LETTERS[r.answer]
    r.all_vote(r.wrong())
    fx = r.tick_after(bt.LOCK_MS)
    assert kinds(fx) == [Touch, Emit, AddBrainrot]
    assert fx[1].name == "round_failed" and letter in fx[1].data["text"] and fx[2].amount == brainrot.TRIVIA_FAIL_PENALTY
    assert r.s.wrong == 1 and not r.s.last["ok"]
    for _ in range(4):
        r.tick_after(bt.REVEAL_MS)
        r.all_vote(r.wrong())
        r.tick_after(bt.LOCK_MS)
    assert r.s.penalty_total == brainrot.ROOM_PENALTY_CAP


def test_reveal_then_next_question_then_complete_at_the_goal():
    r = Rig()
    for i in range(bt.GOAL):
        first = r.s.order[r.s.pos]
        r.all_vote(r.answer)
        r.tick_after(bt.LOCK_MS)
        assert r.s.phase == bt.PHASE_REVEAL
        assert r.tick_after(bt.REVEAL_MS - 1) == []
        fx = r.tick_after(1)
        if i < bt.GOAL - 1:
            assert fx == [Touch()] and r.s.phase == bt.PHASE_VOTE and r.s.votes == {}
            assert r.s.order[r.s.pos] != first
    assert fx == [Complete()]


@pytest.mark.parametrize("action,code", [
    ({"type": "vote", "option": 4}, "bad_option"), ({"type": "vote", "option": -1}, "bad_option"),
    ({"type": "vote", "option": True}, "bad_action"), ({"type": "vote", "option": "A"}, "bad_action"), ({"type": "hit"}, "bad_action"),
])
def test_bad_votes_are_rejected(action, code):
    r = Rig()
    with pytest.raises(ActionRejected) as ei:
        r.p.handle(r.ctx, r.s, "p0", action)
    assert ei.value.code == code


def test_no_votes_during_the_reveal():
    r = Rig()
    r.all_vote(0)
    r.tick_after(bt.LOCK_MS)
    with pytest.raises(ActionRejected) as ei:
        r.vote("p0", 1)
    assert ei.value.code == "wrong_phase"


# --- presence ---------------------------------------------------------------------------------------------
def test_a_phone_connecting_mid_lock_must_agree_too():
    r = Rig(n=2)
    r.players.append(PlayerInfo("p2", "P2", False))
    r.all_vote(1)
    assert r.s.lock_since is not None
    r.players[2].connected = True
    assert r.p.on_presence(r.ctx, r.s) == [Touch()]
    assert r.s.lock_since is None
    r.vote("p2", 1)
    assert r.s.lock_choice == 1


def test_the_only_dissenter_leaving_starts_the_lock():
    r = Rig()
    r.vote("p0", 2)
    r.vote("p1", 2)
    r.vote("p2", 0)
    r.players[2].connected = False
    r.p.on_presence(r.ctx, r.s)
    assert r.s.lock_choice == 2 and r.s.lock_since is not None


# --- views: the answer never leaks before the reveal ----------------------------------------------------------
def test_no_view_carries_the_answer_before_the_reveal():
    r = Rig()
    r.vote("p0", 1)
    for view in (r.p.view_tv(r.s), r.p.view_player(r.s, "p0")):
        assert view["reveal"] is None
        assert TRIVIA[r.s.order[0]].fact not in json.dumps(view, ensure_ascii=False)
    tv = r.p.view_tv(r.s)
    assert tv["votes"][1] == ["P0"] and tv["waiting"] == ["P1", "P2"]
    assert r.p.view_player(r.s, "p0")["mine"] == 1 and r.p.view_player(r.s, "p1")["mine"] is None
    r.all_vote(r.answer)
    r.tick_after(bt.LOCK_MS)
    rev = r.p.view_player(r.s, "p1")["reveal"]
    assert rev["answer"] == r.answer and rev["ok"] and rev["fact"] == TRIVIA[r.s.order[0]].fact


# --- small bank, persistence, debug ----------------------------------------------------------------------------
def test_an_exhausted_bank_reshuffles_without_repeating_the_last_question():
    bank = [TriviaQuestion(f"Q{i}", (f"a{i}", f"b{i}", f"c{i}", f"d{i}"), "dato") for i in range(3)]
    r = Rig(bank=bank)
    seen = []
    for _ in range(9):
        seen.append(r.s.order[r.s.pos])
        r.all_vote(r.wrong())
        r.tick_after(bt.LOCK_MS)
        r.tick_after(bt.REVEAL_MS)
    assert all(a != b for a, b in zip(seen, seen[1:]))
    assert sorted(seen[:3]) == [0, 1, 2]


def test_serialize_roundtrip_jump_and_peek():
    r = Rig()
    r.all_vote(2)
    blob = json.loads(json.dumps(r.p.serialize(r.s)))
    assert r.p.serialize(r.p.deserialize(blob)) == r.p.serialize(r.s)
    with pytest.raises(ValueError):
        r.p.deserialize({**blob, "perm": [0, 1]})
    r.p.jump_level(r.ctx, r.s, 5)
    assert r.s.right == 5 and r.s.votes == {} and r.s.phase == bt.PHASE_VOTE
    assert r.p.debug_peek(r.s) == f"Respuesta: {bt.LETTERS[r.answer]}) {TRIVIA[r.s.order[r.s.pos]].options[0]}"
