"""Private-view isolation (R2.6): tokens, per-player holds and the Sahur sequence stay out of player views."""
import json

from app.content import ROOM_PLAN
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
        await rt.apply(Advance())  # lobby -> room 0 intro
        await rt.apply(Advance())  # -> room 0 puzzle

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


def test_room6_platformer_seed_is_tv_only(client):
    from app.core.game import PHASE_PUZZLE

    rt, toks = make_running_game(client, ("Ana", "Bea", "Cai"))

    async def to_sahur():
        rt.game.puzzle_id = None
        rt.game.puzzle_state = None
        rt.game.room_idx = len(ROOM_PLAN) - 1  # room 6
        rt.game.phase = "intro"
        await rt.apply(Advance())

    client.portal.call(to_sahur)
    assert rt.game.phase == PHASE_PUZZLE and rt.game.puzzle_id == "sahur_platformer"
    payloads = all_payloads(rt)
    tv_view = json.loads(payloads["tv"])["view"]
    assert tv_view["set"] == "sahur" and tv_view["seed"] == rt.game.puzzle_state.seed
    for pid in (p.id for p in rt.game.players):
        own = json.loads(payloads[pid])["view"]
        assert own["kind"] == "sahur_platformer" and own["set"] == "sahur" and "seed" not in own
    for token in toks.values():
        assert all(token not in text for text in payloads.values())
