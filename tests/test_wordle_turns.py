import pytest

from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Emit
from app.core.puzzle import ActionRejected, PlayerInfo, PuzzleCtx
from app.puzzles.cursed_wordle import MAX_ATTEMPTS, CursedWordle
from tests.fakes import FakeClock, seeded_rng


class Rig:
    def __init__(self, names=("A", "B", "C"), words=("SAHUR",), seed=1, connected=True):
        self.clock = FakeClock()
        self.p = CursedWordle(words=list(words))
        self.players = [PlayerInfo(n, n, connected) for n in names]
        self.ctx = PuzzleCtx(self.clock, seeded_rng(seed), self.players)
        self.s = self.p.start(self.ctx, [x.id for x in self.players if x.connected])
        self.solved = False
        self.brainrot = 0.0
        self.events = []

    def guess(self, pid, word):
        fx = self.p.handle(self.ctx, self.s, pid, {"type": "guess", "word": word})
        for e in fx:
            if isinstance(e, Complete):
                self.solved = True
            elif isinstance(e, AddBrainrot):
                self.brainrot += e.amount
            elif isinstance(e, Emit):
                self.events.append(e)
        return fx

    def set_connected(self, pid, value):
        next(x for x in self.players if x.id == pid).connected = value
        return self.p.on_presence(self.ctx, self.s)

    def add_player(self, pid):
        self.players.append(PlayerInfo(pid, pid, True))
        return self.p.on_presence(self.ctx, self.s)


def test_turn_rotation_round_robin():
    r = Rig()
    assert r.s.turn == "A"
    r.guess("A", "ZZZZZ")
    assert r.s.turn == "B"
    r.guess("B", "ZZZZZ")
    assert r.s.turn == "C"
    r.guess("C", "ZZZZZ")
    assert r.s.turn == "A"


def test_not_your_turn_no_state_change():
    r = Rig()
    with pytest.raises(ActionRejected) as e:
        r.guess("B", "ZZZZZ")
    assert e.value.code == "not_your_turn"
    assert r.s.attempts == [] and r.s.turn == "A"


def test_disconnected_player_turn_is_skipped():
    r = Rig()
    r.set_connected("B", False)
    r.guess("A", "ZZZZZ")
    assert r.s.turn == "C"


def test_turn_moves_when_turn_player_disconnects():
    r = Rig()
    r.set_connected("A", False)
    assert r.s.turn == "B"
    with pytest.raises(ActionRejected):
        r.guess("A", "ZZZZZ")


def test_single_player_keeps_turn():
    r = Rig(names=("A",))
    r.guess("A", "ZZZZZ")
    assert r.s.turn == "A"


def test_win_completes_and_no_brainrot():
    r = Rig()
    r.guess("A", "sahur")
    assert r.solved and r.brainrot == 0


def test_each_miss_adds_wrong_attempt_once():
    r = Rig()
    r.guess("A", "ZZZZZ")
    assert r.brainrot == brainrot.WRONG_ATTEMPT
    r.guess("B", "ZZZZZ")
    assert r.brainrot == 2 * brainrot.WRONG_ATTEMPT


def test_six_misses_reset_round_with_penalty():
    r = Rig(words=["SAHUR", "KETER", "NOCLIP"])
    old = r.s.target
    order = "ABCABC"
    for pid in order:
        word = "ZZZZZ" if len(r.s.target) == 5 else "ZZZZZZ"
        r.guess(pid, word)
    assert not r.solved
    assert r.brainrot == MAX_ATTEMPTS * brainrot.WRONG_ATTEMPT + brainrot.ROUND_FAIL_PENALTY
    assert r.s.attempts == [] and r.s.hidden == []
    assert r.s.target != old
    assert any(e.name == "round_failed" for e in r.events)
    # letters reissued for everyone, none in the new word
    assert set(r.s.letters) == {"A", "B", "C"}
    assert all(ch not in r.s.target for ch in r.s.letters.values())
    # keeps playing: turn is next in rotation
    assert r.s.turn == "A"


def test_bad_action_type_rejected():
    r = Rig()
    with pytest.raises(ActionRejected):
        r.p.handle(r.ctx, r.s, "A", {"type": "nope"})
