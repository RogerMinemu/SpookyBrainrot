"""Room 6 plugin: show/input flip, traps, ownership, redeal, private views (R-SD-1..6, R-RE-3)."""
import json

import pytest

from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Emit, Touch
from app.core.puzzle import ActionRejected, PlayerInfo, PuzzleCtx
from app.puzzles import sahur_dice as sd
from app.puzzles.sahur_dice import SahurDice, deal, drum_count, make_sequence
from tests.fakes import FakeClock, seeded_rng


class Rig:
    def __init__(self, n=3, seed=1234):
        self.clock = FakeClock()
        self.p = SahurDice()
        self.players = [PlayerInfo(f"p{i}", f"P{i}", True) for i in range(n)]
        self.ctx = PuzzleCtx(self.clock, seeded_rng(seed), self.players)
        self.s = self.p.start(self.ctx, [x.id for x in self.players])

    def show_ms(self):
        return sd.SHOW_LEAD_MS + len(self.s.seq) * sd.SHOW_STEP_MS + sd.SHOW_TAIL_MS

    def to_input(self):
        self.clock.advance(self.show_ms() / 1000)
        fx = self.p.tick(self.ctx, self.s)
        assert self.s.phase == sd.PHASE_INPUT
        return fx

    def owner_of(self, drum):
        return self.s.owners[drum][0]

    def hit(self, drum, pid=None):
        return self.p.handle(self.ctx, self.s, pid or self.owner_of(drum), {"type": "hit", "drum": drum})

    def play_round(self):
        fx = []
        for drum in self.s.expected[self.s.pos:]:
            fx = self.hit(drum)
        return fx

    def wrong_drum(self):
        want = self.s.expected[self.s.pos]
        return next(d for d in range(self.s.drums) if d != want)


def kinds(effects):
    return [type(e) for e in effects]


# --- sequence generation ----------------------------------------------------------------
def test_constants_follow_the_design():
    assert (sd.ROUNDS, sd.SEQ_LEN, sd.TRAP_CHANCE) == (3, (4, 5, 6), 0.25)
    assert (sd.SHOW_LEAD_MS, sd.SHOW_STEP_MS, sd.SHOW_TAIL_MS) == (1500, 900, 600)
    assert (sd.FAIL_MS, sd.PASS_MS) == (2500, 1500)
    assert SahurDice.levels == 3


def test_round_one_has_no_traps():
    r = Rig()
    assert len(r.s.seq) == 4 and not any(st["trap"] for st in r.s.seq)
    assert r.s.expected == [st["drum"] for st in r.s.seq]


@pytest.mark.parametrize("seed", range(60))
def test_trap_rules_hold_for_many_seeds(seed):
    import random

    rng = random.Random(seed)
    for length in (5, 6):
        seq = make_sequence(rng, length, rng.choice([4, 5, 6]), traps=True)
        flags = [st["trap"] for st in seq]
        assert any(flags)  # at least one trap
        assert not flags[0] and not flags[-1]  # never first, never last
        assert not any(a and b for a, b in zip(flags, flags[1:]))  # never two in a row
        for i, st in enumerate(seq):
            if st["trap"]:
                assert st["drum"] != seq[i + 1]["drum"]  # a trap is never the next real prompt
        assert len([s for s in seq if not s["trap"]]) >= 1


def test_no_traps_when_disabled():
    import random

    assert not any(st["trap"] for st in make_sequence(random.Random(3), 6, 4, traps=False))


# --- show -> input ------------------------------------------------------------------------
def test_tick_flips_show_to_input_by_clock():
    r = Rig()
    assert r.s.phase == sd.PHASE_SHOW and r.p.tick(r.ctx, r.s) == []
    r.clock.advance((r.show_ms() - 1) / 1000)
    assert r.p.tick(r.ctx, r.s) == [] and r.s.phase == sd.PHASE_SHOW
    r.clock.advance(0.001)
    assert r.p.tick(r.ctx, r.s) == [Touch()] and r.s.phase == sd.PHASE_INPUT


