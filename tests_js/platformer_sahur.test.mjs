// Room 6: Sahur's scrolling platformer levels (same engine as Room 1, plus the camera, the leash, drums, small
// buttons, lifts, lanterns and Sahur's chase).
import test from "node:test";
import assert from "node:assert/strict";
import { createSim, BODY_W, BODY_H, LEASH } from "../static/puzzles/coop_platformer/sim.js";
import { LEVEL_SETS, LEVELS, VIEW_W, H, levelsOf, parseLevel } from "../static/puzzles/coop_platformer/levels.js";
import { roster, run, botDriver, seconds } from "./helpers.mjs";
import { R, BOTS, goTo, pulse, run as walk } from "./sahur_bots.mjs";

const SET = "sahur";
const SAHUR = LEVEL_SETS.sahur;
const SIZES = [2, 12];
const sahur = (level, n) => createSim({ level, set: SET, roster: roster(n), seed: 7 });
const penalties = (out) => out.events.filter((e) => e.type === "penalty");
/** Step with `driver` until the first penalty; returns it and the snapshot right after it (or nulls). */
function untilPenalty(sim, driver, maxSteps) {
  for (let i = 0; i < maxSteps; i++) {
    driver(sim.snapshot());
    sim.step();
    const hit = sim.drain().find((e) => e.type === "penalty");
    if (hit) return { hit, snap: sim.snapshot() };
  }
  return { hit: null, snap: sim.snapshot() };
}
const onScreen = (snap) => snap.players.every((p) => p.entered || (p.x >= snap.cam - 1e-9 && p.x + BODY_W <= snap.cam + VIEW_W + 1e-9));

for (const n of SIZES) {
  SAHUR.forEach((def, level) => {
    test(`sahur level ${level + 1} (${def.title}) is cleared by the bot with ${n} players, everybody always on screen`, () => {
      const sim = sahur(level, n);
      const bot = botDriver(BOTS[level](sim.level));
      let offScreen = 0;
      const out = run(sim, (snap, s) => { if (!onScreen(snap)) offScreen++; bot(snap, s); }, { maxSteps: seconds(300) });
      assert.equal(out.snap.cleared, true, `not cleared after ${(out.steps / 60).toFixed(1)} s`);
      assert.equal(out.events.filter((e) => e.type === "clear").length, 1, "clear is emitted exactly once");
      assert.ok(out.snap.players.every((p) => p.entered));
      assert.equal(penalties(out).length, 0, "a clean run costs no brainrot");
      assert.equal(offScreen, 0, "the camera and the leash keep the whole group in view");
      assert.ok(out.snap.lanterns.every(Boolean), "every lantern on the way lights up");
    });
  });
}

test("the sahur set has five long levels and Room 1 keeps its four single screens", () => {
  assert.equal(SAHUR.length, 5);
  assert.equal(LEVELS, LEVEL_SETS.nivel0);
  assert.equal(levelsOf("sahur"), SAHUR);
  assert.equal(levelsOf("nope"), LEVELS, "an unknown set falls back to Room 1");
  for (const def of SAHUR) {
    const m = parseLevel(def.rows);
    assert.equal(def.rows.length, H);
    assert.ok(m.scroll && m.w >= 85 && m.w <= 120, `${def.id}: ${m.w} wide`);
    assert.ok(m.door && m.spawn.x1 - m.spawn.x0 === 6 && m.spawn.y === 16);
  }
  for (const def of LEVELS) assert.equal(parseLevel(def.rows).scroll, false);
  const [tung, mercado, tejados, tambores, huida] = SAHUR.map((d) => parseLevel(d.rows));
  assert.ok(tung.bells.length === 3 && tung.drums.length >= 2 && tung.lanterns.length === 1);
  assert.deepEqual(mercado.buttons.map((b) => [b.kind, mercado.gates[b.gate].kind]), [["heavy", "heavy"], ["small", "small"], ["small", "small"]]);
  assert.equal(mercado.buttons[1].gate, mercado.buttons[2].gate, "both small buttons open the gate between them");
  assert.deepEqual(tejados.platforms.map((p) => p.kind), ["lift", "ferry"]);
  assert.ok(tejados.key && tambores.bells.length === 2 && tambores.drums.length >= 7 && tambores.button);
  assert.ok(huida.key && huida.platforms[0].kind === "lift" && SAHUR[4].chase > 0);
});

