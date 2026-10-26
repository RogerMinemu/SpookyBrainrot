"""TvAction: TV-reported sim outcomes (R-RE-1, R-RT-7, R-BM-1, R-BM-2, R-RS-2)."""
import asyncio

import pytest

from app.core import brainrot
from app.core.engine import DebugJump, Engine, PuzzleAction, TvAction, TvPresence
from app.core.game import PHASE_PUZZLE, PHASE_SEARCH, STATUS_RUNNING, Game, Player
from app.db.database import Database
from app.puzzles import build_registry
from app.runtime.manager import GameManager
from tests.fakes import FakeClock, seeded_rng


def make(n=3):
    clock = FakeClock()
    eng = Engine(build_registry(), clock, seeded_rng(), min_players=1)
    g = Game(id="g", code="ABCD", name="G")
    for i in range(n):
        g.players.append(Player(f"p{i}", f"P{i}", True))
    return eng, g, clock


def at_level(eng, g, level=0, room=1):
    assert eng.apply(g, DebugJump(room, "puzzle", level=level if room == 1 else None)).ok
    return g.puzzle_state


def report(action, s, **extra):
    guard = getattr(s, "guard", s)
    return TvAction({"action": action, "epoch": guard.epoch, "level": guard.level, **extra})


def snapshot(eng, g):
    return (g.phase, g.brainrot, list(g.brainrot_log), eng.puzzles[g.puzzle_id].serialize(g.puzzle_state))


def test_tv_action_without_puzzle_is_rejected():
    eng, g, _ = make()
    out = eng.apply(g, TvAction({"action": "clear"}))
    assert out.error and out.error[0] == "no_puzzle" and not out.changed


def test_puzzle_without_handle_tv_rejects_with_no_change():
    eng, g, _ = make()
    assert eng.apply(g, DebugJump(0, "puzzle")).ok
    before = snapshot(eng, g)
    out = eng.apply(g, TvAction({"action": "clear", "epoch": 1, "level": 0}))
    assert out.error and out.error[0] == "no_tv_actions" and not out.changed
    assert snapshot(eng, g) == before


def test_players_cannot_send_tv_actions_through_puzzle_action():
    eng, g, _ = make()
    s = at_level(eng, g)
    out = eng.apply(g, PuzzleAction("p0", {"action": "clear", "epoch": s.epoch, "level": s.level}))
    assert out.error and not out.changed and s.level == 0


@pytest.mark.parametrize("bad", [{"epoch": 0}, {"level": 1}, {"epoch": "1"}, {"level": True}, {"epoch": None}])
def test_stale_or_malformed_reports_change_nothing(bad):
    eng, g, _ = make()
    s = at_level(eng, g)
    before = snapshot(eng, g)
    data = {"action": "clear", "epoch": s.epoch, "level": s.level, **bad}
    out = eng.apply(g, TvAction(data))
    assert out.error and not out.changed
    assert snapshot(eng, g) == before


def test_unknown_action_is_rejected():
    eng, g, _ = make()
    s = at_level(eng, g)
    out = eng.apply(g, report("explode", s))
    assert out.error and out.error[0] == "bad_action"


def test_clear_advances_once_and_duplicate_is_stale():
    eng, g, _ = make()
    s = at_level(eng, g)
    first = report("clear", s)
    out = eng.apply(g, first)
    assert out.ok and out.changed and s.level == 1
    dup = eng.apply(g, first)  # same report again (TV resend)
    assert dup.error and dup.error[0] == "stale" and not dup.changed and s.level == 1


def test_stale_epoch_after_restart_is_ignored():
    eng, g, _ = make()
    s = at_level(eng, g, level=1)
    old = report("clear", s)
    eng.puzzles["coop_platformer"].jump_level(eng._ctx(g), s, 1)  # restart the same level: new epoch
    assert old.data["epoch"] != s.epoch
    out = eng.apply(g, old)
    assert out.error and out.error[0] == "stale" and not out.changed and s.level == 1
    assert eng.apply(g, report("clear", s)).changed and s.level == 2


def test_last_level_clear_completes_into_the_riddle_phase():
    eng, g, _ = make()
    s = at_level(eng, g, level=3)
    out = eng.apply(g, report("clear", s))
    assert out.ok and g.phase == PHASE_SEARCH and g.puzzle_id is None
    assert ("puzzle_solved", {"room_no": 1}, "all") in out.events
    again = eng.apply(g, TvAction({"action": "clear", "epoch": 2, "level": 3}))
    assert again.error and again.error[0] == "no_puzzle"
    assert g.phase == PHASE_SEARCH


def test_penalty_applies_then_cooldown_blocks_until_it_elapses():
    eng, g, clock = make()
    s = at_level(eng, g)
    out = eng.apply(g, report("penalty", s, pid="p0", why="fall"))
    assert out.changed and g.brainrot == brainrot.SIM_PENALTY
    assert g.brainrot_log[-1]["reason"] == "sim_fall"
    clock.advance(brainrot.SIM_PENALTY_COOLDOWN_MS / 1000 - 0.5)
    out = eng.apply(g, report("penalty", s, pid="p1"))
    assert out.ok and not out.changed and g.brainrot == brainrot.SIM_PENALTY  # rate-limited, silently
    clock.advance(0.5)
    assert eng.apply(g, report("penalty", s, pid="p1")).changed
    assert g.brainrot == 2 * brainrot.SIM_PENALTY


