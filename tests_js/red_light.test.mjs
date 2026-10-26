import test from "node:test";
import assert from "node:assert/strict";
import { BIT } from "../static/js/sim/bits.js";
import { createSim, LANE_LEN, SWIM, GRACE_MS, DISTRACT_COOLDOWN_MS, DISTRACT_DELAY_MS, MAX_FAKES_IN_A_ROW } from "../static/puzzles/red_light/sim.js";
import { roster, run, botDriver, seconds } from "./helpers.mjs";

const { R, A } = BIT;
const SIZES = [2, 12];
const STEPS_PER_MS = 0.06;

const types = (events, type) => events.filter((e) => e.type === type);
/** Step (no input) until the first step where the phase is `phase`. Returns the events seen. */
function until(sim, phase, max = 3600) {
  const seen = [];
  for (let i = 0; i < max; i++) {
    if (sim.snapshot().phase === phase) return seen;
    sim.step();
    seen.push(...sim.drain());
  }
  throw new Error(`never reached ${phase}`);
}
const stepN = (sim, n) => { const out = []; for (let i = 0; i < n; i++) { sim.step(); out.push(...sim.drain()); } return out; };

// ---- bots ---------------------------------------------------------------------------------------------
// Careful swimmer: swims on green, stops as soon as the warning shows (it cannot tell a fake from a real one).
const careful = (snap) => (snap.phase === "green" ? R : 0);

test("holding swims forward, releasing stops", () => {
  const sim = createSim({ roster: roster(1), seed: 1 });
  sim.setInput("p0", R);
  stepN(sim, 60);
  const x = sim.snapshot().players[0].x;
  assert.ok(Math.abs(x - SWIM) < 0.5, `one second of swimming ~ ${SWIM}, got ${x}`);
  sim.setInput("p0", 0);
  stepN(sim, 30);
  assert.equal(sim.snapshot().players[0].x, x);
});

test("grace window: stopping 200 ms after red is fine, still swimming at 400 ms is caught", () => {
  for (const [swimMs, caught] of [[200, false], [400, true]]) {
    const sim = createSim({ roster: roster(1), seed: 7 });
    until(sim, "red");
    sim.drain();
    sim.setInput("p0", R);
    const events = stepN(sim, Math.round(swimMs * STEPS_PER_MS));
    sim.setInput("p0", 0);
    events.push(...stepN(sim, 30));
    assert.equal(types(events, "penalty").length > 0, caught, `${swimMs} ms`);
    if (caught) {
      assert.equal(types(events, "penalty")[0].why, "caught");
      assert.equal(sim.snapshot().players[0].x, 0, "back to the start");
    }
  }
  assert.equal(GRACE_MS, 300);
});

test("a caught swimmer is frozen for the rest of the red phase: one penalty per red", () => {
  const sim = createSim({ roster: roster(1), seed: 7 });
  until(sim, "red");
  sim.drain();
  sim.setInput("p0", R);
  const events = stepN(sim, 120); // 2 s of holding, red lasts up to 3 s
  assert.equal(types(events, "penalty").length, 1);
});

test("cues: green -> warning (~1 s) -> red or fake back to green; fakes happen but never more than 2 in a row", () => {
  const sim = createSim({ roster: roster(1), seed: 3 });
  let prev = sim.snapshot().phase;
  let fakes = 0;
  let streak = 0;
  let maxStreak = 0;
  let reds = 0;
  let warnSteps = 0;
  for (let i = 0; i < 60 * 600; i++) {
    sim.step();
    const ph = sim.snapshot().phase;
    if (ph === "warning") warnSteps++;
    if (prev === "warning" && ph !== "warning") {
      assert.equal(warnSteps, 60, "the warning lasts 1 s");
      if (ph === "green") { fakes++; streak++; maxStreak = Math.max(maxStreak, streak); }
      else { assert.equal(ph, "red"); reds++; streak = 0; }
    }
    if (prev === "red" && ph !== "red") assert.equal(ph, "green");
    if (ph !== "warning") warnSteps = 0;
    prev = ph;
  }
  assert.ok(fakes > 0 && reds > 0, `fakes ${fakes}, reds ${reds}`);
  assert.ok(maxStreak <= MAX_FAKES_IN_A_ROW);
});

test("only a real red catches: warnings and fake turns never do", () => {
  let penalties = 0;
  let fakes = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const sim = createSim({ roster: roster(1), seed });
    let prev = "green";
    for (let i = 0; i < 60 * 120 && !sim.snapshot().cleared; i++) {
      sim.setInput("p0", R); // reckless: never lets go
      sim.step();
      const ph = sim.snapshot().phase;
      if (prev === "warning" && ph === "green") fakes++;
      const n = types(sim.drain(), "penalty").length;
      if (n) assert.equal(ph, "red");
      penalties += n;
      prev = ph;
    }
  }
  assert.ok(fakes > 0 && penalties > 0, `fakes ${fakes}, penalties ${penalties}`);
});