test("Room 1 never scrolls and has no leash", () => {
  const sim = createSim({ level: 0, roster: roster(2) });
  let cams = new Set();
  run(sim, (snap) => {
    cams.add(snap.cam);
    sim.setInput("p0", R);
    sim.setInput("p1", goTo(snap.players[1], 1.0));
  }, { maxSteps: seconds(6), done: () => false });
  const [a, b] = sim.snapshot().players;
  assert.deepEqual([...cams], [1]);
  assert.ok(a.x - b.x > LEASH + 1, `spread ${a.x - b.x}`);
});

test("the leash stops the one who runs ahead, without pushing anybody", () => {
  const sim = sahur(0, 2);
  const out = run(sim, (snap) => {
    sim.setInput("p0", walk(snap.players[0], 80, [[12.4, 13.0]]));
    sim.setInput("p1", 0);
  }, { maxSteps: seconds(10), done: () => false });
  const [a, b] = out.snap.players;
  assert.equal(penalties(out).length, 0);
  assert.ok(Math.abs(a.x - (b.x + LEASH)) < 0.02, `stopped at ${a.x}, the other at ${b.x}`);
  assert.ok(Math.abs(b.x - 2.9) < 1e-9, "the one left behind never moved");
  assert.ok(onScreen(out.snap));
});

test("a drum throws you ~5 tiles up: alone, over the 4-high wall that a jump never climbs", () => {
  const sim = sahur(0, 1);
  let minFeet = Infinity;
  const out = run(sim, (snap) => {
    const p = snap.players[0];
    if (p.x > 20 && p.x < 26) minFeet = Math.min(minFeet, p.y + BODY_H);
    sim.setInput("p0", walk(p, 33, [[12.4, 13.0]]));
  }, { maxSteps: seconds(8), done: () => false });
  assert.equal(penalties(out).length, 0);
  assert.ok(out.snap.players[0].x > 32.9, "over the wall and down the other side");
  assert.ok(minFeet < 11 && minFeet > 10.6, `feet reached ${minFeet}`);
});

test("the last bell of level 1 rings only bouncing still under it, not running over the drum", () => {
  const sim = sahur(0, 1);
  const lv = sim.level;
  run(sim, (snap) => sim.setInput("p0", walk(snap.players[0], 74, [[12.4, 13.0]])), { maxSteps: seconds(14), done: (s) => s.players[0].x > 73.9 });
  assert.deepEqual(sim.snapshot().bells, [false, false, false], "alone, no tower bells and no drum bell on the run");
  run(sim, (snap) => sim.setInput("p0", goTo(snap.players[0], lv.bells[2].x + 0.6)), { maxSteps: seconds(6), done: (s) => s.bells[2] });
  assert.equal(sim.snapshot().bells[2], true);
});

