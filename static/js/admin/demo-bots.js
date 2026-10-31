// Demo autopilot brains. Pure ES module (no DOM, no globals, no clock of its own): every function gets the
// TV's current snapshot/view and a `now` in ms, and answers with what each bot "presses". demo.js turns those
// answers into real pad masks / button presses on the phones; tests_js/demo_bots.test.mjs replays them
// against the real sims with a laggy input path, so the bots are closed-loop (they never see the future).
import { BIT } from "../sim/bits.js";

const { L, R, J, A } = BIT;
const RUN = 7;          // tiles per second (coop_platformer RUN)
const SETTLE_MS = 260;  // after a walking pulse: wait for the new position to show up before measuring again
const HOP_FROM = 9.9;   // level 4: start hopping the 3-tile pit from here (a jump from x < 9.1 lands short)...
const HOP_UNTIL = 10.95; // ...as long as the floor of the near side is still under the feet

const pulse = (now, period = 260) => (Math.floor(now / (period / 2)) % 2 === 0 ? J : 0);

/** Small stable hash -> [0, 1): gives every bot its own "human" reaction time. */
function unit(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return (x % 1000) / 1000;
}

/** Walk to x with timed pulses (a laggy loop cannot steer by bang-bang without oscillating). */
function makeWalker() {
  const w = { mask: 0, until: 0, settle: 0 };
  w.to = (p, tx, now, tol = 0.2) => {
    if (now < w.until) return w.mask;
    if (now < w.settle) return 0;
    const err = tx - p.x;
    if (Math.abs(err) <= tol) return 0;
    w.mask = err > 0 ? R : L;
    w.until = now + (Math.abs(err) / RUN) * 1000;
    w.settle = w.until + SETTLE_MS;
    return w.mask;
  };
  w.idle = (now) => now >= w.until && now >= w.settle;
  return w;
}

/**
 * Level strategies for Room 1 (same ideas as the scripted bots of tests_js/platformer.test.mjs).
 * `think(snap, now)` -> Map(playerId -> mask).  Index 0 / 1 of the roster are the "shoulder" / "climber".
 */
export function createPlatformerCrew(level) {
  const walkers = new Map();
  const walker = (id) => { if (!walkers.has(id)) walkers.set(id, makeWalker()); return walkers.get(id); };
  let climb = null; // level 4: start of the current jump from the shoulders
  const taps = new Map();
  // one short jump press, then a pause long enough to land before pressing again
  const tap = (id, now) => {
    const t = taps.get(id) || { until: 0, cool: 0 };
    taps.set(id, t);
    if (now < t.until) return J;
    if (now < t.cool) return 0;
    t.until = now + 110; t.cool = now + 800;
    return J;
  };

  // Hop over the pit of level 4 while heading right. Returns null once the player is past it.
  const pitHop = (p) => {
    if (p.x < HOP_FROM) return R;
    if (p.x < HOP_UNTIL && p.grounded) return R | J;
    return null;
  };
  const toDoor = (p) => pitHop(p) ?? R;

  const levels = [
    // 0 torre: the first bot waits under the bell, the second climbs on its shoulders and rings
    (snap, now, out) => {
      const [a, b] = snap.players;
      const BELL_X = 16.2; // the bell hangs at column 16
      snap.players.forEach((p) => out.set(p.id, snap.doorOpen ? R : 0));
      if (snap.doorOpen) return;
      out.set(a.id, walker(a.id).to(a, BELL_X, now, 0.15));
      if (!b) return;
      const aReady = Math.abs(a.x - BELL_X) < 0.45 && a.grounded && walker(a.id).idle(now);
      if (b.support === a.id) out.set(b.id, pulse(now));
      else if (aReady && Math.abs(b.x - a.x) < 0.3 && b.grounded) out.set(b.id, pulse(now));
      else if (aReady) out.set(b.id, walker(b.id).to(b, a.x, now, 0.12));
    },
    // 1 boton: exactly need(N) bots stand on the button, the others wait; then everybody walks to the door
    (snap, now, out) => {
      snap.players.forEach((p, i) => {
        if (snap.gateOpen) out.set(p.id, R);
        else out.set(p.id, i < snap.need ? walker(p.id).to(p, 10.2, now, 0.35) : 0);
      });
    },
    // 2 plataforma: everybody boards, rides across, walks off to the door
    (snap, now, out) => {
      const across = snap.plat.state === "right" || snap.plat.state === "back";
      // once aboard, stand still: the platform carries the riders (walking "back to 9.2" would step off it)
      snap.players.forEach((p) => out.set(p.id, across ? R : p.x < 8.8 ? walker(p.id).to(p, 9.4, now, 0.3) : 0));
    },
    // 3 llave: shoulder + climber fetch the key from the shelf; the crowd waits for it, then everybody crosses
    (snap, now, out) => {
      const [a, b] = snap.players;
      const keyTaken = snap.key.state !== "home";
      const SHOULDER_X = 17.1;
      snap.players.forEach((p) => out.set(p.id, keyTaken || snap.doorOpen ? toDoor(p) : 0));
      if (keyTaken || snap.doorOpen) return;
      const aw = walker(a.id);
      const climberUp = b && b.y < 12.3 && b.grounded;
      if (climberUp) out.set(a.id, toDoor(a));
      else out.set(a.id, pitHop(a) ?? aw.to(a, SHOULDER_X, now, 0.15));
      if (!b) return;
      const aReady = Math.abs(a.x - SHOULDER_X) < 0.4 && a.grounded && aw.idle(now);
      // The jump from the shoulders is a timed script: jump now, lean right ~150 ms later. The wall of the shelf holds the
      // climber back until it is above the edge, so leaning early is harmless, but a lean that arrives AFTER the landing
      // would push it off the shoulders (that is what steering from the live position did under input lag).
      if (b.support === a.id && (!climb || now > climb.t0 + 1000)) climb = { t0: now };
      const t = climb ? now - climb.t0 : Infinity;
      if (b.y < 12.5 && b.grounded) out.set(b.id, R);                                      // on the shelf: take the key
      else if (t < 520) out.set(b.id, t < 110 ? J : t < 150 ? 0 : R);                       // jump from the shoulders + lean in
      else if (aReady && b.x > 12 && b.grounded && Math.abs(b.x - a.x) < 0.3) out.set(b.id, tap(b.id, now)); // hop onto the shoulders
      else if (b.x < 12 || b.x > 20) out.set(b.id, pitHop(b) ?? walker(b.id).to(b, 16.0, now, 0.3));
      else if (aReady) out.set(b.id, walker(b.id).to(b, a.x, now, 0.12));
    },
  ];

  return {
    think(snap, now) {
      const out = new Map();
      const fn = levels[level];
      if (fn && snap && snap.players.length) fn(snap, now, out);
      return out;
    },
  };
}

