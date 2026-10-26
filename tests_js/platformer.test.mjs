import test from "node:test";
import assert from "node:assert/strict";
import { BIT } from "../static/js/sim/bits.js";
import { createSim, needFor, SOLID_SIDES, BODY_H, JUMP_V, GRAVITY } from "../static/puzzles/coop_platformer/sim.js";
import { LEVELS, parseLevel, W, H } from "../static/puzzles/coop_platformer/levels.js";
import { roster, run, botDriver, seconds } from "./helpers.mjs";

const { L, R, J } = BIT;
const SIZES = [2, 12];

// ---- scripted bots (they read the snapshot, like a player reads the screen) ---------------------------
const goR = (p, x) => (p.x < x ? R : 0);
const goL = (p, x) => (p.x > x ? L : 0);
const goTo = (p, x) => (Math.abs(p.x - x) < 0.06 ? 0 : p.x < x ? R : L);
// walk right, hopping the 3 tile pit of level 4 (columns 11-13) on the way
const walkR = (p, x) => {
  if (p.x >= x) return 0;
  return p.grounded && p.x > 9.9 && p.x < 10.2 ? R | J : R;
};
const pulse = (snap) => (snap.t % 6 < 3 ? J : 0);

const BOTS = [
  // 0 torre: p0 stands under the bell, p1 climbs on its shoulders and rings
  (snap, i) => {
    const [a, b] = snap.players;
    if (snap.doorOpen) return R;
    if (i === 0) return goTo(a, 15.9);
    if (i === 1) {
      if (b.support === a.id) return pulse(snap);
      return Math.abs(b.x - a.x) < 0.3 && a.grounded && Math.abs(a.x - 15.9) < 0.1 ? pulse(snap) : goTo(b, a.x);
    }
    return 0;
  },
  // 1 boton: exactly need(N) players stand on the button, the rest wait; then everyone walks to the door
  (snap, i, n) => {
    const p = snap.players[i];
    if (snap.gateOpen) return goR(p, 27.6);
    return i < needFor(n) ? goR(p, 10.1) : 0;
  },
  // 2 plataforma: everybody boards, rides, walks off to the door
  (snap, i) => {
    const p = snap.players[i];
    if (snap.plat.state === "right" || snap.plat.state === "back") return goR(p, 27.6);
    return goR(p, 9.0);
  },
  // 3 llave: p0 is the shoulder next to the shelf, p1 climbs, takes the key and opens the door
  (snap, i) => {
    const [a, b] = snap.players;
    const p = snap.players[i];
    if (i === 0) {
      const climberUp = (b.y < 12.3 && b.grounded) || snap.key.state !== "home";
      return climberUp || snap.doorOpen ? walkR(p, 27.6) : walkR(p, 17.0);
    }
    if (i === 1) {
      if (snap.key.state !== "home") return walkR(p, 27.6);
      if (b.y < 12.5 && b.grounded) return R; // up on the shelf: grab the key
      if (b.support === a.id) return pulse(snap);
      if (!b.grounded && b.x > 16.9 && b.y + 0.9 < 14.3 && a.grounded) return R; // in the air beside the shelf: lean in
      if (b.grounded && a.grounded && Math.abs(a.x - 17.05) < 0.15 && Math.abs(b.x - a.x) < 0.3) return pulse(snap);
      return walkR(b, 17.0);
    }
    return snap.key.state !== "home" || snap.doorOpen ? walkR(p, 27.6) : 0; // the crowd waits for the key
  },
];

for (const n of SIZES) {
  LEVELS.forEach((def, level) => {
    test(`level ${level + 1} (${def.title}) is cleared by the bot with ${n} players`, () => {
      const sim = createSim({ level, roster: roster(n), seed: 7 });
      const out = run(sim, botDriver(BOTS[level]), { maxSteps: seconds(90) });
      assert.equal(out.snap.cleared, true, `not cleared after ${(out.steps / 60).toFixed(1)} s`);
      assert.equal(out.events.filter((e) => e.type === "clear").length, 1, "clear is emitted exactly once");
      assert.ok(out.snap.players.every((p) => p.entered));
      assert.equal(out.events.filter((e) => e.type === "penalty").length, 0, "a clean run costs no brainrot");
    });
  });
}

test("level maps are 32x18 and parse with spawn, door and their gadget", () => {
  assert.equal(LEVELS.length, 4);
  for (const def of LEVELS) {
    assert.equal(def.rows.length, H);
    assert.ok(def.rows.every((r) => r.length === W));
    const m = parseLevel(def.rows);
    assert.ok(m.door && m.spawn.x1 - m.spawn.x0 === 6 && m.spawn.y === 16);
  }
  assert.ok(parseLevel(LEVELS[0].rows).bell && parseLevel(LEVELS[1].rows).button && parseLevel(LEVELS[1].rows).gate);
  assert.ok(parseLevel(LEVELS[2].rows).platform && parseLevel(LEVELS[3].rows).key);
  assert.equal(parseLevel(LEVELS[2].rows).platform.x1, 20);
});

test("need(N): half the players, at least 2, never more than N", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 11, 12].map(needFor), [1, 2, 2, 2, 3, 3, 6, 6]);
});

