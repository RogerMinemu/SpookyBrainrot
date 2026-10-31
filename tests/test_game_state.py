import asyncio

from app.core.game import Game, normalize_name
from app.db.database import Database
from app.runtime.manager import GameManager
from tests.fakes import FakeClock, seeded_rng


class FakePlatformer:
    id = "coop_platformer"
    title = "fake"
    min_players = 1

    def on_presence(self, ctx, s):
        return []

    def serialize(self, s):
        return dict(s)

    def deserialize(self, d):
        return dict(d)


PUZZLES = {"coop_platformer": FakePlatformer()}


def make_manager(path):
    return GameManager(Database(path), FakeClock(), seeded_rng(), PUZZLES)


def test_roundtrip_room1_level3_brainrot20_new_instance(tmp_path):
    path = tmp_path / "s.db"
    m1 = make_manager(path)
    rt = m1.create("Casa")
    g = rt.game
    g.status = "running"
    g.room_idx = 1
    g.phase = "puzzle"
    g.brainrot = 20
    g.decoys_hit = [3]
    g.clock_ms = 1200000
    g.puzzle_id = "coop_platformer"
    g.puzzle_state = {"level": 3, "epoch": 1}
    asyncio.run(m1.join(rt, "Ana"))
    rt.persist()
    m1.db.close()

    m2 = make_manager(path)
    g2 = m2.get(g.id).game
    assert (g2.room_idx, g2.room_no, g2.phase, g2.brainrot) == (1, 1, "puzzle", 20)
    assert g2.puzzle_state == {"level": 3, "epoch": 1}
    assert g2.decoys_hit == [3] and g2.clock_ms == 1200000
    assert [p.name for p in g2.players] == ["Ana"]
    assert all(not p.connected for p in g2.players)  # R1.4


def test_serialize_has_expected_keys():
    g = Game(id="a", code="ABCD", name="n")
    s = g.serialize_state({})
    assert s["v"] == 3 and s["room_no"] == 0
    assert set(s) == {"v", "room_idx", "room_no", "phase", "brainrot", "brainrot_log", "decoys_hit",
                      "clock_ms", "seq", "puzzle", "ending"}
    assert s["puzzle"] is None


def test_player_named_ignores_case_and_spaces_and_truncation():
    g = Game(id="a", code="ABCD", name="n")
    ana = g.add_player("1", normalize_name("  Ana  "))
    long_name = g.add_player("2", normalize_name("x" * 40))
    assert ana.name == "Ana" and len(long_name.name) == 24
    assert g.player_named("ana") is ana and g.player_named(" ANA ") is ana
    assert g.player_named("x" * 30) is long_name  # what the join form would store for it
    assert g.player_named("Beto") is None and g.player_named("   ") is None


def test_runtime_serializes_commands_under_lock(tmp_path):
    m = make_manager(tmp_path / "s.db")
    rt = m.create("Casa")
    order = []

    async def slow(g):
        pass

    def make(tag):
        def mutate(g):
            order.append(("in", tag))
            order.append(("out", tag))
            return True
        return mutate

    async def main():
        await asyncio.gather(*(rt.run(make(i)) for i in range(5)))

    asyncio.run(main())
    # every "in" is immediately followed by its own "out": no interleaving
    for i in range(0, len(order), 2):
        assert order[i][0] == "in" and order[i + 1] == ("out", order[i][1])
    assert rt.game.seq == 5


def test_set_presence_bumps_seq(tmp_path):
    m = make_manager(tmp_path / "s.db")
    rt = m.create("Casa")
    p, _ = asyncio.run(m.join(rt, "Ana"))
    assert asyncio.run(rt.set_presence(p.id, True)) is True
    assert asyncio.run(rt.set_presence(p.id, True)) is False
    assert rt.game.player(p.id).connected
