"""Room 2 plugin: arrivals, all-must-arrive, presence, epoch guard (R-RL-4, R-RL-5, R-RL-7)."""
import json

import pytest

from app.core.effects import AddBrainrot, Complete, Touch
from app.core.puzzle import ActionRejected, PlayerInfo, PuzzleCtx
from app.puzzles.red_light import RedLight
from tests.fakes import FakeClock, seeded_rng


class Rig:
    def __init__(self, n=3):
        self.clock = FakeClock()
        self.p = RedLight()
        self.players = [PlayerInfo(f"p{i}", f"P{i}", True) for i in range(n)]
        self.ctx = PuzzleCtx(self.clock, seeded_rng(), self.players)
        self.s = self.p.start(self.ctx, [x.id for x in self.players])

    def tv(self, action, **extra):
        data = {"action": action, "epoch": self.s.guard.epoch, "level": 0, **extra}
        return self.p.handle_tv(self.ctx, self.s, data)

    def set_connected(self, pid, value):
        next(x for x in self.players if x.id == pid).connected = value
        return self.p.on_presence(self.ctx, self.s)

    def add_player(self, pid):
        self.players.append(PlayerInfo(pid, pid, True))
        return self.p.on_presence(self.ctx, self.s)


def test_last_arrival_completes_the_room():
    r = Rig()
    assert r.tv("arrive", pid="p0") == [Touch()]
    assert r.tv("arrive", pid="p1") == [Touch()]
    assert r.tv("arrive", pid="p2") == [Complete()]


def test_duplicate_arrival_is_a_noop():
    r = Rig()
    r.tv("arrive", pid="p0")
    assert r.tv("arrive", pid="p0") == []
    assert r.s.arrived == {"p0"}


def test_disconnect_removes_the_requirement():
    r = Rig()
    r.tv("arrive", pid="p0")
    r.tv("arrive", pid="p1")
    assert r.set_connected("p2", False) == [Complete()]  # only finishers are left


def test_disconnect_of_a_finisher_does_not_complete_with_stragglers():
    r = Rig()
    r.tv("arrive", pid="p0")
    assert r.set_connected("p0", False) == []  # p1, p2 still swimming
    r.tv("arrive", pid="p1")
    assert r.tv("arrive", pid="p2") == [Complete()]  # p0 is offline: not required


def test_joiner_must_arrive_too():
    r = Rig(2)
    r.tv("arrive", pid="p0")
    assert r.add_player("p9") == []
    assert r.tv("arrive", pid="p1") == [Touch()]  # p9 is connected and has not arrived
    assert r.tv("arrive", pid="p9") == [Complete()]


def test_reconnecting_finisher_keeps_their_arrival():
    r = Rig(2)
    r.tv("arrive", pid="p0")
    r.set_connected("p0", False)
    r.set_connected("p0", True)
    assert "p0" in r.s.arrived
    assert r.tv("arrive", pid="p1") == [Complete()]


def test_clear_is_verified_against_the_arrived_set():
    r = Rig()
    r.tv("arrive", pid="p0")
    with pytest.raises(ActionRejected) as ei:
        r.tv("clear")
    assert ei.value.code == "not_all_arrived"
    r.s.arrived.update({"p1", "p2"})
    assert r.tv("clear") == [Complete()]


def test_nobody_connected_never_completes():
    r = Rig(2)
    for pid in ("p0", "p1"):
        r.set_connected(pid, False)
    assert r.p.on_presence(r.ctx, r.s) == []


def test_epoch_and_level_guard():
    r = Rig()
    for extra in ({"epoch": 99}, {"level": 1}):
        data = {"action": "arrive", "epoch": r.s.guard.epoch, "level": 0, "pid": "p0", **extra}
        with pytest.raises(ActionRejected) as ei:
            r.p.handle_tv(r.ctx, r.s, data)
        assert ei.value.code == "stale"
    assert r.s.arrived == set()


def test_unknown_pid_and_action_rejected():
    r = Rig()
    with pytest.raises(ActionRejected) as ei:
        r.tv("arrive", pid="ghost")
    assert ei.value.code == "unknown_player"
    with pytest.raises(ActionRejected):
        r.tv("arrive")  # no pid
    with pytest.raises(ActionRejected) as ei:
        r.tv("dance", pid="p0")
    assert ei.value.code == "bad_action"


def test_penalty_rate_limited_and_finishers_never_penalized():
    r = Rig()
    fx = r.tv("penalty", pid="p0", why="caught")
    assert len(fx) == 1 and isinstance(fx[0], AddBrainrot) and fx[0].reason == "sim_caught"
    assert r.tv("penalty", pid="p1") == []  # cooldown
    r.clock.advance(3)
    r.tv("arrive", pid="p2")
    assert r.tv("penalty", pid="p2") == []  # a finisher cannot be caught
    assert len(r.tv("penalty", pid="p1")) == 1


def test_views_split_tv_and_player():
    r = Rig()
    r.tv("arrive", pid="p1")
    tv, mine, other = r.p.view_tv(r.s), r.p.view_player(r.s, "p1"), r.p.view_player(r.s, "p0")
    assert tv["kind"] == "red_light" and tv["arrived"] == ["p1"] and "seed" in tv
    assert mine["you_arrived"] is True and other["you_arrived"] is False
    assert "arrived" not in mine and "seed" not in mine  # phones learn nothing about the others


def test_levels_is_zero_and_roundtrip_keeps_arrivals():
    r = Rig()
    assert r.p.levels == 0
    r.tv("arrive", pid="p0")
    s2 = r.p.deserialize(json.loads(json.dumps(r.p.serialize(r.s))))
    assert s2.arrived == {"p0"} and s2.guard.epoch == r.s.guard.epoch
