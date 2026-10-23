"""Engine unit tests with fake plugins (no web, no DB)."""
from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Emit, Touch
from app.core.engine import (
    SCAN_ALREADY,
    SCAN_FINISHED,
    SCAN_SLEEPING,
    Advance,
    Engine,
    Join,
    Presence,
    PuzzleAction,
    Scan,
    Tick,
    TvPresence,
)
from app.core.game import (
    PHASE_INTRO,
    PHASE_PUZZLE,
    PHASE_SEARCH,
    PHASE_UNLOCKED,
    STATUS_FINISHED,
    STATUS_LOBBY,
    STATUS_RUNNING,
    Game,
)
from app.core.puzzle import ActionRejected
from tests.fakes import FakeClock, seeded_rng


class FakePuzzle:
    """Behaviour is driven by the action: {"do": "complete" | "reject" | "noop" | "rot" | "emit" | "touch"}."""

    min_players = 1

    def __init__(self, pid):
        self.id = pid
        self.title = pid

    def start(self, ctx, player_ids):
        return {"n": 0, "started_with": list(player_ids)}

    def handle(self, ctx, s, pid, action):
        do = action.get("do")
        if do == "reject":
            raise ActionRejected("nope", "no")
        if do == "complete":
            s["n"] += 1
            return [Complete()]
        if do == "rot":
            return [AddBrainrot(action.get("amount", 5), "test")]
        if do == "emit":
            return [Emit("hi", {"x": 1}, "tv")]
        if do == "touch":
            s["n"] += 1
            return [Touch()]
        return []

    def on_presence(self, ctx, s):
        s["presence_calls"] = s.get("presence_calls", 0) + 1
        return [Touch()]

    def tick(self, ctx, s):
        return [Touch()] if s.get("tick_changes") else []

    def view_tv(self, s):
        return {"kind": self.id}

    def view_player(self, s, pid):
        return {"kind": self.id}

    def serialize(self, s):
        return dict(s)

    def deserialize(self, d):
        return dict(d)


def make(min_players=1, players=("a", "b"), connect=True):
    clock = FakeClock()
    puzzles = {"hold_together": FakePuzzle("hold_together"), "cursed_wordle": FakePuzzle("cursed_wordle")}
    eng = Engine(puzzles, clock, seeded_rng(), min_players=min_players)
    g = Game(id="g", code="ABCD", name="G")
    for pid in players:
        g.add_player(pid, pid.upper())
        if connect:
            g.player(pid).connected = True
    return eng, g, clock


def to_puzzle(eng, g):
    out = eng.apply(g, Advance())
    assert out.changed and g.phase == PHASE_PUZZLE
    return out


def test_advance_from_lobby_starts_puzzle_and_game():
    eng, g, _ = make()
    assert g.status == STATUS_LOBBY and g.phase == PHASE_INTRO
    to_puzzle(eng, g)
    assert g.status == STATUS_RUNNING
    assert g.puzzle_id == "hold_together"
    assert g.puzzle_state["started_with"] == ["a", "b"]


def test_lobby_gated_by_min_players():
    eng, g, _ = make(min_players=2, players=("a", "b"), connect=False)
    g.player("a").connected = True
    out = eng.apply(g, Advance())
    assert not out.changed and out.error[0] == "not_enough_players"
    assert g.status == STATUS_LOBBY and g.phase == PHASE_INTRO and g.puzzle_state is None
    g.player("b").connected = True
    assert eng.apply(g, Advance()).changed
    assert g.phase == PHASE_PUZZLE


def test_advance_by_unknown_player_rejected():
    eng, g, _ = make()
    out = eng.apply(g, Advance(pid="ghost"))
    assert out.error[0] == "unknown_player" and g.phase == PHASE_INTRO
    assert eng.apply(g, Advance(pid="a")).changed


def test_advance_in_wrong_phase_rejected_without_state_change():
    eng, g, _ = make()
    to_puzzle(eng, g)
    out = eng.apply(g, Advance())
    assert not out.changed and out.error[0] == "wrong_phase"
    assert g.phase == PHASE_PUZZLE
    g.phase = PHASE_SEARCH
    assert eng.apply(g, Advance()).error[0] == "wrong_phase"


def test_complete_effect_advances_phase_and_flags_change():
    eng, g, _ = make()
    to_puzzle(eng, g)
    out = eng.apply(g, PuzzleAction("a", {"do": "complete"}))
    assert out.changed and out.error is None
    # Room 0 has no anchor: unlocked immediately
    assert g.phase == PHASE_UNLOCKED and g.puzzle_id is None and g.puzzle_state is None
    assert ("puzzle_solved", {"room_no": 0}, "all") in out.events


def test_rejected_action_leaves_state_unchanged_and_reports_error():
    eng, g, _ = make()
    to_puzzle(eng, g)
    before = (g.phase, g.brainrot, dict(g.puzzle_state))
    out = eng.apply(g, PuzzleAction("a", {"do": "reject"}))
    assert not out.changed and out.error == ("nope", "no")
    assert (g.phase, g.brainrot, g.puzzle_state) == before


def test_empty_effects_mean_unchanged_and_touch_means_changed():
    eng, g, _ = make()
    to_puzzle(eng, g)
    assert not eng.apply(g, PuzzleAction("a", {"do": "noop"})).changed
    assert eng.apply(g, PuzzleAction("a", {"do": "touch"})).changed


def test_action_without_puzzle_or_from_stranger_rejected():
    eng, g, _ = make()
    assert eng.apply(g, PuzzleAction("a", {"do": "complete"})).error[0] == "no_puzzle"
    to_puzzle(eng, g)
    assert eng.apply(g, PuzzleAction("ghost", {"do": "complete"})).error[0] == "unknown_player"


