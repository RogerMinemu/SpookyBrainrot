// Shared sim loop: fixed-step accumulator, seeded RNG, ms -> steps. Pure ES module (no DOM, no globals).
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.25; // a long frame (tab in background) never replays more than this
export const MAX_STEPS = 8;       // hard cap per rendered frame: the sim slows down instead of spiralling
const EPS = 1e-9;

/**
 * Fold a frame time into the accumulator.
 * @param {number} acc seconds left over from the previous frame
 * @param {number} dt seconds since the previous frame
 * @returns {{acc:number, steps:number}}
 */
export function advance(acc, dt) {
  const frame = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), MAX_FRAME_DT);
  let total = acc + frame;
  let steps = Math.floor(total / FIXED_DT + EPS);
  if (steps > MAX_STEPS) steps = MAX_STEPS;
  total -= steps * FIXED_DT;
  if (total < 0) total = 0;
  if (total > FIXED_DT) total = FIXED_DT; // drop the backlog beyond one step (clamped accumulator)
  return { acc: total, steps };
}

/** Deterministic 32-bit PRNG: the same seed always yields the same stream. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Milliseconds -> whole sim steps (300 ms = 18 steps). */
export function ms2steps(ms) {
  return Math.round((ms / 1000) / FIXED_DT);
}

/** Small stable string hash (FNV-1a) used by tests to fingerprint a snapshot. */
export function hashString(str) {
  let hsh = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hsh ^= str.charCodeAt(i);
    hsh = Math.imul(hsh, 0x01000193) >>> 0;
  }
  return hsh >>> 0;
}
