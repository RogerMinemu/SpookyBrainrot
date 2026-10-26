"""Room 3 plugin: field generation, dealing, the two-button counter, check/pass/fail, presence, private views."""
import json
import random

import pytest

from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Emit, Touch
from app.core.puzzle import ActionRejected, PlayerInfo, PuzzleCtx
from app.puzzles import shape_count as sc
from app.puzzles.shape_count import ShapeCount, deal, kinds_for, make_field, tally
from tests.fakes import FakeClock, seeded_rng


class Rig:
    def __init__(self, n=3, seed=1234):
        self.clock = FakeClock()
        self.p = ShapeCount()
        self.players = [PlayerInfo(f"p{i}", f"P{i}", True) for i in range(n)]
        self.ctx = PuzzleCtx(self.clock, seeded_rng(seed), self.players)
        self.s = self.p.start(self.ctx, [x.id for x in self.players])

    def adjust(self, pid, delta=1):
        return self.p.handle(self.ctx, self.s, pid, {"type": "adjust", "delta": delta})

    def answer_right(self, skip=()):
        truth = tally(self.s.shapes)
        for pid, kind in self.s.assign.items():
            if pid not in skip:
                for _ in range(truth[kind]):
                    self.adjust(pid)

    def end_count(self):
        self.clock.advance(sc.COUNT_MS[self.s.round] / 1000)
        return self.p.tick(self.ctx, self.s)

    def end_check(self):
        self.clock.advance(sc.CHECK_MS / 1000)
        return self.p.tick(self.ctx, self.s)


def kinds(effects):
    return [type(e) for e in effects]


# --- generation ------------------------------------------------------------------------------
def test_constants_follow_the_design():
    assert sc.ROUNDS == 3 and ShapeCount.levels == 3 and len(sc.KINDS) == 8
    assert set(sc.KIND_NAMES) == set(sc.KINDS)
    assert len(sc.MIN_KINDS) == len(sc.COUNT_RANGE) == len(sc.COUNT_MS) == sc.ROUNDS


@pytest.mark.parametrize("seed", range(40))
def test_field_has_one_shape_per_cell_and_counts_in_range(seed):
    rng = random.Random(seed)
    for r in range(sc.ROUNDS):
        kinds_ = kinds_for(rng, r, rng.randint(1, 12))
        lo, hi = sc.COUNT_RANGE[r]
        field = make_field(rng, kinds_, lo, hi)
        counts = tally(field)
        assert set(counts) == set(kinds_) and all(lo <= c <= hi for c in counts.values())
        cells = {(int(sh["x"] * sc.COLS), int(sh["y"] * sc.ROWS)) for sh in field}
        assert len(cells) == len(field)  # never two shapes in one cell
        assert all(0 < sh["x"] < 1 and 0 < sh["y"] < 1 and 0 <= sh["color"] < sc.COLORS for sh in field)
        assert all(sh["rot"] == 0 for sh in field if sh["kind"] in sc.UPRIGHT)  # a tilted square would be a diamond


def test_kinds_on_the_field_grow_with_the_round_and_the_players():
    rng = random.Random(1)
    assert [len(kinds_for(rng, r, 2)) for r in range(3)] == [4, 6, 8]
    assert len(kinds_for(rng, 0, 7)) == 7 and len(kinds_for(rng, 0, 14)) == 8


def test_deal_gives_distinct_kinds_while_they_last_then_repeats():
    rng = random.Random(2)
    ks = ["star", "moon", "heart", "cross"]
    d = deal(["a", "b", "c"], ks, rng)
    assert len(set(d.values())) == 3 and set(d.values()) <= set(ks)
    d = deal([f"p{i}" for i in range(6)], ks, rng)
    assert set(d.values()) == set(ks)


# --- start / handle --------------------------------------------------------------------------------
def test_start_deals_a_kind_to_every_connected_player():
    r = Rig()
    assert r.s.phase == sc.PHASE_COUNT and r.s.round == 0
    assert set(r.s.assign) == {"p0", "p1", "p2"} and len(set(r.s.assign.values())) == 3
    assert set(r.s.assign.values()) <= set(r.s.kinds)
    assert r.s.answers == {"p0": 0, "p1": 0, "p2": 0} and r.s.left == sc.COUNT_MS[0] // 1000


def test_two_buttons_move_the_counter_and_clamp_at_zero():
    r = Rig()
    assert r.adjust("p0", -1) == []  # already 0: nothing changed
    assert r.adjust("p0", 1) == [Touch()] and r.adjust("p0", 1) == [Touch()]
    assert r.adjust("p0", -1) == [Touch()] and r.s.answers["p0"] == 1
    r.s.answers["p0"] = sc.MAX_COUNT
    assert r.adjust("p0", 1) == [] and r.s.answers["p0"] == sc.MAX_COUNT


@pytest.mark.parametrize("action", [{"type": "adjust", "delta": True}, {"type": "adjust", "delta": 2},
                                    {"type": "adjust", "delta": "1"}, {"type": "hit", "delta": 1}, {}])
def test_bad_actions_are_rejected(action):
    r = Rig()
    with pytest.raises(ActionRejected) as ei:
        r.p.handle(r.ctx, r.s, "p0", action)
    assert ei.value.code == "bad_action"


def test_counting_outside_the_count_or_without_a_shape_is_rejected():
    r = Rig()
    with pytest.raises(ActionRejected) as ei:
        r.adjust("ghost")
    assert ei.value.code == "no_shape"
    r.end_count()
    with pytest.raises(ActionRejected) as ei:
        r.adjust("p0")
    assert ei.value.code == "wrong_phase"