def test_brainrot_effect_is_clamped_logged_and_events_forwarded():
    eng, g, _ = make()
    to_puzzle(eng, g)
    eng.apply(g, PuzzleAction("a", {"do": "rot", "amount": 95}))
    out = eng.apply(g, PuzzleAction("a", {"do": "rot", "amount": 20}))
    assert g.brainrot == brainrot.BRAINROT_MAX and out.changed
    assert [e["reason"] for e in g.brainrot_log] == ["test", "test"]
    out = eng.apply(g, PuzzleAction("a", {"do": "emit"}))
    assert out.events == [("hi", {"x": 1}, "tv")]


def test_presence_toggles_and_notifies_puzzle():
    eng, g, _ = make(connect=False)
    assert eng.apply(g, Presence("a", True)).changed
    assert not eng.apply(g, Presence("a", True)).changed  # idempotent
    assert not eng.apply(g, Presence("ghost", True)).changed
    to_puzzle(eng, g)  # a connected only
    out = eng.apply(g, Presence("b", True))
    assert out.changed and g.puzzle_state["presence_calls"] == 1
    eng.apply(g, Presence("a", False))
    assert g.puzzle_state["presence_calls"] == 2 and not g.player("a").connected


def test_join_notifies_active_puzzle():
    eng, g, _ = make()
    to_puzzle(eng, g)
    g.add_player("c", "C")
    assert eng.apply(g, Join("c")).changed
    assert g.puzzle_state["presence_calls"] == 1


def test_full_pass_through_both_rooms_and_frozen_ending():
    eng, g, _ = make()
    to_puzzle(eng, g)
    eng.apply(g, PuzzleAction("a", {"do": "complete"}))  # room 0 -> unlocked
    assert (g.room_no, g.phase) == (0, PHASE_UNLOCKED)

    out = eng.apply(g, Advance())  # -> room 2 intro
    assert out.changed and (g.room_no, g.phase) == (2, PHASE_INTRO) and g.status == STATUS_RUNNING
    to_puzzle(eng, g)
    assert g.puzzle_id == "cursed_wordle"
    eng.apply(g, PuzzleAction("a", {"do": "rot", "amount": 42}))
    eng.apply(g, PuzzleAction("a", {"do": "complete"}))  # room 2 solved -> search
    assert g.phase == PHASE_SEARCH and g.puzzle_state is None

    assert eng.apply(g, Scan("anchor", 1)).scan_result == SCAN_SLEEPING
    assert g.phase == PHASE_SEARCH
    out = eng.apply(g, Scan("anchor", 2))
    assert out.changed and out.scan_result == SCAN_FINISHED
    assert g.status == STATUS_FINISHED
    assert g.ending["band"] == brainrot.BAND_PASSENGER and g.ending["brainrot"] == 42

    # frozen: nothing moves anymore
    assert eng.apply(g, Advance()).error[0] == "wrong_phase"
    assert eng.apply(g, PuzzleAction("a", {"do": "rot"})).error[0] == "no_puzzle"
    assert eng.apply(g, Scan("anchor", 2)).scan_result == SCAN_ALREADY
    assert g.brainrot == 42 and g.status == STATUS_FINISHED


def test_scan_before_search_is_sleeping_and_has_no_effect():
    eng, g, _ = make()
    to_puzzle(eng, g)
    out = eng.apply(g, Scan("anchor", 2))
    assert out.scan_result == SCAN_SLEEPING and not out.changed and g.brainrot == 0


def test_tick_changes_only_when_puzzle_says_so():
    eng, g, _ = make()
    assert not eng.apply(g, Tick()).changed  # no puzzle
    to_puzzle(eng, g)
    assert not eng.apply(g, Tick()).changed
    g.puzzle_state["tick_changes"] = True
    assert eng.apply(g, Tick()).changed


def test_unregistered_puzzle_rejected():
    eng, g, _ = make()
    del eng.puzzles["hold_together"]
    out = eng.apply(g, Advance())
    assert out.error[0] == "puzzle_unavailable" and g.status == STATUS_LOBBY


# --- play clock (R3.4) ----------------------------------------------------------------
def test_clock_accumulates_only_when_running_with_tv():
    eng, g, clock = make()
    eng.apply(g, TvPresence(1))
    clock.advance(30)
    eng.apply(g, Tick())
    assert g.clock_ms == 0  # lobby: not running
    to_puzzle(eng, g)
    clock.advance(10)
    eng.apply(g, Tick())
    assert g.clock_ms == 10_000


def test_clock_does_not_accumulate_without_tv():
    eng, g, clock = make()
    to_puzzle(eng, g)
    clock.advance(60)
    eng.apply(g, Tick())
    assert g.clock_ms == 0
    eng.apply(g, TvPresence(1))
    clock.advance(5)
    eng.apply(g, Tick())
    assert g.clock_ms == 5_000
    eng.apply(g, TvPresence(0))  # settles, then stops
    clock.advance(100)
    eng.apply(g, Tick())
    assert g.clock_ms == 5_000


def test_tv_presence_settles_elapsed_time_before_dropping():
    eng, g, clock = make()
    eng.apply(g, TvPresence(1))
    to_puzzle(eng, g)
    clock.advance(20 * 60)
    out = eng.apply(g, TvPresence(0))
    assert g.clock_ms == 20 * 60 * 1000
    assert out.persist and not out.changed  # persisted, but no state broadcast


def test_tv_presence_same_count_is_noop():
    eng, g, _ = make()
    assert not eng.apply(g, TvPresence(0)).persist
    assert eng.apply(g, TvPresence(1)).persist
    assert not eng.apply(g, TvPresence(1)).persist