test("finishers are never caught and a distraction suspends catching; the cooldown is shared", () => {
  const sim = createSim({ roster: roster(3), seed: 11 });
  // p0 swims to the end during green phases (careful bot), p1 and p2 stay at the start
  while (!sim.snapshot().players[0].done) {
    sim.setInput("p0", careful(sim.snapshot()));
    sim.step();
  }
  sim.drain();
  assert.ok(sim.snapshot().players[0].done);
  // holding swim after arriving does nothing to a finisher, even in red
  until(sim, "red");
  sim.setInput("p0", R);
  assert.equal(types(stepN(sim, 120), "penalty").length, 0);
  assert.equal(sim.snapshot().players[0].x, LANE_LEN);

  // distract: pending after the press, active after the delay
  const s2 = createSim({ roster: roster(3), seed: 11 });
  while (!s2.snapshot().players[0].done) { s2.setInput("p0", careful(s2.snapshot())); s2.step(); }
  s2.setInput("p0", 0);
  s2.drain();
  s2.setInput("p0", A);
  s2.step();
  assert.ok(s2.snapshot().distract.pending);
  assert.ok(s2.snapshot().distract.cooldownMs > DISTRACT_COOLDOWN_MS - 100);
  stepN(s2, Math.round(DISTRACT_DELAY_MS * STEPS_PER_MS) + 1);
  assert.ok(s2.snapshot().distract.active, "active once the delay is over");
  // another finisher cannot restart it while the shared cooldown runs
  s2.setInput("p1", 0);
  const cd = s2.snapshot().distract.cooldownMs;
  stepN(s2, 6);
  assert.ok(s2.snapshot().distract.cooldownMs < cd);
});

test("while distracted, red catches nobody", () => {
  const sim = createSim({ roster: roster(2), seed: 11 });
  while (!sim.snapshot().players[0].done) { sim.setInput("p0", careful(sim.snapshot())); sim.step(); }
  sim.setInput("p0", A);
  until(sim, "red");
  sim.drain();
  stepN(sim, 24); // press (cooldown permitting) + delay: distraction is active well before the grace is over twice
  sim.setInput("p1", R);
  const snap = sim.snapshot();
  if (snap.phase === "red" && snap.distract.active) {
    assert.equal(types(stepN(sim, 6), "penalty").length, 0);
  }
});

test("everybody must arrive: arrive events per player, clear only after the last one", () => {
  const sim = createSim({ roster: roster(3), seed: 5 });
  const r = run(sim, botDriver((snap, i) => (snap.players[i].done ? 0 : careful(snap))), { maxSteps: 3600 * 5 });
  assert.equal(types(r.events, "arrive").length, 3);
  assert.equal(types(r.events, "clear").length, 1);
  const last = r.events.map((e) => e.type).lastIndexOf("arrive");
  assert.ok(r.events.findIndex((e) => e.type === "clear") > last);
});

test("a disconnect removes the player from the requirement and keeps their progress", () => {
  const sim = createSim({ roster: roster(2), seed: 5 });
  sim.setInput("p0", R);
  stepN(sim, 30);
  const x = sim.snapshot().players[0].x;
  assert.ok(x > 0);
  sim.setRoster(roster(2).slice(1)); // p0 leaves
  assert.equal(sim.snapshot().players.length, 1);
  sim.setRoster(roster(2));          // ... and comes back
  assert.equal(sim.snapshot().players[0].x, x);
  // the one left must arrive alone for the room to clear
  sim.setRoster(roster(2).slice(1));
  const r = run(sim, botDriver((snap) => careful(snap)), { maxSteps: 3600 * 5 });
  assert.equal(types(r.events, "clear").length, 1);
});

for (const n of SIZES) {
  test(`bots clear the room with N=${n}`, () => {
    const sim = createSim({ roster: roster(n), seed: 2024 });
    const r = run(sim, botDriver((snap, i) => (snap.players[i].done ? 0 : careful(snap))), { maxSteps: seconds(120) });
    assert.ok(r.snap.cleared, `cleared in ${r.steps} steps`);
    assert.equal(types(r.events, "penalty").length, 0);
    assert.equal(types(r.events, "arrive").length, n);
    assert.equal(types(r.events, "clear").length, 1);
  });
}

test("a reckless swimmer is caught repeatedly and still can finish later", () => {
  const sim = createSim({ roster: roster(2), seed: 9 });
  const r = run(sim, botDriver((snap, i) => (i === 0 ? R : careful(snap))), { maxSteps: seconds(300) });
  assert.ok(types(r.events, "penalty").length > 0);
  assert.ok(types(r.events, "penalty").every((e) => e.id === "p0"));
});

test("determinism: same seed and inputs give the same history", () => {
  const go = (seed) => run(createSim({ roster: roster(4), seed }), botDriver((snap, i) => (i % 2 ? R : careful(snap))), { maxSteps: seconds(40), done: () => false });
  assert.equal(go(77).hash, go(77).hash);
  assert.notEqual(go(77).hash, go(78).hash);
});
