import asyncio
import json

from app.core.engine import Advance, PuzzleAction
from app.core.game import PHASE_PUZZLE, STATUS_RUNNING
from app.db.database import Database
from app.puzzles import build_registry
from app.runtime.manager import GameManager
from tests.fakes import FakeClock, seeded_rng


def make_manager(path, clock=None):
    return GameManager(Database(path), clock or FakeClock(), seeded_rng(), build_registry(), min_players=1)


def saved_state(m, game_id):
    return json.loads(m.games.get(game_id).state_json)


def test_mid_puzzle_state_restores_in_new_instance(tmp_path):
    path = tmp_path / "p.db"
    m1 = make_manager(path)
    rt = m1.create("Casa")

    async def play():
        p, _ = await m1.join(rt, "Ana")
        await rt.set_presence(p.id, True)
        await rt.apply(Advance())  # lobby -> room 0 intro (prologue)
        await rt.apply(Advance())  # -> room 0 puzzle
        await rt.apply(PuzzleAction(p.id, {"type": "hold", "down": True}))
        return p

    p = asyncio.run(play())
    assert rt.game.phase == PHASE_PUZZLE
    seq = rt.game.seq
    m1.db.close()

    m2 = make_manager(path)
    g = m2.get(rt.game.id).game
    assert g.status == STATUS_RUNNING and g.phase == PHASE_PUZZLE
    assert g.puzzle_id == "hold_together"
    assert g.puzzle_state is not None and g.puzzle_state.holders == set()  # holders cleared on restore
    assert g.seq == seq  # seq persisted
    assert [x.name for x in g.players] == ["Ana"] and not g.players[0].connected


def test_every_accepted_command_persists_and_rejected_does_not(tmp_path):
    m = make_manager(tmp_path / "p.db")
    rt = m.create("Casa")

    async def play():
        p, _ = await m.join(rt, "Ana")
        await rt.set_presence(p.id, True)
        assert saved_state(m, rt.game.id)["seq"] == rt.game.seq
        await rt.apply(Advance())
        s0 = saved_state(m, rt.game.id)
        assert rt.game.status == STATUS_RUNNING and s0["phase"] == "intro" and s0["seq"] == rt.game.seq
        await rt.apply(Advance())
        s1 = saved_state(m, rt.game.id)
        assert s1["phase"] == "puzzle" and s1["puzzle"]["id"] == "hold_together"
        assert s1["seq"] == rt.game.seq
        before = rt.game.seq
        out = await rt.apply(Advance())  # wrong phase now
        assert out.error and rt.game.seq == before
        await rt.apply(PuzzleAction(p.id, {"type": "hold", "down": True}))
        assert rt.game.seq == before + 1 and saved_state(m, rt.game.id)["seq"] == before + 1

    asyncio.run(play())


def test_elapsed_play_time_survives_restart(tmp_path):
    path = tmp_path / "p.db"
    clock = FakeClock()
    m1 = make_manager(path, clock)
    rt = m1.create("Casa")

    async def play():
        p, _ = await m1.join(rt, "Ana")
        await rt.set_presence(p.id, True)
        await rt.set_tv_presence(1)
        await rt.apply(Advance())
        clock.advance(20 * 60)
        await rt.set_tv_presence(0)  # TV closes: time settled and persisted

    asyncio.run(play())
    m1.db.close()
    m2 = make_manager(path, clock)
    assert m2.get(rt.game.id).game.clock_ms == 20 * 60 * 1000


def test_clock_flush_every_10s_persists_without_bumping_seq(tmp_path):
    clock = FakeClock()
    m = make_manager(tmp_path / "p.db", clock)
    rt = m.create("Casa")

    async def play():
        p, _ = await m.join(rt, "Ana")
        await rt.set_presence(p.id, True)
        await rt.set_tv_presence(1)
        await rt.apply(Advance())
        seq = rt.game.seq
        clock.advance(4)
        await rt.tick()
        assert saved_state(m, rt.game.id)["clock_ms"] == 0  # too early to flush
        clock.advance(7)
        await rt.tick()
        st = saved_state(m, rt.game.id)
        assert st["clock_ms"] == 11_000 and st["seq"] == seq
        assert rt.game.seq == seq

    asyncio.run(play())
