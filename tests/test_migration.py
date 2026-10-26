"""v1 -> v2 save migration: room_no is persisted and legacy room_idx is remapped (R-GM-1/2/3)."""
import json

from app.content import ROOM_PLAN
from app.core.game import LEGACY_V1_ROOM_NOS, STATE_VERSION, Game, Player, resolve_room_idx
from app.puzzles import build_registry


class _Boom:
    id = "coop_platformer"
    title = "boom"
    min_players = 1

    def deserialize(self, d):
        raise ValueError("incompatible blob")

    def serialize(self, s):
        return {}


def _v1(room_idx, phase="puzzle", puzzle=None):
    return {
        "v": 1,
        "room_idx": room_idx,
        "phase": phase,
        "brainrot": 30.0,
        "brainrot_log": [],
        "decoys_hit": [],
        "clock_ms": 5000,
        "seq": 7,
        "puzzle": puzzle,
        "ending": None,
    }


def _load(state, status="running", puzzles=None):
    players = [Player("p1", "Ana", True)]
    return Game.from_state("g", "ABCD", "n", status, state, players, puzzles or build_registry())


def test_state_version_and_legacy_constant():
    assert STATE_VERSION == 2
    assert LEGACY_V1_ROOM_NOS == (0, 2)


def test_v1_idx1_cursed_wordle_lands_in_room2_intro():
    g = _load(_v1(1, puzzle={"id": "cursed_wordle", "state": {"target": "SAHUR"}}))
    assert g.room_no == 2
    assert ROOM_PLAN[g.room_idx].room_no == 2
    assert g.phase == "intro"
    assert g.puzzle_id is None and g.puzzle_state is None
    assert g.brainrot == 30.0 and g.seq == 7 and g.clock_ms == 5000
    assert all(not p.connected for p in g.players)


def test_v1_idx0_hold_together_keeps_room0_and_puzzle():
    g = _load(_v1(0, puzzle={"id": "hold_together", "state": {"v": 1}}))
    assert g.room_no == 0 and g.room_idx == 0
    assert g.phase == "puzzle" and g.puzzle_id == "hold_together"


def test_v1_idx_out_of_range_clamps_to_last_legacy_room():
    assert resolve_room_idx(_v1(99)) == 2  # clamped to legacy idx 1 -> room 2
    assert resolve_room_idx(_v1(-4)) == 0
    assert resolve_room_idx(_v1("x")) == 0


def test_unknown_puzzle_id_never_raises_and_resets_phase():
    g = _load(_v1(0, puzzle={"id": "nope", "state": {}}))
    assert g.puzzle_id is None and g.puzzle_state is None
    assert g.phase == "intro"


def test_puzzle_of_another_room_is_dropped():
    g = _load(_v1(0, puzzle={"id": "red_light", "state": {}}))
    assert g.puzzle_id is None and g.phase == "intro"


def test_deserialize_failure_falls_back_to_intro():
    state = {"v": 2, "room_no": 1, "room_idx": 1, "phase": "puzzle", "puzzle": {"id": "coop_platformer", "state": {}}}
    g = _load(state, puzzles={"coop_platformer": _Boom()})
    assert g.puzzle_id is None and g.puzzle_state is None
    assert g.phase == "intro" and g.room_no == 1


def test_search_phase_without_puzzle_is_kept():
    g = _load(_v1(1, phase="search"))
    assert g.room_no == 2 and g.phase == "search"


def test_v2_roundtrip_uses_room_no():
    last = len(ROOM_PLAN) - 1
    g = Game(id="g", code="ABCD", name="n", room_idx=last, phase="intro")
    blob = json.loads(json.dumps(g.serialize_state({})))
    assert blob["v"] == 2 and blob["room_no"] == 7
    g2 = _load(blob)
    assert g2.room_idx == last and g2.room_no == 7


def test_v2_save_from_the_old_plan_keeps_its_room():
    # a save made while the plan was 0, 1, 2, 7 (room 7 at idx 3) still lands on room 7: room_no wins over the idx
    g = _load({"v": 2, "room_no": 7, "room_idx": 3, "phase": "intro"})
    assert g.room_no == 7 and g.room_idx == len(ROOM_PLAN) - 1
    assert resolve_room_idx({"v": 2, "room_no": 5, "room_idx": 4}) == 4  # room 5 is gone: clamp the idx (room 4)


def test_v2_room_no_wins_over_stale_idx():
    assert resolve_room_idx({"v": 2, "room_no": 2, "room_idx": 0}) == 2
    assert resolve_room_idx({"v": 2, "room_no": 99, "room_idx": 1}) == 1  # unknown room_no: clamp idx
    assert resolve_room_idx({"v": 2, "room_no": 99, "room_idx": 50}) == len(ROOM_PLAN) - 1


def test_finished_game_sits_on_last_room():
    g = _load(_v1(1, phase="unlocked"), status="finished")
    assert g.room_idx == len(ROOM_PLAN) - 1