/** Room 2: swim while Tralalero looks away, stop when he starts to turn; finishers distract him for the rest. */
export function createRedLightCrew() {
  const warnSince = new Map(); // player -> when this bot noticed the warning
  let lastPhase = "";
  return {
    think(snap, now) {
      const out = new Map();
      if (snap.phase !== lastPhase) { lastPhase = snap.phase; warnSince.clear(); }
      const someoneBehind = snap.players.some((p) => !p.done);
      for (const p of snap.players) {
        if (p.done) { out.set(p.id, someoneBehind ? A : 0); continue; }
        if (snap.phase === "green") { out.set(p.id, R); continue; }
        if (snap.phase === "warning") {
          if (!warnSince.has(p.id)) warnSince.set(p.id, now);
          const reaction = 160 + unit(p.id) * 260; // 160..420 ms, like a person who sees the cue
          out.set(p.id, now - warnSince.get(p.id) < reaction ? R : 0);
          continue;
        }
        out.set(p.id, 0); // red: frozen
      }
      return out;
    },
  };
}

/**
 * Room 3: every bot counts its own shape on the TV field and walks its counter there one tap at a time, after a
 * human-like look at the field. `seats` = [{ name, view }] with each bot's OWN phone view (its shape and counter).
 * `think(tvView, seats, now)` -> [{ name, delta }].
 */
export function createShapeCounter(random = Math.random) {
  const bots = new Map(); // name -> { epoch, nextAt }
  return {
    think(tv, seats, now) {
      const out = [];
      if (!tv || tv.phase !== "count" || !Array.isArray(tv.shapes)) return out;
      for (const { name, view } of seats) {
        if (!view || view.phase !== "count" || !view.shape || view.epoch !== tv.epoch) continue;
        let b = bots.get(name);
        if (!b || b.epoch !== tv.epoch) { b = { epoch: tv.epoch, nextAt: now + 2500 + random() * 3000 }; bots.set(name, b); }
        if (now < b.nextAt) continue;
        const target = tv.shapes.filter((s) => s.kind === view.shape).length;
        if (view.answer === target) continue;
        out.push({ name, delta: view.answer < target ? 1 : -1 });
        b.nextAt = now + 260 + random() * 220;
      }
      return out;
    },
  };
}

/**
 * Room 4: the bots do not know the answers (the TV never has them). The first seat proposes an option after a while
 * and the rest follow it, so the group agrees and the answer goes in. `think(tvView, seats, now)` -> [{ name, option }].
 */
export function createTriviaCrew(random = Math.random) {
  const st = { epoch: null, pick: 0, at: new Map() };
  return {
    think(tv, seats, now) {
      const out = [];
      if (!tv || tv.phase !== "vote") return out;
      if (st.epoch !== tv.epoch) {
        st.epoch = tv.epoch;
        st.pick = Math.floor(random() * 4);
        st.at = new Map(seats.map((s, i) => [s.name, now + (i === 0 ? 2500 : 3500 + i * 700) + random() * 900]));
      }
      for (const { name, view } of seats) {
        if (!view || view.epoch !== tv.epoch || view.mine === st.pick) continue;
        const at = st.at.get(name);
        if (at !== undefined && now < at) continue;
        out.push({ name, option: st.pick });
        st.at.set(name, now + 1500); // the vote got lost: try again later
      }
      return out;
    },
  };
}

/**
 * Room 6: reads the TV view (sequence with its trap flags) and, in the input phase, makes the owner of the next
 * real prompt tap its drum after a human-like pause. Trap prompts are skipped: nobody taps them.
 * `think(view, now)` -> null | { name, drum }.
 */
export function createSahurBot(random = Math.random) {
  const st = { key: "", fireAt: 0, fired: false };
  return {
    think(view, now) {
      if (!view || view.phase !== "input" || !Array.isArray(view.seq)) { st.key = ""; return null; }
      const expected = view.seq.filter((s) => !s.trap).map((s) => s.drum);
      const pos = view.hits.length;
      if (pos >= expected.length) return null;
      const key = `${view.epoch}:${pos}`;
      if (st.key !== key) { st.key = key; st.fired = false; st.fireAt = now + (pos === 0 ? 600 : 350) + random() * 500; }
      if (st.fired && now > st.fireAt + 4000) st.fired = false; // the tap got lost: try again
      if (st.fired || now < st.fireAt) return null;
      st.fired = true;
      const drum = expected[pos];
      const owners = (view.drums.find((d) => d.id === drum) || { owners: [] }).owners;
      return owners.length ? { name: owners[Math.floor(random() * owners.length)], drum } : null;
    },
  };
}
