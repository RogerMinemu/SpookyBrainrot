import pytest

from app.core.effects import Complete
from app.core.puzzle import ActionRejected, PlayerInfo, PuzzleCtx
from app.puzzles.hold_together import HOLD_MS, HoldTogether
from tests.fakes import FakeClock, seeded_rng


class Rig:
    def __init__(self, names=("A", "B", "C"), connected=True):
        self.clock = FakeClock()
        self.p = HoldTogether()
        self.players = [PlayerInfo(n, n, connected) for n in names]
        self.ctx = PuzzleCtx(self.clock, seeded_rng(), self.players)
        self.s = self.p.start(self.ctx, [x.id for x in self.players if x.connected])
        self.solved = False

    def _fx(self, effects):
        if any(isinstance(e, Complete) for e in effects):
            self.solved = True
        return effects

    def hold(self, pid):
        return self._fx(self.p.handle(self.ctx, self.s, pid, {"type": "hold", "down": True}))

    def release(self, pid):
        return self._fx(self.p.handle(self.ctx, self.s, pid, {"type": "hold", "down": False}))

    def tick(self):
        return self._fx(self.p.tick(self.ctx, self.s))

    def at(self, seconds_from_now):
        self.clock.advance(seconds_from_now)
        return self.tick()

    def set_connected(self, pid, value):
        next(x for x in self.players if x.id == pid).connected = value
        return self._fx(self.p.on_presence(self.ctx, self.s))

    def add_player(self, pid):
        self.players.append(PlayerInfo(pid, pid, True))
        return self._fx(self.p.on_presence(self.ctx, self.s))


def test_three_players_4_9_not_solved_5_0_solved():
    r = Rig()
    for pid in "ABC":
        r.hold(pid)
    r.at(4.9)
    assert not r.solved
    r.at(0.1)
    assert r.solved


def test_hold_constant_is_five_seconds():
    assert HOLD_MS == 5000


def test_release_resets_timer_solved_at_8_1_not_5():
    r = Rig()
    for pid in "ABC":
        r.hold(pid)
    r.at(3)
    r.release("B")
    assert r.s.since_ms is None and r.s.progress == 0.0
    r.at(0.1)
    r.hold("B")  # t=3.1, everybody holds again
    r.at(4.9)  # t=8.0
    assert not r.solved
    r.at(0.1)  # t=8.1
    assert r.solved


def test_holder_dropping_does_not_reset_timer():
    r = Rig()
    for pid in "ABC":
        r.hold(pid)
    r.at(2)
    r.set_connected("C", False)
    r.at(3)  # t=5 from the original start
    assert r.solved


def test_non_holder_disconnect_lets_remaining_holders_start_the_timer():
    r = Rig()
    r.hold("A")
    r.hold("B")
    r.at(2)
    assert r.s.since_ms is None  # C is connected but not holding
    r.set_connected("C", False)  # now everybody connected holds: timer starts here
    r.at(4.9)
    assert not r.solved
    r.at(0.1)
    assert r.solved


def test_zero_connected_never_solves():
    r = Rig(connected=False)
    r.at(60)
    assert not r.solved and r.s.since_ms is None
    r.hold("A")  # disconnected: ignored
    r.at(60)
    assert not r.solved


def test_all_players_dropping_after_hold_does_not_solve():
    r = Rig(("A",))
    r.hold("A")
    r.at(1)
    r.set_connected("A", False)
    r.at(60)
    assert not r.solved


def test_duplicate_hold_start_ignored():
    r = Rig(("A", "B"))
    assert r.hold("A")  # first one changes state
    r.hold("B")
    r.at(2)
    since = r.s.since_ms
    assert r.hold("A") == []  # duplicate: no effects, timer untouched
    assert r.s.since_ms == since


def test_hold_end_from_non_holder_ignored():
    r = Rig(("A", "B"))
    r.hold("A")
    r.hold("B")
    r.at(1)
    r.set_connected("A", True)
    assert r.release("ghost") == []
    r2 = Rig(("A", "B"))
    r2.hold("A")
    assert r2.release("B") == []  # B never held
    assert r2.s.holders == {"A"}


def test_new_joiner_resets_timer_and_is_non_holder():
    r = Rig(("A", "B"))
    r.hold("A")
    r.hold("B")
    r.at(3)
    r.add_player("D")
    assert r.s.since_ms is None and r.s.progress == 0.0
    r.at(10)
    assert not r.solved  # D never holds
    r.hold("D")
    r.at(4.9)
    assert not r.solved
    r.at(0.1)
    assert r.solved


def test_reconnecting_player_comes_back_as_non_holder_and_resets():
    r = Rig(("A", "B"))
    r.hold("A")
    r.hold("B")
    r.at(2)
    r.set_connected("B", False)
    r.set_connected("B", True)
    assert "B" not in r.s.holders and r.s.since_ms is None
    r.hold("B")
    r.at(5)
    assert r.solved


def test_progress_ratio_in_views():
    r = Rig(("A", "B"))
    r.hold("A")
    r.hold("B")
    r.at(2.5)
    assert r.s.progress == 0.5
    tv = r.p.view_tv(r.s)
    assert tv["kind"] == "hold_together" and tv["progress"] == 0.5
    assert tv["players"] == [{"name": "A", "holding": True}, {"name": "B", "holding": True}]
    assert r.p.view_player(r.s, "A")["holding"] is True
    r.release("A")
    assert r.p.view_player(r.s, "A")["holding"] is False
    assert r.p.view_tv(r.s)["players"][0] == {"name": "A", "holding": False}


def test_tick_only_reports_change_when_progress_moves():
    r = Rig(("A",))
    r.hold("A")
    assert r.tick() == []  # same instant, progress still 0
    assert r.at(0.25)  # progress 0.05


def test_restore_clears_holders():
    r = Rig(("A", "B"))
    r.hold("A")
    data = r.p.serialize(r.s)
    s2 = r.p.deserialize(data)
    assert s2.holders == set() and s2.since_ms is None and s2.progress == 0.0


def test_bad_action_rejected():
    r = Rig(("A",))
    with pytest.raises(ActionRejected):
        r.p.handle(r.ctx, r.s, "A", {"type": "guess"})
    with pytest.raises(ActionRejected):
        r.p.handle(r.ctx, r.s, "A", {"type": "hold", "down": "yes"})