test("small buttons: their gate is open only while pressed, and never shuts on a player inside it", () => {
  const sim = sahur(1, 2);
  const lv = sim.level;
  const heavy = lv.buttons[0];
  const near = lv.buttons[1];
  const gate = lv.gates[near.gate];
  const hops = [[21.3, 22.1]];
  run(sim, botDriver((snap, i) => goTo(snap.players[i], heavy.x + 0.6)), { maxSteps: seconds(6), done: (s) => s.gates[0] });
  const drive = (fa, fb, secs, done = () => false) =>
    run(sim, (snap) => { sim.setInput("p0", fa(snap.players[0])); sim.setInput("p1", fb(snap.players[1])); }, { maxSteps: seconds(secs), done });
  drive((p) => walk(p, near.x + 0.1, hops), (p) => walk(p, gate.x - 2, hops), 8);
  assert.equal(sim.snapshot().gates[near.gate], true, "open while p0 stands on its button");
  drive(() => 0, (p) => goTo(p, gate.x - 0.4), 2);           // p1 stops inside the gate
  drive((p) => goTo(p, near.x - 4), () => 0, 2);              // p0 steps off
  assert.equal(sim.snapshot().gates[near.gate], true, "it does not close on p1");
  drive(() => 0, (p) => goTo(p, gate.x - 2), 2);              // p1 steps back out
  assert.equal(sim.snapshot().gates[near.gate], false, "and shuts once nobody holds it");
});

test("the lift waits for the last straggler, then takes everybody up", () => {
  const sim = sahur(2, 3);
  const lift = sim.level.platforms[0];
  run(sim, botDriver((snap, i) => (i === 2 ? 0 : goTo(snap.players[i], lift.x + 1))), { maxSteps: seconds(5), done: () => false });
  assert.deepEqual([sim.snapshot().plats[0].state, sim.snapshot().plats[0].y], ["wait", lift.y0]);
  run(sim, botDriver((snap, i) => goTo(snap.players[i], lift.x + 1)), { maxSteps: seconds(8), done: (s) => s.plats[0].state === "right" });
  assert.equal(sim.snapshot().plats[0].y, lift.y1);
  assert.ok(sim.snapshot().players.every((p) => p.support === "plat" && Math.abs(p.y + BODY_H - lift.y1) < 1e-6));
});

test("a fall into the pit sends the whole group back to the start, the ones already past it too", () => {
  const sim = sahur(0, 3);
  const start = sim.snapshot().players.map((p) => p.x);
  const { hit, snap } = untilPenalty(sim, (s) => {
    sim.setInput("p0", s.t > 90 ? R : 0); // p0 waits, then runs straight into the pit (columns 14-15)
    sim.setInput("p1", goTo(s.players[1], 10));
    sim.setInput("p2", goTo(s.players[2], 11));
  }, seconds(6));
  assert.deepEqual([hit.id, hit.why], ["p0", "fall"]);
  snap.players.forEach((p, i) => assert.ok(Math.abs(p.x - start[i]) < 0.2, `${p.id} back at ${p.x}, started at ${start[i]}`));
  assert.equal(snap.cam, 1, "the view is back at the start: nobody off-screen");
});

test("past a lantern, spikes still restart everybody and the lanterns go out", () => {
  const sim = sahur(3, 2); // the drum chain
  run(sim, botDriver(BOTS[3](sim.level)), { maxSteps: seconds(60), done: (s) => s.lanterns[0] });
  const { hit, snap } = untilPenalty(sim, (s) => sim.setInput("p0", goTo(s.players[0], 24)), seconds(6)); // back to the spikes
  assert.equal(hit.why, "spikes");
  assert.deepEqual(snap.lanterns, sim.level.lanterns.map(() => false));
  const { spawn } = sim.level;
  assert.ok(snap.players.every((p) => p.x >= spawn.x0 - 1e-9 && p.x <= spawn.x1), "both back at the start");
});

test("spikes count under your middle: an edge over them is safe, the middle is not", () => {
  const sim = sahur(1, 1);
  const spike = sim.level.spikes[0].x; // 23
  let out = run(sim, (snap) => sim.setInput("p0", goTo(snap.players[0], spike - BODY_W / 2 - 0.1)), { maxSteps: seconds(4), done: () => false });
  assert.equal(penalties(out).length, 0);
  out = run(sim, (snap) => sim.setInput("p0", goTo(snap.players[0], spike - BODY_W / 2 + 0.2)), { maxSteps: seconds(1), done: () => false });
  assert.equal(penalties(out)[0].why, "spikes");
});