def test_tick_counts_down_whole_seconds_only():
    r = Rig()
    assert r.p.tick(r.ctx, r.s) == []
    r.clock.advance(0.4)
    assert r.p.tick(r.ctx, r.s) == [] and r.s.left == sc.COUNT_MS[0] // 1000
    r.clock.advance(0.7)
    assert r.p.tick(r.ctx, r.s) == [Touch()] and r.s.left == sc.COUNT_MS[0] // 1000 - 1


# --- check -------------------------------------------------------------------------------------------
def test_all_right_passes_then_the_next_round_brings_a_new_field():
    r = Rig()
    r.answer_right()
    epoch = r.s.epoch
    assert r.end_count() == [Touch()] and r.s.phase == sc.PHASE_PASS
    assert all(x["ok"] for x in r.s.results) and r.s.penalty_total == 0
    assert r.end_check() == [Touch()]
    assert r.s.round == 1 and r.s.phase == sc.PHASE_COUNT and r.s.epoch == epoch + 1
    assert set(r.s.answers.values()) == {0} and r.s.results == [] and len(r.s.kinds) == 6


def test_one_miscount_fails_the_round_with_a_capped_penalty():
    r = Rig()
    r.answer_right(skip=("p1",))
    fx = r.end_count()
    assert r.s.phase == sc.PHASE_FAIL
    assert kinds(fx) == [Touch, Emit, AddBrainrot]
    assert fx[1].name == "round_failed" and fx[1].data["penalty"] == brainrot.SHAPE_FAIL_PENALTY
    assert fx[2].amount == brainrot.SHAPE_FAIL_PENALTY
    assert [x["ok"] for x in r.s.results] == [x != "p1" for x in ("p0", "p1", "p2")]
    r.end_check()
    assert r.s.round == 0 and r.s.phase == sc.PHASE_COUNT  # same round, new field
    for _ in range(4):
        r.end_count()
        r.end_check()
    assert r.s.penalty_total == brainrot.ROOM_PENALTY_CAP
    fx = r.end_count()
    assert kinds(fx) == [Touch, Emit] and fx[1].data["penalty"] == 0  # capped: no AddBrainrot any more


def test_last_round_completes_after_the_check():
    r = Rig()
    r.p.jump_level(r.ctx, r.s, 2)
    r.answer_right()
    r.end_count()
    assert r.s.phase == sc.PHASE_PASS
    assert r.end_check() == [Complete()]


def test_a_disconnected_player_is_not_checked_and_a_newcomer_gets_the_least_used_kind():
    r = Rig(n=2)
    r.players.append(PlayerInfo("late", "Late", False))
    r.players[1].connected = False
    assert r.p.on_presence(r.ctx, r.s) == [Touch()]
    r.players[2].connected = True
    assert r.p.on_presence(r.ctx, r.s) == [Touch()]
    assert r.s.assign["late"] in r.s.kinds and r.s.assign["late"] != r.s.assign["p0"]
    r.answer_right(skip=("p1",))
    r.end_count()
    assert r.s.phase == sc.PHASE_PASS and {x["pid"] for x in r.s.results} == {"p0", "late"}


def test_nobody_connected_at_the_check_restarts_the_round_without_penalty():
    r = Rig(n=1)
    r.players[0].connected = False
    r.p.on_presence(r.ctx, r.s)
    epoch = r.s.epoch
    assert r.end_count() == [Touch()]
    assert r.s.phase == sc.PHASE_COUNT and r.s.epoch == epoch + 1 and r.s.penalty_total == 0


# --- views ---------------------------------------------------------------------------------------------
def test_phones_only_see_their_own_shape_and_counter():
    r = Rig()
    r.adjust("p0")
    pv = r.p.view_player(r.s, "p1")
    assert pv["shape"] == r.s.assign["p1"] and pv["answer"] == 0 and pv["result"] is None
    for key in ("shapes", "counters", "results"):
        assert key not in pv
    blob = json.dumps(pv, ensure_ascii=False)
    assert "P0" not in blob  # nothing about another player


def test_the_tv_shows_who_counts_what_but_no_counter_until_the_check():
    r = Rig()
    r.adjust("p0")
    tv = r.p.view_tv(r.s)
    assert len(tv["shapes"]) == len(r.s.shapes) and tv["results"] == [] and not tv["drift"]
    assert {c["name"] for c in tv["counters"]} == {"P0", "P1", "P2"}
    assert all("answer" not in c for c in tv["counters"])
    r.answer_right()
    r.end_count()
    tv = r.p.view_tv(r.s)
    assert {x["name"] for x in tv["results"]} == {"P0", "P1", "P2"} and all("truth" in x for x in tv["results"])
    assert r.p.view_player(r.s, "p2")["result"]["truth"] == tally(r.s.shapes)[r.s.assign["p2"]]


def test_the_last_round_drifts():
    r = Rig()
    r.p.jump_level(r.ctx, r.s, sc.DRIFT_FROM_ROUND)
    assert r.p.view_tv(r.s)["drift"] is True


# --- persistence / debug -----------------------------------------------------------------------------------
def test_serialize_roundtrip_and_peek():
    r = Rig()
    r.adjust("p0")
    r.answer_right(skip=("p0",))
    r.end_count()
    blob = json.loads(json.dumps(r.p.serialize(r.s)))
    assert r.p.serialize(r.p.deserialize(blob)) == r.p.serialize(r.s)
    peek = r.p.debug_peek(r.s)
    assert peek.startswith("Formas: ") and all(sc.KIND_NAMES[k] in peek for k in r.s.kinds)
