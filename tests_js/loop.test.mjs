import test from "node:test";
import assert from "node:assert/strict";
import { advance, mulberry32, ms2steps, FIXED_DT, MAX_FRAME_DT, MAX_STEPS, hashString } from "../static/js/sim/loop.js";
import { BIT, clean, axis } from "../static/js/sim/bits.js";
import { overlapX, intersects } from "../static/js/sim/aabb.js";
import { COLORS, colorFor } from "../static/js/sim/colors.js";
import { createHost, STALE_MS } from "../static/js/sim/host.js";

test("advance: one 1/60 frame is exactly one step", () => {
  assert.deepEqual(advance(0, FIXED_DT), { acc: 0, steps: 1 });
});

test("advance: 600 frames of 1/60 s give 600 steps (no drift)", () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 600; i++) {
    const r = advance(acc, 1 / 60);
    acc = r.acc;
    total += r.steps;
  }
  assert.equal(total, 600);
});

test("advance: a 144 Hz display still runs 60 steps per second", () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 144 * 5; i++) {
    const r = advance(acc, 1 / 144);
    acc = r.acc;
    total += r.steps;
  }
  assert.ok(Math.abs(total - 300) <= 1, `got ${total}`);
});

test("advance: frame time is clamped, steps are capped, backlog is dropped", () => {
  const r = advance(0, 10);
  assert.equal(r.steps, MAX_STEPS);
  assert.ok(MAX_FRAME_DT === 0.25 && r.acc <= FIXED_DT + 1e-12);
  assert.deepEqual(advance(0, -1), { acc: 0, steps: 0 });
  assert.deepEqual(advance(0, NaN), { acc: 0, steps: 0 });
});

test("mulberry32: deterministic, in [0,1), seed-dependent", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 50 }, a);
  const seqB = Array.from({ length: 50 }, b);
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(seqA, Array.from({ length: 50 }, mulberry32(43)));
});

test("ms2steps: 300 ms is 18 steps", () => {
  assert.equal(ms2steps(300), 18);
  assert.equal(ms2steps(2500), 150);
  assert.equal(ms2steps(1000), 60);
});

test("bits: mask is clamped to the four buttons and left+right cancel", () => {
  assert.equal(clean(0xff), 0x0f);
  assert.equal(clean("3"), 0);
  assert.equal(axis(BIT.L | BIT.R), 0);
  assert.equal(axis(BIT.R), 1);
  assert.equal(axis(BIT.L | BIT.J), -1);
});

test("aabb: touching boxes do not intersect", () => {
  const a = { x: 0, y: 0, w: 1, h: 1 };
  assert.equal(intersects(a, { x: 1, y: 0, w: 1, h: 1 }), false);
  assert.equal(intersects(a, { x: 0.9, y: 0.5, w: 1, h: 1 }), true);
  assert.ok(Math.abs(overlapX(a, { x: 0.8, w: 1 }) - 0.2) < 1e-12);
});

test("colors: 12 distinct join colours that wrap", () => {
  assert.equal(new Set(COLORS).size, 12);
  assert.equal(colorFor(0), colorFor(12));
  assert.equal(hashString("a"), hashString("a"));
  assert.notEqual(hashString("a"), hashString("b"));
});

function fakeLoop() {
  let t = 0;
  const cbs = [];
  return {
    now: () => t,
    raf: (fn) => { cbs.push(fn); return cbs.length; },
    caf: () => {},
    tickMs(ms) { t += ms; const fn = cbs.shift(); if (fn) fn(t); },
  };
}

function stubSim() {
  const log = { inputs: {}, steps: 0, roster: [] };
  let events = [];
  return {
    log,
    makeSim: ({ level, roster, seed }) => {
      log.made = { level, seed };
      log.roster = roster;
      return {
        setRoster(r) { log.roster = r; },
        setInput(id, m) { log.inputs[id] = m; },
        step() { log.steps += 1; if (log.steps === 3) events.push({ type: "clear" }, { type: "clear" }); if (log.steps === 4) events.push({ type: "penalty", id: "p0", why: "fall" }, { type: "fx", to: "all", kind: "ring" }); },
        drain() { const e = events; events = []; return e; },
        snapshot() { return {}; },
      };
    },
  };
}

test("host: fixed step independent of frame rate, clear reported once, penalty -> report + fx", () => {
  const loop = fakeLoop();
  const stub = stubSim();
  const reports = [];
  const fx = [];
  const host = createHost({ makeSim: stub.makeSim, report: (r) => reports.push(r), fx: (...a) => fx.push(a), raf: loop.raf, caf: loop.caf, now: loop.now });
  host.setRoster([{ id: "p0", name: "A", color: "#fff" }]);
  host.setView({ epoch: 3, level: 1, seed: 9 });
  assert.deepEqual(stub.log.made, { level: 1, seed: 9 });
  host.start();
  for (let i = 0; i < 6; i++) loop.tickMs(1000 / 60);
  assert.equal(stub.log.steps, 5); // the first frame only sets the time origin
  assert.deepEqual(reports.filter((r) => r.action === "clear"), [{ action: "clear", epoch: 3, level: 1 }]);
  assert.deepEqual(reports.find((r) => r.action === "penalty"), { action: "penalty", pid: "p0", why: "fall", epoch: 3, level: 1 });
  assert.deepEqual(fx, [["p0", "fail"], ["all", "ring", undefined]]);
  host.stop();
});

test("host: masks older than the staleness window count as 0, new epoch rebuilds the sim", () => {
  const loop = fakeLoop();
  const stub = stubSim();
  const host = createHost({ makeSim: stub.makeSim, raf: loop.raf, caf: loop.caf, now: loop.now });
  host.setRoster([{ id: "p0" }]);
  host.setView({ epoch: 1, level: 0, seed: 1 });
  host.setInput("p0", 2);
  host.start();
  loop.tickMs(16); loop.tickMs(16);
  assert.equal(stub.log.inputs.p0, 2);
  loop.tickMs(STALE_MS + 100);
  assert.equal(stub.log.inputs.p0, 0);
  host.setInput("p0", 1);
  loop.tickMs(16);
  assert.equal(stub.log.inputs.p0, 1);
  const first = host.sim;
  host.setView({ epoch: 1, level: 0, seed: 1 });
  assert.equal(host.sim, first); // same view: untouched
  host.setView({ epoch: 2, level: 0, seed: 1 });
  assert.notEqual(host.sim, first);
  host.stop();
});
