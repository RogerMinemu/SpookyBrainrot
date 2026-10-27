"""Story reader: the phone picked to read a cutscene line aloud presses "Siguiente" (WS "story"). The server only relays
it to the TV with the pid of the authenticated socket; the TV decides whether that phone is the reader of its line."""
from tests.test_admin_player import join, new_game
from tests.test_realtime_ws import drain, env, of, phone, tv_socket


def test_story_next_is_relayed_to_the_tv_with_the_socket_pid(client):
    gid, code = new_game(client)
    ana, bea = join(client, code, "Ana"), join(client, code, "Bea")
    rt = client.app.state.manager.get(gid)
    with tv_socket(client, gid) as tv, phone(client, ana["token"]) as a, phone(client, bea["token"]) as b:
        drain(tv), drain(a), drain(b)
        seq = rt.game.seq
        a.send_text(env("story", {"key": "intro:0", "scene": "prologue", "beat": 3, "pid": "forged"}))
        assert [m["payload"] for m in of(drain(tv), "story")] == [
            {"pid": ana["player_id"], "key": "intro:0", "scene": "prologue", "beat": 3}]
        assert not of(drain(a), "error") and not of(drain(b), "story")  # only the TV hears it
        assert rt.game.seq == seq  # a cutscene press never touches the game state


def test_story_next_drops_malformed_presses_and_the_tv_cannot_send_one(client):
    gid, code = new_game(client)
    ana = join(client, code, "Ana")
    with tv_socket(client, gid) as tv, phone(client, ana["token"]) as a:
        drain(tv), drain(a)
        for bad in ({"key": "intro:0", "scene": "prologue"}, {"key": 1, "scene": "x", "beat": 0},
                    {"key": "intro:0", "scene": "prologue", "beat": True}, {"key": "k", "scene": None, "beat": 0}):
            a.send_text(env("story", bad))
        tv.send_text(env("story", {"key": "intro:0", "scene": "prologue", "beat": 0}))
        assert not of(drain(tv), "story")


def test_story_next_is_rate_limited(client):
    gid, code = new_game(client)
    ana = join(client, code, "Ana")
    with tv_socket(client, gid) as tv, phone(client, ana["token"]) as a:
        drain(tv), drain(a)
        for beat in range(10):
            a.send_text(env("story", {"key": "intro:0", "scene": "prologue", "beat": beat}))
        assert len(of(drain(tv), "story")) == 4  # burst of 4 (the FakeClock never refills it)