def test_penalty_cap_per_room_and_meter_bounds():
    eng, g, clock = make()
    s = at_level(eng, g)
    for _ in range(20):
        clock.advance(brainrot.SIM_PENALTY_COOLDOWN_MS / 1000)
        eng.apply(g, report("penalty", s))
    assert g.brainrot == brainrot.ROOM_PENALTY_CAP  # more reports leave the meter alone
    assert 0 <= g.brainrot <= brainrot.BRAINROT_MAX
    # the cap is per puzzle instance, not per level
    s.level = 1
    clock.advance(10)
    assert not eng.apply(g, report("penalty", s)).changed


def test_penalty_near_the_top_of_the_meter_stays_in_bounds():
    eng, g, _ = make()
    s = at_level(eng, g)
    g.brainrot = 99.5
    eng.apply(g, report("penalty", s))
    assert g.brainrot == brainrot.BRAINROT_MAX


def test_penalty_from_unknown_player_is_rejected():
    eng, g, _ = make()
    s = at_level(eng, g)
    out = eng.apply(g, report("penalty", s, pid="ghost"))
    assert out.error and out.error[0] == "unknown_player" and g.brainrot == 0


def test_persisted_state_keeps_epoch_level_and_penalty_budget():
    eng, g, clock = make()
    s = at_level(eng, g, level=2)
    eng.apply(g, report("penalty", s))
    blob = g.serialize_state(eng.puzzles)
    g2 = Game.from_state("g", "ABCD", "G", STATUS_RUNNING, blob, [Player("p0", "P0")], eng.puzzles)
    assert g2.phase == PHASE_PUZZLE and g2.puzzle_state.level == 2
    assert g2.puzzle_state.epoch == s.epoch
    assert g2.puzzle_state.penalty_total == brainrot.SIM_PENALTY


# --- runtime shell ------------------------------------------------------------------------
class SpyNotifier:
    def __init__(self):
        self.broadcasts = 0

    async def broadcast_state(self, rt):
        self.broadcasts += 1

    async def send_event(self, rt, name, data, to):
        pass

    async def game_deleted(self, game_id):
        pass


def make_runtime(tmp_path):
    clock = FakeClock()
    spy = SpyNotifier()
    m = GameManager(Database(tmp_path / "s.db"), clock, seeded_rng(), build_registry(), notifier=spy, min_players=1)
    rt = m.create("Casa")
    asyncio.run(m.join(rt, "Ana"))
    asyncio.run(rt.set_presence(rt.game.players[0].id, True))
    return rt, spy, clock


def test_runtime_routes_tv_action_through_lock_persist_broadcast(tmp_path):
    rt, spy, _ = make_runtime(tmp_path)
    asyncio.run(rt.apply(DebugJump(1, "puzzle")))
    s = rt.game.puzzle_state
    seq, sent = rt.game.seq, spy.broadcasts
    out = asyncio.run(rt.tv_action({"action": "clear", "epoch": s.epoch, "level": s.level}))
    assert out.ok and rt.game.seq == seq + 1 and spy.broadcasts == sent + 1
    row = rt.games_repo.get(rt.game.id)
    assert '"level":1' in row.state_json  # persisted
    stale = asyncio.run(rt.tv_action({"action": "clear", "epoch": s.epoch, "level": 0}))
    assert stale.error and rt.game.seq == seq + 1 and spy.broadcasts == sent + 1  # nothing pushed


def test_runtime_penalty_cooldown_uses_the_injected_clock(tmp_path):
    rt, _, clock = make_runtime(tmp_path)
    asyncio.run(rt.apply(DebugJump(1, "puzzle")))
    s = rt.game.puzzle_state
    data = {"action": "penalty", "epoch": s.epoch, "level": s.level}
    asyncio.run(rt.tv_action(data))
    seq = rt.game.seq
    asyncio.run(rt.tv_action(data))
    assert rt.game.brainrot == brainrot.SIM_PENALTY and rt.game.seq == seq
    clock.advance(brainrot.SIM_PENALTY_COOLDOWN_MS / 1000)
    asyncio.run(rt.tv_action(data))
    assert rt.game.brainrot == 2 * brainrot.SIM_PENALTY


def test_tv_online_in_payload_and_pushed_without_seq_bump(tmp_path):
    rt, spy, _ = make_runtime(tmp_path)
    assert rt.state_payload("tv")["game"]["tv_online"] is False
    assert rt.state_payload("player", "x")["game"]["tv_online"] is False
    seq, sent = rt.game.seq, spy.broadcasts
    assert asyncio.run(rt.set_tv_presence(1)) is True  # the push already happened
    assert rt.state_payload("player", "x")["game"]["tv_online"] is True
    assert rt.game.seq == seq and spy.broadcasts == sent + 1
    asyncio.run(rt.set_tv_presence(1))  # same count: nothing to say
    assert spy.broadcasts == sent + 1
    asyncio.run(rt.set_tv_presence(0))
    assert rt.state_payload("player", "x")["game"]["tv_online"] is False
    assert rt.game.seq == seq and spy.broadcasts == sent + 2


def test_tv_presence_command_flags_broadcast():
    eng, g, _ = make()
    out = eng.apply(g, TvPresence(1))
    assert out.broadcast and out.persist and not out.changed