test("alone, nobody reaches the key on the eave of level 3", () => {
  const sim = sahur(2, 1);
  const bot = BOTS[2](sim.level);
  run(sim, (snap) => sim.setInput("p0", bot(snap, 0)), { maxSteps: seconds(40), done: (s) => s.players[0].x > 74.4 });
  assert.ok(sim.snapshot().players[0].x > 74.4, "the lift and the ferry carry a lone player too");
  for (const x of [84.05, 85.2, 86.1, 87.4]) {
    run(sim, (snap) => {
      const p = snap.players[0];
      sim.setInput("p0", Math.abs(p.x - x) > 0.1 ? goTo(p, x) : pulse(snap));
    }, { maxSteps: seconds(3), done: () => false });
    assert.equal(sim.snapshot().key.state, "home", `jumping at ${x}`);
  }
});

test("taking the key wakes Sahur: one caught and the whole group starts the level over, everything reset", () => {
  const sim = sahur(4, 3);
  const fresh = sahur(4, 3).snapshot();
  assert.equal(sim.snapshot().chase.on, false, "asleep until the key moves");
  const before = run(sim, botDriver(BOTS[4](sim.level)), { maxSteps: seconds(60), done: (s) => s.key.state === "held" });
  assert.ok(before.events.some((e) => e.kind === "alarm"));
  assert.equal(sim.snapshot().chase.on, true);
  assert.ok(sim.snapshot().gates.some(Boolean) && sim.snapshot().lanterns.some(Boolean), "the run got somewhere");
  const holder = sim.snapshot().key.holder;
  const { hit, snap } = untilPenalty(sim, (s) => {
    for (const p of s.players) sim.setInput(p.id, p.id === holder ? walk(p, 100, [[63.3, 64.1], [69.3, 70.1], [89.3, 90.1]]) : 0);
  }, seconds(30));
  assert.equal(hit.why, "sahur");
  assert.notEqual(hit.id, holder, "the one standing still is caught");
  const { spawn } = sim.level;
  for (const p of snap.players) {
    assert.ok(!p.entered && p.x >= spawn.x0 - 1e-9 && p.x <= spawn.x1, `${p.id} back at the start, at ${p.x}`);
  }
  assert.deepEqual([snap.key.state, snap.key.holder, snap.chase.on, snap.doorOpen], ["home", null, false, false]);
  assert.deepEqual([snap.gates, snap.lanterns, snap.cam], [fresh.gates, fresh.lanterns, fresh.cam]);
  assert.deepEqual(snap.plats.map((p) => [p.x, p.y, p.state]), fresh.plats.map((p) => [p.x, p.y, p.state]));
});

test("every Sahur level restarts the whole group on a death; Room 1 sends back only the one who fell", () => {
  assert.ok(SAHUR.every((d) => d.restart) && LEVELS.every((d) => !d.restart));
});

test("a newcomer on a scrolling level joins the group instead of the start", () => {
  const sim = sahur(0, 2);
  run(sim, botDriver(BOTS[0](sim.level)), { maxSteps: seconds(30), done: (s) => s.players.every((p) => p.x > 38 && p.grounded && p.support === null) });
  sim.setRoster(roster(3));
  const s = sim.snapshot();
  const rear = Math.min(s.players[0].x, s.players[1].x);
  assert.ok(Math.abs(s.players[2].x - rear) < 1e-9, `joined at ${s.players[2].x}`);
});

test("leaving players never strand Sahur's chase: the key goes home and he sleeps again", () => {
  const sim = sahur(4, 3);
  run(sim, botDriver(BOTS[4](sim.level)), { maxSteps: seconds(60), done: (s) => s.key.state === "held" });
  const holder = sim.snapshot().key.holder;
  sim.step();
  assert.equal(sim.snapshot().chase.on, true);
  sim.setRoster(roster(3).filter((p) => p.id !== holder));
  assert.deepEqual([sim.snapshot().key.state, sim.snapshot().chase.on], ["home", false]);
});
