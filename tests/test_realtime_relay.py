"""Unit tests for app/web/realtime.py (token bucket, mask cleaning, relay memory, frame caps)."""
from app.web.realtime import (
    BUCKET_SPECS,
    FRAME_LIMITS,
    MASK_BITS,
    InputRelay,
    TokenBucket,
    clean_mask,
    frame_ok,
)
from tests.fakes import FakeClock


def test_bucket_burst_then_drops_and_frozen_clock_never_refills():
    clock = FakeClock()
    b = TokenBucket(3, 30.0, clock.now_ms)
    assert [b.allow() for _ in range(5)] == [True, True, True, False, False]


def test_bucket_refills_with_time_but_never_beyond_burst():
    clock = FakeClock()
    b = TokenBucket(2, 10.0, clock.now_ms)  # 1 token / 100 ms
    assert b.allow() and b.allow() and not b.allow()
    clock.advance(0.1)
    assert b.allow() and not b.allow()
    clock.advance(60)
    assert [b.allow() for _ in range(3)] == [True, True, False]


def test_clean_mask_clamps_bits_and_rejects_non_int():
    assert clean_mask(0) == 0
    assert clean_mask(0xFF) == MASK_BITS
    assert clean_mask(5) == 5
    assert clean_mask(-1) == MASK_BITS
    for bad in (True, False, "3", 1.5, None, [1], {"a": 1}):
        assert clean_mask(bad) is None


def test_frame_caps():
    assert frame_ok("input", "x" * FRAME_LIMITS["input"])
    assert not frame_ok("input", "x" * (FRAME_LIMITS["input"] + 1))
    assert not frame_ok("sim", "x" * (FRAME_LIMITS["sim"] + 1))


def test_relay_set_zero_replay_drop():
    r = InputRelay(FakeClock().now_ms)
    r.set("g", "a", 2)
    r.set("g", "b", 0)
    r.set("g", "c", 4)
    assert r.replay("g", ["a", "b"]) == [("a", 2)]  # zero masks and unlisted pids are skipped
    assert r.zero("g", "a") is True
    assert r.zero("g", "a") is False
    assert r.replay("g", ["a", "c"]) == [("c", 4)]
    r.drop_game("g")
    assert r.replay("g", ["c"]) == []


def test_relay_buckets_are_per_owner_and_per_kind():
    r = InputRelay(FakeClock().now_ms)
    one, two = {}, {}
    assert r.bucket(one, "input") is r.bucket(one, "input")
    assert r.bucket(one, "input") is not r.bucket(two, "input")
    assert r.bucket(one, "input") is not r.bucket(one, "sim")


def test_sim_burst_fits_a_whole_group_arriving_at_once():
    # red light: one "arrive" report per player and the last one completes the room; a dropped one is never resent
    clock = FakeClock()
    burst, rate = BUCKET_SPECS["sim"]
    b = TokenBucket(burst, rate, clock.now_ms)
    assert all(b.allow() for _ in range(12 + 1))  # 12 players (every join colour) + the TV's clear, same instant
