"""Private-view isolation skeleton (R2.6). Extended with Wordle letters in batch C (C5)."""
import json

from app.core.engine import Advance, PuzzleAction


def make_running_game(client, names=("Ana", "Bea")):
    g = client.post("/api/games", json={"name": "G"}).json()
    toks = {}
    for n in names:
        toks[n] = client.post("/api/join", json={"code": g["code"], "name": n}).json()["token"]
    mgr = client.app.state.manager
    rt = mgr.get(g["id"])

    async def go():
        for p in rt.game.players:
            await rt.set_presence(p.id, True)
        await rt.apply(Advance())

    client.portal.call(go)
    return rt, toks


def all_payloads(rt):
    """Every state payload a client could receive: {viewer: json text}."""
    out = {"tv": json.dumps(rt.state_payload("tv"))}
    for p in rt.game.players:
        out[p.id] = json.dumps(rt.state_payload("player", p.id))
    return out


def test_no_tokens_or_foreign_private_data_in_any_payload(client):
    rt, toks = make_running_game(client)
    pa, pb = rt.game.players

    async def hold():
        await rt.apply(PuzzleAction(pa.id, {"type": "hold", "down": True}))

    client.portal.call(hold)
    payloads = all_payloads(rt)
    for token in toks.values():
        for text in payloads.values():
            assert token not in text  # session tokens never leave the server
    assert "player_token" not in payloads["tv"]


def test_player_view_exposes_only_own_hold_state(client):
    rt, _ = make_running_game(client)
    pa, pb = rt.game.players

    async def hold():
        await rt.apply(PuzzleAction(pa.id, {"type": "hold", "down": True}))

    client.portal.call(hold)
    va = rt.state_payload("player", pa.id)["view"]
    vb = rt.state_payload("player", pb.id)["view"]
    assert va["holding"] is True and vb["holding"] is False
    assert "players" not in va and "players" not in vb  # roster-wide holding map is TV-only


def test_tv_view_has_no_player_only_keys_and_code_is_tv_only(client):
    rt, _ = make_running_game(client)
    pa, _ = rt.game.players
    tv = rt.state_payload("tv")
    pl = rt.state_payload("player", pa.id)
    assert "code" in tv["game"] and "code" not in pl["game"]
    assert "holding" not in tv["view"]


def test_wordle_letters_and_answer_never_leak(client):
    from app.core.game import PHASE_PUZZLE

    rt, toks = make_running_game(client, ("Ana", "Bea", "Cai"))

    async def to_wordle():
        rt.game.puzzle_id = None
        rt.game.puzzle_state = None
        rt.game.room_idx = 1
        rt.game.phase = "intro"
        await rt.apply(Advance())

    client.portal.call(to_wordle)
    assert rt.game.phase == PHASE_PUZZLE and rt.game.puzzle_id == "cursed_wordle"
    s = rt.game.puzzle_state
    ids = [p.id for p in rt.game.players]
    payloads = all_payloads(rt)
    for pid in ids:
        letter = s.letters[pid]
        own = json.loads(payloads[pid])["view"]
        assert own["letter"] == letter
        for other in ["tv"] + [x for x in ids if x != pid]:
            view = json.loads(payloads[other])["view"]
            if other == "tv":
                assert "letter" not in view
            else:
                assert view["letter"] != letter  # distinct letters: B never sees A's
    tv_view = json.loads(payloads["tv"])["view"]
    assert "letter" not in tv_view and "your_turn" not in tv_view
    for text in payloads.values():
        assert s.target not in text
        assert '"target"' not in text
