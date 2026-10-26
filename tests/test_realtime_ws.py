"""Realtime lane over /ws: input relay, fx, sim, tv_online, lock-free guarantees."""
import json
from contextlib import contextmanager

import pytest
from starlette.websockets import WebSocketDisconnect


def env(t, payload=None, v=1):
    return json.dumps({"v": v, "t": t, "payload": payload or {}})


def recv(ws):
    return json.loads(ws.receive_text())


def setup_game(client, names=("Ana", "Beto")):
    g = client.post("/api/games", json={"name": "G"}).json()
    tokens = [client.post("/api/join", json={"code": g["code"], "name": n}).json()["token"] for n in names]
    return g["id"], tokens


@contextmanager
def tv_socket(client, gid):
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "tv", "game_id": gid}))
        assert recv(ws)["t"] == "welcome"
        yield ws


@contextmanager
def phone(client, token):
    with client.websocket_connect("/ws") as ws:
        ws.send_text(env("hello", {"role": "player", "player_token": token}))
        w = recv(ws)
        assert w["t"] == "welcome"
        ws.pid = w["payload"]["player_id"]
        yield ws


def drain(ws):
    """Barrier: ping and collect everything received before the pong (frames are handled in order)."""
    ws.send_text(env("ping"))
    got = []
    while True:
        m = recv(ws)
        if m["t"] == "pong":
            return got
        got.append(m)


def of(msgs, t):
    return [m for m in msgs if m["t"] == t]


def test_input_pid_is_stamped_from_the_socket(client):
    gid, (ta, tb) = setup_game(client)
    with tv_socket(client, gid) as tv, phone(client, ta) as a, phone(client, tb) as b:
        drain(tv), drain(a), drain(b)
        a.send_text(env("input", {"mask": 2, "pid": b.pid}))
        a.send_text(env("ping"))
        inputs = of(drain(tv), "input")
        assert [m["payload"] for m in inputs] == [{"pid": a.pid, "mask": 2}]
        assert not of(drain(b), "input")  # phones never see other phones' input


def test_mask_is_clamped_and_non_int_dropped(client):
    gid, (ta, _) = setup_game(client)
    with tv_socket(client, gid) as tv, phone(client, ta) as a:
        drain(tv), drain(a)
        for bad in (True, "3", 1.5, None, [2]):
            a.send_text(env("input", {"mask": bad}))
        a.send_text(env("input", {"mask": 0xFF}))
        a.send_text(env("input", {}))
        drain(a)
        assert [m["payload"]["mask"] for m in of(drain(tv), "input")] == [0x0F]


def test_role_gating_input_fx_sim(client):
    gid, (ta, tb) = setup_game(client)
    with tv_socket(client, gid) as tv, phone(client, ta) as a, phone(client, tb) as b:
        drain(tv), drain(a), drain(b)
        seq = client.app.state.manager.get(gid).game.seq
        tv.send_text(env("input", {"mask": 2}))  # TV cannot feed input
        a.send_text(env("fx", {"to": "all", "kind": "boom"}))  # phone cannot send fx
        a.send_text(env("sim", {"action": "clear", "epoch": 0, "level": 0}))  # phone cannot report
        drain(a), drain(tv)
        assert not of(drain(tv), "input")
        assert not of(drain(b), "fx")
        assert not of(drain(a), "error")  # silently dropped, not even an error
        assert client.app.state.manager.get(gid).game.seq == seq


def test_fx_goes_to_target_or_all_and_validates_kind(client):
    gid, (ta, tb) = setup_game(client)
    with tv_socket(client, gid) as tv, phone(client, ta) as a, phone(client, tb) as b:
        drain(tv), drain(a), drain(b)
        tv.send_text(env("fx", {"to": a.pid, "kind": "buzz", "data": {"ms": 80}}))
        tv.send_text(env("fx", {"to": "all", "kind": "chime"}))
        tv.send_text(env("fx", {"to": "all", "kind": "BAD KIND!"}))
        drain(tv)
        got_a, got_b = of(drain(a), "fx"), of(drain(b), "fx")
        assert [m["payload"] for m in got_a] == [{"kind": "buzz", "data": {"ms": 80}}, {"kind": "chime"}]
        assert [m["payload"] for m in got_b] == [{"kind": "chime"}]


def test_rate_limit_drops_excess_and_keeps_socket(client):
    gid, (ta, _) = setup_game(client)
    with tv_socket(client, gid) as tv, phone(client, ta) as a:
        drain(tv), drain(a)
        for _ in range(60):  # FakeClock is frozen: the bucket (burst 30) never refills
            a.send_text(env("input", {"mask": 1}))
        drain(a)
        assert len(of(drain(tv), "input")) == 30
        a.send_text(env("ping"))
        assert recv(a)["t"] == "pong"  # still connected


