// Room 7: Sahur's set of co-op platformer levels (same engine as Room 1, combined gadgets, spikes, several bells).
import test from "node:test";
import assert from "node:assert/strict";
import { createSim } from "../static/puzzles/coop_platformer/sim.js";
import { LEVEL_SETS, LEVELS, levelsOf, parseLevel } from "../static/puzzles/coop_platformer/levels.js";
import { roster, run, botDriver, seconds } from "./helpers.mjs";
import { L, R, J, BOTS, goTo, goBlock, pulse } from "./sahur_bots.mjs";

const SET = "sahur";
const SAHUR = LEVEL_SETS.sahur;
const SIZES = [2, 12];

for (const n of SIZES) {
  SAHUR.forEach((def, level) => {
    test(`sahur level ${level + 1} (${def.title}) is cleared by the bot with ${n} players`, () => {
      const sim = createSim({ level, set: SET, roster: roster(n), seed: 7 });
      const out = run(sim, botDriver(BOTS[level]), { maxSteps: seconds(120) });
      assert.equal(out.snap.cleared, true, `not cleared after ${(out.steps / 60).toFixed(1)} s`);
      assert.equal(out.events.filter((e) => e.type === "clear").length, 1, "clear is emitted exactly once");
      assert.ok(out.snap.players.every((p) => p.entered));
      assert.equal(out.events.filter((e) => e.type === "penalty").length, 0, "a clean run costs no brainrot");
    });
  });
}

test("the sahur set has four levels and Room 1 keeps its own four", () => {
  assert.equal(SAHUR.length, 4);
  assert.equal(LEVELS, LEVEL_SETS.nivel0);
  assert.equal(levelsOf("sahur"), SAHUR);
  assert.equal(levelsOf("nope"), LEVELS, "an unknown set falls back to Room 1");
  for (const def of SAHUR) {
    const m = parseLevel(def.rows);
    assert.ok(m.door && m.spawn.x1 - m.spawn.x0 === 6 && m.spawn.y === 16);
  }
  assert.equal(parseLevel(SAHUR[0].rows).bells.length, 3);
  assert.ok(parseLevel(SAHUR[1].rows).spikes.length && parseLevel(SAHUR[1].rows).button);
  assert.ok(parseLevel(SAHUR[2].rows).platform && parseLevel(SAHUR[2].rows).key);
  assert.ok(parseLevel(SAHUR[3].rows).spikes.length && parseLevel(SAHUR[3].rows).key && parseLevel(SAHUR[3].rows).gate);
});

test("several bells: the door only opens once every bell has rung", () => {
  const sim = createSim({ level: 0, set: SET, roster: roster(2), seed: 7 });
  let seen = [];
  run(sim, botDriver(BOTS[0]), {
    maxSteps: seconds(120),
    done: (s) => { if (s.bells.some(Boolean) && !s.bells.every(Boolean)) seen.push(s.doorOpen); return s.doorOpen; },
  });
  assert.ok(seen.length > 0 && seen.every((open) => open === false), "the door stays shut while a bell is silent");
  assert.deepEqual(sim.snapshot().bells, [true, true, true]);
});

test("a lone player cannot ring a bell of the first level, not even from the block", () => {
  for (const tx of [8.9, 15.9, 23.9]) {
    const sim = createSim({ level: 0, set: SET, roster: roster(1) });
    run(sim, (snap) => sim.setInput("p0", goBlock(snap.players[0], tx) || pulse(snap)), { maxSteps: seconds(20), done: () => false });
    assert.deepEqual(sim.snapshot().bells, [false, false, false], `under ${tx}`);
  }
});

test("spikes send you back to the start with a spikes penalty", () => {
  const sim = createSim({ level: 1, set: SET, roster: roster(2) });
  const out = run(sim, botDriver((snap, i) => (i === 0 ? R : 0)), { maxSteps: seconds(3), done: () => false });
  const hits = out.events.filter((e) => e.type === "penalty");
  assert.ok(hits.length >= 1);
  assert.deepEqual([hits[0].id, hits[0].why], ["p0", "spikes"]);
  assert.ok(out.snap.players[1].x < 8, "the other player is untouched");
});

test("a standing jump from the very edge clears a 2-wide spike strip (no need to time a running jump)", () => {
  const sim = createSim({ level: 1, set: SET, roster: roster(1) });
  const EDGE = 10 - 0.88; // body right edge a hair short of the first spike (goTo stops within ±0.06)
  const out = run(sim, (snap) => {
    const p = snap.players[0];
    const settled = snap.t > 150; // walked from the spawn and stopped at the edge
    sim.setInput(p.id, !settled ? goTo(p, EDGE) : snap.t < 153 ? R | J : R);
  }, { maxSteps: 220, done: () => false });
  assert.equal(out.events.filter((e) => e.type === "penalty").length, 0);
  assert.ok(out.snap.players[0].x > 12, `landed at ${out.snap.players[0].x}`);
});

test("running off the key shelf of the last level lands short of the spikes, with time to jump", () => {
  const sim = createSim({ level: 3, set: SET, roster: roster(2), seed: 7 });
  run(sim, botDriver(BOTS[3]), { maxSteps: seconds(60), done: (s) => s.key.state === "held" });
  let landed = null;
  const out = run(sim, (snap) => {
    const b = snap.players[1];
    if (landed === null && b.grounded && b.y > 15) landed = b.x;
    snap.players.forEach((p) => sim.setInput(p.id, p.id === b.id && landed === null ? R : 0));
  }, { maxSteps: seconds(5), done: () => landed !== null });
  assert.ok(landed !== null && landed + 0.8 < 25, `landed at ${landed}`);
  assert.equal(out.events.filter((e) => e.type === "penalty").length, 0);
});

test("the platform waits for everybody on its side of the pit, wherever the pit is", () => {
  const sim = createSim({ level: 2, set: SET, roster: roster(3) });
  const out = run(sim, botDriver((snap, i) => (i === 2 ? 0 : snap.players[i].x < 9.3 ? R : 0)), { maxSteps: seconds(6), done: () => false });
  assert.equal(out.snap.plat.state, "wait");
});

test("a lone player cannot reach the key shelves of the third and fourth levels", () => {
  for (const [level, dir, x] of [[2, L, 7.0], [3, R, 17.0]]) {
    const sim = createSim({ level, set: SET, roster: roster(1) });
    run(sim, (snap) => {
      const p = snap.players[0];
      if (level === 3 && !snap.gateOpen) return sim.setInput(p.id, goTo(p, 10.1)); // alone, the button needs just one
      sim.setInput(p.id, Math.abs(p.x - x) > 0.3 ? goTo(p, x) : pulse(snap) | dir);
    }, { maxSteps: seconds(20), done: () => false });
    assert.equal(sim.snapshot().key.state, "home", `level ${level + 1}`);
  }
});