def test_hit_outside_input_is_rejected_without_failing():
    r = Rig()
    with pytest.raises(ActionRejected) as ei:
        r.hit(r.s.expected[0])
    assert ei.value.code == "wrong_phase"
    assert r.s.phase == sd.PHASE_SHOW and r.s.penalty_total == 0


# --- input: pass / fail ----------------------------------------------------------------------
def test_correct_round_passes_then_next_round_shows_longer_sequence():
    r = Rig()
    r.to_input()
    fx = r.play_round()
    assert kinds(fx) == [Touch] and r.s.phase == sd.PHASE_PASS
    r.clock.advance(sd.PASS_MS / 1000)
    assert r.p.tick(r.ctx, r.s) == [Touch()]
    assert r.s.phase == sd.PHASE_SHOW and r.s.round == 1 and len(r.s.seq) == 5
    assert any(st["trap"] for st in r.s.seq)


def test_last_round_completes_the_puzzle():
    r = Rig()
    for _ in range(sd.ROUNDS - 1):
        r.to_input()
        r.play_round()
        r.clock.advance(sd.PASS_MS / 1000)
        r.p.tick(r.ctx, r.s)
    r.to_input()
    assert r.s.round == 2 and len(r.s.seq) == 6
    assert r.play_round() == [Complete()]


def test_wrong_drum_fails_with_event_and_capped_penalty():
    r = Rig()
    r.to_input()
    bad = r.wrong_drum()
    fx = r.hit(bad, pid=r.owner_of(bad))
    emit = next(e for e in fx if isinstance(e, Emit))
    assert emit.name == "round_failed" and emit.to == "all"
    assert emit.data["penalty"] == brainrot.SAHUR_FAIL_PENALTY and emit.data["title"] and emit.data["text"]
    assert any(isinstance(e, AddBrainrot) and e.amount == brainrot.SAHUR_FAIL_PENALTY for e in fx)
    assert r.s.phase == sd.PHASE_FAIL


def test_fail_restarts_same_round_with_new_sequence_after_fail_ms():
    r = Rig()
    r.to_input()
    epoch, length = r.s.epoch, len(r.s.seq)
    r.hit(r.wrong_drum(), pid=r.owner_of(r.wrong_drum()))
    r.clock.advance((sd.FAIL_MS - 1) / 1000)
    assert r.p.tick(r.ctx, r.s) == [] and r.s.phase == sd.PHASE_FAIL
    r.clock.advance(0.001)
    assert r.p.tick(r.ctx, r.s) == [Touch()]
    assert r.s.phase == sd.PHASE_SHOW and r.s.round == 0 and len(r.s.seq) == length
    assert r.s.epoch == epoch + 1 and r.s.pos == 0 and r.s.hits == []


def test_wrong_owner_fails_even_on_the_right_drum():
    r = Rig()
    r.to_input()
    drum = r.s.expected[0]
    intruder = next(p.id for p in r.players if p.id not in r.s.owners[drum])
    fx = r.hit(drum, pid=intruder)
    assert any(isinstance(e, Emit) for e in fx) and r.s.phase == sd.PHASE_FAIL


def test_wrong_order_fails():
    r = Rig()
    r.to_input()
    r.hit(r.s.expected[0])
    later = next(d for d in r.s.expected[1:] if d != r.s.expected[1]) if len(set(r.s.expected[1:])) > 1 else None
    drum = later if later is not None else r.wrong_drum()
    fx = r.hit(drum, pid=r.owner_of(drum))
    assert r.s.phase == sd.PHASE_FAIL and any(isinstance(e, Emit) for e in fx)


def _trap_round(seed):
    r = Rig(seed=seed)
    r.to_input()
    r.play_round()
    r.clock.advance(sd.PASS_MS / 1000)
    r.p.tick(r.ctx, r.s)
    r.to_input()
    assert any(st["trap"] for st in r.s.seq)
    return r


