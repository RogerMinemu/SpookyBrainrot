import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../static/js/sim/loop.js";
import { createSim as createPlatformer } from "../static/puzzles/coop_platformer/sim.js";
import { createSim as createRedLight } from "../static/puzzles/red_light/sim.js";
import { createPlatformerCrew, createRedLightCrew, createSahurBot, createShapeCounter, createTriviaCrew } from "../static/js/admin/demo-bots.js";
import { roster } from "./helpers.mjs";

const STEP_MS = 1000 / 60;

/**
 * Closed loop with a laggy input path: the crew reads the live snapshot every sim step, but its masks only reach the
 * sim after a random 60..180 ms (pad throttle + WebSocket + relay), exactly the situation of the demo page.
 */
function play(sim, crew, { seconds = 90, seed = 3, lag = [60, 180] } = {}) {
  const rng = mulberry32(seed);
  const wire = [];
  const lastSent = new Map();
  const events = [];
  let lastAt = 0;
  let now = 0;
  for (; now < seconds * 1000; now += STEP_MS) {
    const snap = sim.snapshot();
    if (snap.cleared) break;
    for (const [id, mask] of crew.think(snap, now)) {
      if (lastSent.get(id) === mask) continue;
      lastSent.set(id, mask);
      lastAt = Math.max(lastAt, now + lag[0] + rng() * (lag[1] - lag[0])); // a WebSocket never reorders frames
      wire.push({ at: lastAt, id, mask });
    }
    while (wire.length && wire[0].at <= now) { const m = wire.shift(); sim.setInput(m.id, m.mask); }
    sim.step();
    events.push(...sim.drain());
  }
  return { seconds: now / 1000, snap: sim.snapshot(), events };
}

for (const n of [2, 4, 6]) {
  for (const level of [0, 1, 2, 3]) {
    test(`platformer level ${level + 1} is cleared by the live crew with ${n} players and lagging inputs`, () => {
      for (const lag of [[60, 180], [5, 40]]) {
        for (const seed of [1, 2, 3]) {
          const sim = createPlatformer({ level, roster: roster(n), seed: 7 });
          const out = play(sim, createPlatformerCrew(level), { seed, lag });
          assert.equal(out.snap.cleared, true, `lag ${lag} seed ${seed}: not cleared after ${out.seconds.toFixed(1)} s`);
          assert.ok(out.seconds < 60, `lag ${lag} seed ${seed}: took ${out.seconds.toFixed(1)} s`);
        }
      }
    });
  }
}

test("red light: the live crew crosses without being caught more than a couple of times", () => {
  for (const n of [2, 4]) {
    const sim = createRedLight({ roster: roster(n), seed: 11 });
    const out = play(sim, createRedLightCrew(), { seconds: 300 });
    assert.equal(out.snap.cleared, true, `n=${n}: not cleared after ${out.seconds.toFixed(1)} s`);
    const caught = out.events.filter((e) => e.type === "penalty").length;
    assert.ok(caught <= 2, `n=${n}: caught ${caught} times`);
  }
});

test("sahur bot taps only real prompts, in order, by an owner of that drum", () => {
  const view = {
    kind: "sahur_dice", phase: "input", epoch: 3, round: 2, rounds: 3, hits: [],
    seq: [{ drum: 1, trap: false }, { drum: 3, trap: true }, { drum: 0, trap: false }, { drum: 2, trap: false }],
    drums: [0, 1, 2, 3].map((id) => ({ id, owners: [["Ana", "Biel", "Carla", "Dani"][id]] })),
  };
  const bot = createSahurBot(() => 0.5);
  const taps = [];
  for (let now = 0; now < 30000 && view.hits.length < 3; now += 50) {
    const tap = bot.think(view, now);
    if (tap) { taps.push(tap); view.hits.push(tap.drum); }
  }
  assert.deepEqual(taps.map((t) => t.drum), [1, 0, 2], "the trap (drum 3) is never tapped");
  assert.deepEqual(taps.map((t) => t.name), ["Biel", "Ana", "Carla"]);
  assert.equal(bot.think({ ...view, phase: "show" }, 99999), null, "nobody taps while Sahur is playing");
});

test("shape counters walk each bot's own counter to the count of its shape on the TV field", () => {
  const tv = { kind: "shape_count", phase: "count", epoch: 2, shapes: [
    { kind: "star" }, { kind: "moon" }, { kind: "star" }, { kind: "circle" }, { kind: "star" }, { kind: "moon" }] };
  const seats = [
    { name: "Ana", view: { phase: "count", epoch: 2, shape: "star", answer: 0 } },
    { name: "Biel", view: { phase: "count", epoch: 2, shape: "moon", answer: 4 } },
  ];
  const bot = createShapeCounter(() => 0.5);
  assert.deepEqual(bot.think(tv, seats, 0), [], "the bots look at the field before tapping");
  for (let now = 0; now < 20000; now += 50) {
    for (const tap of bot.think(tv, seats, now)) seats.find((s) => s.name === tap.name).view.answer += tap.delta;
  }
  assert.deepEqual(seats.map((s) => s.view.answer), [3, 2]);
  assert.deepEqual(bot.think({ ...tv, phase: "pass" }, seats, 99999), [], "nobody taps outside the count");
});

test("trivia crew: one bot proposes, the rest follow, so everybody ends on the same option", () => {
  const tv = { kind: "backrooms_trivia", phase: "vote", epoch: 5 };
  const seats = ["Ana", "Biel", "Carla", "Dani"].map((name) => ({ name, view: { epoch: 5, mine: null } }));
  const crew = createTriviaCrew(() => 0.3);
  for (let now = 0; now < 15000; now += 100) {
    for (const v of crew.think(tv, seats, now)) seats.find((s) => s.name === v.name).view.mine = v.option;
  }
  const picks = new Set(seats.map((s) => s.view.mine));
  assert.equal(picks.size, 1);
  assert.ok([0, 1, 2, 3].includes([...picks][0]));
  assert.deepEqual(crew.think({ ...tv, phase: "reveal" }, seats, 20000), []);
});
