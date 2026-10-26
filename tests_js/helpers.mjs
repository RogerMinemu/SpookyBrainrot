// Shared helpers for the node sim tests (pure ES modules, no DOM).
import { hashString } from "../static/js/sim/loop.js";
import { colorFor } from "../static/js/sim/colors.js";

export const roster = (n, prefix = "p") =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `Jugador ${i}`, color: colorFor(i) }));

/** Fingerprint of any JSON-able snapshot. */
export const hashSnap = (snap) => hashString(JSON.stringify(snap));

/**
 * Step `sim` until `done(snap)` or `maxSteps`. `driver(snap, sim)` sets the inputs before each step.
 * Returns { steps, events, hash } where hash folds every snapshot (determinism fingerprint).
 */
export function run(sim, driver, { maxSteps = 3600 * 3, done = (s) => s.cleared } = {}) {
  const events = [];
  let hash = 0;
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    const snap = sim.snapshot();
    if (done(snap)) break;
    driver(snap, sim);
    sim.step();
    events.push(...sim.drain());
    hash = (hash * 31 + hashSnap(sim.snapshot())) >>> 0;
  }
  return { steps, events, hash, snap: sim.snapshot() };
}

/** Run a bot: `bot(snap, i, n)` -> mask for player i. */
export const botDriver = (bot) => (snap, sim) => {
  snap.players.forEach((p, i) => { if (!p.entered) sim.setInput(p.id, bot(snap, i, snap.players.length)); });
};

export const seconds = (s) => Math.round(s * 60);