@pytest.mark.parametrize("seed", range(8))
def test_trap_not_repeated_is_ok_and_repeating_it_fails(seed):
    r = _trap_round(seed)
    # skipping every trap (only the real prompts, in order) clears the round
    fx = r.play_round()
    assert r.s.phase == sd.PHASE_PASS or fx == [Complete()]
    r = _trap_round(seed)
    ti = next(i for i, st in enumerate(r.s.seq) if st["trap"])
    real_before = [st["drum"] for st in r.s.seq[:ti] if not st["trap"]]
    for drum in real_before:
        r.hit(drum)
    trap_drum = r.s.seq[ti]["drum"]
    fx = r.hit(trap_drum, pid=r.owner_of(trap_drum))  # repeats the trap: expected is the NEXT real prompt
    assert r.s.phase == sd.PHASE_FAIL
    emit = next(e for e in fx if isinstance(e, Emit))
    assert emit.name == "round_failed" and "trampa" in emit.data["text"]


def test_penalty_is_capped_per_room_but_event_still_fires():
    r = Rig()
    r.s.penalty_total = brainrot.ROOM_PENALTY_CAP - 1
    r.to_input()
    bad = r.wrong_drum()
    fx = r.hit(bad, pid=r.owner_of(bad))
    assert next(e for e in fx if isinstance(e, AddBrainrot)).amount == 1
    r.clock.advance(sd.FAIL_MS / 1000)
    r.p.tick(r.ctx, r.s)
    r.to_input()
    bad = r.wrong_drum()
    fx = r.hit(bad, pid=r.owner_of(bad))
    assert not any(isinstance(e, AddBrainrot) for e in fx)
    assert next(e for e in fx if isinstance(e, Emit)).data["penalty"] == 0


def test_bad_hit_payloads_are_rejected():
    r = Rig()
    r.to_input()
    for action in ({"type": "hit"}, {"type": "hit", "drum": "1"}, {"type": "hit", "drum": True},
                   {"type": "nope", "drum": 0}, {"type": "hit", "drum": 99}, {"type": "hit", "drum": -1}):
        with pytest.raises(ActionRejected):
            r.p.handle(r.ctx, r.s, "p0", action)
    assert r.s.phase == sd.PHASE_INPUT and r.s.pos == 0


# --- ownership ------------------------------------------------------------------------------
@pytest.mark.parametrize("n", range(1, 13))
def test_every_drum_owned_and_every_player_owns_one(n):
    r = Rig(n)
    assert r.s.drums == drum_count(n) == min(6, max(4, n))
    assert all(r.s.owners[d] for d in range(r.s.drums))
    for p in r.players:
        assert any(p.id in owners for owners in r.s.owners.values())


def test_single_player_owns_all_drums_and_can_clear():
    r = Rig(1)
    assert all(r.s.owners[d] == ["p0"] for d in range(r.s.drums))
    r.to_input()
    assert kinds(r.play_round()) == [Touch]


def test_deal_with_no_players_is_empty_not_a_crash():
    assert deal([], 4) == {0: [], 1: [], 2: [], 3: []}


def test_owner_disconnect_redeals_without_orphans():
    r = Rig(4)
    before = {d: list(o) for d, o in r.s.owners.items()}
    r.players[1].connected = False
    assert r.p.on_presence(r.ctx, r.s) == [Touch()]
    assert r.s.owners != before
    assert all(r.s.owners[d] for d in range(r.s.drums))
    assert all("p1" not in owners for owners in r.s.owners.values())
    r.players[1].connected = True
    assert r.p.on_presence(r.ctx, r.s) == [Touch()]
    assert any("p1" in owners for owners in r.s.owners.values())
    assert r.p.on_presence(r.ctx, r.s) == []  # nothing changed: nothing pushed


def test_redeal_keeps_the_sequence_and_drum_count():
    r = Rig(4)
    seq, drums = [dict(s) for s in r.s.seq], r.s.drums
    r.players[0].connected = False
    r.p.on_presence(r.ctx, r.s)
    assert r.s.seq == seq and r.s.drums == drums


def test_player_who_lost_a_drum_to_a_redeal_cannot_play_it():
    r = Rig(4)
    r.to_input()
    drum = r.s.expected[0]
    owner = r.owner_of(drum)
    next(p for p in r.players if p.id == owner).connected = False
    r.p.on_presence(r.ctx, r.s)
    fx = r.hit(drum, pid=owner)  # stale phone still sending
    assert r.s.phase == sd.PHASE_FAIL and any(isinstance(e, Emit) for e in fx)


