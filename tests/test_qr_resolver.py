from app.core.qr import CHOOSE, NO_GAME, RESOLVED, GameRef, resolve_game


def g(id, status="running", tv=False):
    return GameRef(id, id.upper(), status, tv)


def test_requested_running_game_wins():
    r = resolve_game("b", "a", [g("a"), g("b")])
    assert (r.kind, r.game_id) == (RESOLVED, "b")


def test_requested_not_running_falls_through():
    r = resolve_game("lob", None, [g("lob", "lobby"), g("a")])
    assert (r.kind, r.game_id) == (RESOLVED, "a")


def test_two_running_no_cookie_lists():
    r = resolve_game(None, None, [g("a"), g("b")])
    assert r.kind == CHOOSE and {x.id for x in r.candidates} == {"a", "b"}


def test_cookie_of_game_b_resolves_b():
    r = resolve_game(None, "b", [g("a"), g("b")])
    assert (r.kind, r.game_id) == (RESOLVED, "b")


def test_sole_running_game_with_tv_preferred():
    r = resolve_game(None, None, [g("a"), g("b", tv=True)])
    assert (r.kind, r.game_id) == (RESOLVED, "b")


def test_sole_running_game_without_tv():
    r = resolve_game(None, None, [g("a"), g("l", "lobby")])
    assert (r.kind, r.game_id) == (RESOLVED, "a")


def test_none_running():
    assert resolve_game(None, None, []).kind == NO_GAME
    assert resolve_game(None, None, [g("a", "finished"), g("l", "lobby")]).kind == NO_GAME


def test_finished_game_of_cookie_player_resolves_when_nothing_runs():
    r = resolve_game(None, "a", [g("a", "finished")])
    assert (r.kind, r.game_id) == (RESOLVED, "a")


def test_cookie_game_not_running_ignored():
    r = resolve_game(None, "l", [g("l", "lobby"), g("a"), g("b")])
    assert r.kind == CHOOSE
