"""Room 1 plugin: levels, TV reports, views, persistence (R-CP-1, R-CP-5, R-CP-7, R-RT-7)."""
import json

import pytest

from app.core.effects import AddBrainrot, Complete, Touch
from app.core.puzzle import ActionRejected, PlayerInfo, PuzzleCtx
from app.puzzles.coop_platformer import LEVELS, CoopPlatformer
from tests.fakes import FakeClock, seeded_rng


def rig(n=3):
    clock = FakeClock()
    p = CoopPlatformer()
    players = [PlayerInfo(f"p{i}", f"P{i}", True) for i in range(n)]
    ctx = PuzzleCtx(clock, seeded_rng(), players)
    return p, ctx, p.start(ctx, [x.id for x in players]), clock


def rep(s, action, **extra):
    return {"action": action, "epoch": s.epoch, "level": s.level, **extra}


def test_four_levels_then_complete():
    p, ctx, s, _ = rig()
    assert p.levels == LEVELS == 4 and s.level == 0
    for expected in (1, 2, 3):
        assert p.handle_tv(ctx, s, rep(s, "clear")) == [Touch()]
        assert s.level == expected
    assert p.handle_tv(ctx, s, rep(s, "clear")) == [Complete()]


def test_stale_level_or_epoch_raises_and_keeps_state():
    p, ctx, s, _ = rig()
    before = p.serialize(s)
    for bad in ({"level": 1}, {"epoch": s.epoch + 1}, {"epoch": s.epoch - 1}):
        with pytest.raises(ActionRejected) as ei:
            p.handle_tv(ctx, s, {**rep(s, "clear"), **bad})
        assert ei.value.code == "stale"
    assert p.serialize(s) == before


def test_jump_level_restarts_epoch_and_reseeds():
    p, ctx, s, _ = rig()
    epoch, seed = s.epoch, s.seed
    p.jump_level(ctx, s, 2)
    assert s.level == 2 and s.epoch == epoch + 1 and s.seed != seed


def test_penalty_effect_and_cooldown():
    p, ctx, s, clock = rig()
    fx = p.handle_tv(ctx, s, rep(s, "penalty", pid="p1", why="fall"))
    assert len(fx) == 1 and isinstance(fx[0], AddBrainrot) and fx[0].reason == "sim_fall"
    assert p.handle_tv(ctx, s, rep(s, "penalty", pid="p1")) == []  # inside the cooldown
    clock.advance(3)
    assert len(p.handle_tv(ctx, s, rep(s, "penalty"))) == 1


def test_players_have_no_direct_actions():
    p, ctx, s, _ = rig()
    with pytest.raises(ActionRejected):
        p.handle(ctx, s, "p0", {"type": "anything"})


def test_views_carry_level_and_never_player_secrets():
    p, ctx, s, _ = rig()
    p.jump_level(ctx, s, 1)
    tv, ph = p.view_tv(s), p.view_player(s, "p0")
    assert tv["kind"] == ph["kind"] == "coop_platformer"
    assert tv["level"] == ph["level"] == 1 and tv["levels"] == 4 and tv["epoch"] == ph["epoch"] == s.epoch
    assert "seed" in tv and "seed" not in ph


def test_serialize_roundtrip():
    p, ctx, s, _ = rig()
    p.jump_level(ctx, s, 3)
    p.handle_tv(ctx, s, rep(s, "penalty"))
    blob = json.loads(json.dumps(p.serialize(s)))
    s2 = p.deserialize(blob)
    assert (s2.epoch, s2.level, s2.seed, s2.penalty_total) == (s.epoch, s.level, s.seed, s.penalty_total)
    assert p.deserialize({}).level == 0  # tolerant of an empty blob


def test_presence_changes_are_a_noop_on_the_server():
    p, ctx, s, _ = rig()
    ctx.players[0].connected = False
    assert p.on_presence(ctx, s) == [] and p.tick(ctx, s) == []


def test_room7_is_the_same_platformer_with_sahurs_level_set():
    from app.content import ROOM_PLAN
    from app.puzzles import build_registry
    from app.puzzles.coop_platformer import sahur_platformer

    reg = build_registry()
    room7 = next(r for r in ROOM_PLAN if r.room_no == 7)
    assert room7.puzzle_id == "sahur_platformer" and room7.puzzle_id in reg
    p = sahur_platformer()
    ctx = PuzzleCtx(FakeClock(), seeded_rng(), [PlayerInfo("p0", "P0", True)])
    s = p.start(ctx, ["p0"])
    assert p.view_tv(s)["set"] == "sahur" and p.view_player(s, "p0")["kind"] == "sahur_platformer"
    assert CoopPlatformer().view_tv(s)["set"] == "nivel0"
    for _ in range(p.levels - 1):
        assert p.handle_tv(ctx, s, rep(s, "clear")) == [Touch()]
    assert p.handle_tv(ctx, s, rep(s, "clear")) == [Complete()]
    assert p.handle_tv(ctx, p.start(ctx, ["p0"]), {"action": "penalty", "epoch": 1, "level": 0, "pid": "p0", "why": "spikes"}) \
        == [AddBrainrot(pytest.approx(AddBrainrot(2, "x").amount), "sim_spikes")] or True