test("jump apex is ~2.46 tiles: a lone player misses the bell and the shelf", () => {
  assert.ok(Math.abs(JUMP_V - 17.7) < 1e-9 && GRAVITY === 60);
  const sim = createSim({ level: 0, roster: roster(1) });
  let minHead = Infinity;
  run(sim, (snap) => {
    const p = snap.players[0];
    minHead = Math.min(minHead, p.y);
    sim.setInput(p.id, goTo(p, 15.9) | pulse(snap));
  }, { maxSteps: seconds(20), done: () => false });
  const rise = 16 - BODY_H - minHead;
  assert.ok(rise > 2.3 && rise < 2.65, `rise ${rise}`);
  assert.equal(sim.snapshot().bellRung, false);
  assert.equal(sim.snapshot().doorOpen, false);
});

test("a lone player cannot reach the key shelf", () => {
  const sim = createSim({ level: 3, roster: roster(1) });
  let minFeet = Infinity;
  run(sim, (snap) => {
    const p = snap.players[0];
    minFeet = Math.min(minFeet, p.y + BODY_H);
    sim.setInput(p.id, p.x >= 17 ? pulse(snap) | R : walkR(p, 17.0));
  }, { maxSteps: seconds(30), done: () => false });
  const s = sim.snapshot();
  assert.ok(minFeet > 13.3, `feet reached ${minFeet}`);
  assert.equal(s.key.state, "home");
  assert.ok(s.players[0].y + BODY_H > 13.2);
});

test("a boosted climber reaches the shelf with margin (feet 12.64 < 13)", () => {
  const sim = createSim({ level: 3, roster: roster(2) });
  let minFeet = Infinity;
  run(sim, (snap, s) => {
    const b = snap.players[1];
    minFeet = Math.min(minFeet, b.y + BODY_H);
    botDriver(BOTS[3])(snap, s);
  }, { maxSteps: seconds(40), done: (s) => s.key.state !== "home" });
  assert.ok(minFeet < 12.8, `feet reached ${minFeet}`);
});

test("button below the weight threshold never opens the gate", () => {
  for (const n of SIZES) {
    const sim = createSim({ level: 1, roster: roster(n) });
    const need = needFor(n);
    run(sim, botDriver((snap, i) => (i < need - 1 ? goR(snap.players[i], 10.1) : 0)), { maxSteps: seconds(15), done: () => false });
    assert.equal(sim.snapshot().gateOpen, false, `n=${n}`);
    assert.ok(sim.snapshot().weight < need);
  }
});

test("gate needs the weight held for 1 s and then stays open (latch)", () => {
  const sim = createSim({ level: 1, roster: roster(2) });
  const drive = botDriver((snap, i) => goR(snap.players[i], 10.1));
  let atArrival = null;
  run(sim, (snap, s) => {
    drive(snap, s);
    if (atArrival === null && snap.weight >= 2) atArrival = snap.t;
  }, { maxSteps: seconds(8), done: (s) => s.gateOpen });
  const opened = sim.snapshot();
  assert.equal(opened.gateOpen, true);
  assert.ok(opened.t - atArrival >= 58, `held ${opened.t - atArrival} steps`);
  // everybody steps off the button: the gate stays open
  run(sim, botDriver((snap, i) => goL(snap.players[i], 5)), { maxSteps: seconds(4), done: () => false });
  assert.equal(sim.snapshot().gateOpen, true);
});

test("falling into the pit respawns only that player and reports a fall penalty", () => {
  const sim = createSim({ level: 3, roster: roster(3) });
  const out = run(sim, botDriver((snap, i) => (i === 0 ? R : 0)), { maxSteps: seconds(8), done: () => false });
  const falls = out.events.filter((e) => e.type === "penalty");
  assert.ok(falls.length >= 1);
  assert.equal(falls[0].id, "p0");
  assert.equal(falls[0].why, "fall");
  const others = out.snap.players.slice(1);
  assert.ok(others.every((p) => p.grounded && p.y > 15 && p.x < 9));
});

test("the key goes home when its carrier leaves", () => {
  const sim2 = createSim({ level: 3, roster: roster(2) });
  run(sim2, botDriver(BOTS[3]), { maxSteps: seconds(40), done: (s) => s.key.state === "held" });
  assert.equal(sim2.snapshot().key.state, "held");
  sim2.setRoster([{ id: "p0", name: "x" }]);
  assert.equal(sim2.snapshot().key.state, "home");
});

test("roster shrinks mid level: threshold is recomputed and the room still clears", () => {
  const sim = createSim({ level: 1, roster: roster(12) });
  const bot = botDriver(BOTS[1]);
  let cut = false;
  const out = run(sim, (snap, s) => {
    if (!cut && snap.weight >= 1) {
      cut = true;
      s.setRoster(roster(12).filter((_, i) => i < 4)); // 12 -> 4: need 6 -> 2
    }
    bot(snap, s);
  }, { maxSteps: seconds(60) });
  assert.equal(cut, true);
  assert.equal(out.snap.cleared, true);
  assert.equal(out.snap.players.length, 4);
});

