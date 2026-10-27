// Room 2 "Un, dos, tres... ¡Tralalero!" rules. Pure deterministic ES module: no DOM, no globals, fixed 1/60 step.
// Everybody swims along their own lane while Tralalero looks away. A cue (warning, then red) makes him turn:
// whoever still swims after the grace window is caught and goes back to the start. Players who arrived
// (finishers) can never be caught and may distract him, with one cooldown shared by all of them.
import { FIXED_DT, ms2steps, mulberry32 } from "../../js/sim/loop.js";
import { BIT, has, clean } from "../../js/sim/bits.js";

export const LANE_LEN = 100;
export const SWIM = 3;                // units per second: ~33 s of pure swimming per lane (the room lasts minutes, not seconds)
export const WARNING_MS = 1000;
export const GRACE_MS = 300;          // after "red" a swimmer still gets this long to stop (18 steps)
export const GREEN_MS = [1500, 4000];
export const RED_MS = [1500, 3000];
export const FAKE_CHANCE = 0.3;
export const MAX_FAKES_IN_A_ROW = 2;
export const DISTRACT_COOLDOWN_MS = 6000; // shared by every finisher
export const DISTRACT_DELAY_MS = 300;
export const DISTRACT_MS = 2000;          // while distracted, "red" catches nobody

const WARNING_STEPS = ms2steps(WARNING_MS);
const GRACE_STEPS = ms2steps(GRACE_MS);
const COOLDOWN_STEPS = ms2steps(DISTRACT_COOLDOWN_MS);
const DELAY_STEPS = ms2steps(DISTRACT_DELAY_MS);
const DISTRACT_STEPS = ms2steps(DISTRACT_MS);

/** A swimmer holds any direction/jump button; A is reserved for the distraction of finishers. */
const swims = (mask) => (mask & (BIT.L | BIT.R | BIT.J)) !== 0;

/**
 * @param {{roster?:Array<{id:string,name?:string,color?:string}>, seed?:number}} opts
 */
export function createSim({ roster = [], seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const between = ([a, b]) => ms2steps(a + rng() * (b - a));
  const players = [];                 // current roster, lane order
  const away = new Map();             // disconnected players keep x/done until they come back
  const masks = new Map();
  let events = [];
  let tick = 0;
  let cleared = false;
  const cue = { phase: "green", left: between(GREEN_MS), fake: false, fakes: 0, grace: 0 };
  const distract = { cooldown: 0, pending: 0, active: 0 };

  const emit = (e) => events.push(e);
  const makePlayer = (p) => ({ id: p.id, name: p.name || "", color: p.color || "#888888", x: 0, done: false, frozen: false, swimming: false });

  function setRoster(list) {
    for (const p of players) if (!list.some((q) => q.id === p.id)) { away.set(p.id, p); masks.delete(p.id); }
    const next = list.map((q) => {
      const old = players.find((p) => p.id === q.id) || away.get(q.id);
      away.delete(q.id);
      if (old) { old.name = q.name || old.name; old.color = q.color || old.color; return old; }
      return makePlayer(q);
    });
    players.length = 0;
    players.push(...next);
  }

  function setPhase(phase, steps, kind) {
    cue.phase = phase;
    cue.left = steps;
    if (kind) emit({ type: "fx", to: "all", kind });
  }

  function advanceCue() {
    cue.left -= 1;
    if (cue.left > 0) return;
    if (cue.phase === "green") {
      cue.fake = cue.fakes < MAX_FAKES_IN_A_ROW && rng() < FAKE_CHANCE;
      setPhase("warning", WARNING_STEPS, "warn");
    } else if (cue.phase === "warning") {
      if (cue.fake) { cue.fakes += 1; setPhase("green", between(GREEN_MS), "green"); }
      else {
        cue.fakes = 0;
        setPhase("red", between(RED_MS), "red");
        cue.grace = GRACE_STEPS;
      }
      cue.fake = false;
    } else {
      setPhase("green", between(GREEN_MS), "green");
      for (const p of players) p.frozen = false;
    }
  }

  function distractions() {
    if (distract.cooldown > 0) distract.cooldown -= 1;
    if (distract.pending > 0 && --distract.pending === 0) {
      distract.active = DISTRACT_STEPS;
      emit({ type: "fx", to: "all", kind: "blip" });
    } else if (distract.active > 0) distract.active -= 1;
    if (distract.cooldown > 0) return;
    // the A button of any finisher (rising edge irrelevant: the shared cooldown does the limiting)
    const presser = players.find((p) => p.done && has(masks.get(p.id) || 0, BIT.A));
    if (!presser) return;
    distract.cooldown = COOLDOWN_STEPS;
    distract.pending = DELAY_STEPS;
    emit({ type: "fx", to: presser.id, kind: "tick" });
  }

  function step() {
    tick += 1;
    advanceCue();
    distractions();
    if (cue.phase === "red" && cue.grace > 0) cue.grace -= 1;
    const watching = cue.phase === "red" && cue.grace === 0 && distract.active === 0;
    for (const p of players) {
      if (p.done) continue;
      p.swimming = !p.frozen && swims(masks.get(p.id) || 0);
      if (watching && p.swimming) {
        p.x = 0;
        p.frozen = true;      // no second catch (and no drifting) until the red phase is over
        p.swimming = false;
        emit({ type: "penalty", why: "caught", id: p.id });
        continue;
      }
      if (p.swimming) {
        p.x = Math.min(LANE_LEN, p.x + SWIM * FIXED_DT);
        if (p.x >= LANE_LEN) {
          p.done = true;
          p.swimming = false;
          emit({ type: "arrive", id: p.id });
          emit({ type: "fx", to: p.id, kind: "ring" });
        }
      }
    }
    if (!cleared && players.length > 0 && players.every((p) => p.done)) {
      cleared = true;
      emit({ type: "clear" });
      emit({ type: "fx", to: "all", kind: "win" });
    }
  }

  setRoster(roster);

  return {
    level: { index: 0, id: "red_light", title: "Un, dos, tres... ¡Tralalero!", laneLen: LANE_LEN },
    setRoster,
    setInput(id, mask) { masks.set(id, clean(mask)); },
    step,
    drain() { const out = events; events = []; return out; },
    snapshot() {
      return {
        t: tick,
        cleared,
        phase: cue.phase,
        cueMs: Math.round(cue.left * FIXED_DT * 1000),
        distract: { cooldownMs: Math.round(distract.cooldown * FIXED_DT * 1000), pending: distract.pending > 0, active: distract.active > 0 },
        players: players.map((p, lane) => ({
          id: p.id, name: p.name, color: p.color, lane, x: p.x, done: p.done, swimming: p.swimming, frozen: p.frozen,
        })),
      };
    },
  };
}