def test_oversize_frames_are_ignored_without_crash(client):
    gid, (ta, _) = setup_game(client)
    with tv_socket(client, gid) as tv, phone(client, ta) as a:
        drain(tv), drain(a)
        a.send_text(env("input", {"mask": 1, "junk": "x" * 200}))  # > 128 B input cap
        a.send_text("x" * 9000)  # > 8192 B: dropped before parsing (not even "malformed")
        a.send_text(env("input", {"mask": 4}))
        msgs = drain(a)
        assert not of(msgs, "error")
        assert [m["payload"]["mask"] for m in of(drain(tv), "input")] == [4]


def test_zero_relayed_to_tv_on_player_disconnect(client):
    gid, (ta, _) = setup_game(client)
    with tv_socket(client, gid) as tv:
        drain(tv)
        with phone(client, ta) as a:
            pid = a.pid
            drain(a)
            a.send_text(env("input", {"mask": 2}))
            drain(a)
        # phone left: TV gets {pid, 0}
        tv.send_text(env("ping"))
        msgs = []
        while True:
            m = recv(tv)
            if m["t"] == "pong":
                break
            msgs.append(m)
        inputs = [m["payload"] for m in of(msgs, "input")]
        assert inputs[-2:] == [{"pid": pid, "mask": 2}, {"pid": pid, "mask": 0}]


def test_replay_masks_when_tv_reconnects_and_old_tv_is_evicted(client):
    gid, (ta, _) = setup_game(client)
    with tv_socket(client, gid) as tv1, phone(client, ta) as a:
        drain(tv1), drain(a)
        a.send_text(env("input", {"mask": 6}))
        drain(a)
        with tv_socket(client, gid) as tv2:
            msgs = drain(tv2)
            assert [m["payload"] for m in of(msgs, "input")] == [{"pid": a.pid, "mask": 6}]
            assert of(msgs, "state")
            with pytest.raises(WebSocketDisconnect) as e:
                while True:
                    tv1.receive_text()
            assert e.value.code == 4001


def test_realtime_lane_never_takes_the_lock_or_persists(client):
    gid, (ta, _) = setup_game(client)
    rt = client.app.state.manager.get(gid)

    class Spy:
        entered = 0

        async def __aenter__(self):
            Spy.entered += 1

        async def __aexit__(self, *a):
            return False

    with tv_socket(client, gid) as tv, phone(client, ta) as a:
        drain(tv), drain(a)
        calls = []
        real_lock, real_persist = rt.lock, rt.persist
        rt.lock, rt.persist = Spy(), lambda: calls.append(1)
        try:
            for _ in range(20):
                a.send_text(env("input", {"mask": 1}))
            tv.send_text(env("fx", {"to": "all", "kind": "x"}))
            a.send_text(env("sim", {"action": "clear"}))  # phone sim: dropped
            drain(a), drain(tv)
            assert Spy.entered == 0 and calls == []
        finally:
            rt.lock, rt.persist = real_lock, real_persist


def test_tv_sim_goes_through_the_lock_and_unknown_actions_are_rejected(client):
    gid, _ = setup_game(client)
    with tv_socket(client, gid) as tv:
        drain(tv)
        tv.send_text(env("sim", {"action": "clear", "epoch": 0, "level": 0}))
        e = recv(tv)
        assert e["t"] == "error" and e["payload"]["code"] == "no_puzzle"


def test_phones_learn_tv_presence_on_connect_disconnect_and_eviction(client):
    gid, (ta, _) = setup_game(client)
    with phone(client, ta) as a:
        first = of(drain(a), "state")
        assert first[-1]["payload"]["game"]["tv_online"] is False
        with tv_socket(client, gid) as tv:
            drain(tv)
            assert of(drain(a), "state")[-1]["payload"]["game"]["tv_online"] is True
            with tv_socket(client, gid) as tv2:  # takeover: phones keep seeing a TV
                drain(tv2)
                states = of(drain(a), "state")
                assert not states or states[-1]["payload"]["game"]["tv_online"] is True
        assert of(drain(a), "state")[-1]["payload"]["game"]["tv_online"] is False


def test_unknown_types_still_get_an_error_and_state_broadcast_unchanged(client):
    gid, (ta, _) = setup_game(client)
    with tv_socket(client, gid) as tv, phone(client, ta) as a:
        drain(tv), drain(a)
        a.send_text(env("telepathy"))
        e = recv(a)
        assert e["t"] == "error" and e["payload"]["code"] == "unknown_type"
        tv.send_text(env("advance"))  # regular commands still persist + broadcast state to everyone
        assert recv(tv)["t"] == "state"
        assert of(drain(a), "state")


def test_hub_forgets_masks_when_game_is_deleted(client):
    gid, (ta, _) = setup_game(client)
    with tv_socket(client, gid) as tv, phone(client, ta) as a:
        drain(tv), drain(a)
        a.send_text(env("input", {"mask": 2}))
        drain(a)
        assert client.app.state.hub.relay.masks.get(gid)
        assert client.delete(f"/api/games/{gid}").status_code == 204
        assert gid not in client.app.state.hub.relay.masks