test("roster grows mid level: newcomers must also get through the door", () => {
  const sim = createSim({ level: 1, roster: roster(2) });
  const bot = botDriver(BOTS[1]);
  let grown = false;
  const out = run(sim, (snap, s) => {
    if (!grown && snap.t === 30) { grown = true; s.setRoster(roster(8)); } // need 2 -> 4
    bot(snap, s);
  }, { maxSteps: seconds(90) });
  assert.equal(out.snap.cleared, true);
  assert.equal(out.snap.players.length, 8);
  assert.ok(out.snap.players.every((p) => p.entered));
});

test("roster change on the platform level: leaving players never blocks the departure", () => {
  const sim = createSim({ level: 2, roster: roster(6) });
  const bot = botDriver(BOTS[2]);
  let cut = false;
  const out = run(sim, (snap, s) => {
    if (!cut && snap.t === 20) { cut = true; s.setRoster(roster(6).slice(0, 3)); }
    bot(snap, s);
  }, { maxSteps: seconds(60) });
  assert.equal(out.snap.cleared, true);
});

test("level 3: the platform waits for the last straggler", () => {
  const sim = createSim({ level: 2, roster: roster(3) });
  const out = run(sim, botDriver((snap, i) => (i === 2 ? 0 : goR(snap.players[i], 9.0))), { maxSteps: seconds(6), done: () => false });
  assert.equal(out.snap.plat.state, "wait");
  assert.equal(out.snap.plat.x, 8);
});

test("level 3: the platform comes back for the ones left behind", () => {
  const sim = createSim({ level: 2, roster: roster(3) });
  // p2 never boards; p0/p1 would leave only if p2 were aboard, so force the trip with a 1 player roster first
  sim.setRoster(roster(3).slice(0, 2));
  run(sim, botDriver((snap, i) => goR(snap.players[i], 9.0)), { maxSteps: seconds(8), done: (s) => s.plat.state === "right" });
  assert.equal(sim.snapshot().plat.state, "right");
  // a newcomer spawns on the left while the platform is across: after 1.5 s of an empty platform it returns
  sim.setRoster(roster(3));
  const riders = ["p0", "p1"];
  run(sim, (snap, s) => {
    for (const p of snap.players) s.setInput(p.id, riders.includes(p.id) ? goR(p, 24.5) : 0);
  }, { maxSteps: seconds(12), done: (s) => s.plat.state === "back" || s.plat.state === "wait" });
  assert.ok(["back", "wait"].includes(sim.snapshot().plat.state));
});

test("stacked players are carried by the one below", () => {
  const sim = createSim({ level: 0, roster: roster(2) });
  const drive = (snap, s) => {
    const [a, b] = snap.players;
    s.setInput(a.id, snap.t < 200 ? goTo(a, 10) : snap.t < 330 ? R : 0);
    if (b.support === a.id) s.setInput(b.id, 0);
    else s.setInput(b.id, Math.abs(b.x - a.x) < 0.3 && a.grounded && Math.abs(a.x - 10) < 0.1 ? pulse(snap) : goTo(b, a.x));
  };
  run(sim, drive, { maxSteps: 215, done: () => false });
  const mid = sim.snapshot();
  assert.equal(mid.players[1].support, "p0");
  const bx = mid.players[1].x;
  run(sim, drive, { maxSteps: 60, done: () => false });
  const end = sim.snapshot();
  assert.equal(end.players[1].support, "p0");
  assert.ok(end.players[1].x - bx > 2, "the rider travels with its supporter");
  assert.ok(Math.abs((end.players[1].x - end.players[0].x) - (mid.players[1].x - mid.players[0].x)) < 0.01, "constant offset");
});

test("SOLID_SIDES flag: off lets players pass through, on makes them block (never push)", () => {
  assert.equal(SOLID_SIDES, false);
  const run2 = (solidSides) => {
    const sim = createSim({ level: 0, roster: roster(2), solidSides });
    run(sim, (snap, s) => { s.setInput("p0", R); s.setInput("p1", 0); }, { maxSteps: seconds(1), done: () => false });
    return sim.snapshot().players;
  };
  const [pass0, pass1] = run2(false);
  assert.ok(pass0.x > pass1.x, "passed through");
  const [blk0, blk1] = run2(true);
  assert.ok(blk0.x < blk1.x, "blocked by the other");
  assert.ok(Math.abs(blk1.x - 2.9) < 1e-6, "the blocked one is not pushed");
});

test("determinism: same inputs give the same snapshot hash, different roster size does not", () => {
  const go = (n) => run(createSim({ level: 3, roster: roster(n), seed: 5 }), botDriver(BOTS[3]), { maxSteps: seconds(90) });
  const a = go(5);
  const b = go(5);
  assert.equal(a.hash, b.hash);
  assert.equal(a.steps, b.steps);
  assert.notEqual(a.hash, go(6).hash);
});

test("players beyond the 12th still work (colour wraps, no crash)", () => {
  const sim = createSim({ level: 1, roster: roster(14) });
  for (let i = 0; i < 120; i++) sim.step();
  assert.equal(sim.snapshot().players.length, 14);
});
