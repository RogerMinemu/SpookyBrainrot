from app.core import brainrot
from app.core.engine import (
    SCAN_ALREADY, SCAN_FINISHED, SCAN_JUMPSCARE, SCAN_LAUGH, SCAN_SLEEPING, SCAN_UNLOCKED, Engine, Scan,
)
from app.core.game import PHASE_PUZZLE, PHASE_SEARCH, PHASE_UNLOCKED, STATUS_FINISHED, STATUS_LOBBY, STATUS_RUNNING, Game
from app.content import CAMEOS, ROOM_PLAN
from app.puzzles import build_registry
from tests.fakes import FakeClock, seeded_rng


LAST = len(ROOM_PLAN) - 1  # room 7, the exit


def engine():
    return Engine(build_registry(), FakeClock(), seeded_rng(), min_players=1)


def game(room_idx, phase, status=STATUS_RUNNING):
    return Game(id="g", code="ABCD", name="G", status=status, room_idx=room_idx, phase=phase)


def test_room7_search_anchor7_finishes():
    g = game(LAST, PHASE_SEARCH)
    g.brainrot = 10
    out = engine().apply(g, Scan("anchor", 7))
    assert out.scan_result == SCAN_FINISHED and out.changed
    assert g.status == STATUS_FINISHED and g.phase == PHASE_UNLOCKED
    assert g.ending["band"] == brainrot.band(10)
    assert ("anchor_unlocked", {"level": 7}, "all") in out.events


def test_room7_puzzle_anchor7_sleeping_no_change():
    g = game(LAST, PHASE_PUZZLE)
    out = engine().apply(g, Scan("anchor", 7))
    assert out.scan_result == SCAN_SLEEPING and not out.changed
    assert g.brainrot == 0 and g.status == STATUS_RUNNING


def test_wrong_level_sleeping():
    g = game(LAST, PHASE_SEARCH)
    assert engine().apply(g, Scan("anchor", 5)).scan_result == SCAN_SLEEPING  # anchor 5: no room uses it


def test_anchor_again_after_finish_is_idempotent():
    g = game(LAST, PHASE_SEARCH)
    e = engine()
    e.apply(g, Scan("anchor", 7))
    out = e.apply(g, Scan("anchor", 7))
    assert out.scan_result == SCAN_ALREADY and not out.changed


def test_decoy_first_scan_penalty_and_jumpscare():
    g = game(LAST, PHASE_PUZZLE)
    out = engine().apply(g, Scan("decoy", 3))
    assert out.scan_result == SCAN_JUMPSCARE and out.changed
    assert g.brainrot == brainrot.DECOY_PENALTY
    jump = [e for e in out.events if e[0] == "jumpscare"]
    assert jump == [("jumpscare", {"decoy": 3, "cameo": CAMEOS[2]}, "tv")]
    assert any(e[0] == "toast" and e[2] == "all" for e in out.events)


def test_decoy_twice_one_penalty_one_jumpscare():
    g = game(LAST, PHASE_PUZZLE)
    e = engine()
    first = e.apply(g, Scan("decoy", 3))
    second = e.apply(g, Scan("decoy", 3))
    assert second.scan_result == SCAN_LAUGH and not second.changed and not second.events
    assert g.brainrot == brainrot.DECOY_PENALTY
    assert len([x for x in first.events + second.events if x[0] == "jumpscare"]) == 1


def test_different_decoys_each_penalize():
    g = game(LAST, PHASE_PUZZLE)
    e = engine()
    e.apply(g, Scan("decoy", 1))
    e.apply(g, Scan("decoy", 2))
    assert g.brainrot == 2 * brainrot.DECOY_PENALTY and g.decoys_hit == [1, 2]


def test_decoy_in_lobby_does_nothing():
    g = game(0, "intro", status=STATUS_LOBBY)
    out = engine().apply(g, Scan("decoy", 1))
    assert out.scan_result == SCAN_SLEEPING and g.brainrot == 0 and not out.changed


def test_room0_unlocked_anchor_flow_not_affected():
    g = game(0, PHASE_SEARCH)  # Room 0 has no anchor: nothing to find
    assert engine().apply(g, Scan("anchor", 7)).scan_result == SCAN_SLEEPING
    assert SCAN_UNLOCKED  # exported constant still available