# --- views: the sequence never reaches a phone ----------------------------------------------------
def _walk_phases(r):
    """Yield the state in every phase: show, input, mid-input, pass, fail."""
    yield r.s.phase
    r.to_input()
    yield r.s.phase
    r.hit(r.s.expected[0])
    yield "mid-input"
    r.play_round() if r.s.pos < len(r.s.expected) else None
    yield r.s.phase  # pass
    r.clock.advance(sd.PASS_MS / 1000)
    r.p.tick(r.ctx, r.s)
    r.to_input()
    bad = r.wrong_drum()
    r.hit(bad, pid=r.owner_of(bad))
    yield r.s.phase  # fail


@pytest.mark.parametrize("n", [1, 2, 5, 12])
def test_view_player_never_contains_sequence_data(n):
    r = Rig(n)
    for _ in _walk_phases(r):
        for p in r.players:
            view = r.p.view_player(r.s, p.id)
            text = json.dumps(view)
            for forbidden in ('"seq"', '"trap"', '"hits"', '"expected"', '"pos"', "sequence"):
                assert forbidden not in text, (forbidden, view)
            assert set(view) == {"kind", "phase", "round", "rounds", "epoch", "drums"}
            assert view["drums"] == [d for d in range(r.s.drums) if p.id in r.s.owners[d]]
        # ...while the TV has everything
        tv = r.p.view_tv(r.s)
        assert [st["drum"] for st in tv["seq"]] == [st["drum"] for st in r.s.seq]


def test_view_tv_lists_drums_with_owner_names_and_timing():
    r = Rig(3)
    tv = r.p.view_tv(r.s)
    assert tv["kind"] == "sahur_dice" and tv["round"] == 1 and tv["rounds"] == 3
    assert [d["id"] for d in tv["drums"]] == list(range(r.s.drums))
    assert all(d["owners"] and all(name.startswith("P") for name in d["owners"]) for d in tv["drums"])
    assert tv["timing"] == {"lead": 1500, "step": 900, "tail": 600}
    assert tv["hits"] == []


# --- TV replay / debug jump / persistence -------------------------------------------------------------
def test_replay_restarts_the_show_timeline_only_in_show():
    r = Rig()
    r.clock.advance(1)
    since = r.s.since_ms
    assert r.p.handle_tv(r.ctx, r.s, {"action": "replay", "epoch": r.s.epoch}) == [Touch()]
    assert r.s.since_ms > since
    r.to_input()
    assert r.p.handle_tv(r.ctx, r.s, {"action": "replay", "epoch": r.s.epoch}) == []


def test_replay_with_stale_epoch_or_wrong_action_is_rejected():
    r = Rig()
    with pytest.raises(ActionRejected) as ei:
        r.p.handle_tv(r.ctx, r.s, {"action": "replay", "epoch": r.s.epoch + 1})
    assert ei.value.code == "stale"
    with pytest.raises(ActionRejected):
        r.p.handle_tv(r.ctx, r.s, {"action": "clear", "epoch": r.s.epoch})


@pytest.mark.parametrize("level", [0, 1, 2])
def test_jump_level_selects_the_round(level):
    r = Rig()
    epoch = r.s.epoch
    r.p.jump_level(r.ctx, r.s, level)
    assert r.s.round == level and len(r.s.seq) == sd.SEQ_LEN[level] and r.s.epoch == epoch + 1
    assert r.s.phase == sd.PHASE_SHOW
    assert any(st["trap"] for st in r.s.seq) == (level >= 1)


def test_serialize_roundtrip_mid_input():
    r = Rig(4)
    r.to_input()
    r.hit(r.s.expected[0])
    blob = json.loads(json.dumps(r.p.serialize(r.s)))
    s2 = r.p.deserialize(blob)
    assert r.p.serialize(s2) == r.p.serialize(r.s)
    assert s2.pos == 1 and s2.phase == sd.PHASE_INPUT and s2.owners == r.s.owners


def test_deserialize_tolerates_garbage_round():
    s = SahurDice().deserialize({"round": 99})
    assert s.round == sd.ROUNDS - 1
