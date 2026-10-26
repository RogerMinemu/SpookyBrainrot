// Puppet: turns (rig, state, t) into flat draw ops. Pure and deterministic (t in seconds, no clock, no RNG,
// no DOM): the sprite layer owns the 2D canvas and just replays the ops. Nothing here ever paints; a
// character is painted once into an atlas and animated by transforms only (bob, squash, blink, mouth swap,
// and a 2-frame "boil" between two atlas variants).
//
// The "take" emote (a quick squint + squash) is an idea ported from ClaudeAnimationBase (CAB, MIT);
// the code is original.
//
// Ops (matrices are canvas-style [a, b, c, d, e, f] in rig space, origin = feet centre, +y down):
//   { op: "cell",  part, cell: [x, y, w, h], px, py, m }   draw the atlas cell with its pivot (px, py) at m
//   { op: "shape", kind: "ell"|"rect"|"tri", w, h, m, fill } silhouette ink shape centred at m
//   { op: "eye",   r, m, fill, glow }                       silhouette glowing eye centred at m
// poseOps    -> { variant: 0|1, alpha, ops }   (variant = atlas boil variant to sample)
// silhouetteOps -> { variant: 0, alpha, ops }
import { RIG_CELLS, CAMEO_CELLS } from "./roster.js";

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

export const BOB_AMP = 6, BOB_HZ = 0.45;
export const DANCE_AMP = 14, DANCE_HZ = 2;
export const SQUASH_AMP = 0.018, SQUASH_HZ = 0.9;
export const NOD_DEG = 2.5, NOD_HZ = 3.2;
export const ARM_DEG = 7, ARM_HZ = 1.6;
/** Cameos have no mouth: while they talk they hop and squash on the syllables instead. */
export const TALK_HOP = 9, TALK_HOP_HZ = 3.4, TALK_SQUASH = 0.035;
/** A held prop (Sahur's bat) leans out a little at rest, so it never covers the face. */
export const PROP_REST_DEG = 12;
export const DANCE_ARM_DEG = 18;
export const BLINK_PERIOD = 3.9, BLINK_LEN = 0.12, BLINK_SEED_MUL = 1.7;
export const TAKE_SEC = 0.22;
export const SCARY_LEAN_DEG = 6, SCARY_SCALE = 1.08, SCARY_SHAKE = 3, SCARY_SHAKE_HZ = 24;
export const SLIDE_SEC = 0.45, SLIDE_DIST = 520;
export const LUNGE_SEC = 0.18, LUNGE_FROM = 0.55, LUNGE_TO = 1.25;
/** Boil period in ms by degradation level 0 / 1 / 2 (the worse the brainrot, the faster the wobble). */
export const BOIL_MS = [140, 110, 80];

const INK = "#2B2233";
const GLOW = "#E8AA38";
const GLOW_SCARY = "#F2D23C";

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, k) => a + (b - a) * k;
const fmod = (a, n) => ((a % n) + n) % n;

/** Deterministic integer-hash -> [0, 1). */
export function hash(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---- matrices ([a, b, c, d, e, f], x' = a x + c y + e, y' = b x + d y + f) -----------------------------
function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function trs(x, y, deg = 0, sx = 1, sy = sx) {
  const r = deg * RAD, c = Math.cos(r), s = Math.sin(r);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}

// ---- timing helpers ------------------------------------------------------------------------------------
/** Boil variant (0 or 1) at time t. Reduced motion pins v0. */
export function boilVariant(t, degradation = 0, reduced = false) {
  if (reduced) return 0;
  const ms = BOIL_MS[degradation] ?? BOIL_MS[0];
  return Math.floor((t * 1000) / ms) % 2;
}

/** True while the blink is on. `seed` is the character's own [0, 1) seed so they do not blink in unison. */
export function isBlinking(t, seed = 0) {
  return fmod(t + BLINK_SEED_MUL * seed, BLINK_PERIOD) < BLINK_LEN;
}

const easeOut = (p) => 1 - (1 - p) * (1 - p) * (1 - p);

/** Take emote at elapsed seconds e -> { squash, squint }; neutral outside [0, TAKE_SEC). */
function takeAt(e) {
  if (!(e >= 0) || e >= TAKE_SEC) return { squash: 1, squint: false };
  const p = e / TAKE_SEC;
  const keys = [[0, 1], [0.35, 0.93], [0.7, 1.05], [1, 1]];
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const [p0, v0] = keys[i - 1], [p1, v1] = keys[i];
      return { squash: lerp(v0, v1, (p - p0) / (p1 - p0)), squint: p < 0.5 };
    }
  }
  return { squash: 1, squint: false };
}

/** Whole-body motion shared by rigs, cameos and silhouettes: root matrix + alpha + flags. */
function rootOf(rig, state, t) {
  const emote = state.emote || "idle";
  const reduced = !!state.reduced;
  const scary = emote === "scary";
  let x = 0, y = 0, rot = 0, scale = 1, alpha = 1;

  // bob / dance (vertical), frozen under reduced motion except the tiny squash
  if (!reduced) {
    y -= state.dance ? DANCE_AMP * Math.pow(Math.sin(TAU * DANCE_HZ * t), 2) : BOB_AMP * Math.sin(TAU * BOB_HZ * t);
  }
  let sy0 = 1 + SQUASH_AMP * Math.sin(TAU * SQUASH_HZ * t);
  if (rig.kind !== "rig" && state.talking && !reduced) {
    const beat = Math.abs(Math.sin(TAU * TALK_HOP_HZ * t));
    y -= TALK_HOP * beat;
    sy0 *= 1 + TALK_SQUASH * (beat - 0.5);
  }
  const take = takeAt(t - (state.takeT ?? Infinity));
  const sy = sy0 * take.squash;
  const sx = 1 / Math.sqrt(sy);

  if (scary) {
    rot += SCARY_LEAN_DEG;
    scale *= SCARY_SCALE;
    if (!reduced) {
      const n = Math.floor(SCARY_SHAKE_HZ * t);
      x += SCARY_SHAKE * (hash(n) * 2 - 1);
      y += SCARY_SHAKE * (hash(n + 7919) * 2 - 1);
    }
  }
  if (state.lungeT != null && t >= state.lungeT) {
    scale *= lerp(LUNGE_FROM, LUNGE_TO, easeOut(clamp01((t - state.lungeT) / LUNGE_SEC)));
  }

  // enter / exit slide (450 ms) with a fade
  const dir = state.slideDir || -1;
  if (state.enterT != null && t >= state.enterT && t < state.enterT + SLIDE_SEC) {
    const k = easeOut((t - state.enterT) / SLIDE_SEC);
    x += dir * SLIDE_DIST * (1 - k);
    alpha = k;
  } else if (state.enterT != null && t < state.enterT) {
    alpha = 0;
  }
  if (state.exitT != null && t >= state.exitT) {
    const k = easeOut(clamp01((t - state.exitT) / SLIDE_SEC));
    x += dir * SLIDE_DIST * k;
    alpha = Math.min(alpha, 1 - k);
  }

  const flip = state.flip ? -1 : 1;
  const m = trs(x, y, rot * flip, scale * flip * sx, scale * sy);
  return { m, alpha, emote, take, scary, flip };
}

/** Which eyes cell the state asks for. */
function eyesFor(emote, blinking, squint) {
  if (emote === "away" || blinking || squint) return "closed";
  if (emote === "angry") return "angry";
  if (emote === "scary" || emote === "surprised") return "wide";
  return "open";
}

function mouthFor(state, emote) {
  if (state.mouth && RIG_CELLS.mouth[state.mouth]) return state.mouth;
  if (emote === "scary") return "scary";
  if (emote === "surprised") return "open";
  if (emote === "happy") return "mid";
  return "closed";
}

/**
 * Draw ops for a character at time t (seconds).
 * state: { emote, mouth, talking, dance, degradation, reduced, flip, enterT, exitT, slideDir, takeT, lungeT }
 */
export function poseOps(rig, state = {}, t = 0) {
  const root = rootOf(rig, state, t);
  const variant = boilVariant(t, state.degradation || 0, !!state.reduced);
  if (rig.kind !== "rig") {
    const pose = root.scary || state.pose === "scary" ? "scary" : "idle";
    const cell = CAMEO_CELLS[pose];
    return {
      variant, alpha: root.alpha,
      ops: [{ op: "cell", part: pose, cell, px: cell[2] / 2, py: cell[3] - 12, m: root.m }],
    };
  }

  const emote = root.emote;
  const reduced = !!state.reduced;
  const talk = !!state.talking || emote === "talk";
  const blinking = isBlinking(t, rig.seed);
  const eyeKey = eyesFor(emote, blinking, root.take.squint);
  const mouthKey = mouthFor(state, emote);

  // per-part extra rotation (deg)
  const rotOf = (part, swing) => {
    if (reduced) return 0;
    let r = 0;
    if (part === "head" && talk) r += NOD_DEG * Math.sin(TAU * NOD_HZ * t);
    if ((part === "armL" || part === "armR") && swing) {
      if (state.dance) r += DANCE_ARM_DEG * swing * Math.sin(TAU * DANCE_HZ * t);
      else if (talk) r += ARM_DEG * swing * Math.sin(TAU * ARM_HZ * t);
    }
    if (emote === "happy" && (part === "armL" || part === "armR")) r += swing > 0 ? 25 : -25; // arms up
    if ((emote === "scary" || emote === "angry") && (part === "armL" || part === "armR")) r += (swing > 0 ? 1 : -1) * (emote === "scary" ? 22 : 12); // arms flare out
    return r;
  };

  const byPart = new Map(rig.parts.map((p) => [p.part, p]));
  const world = new Map();
  const angle = new Map(); // accumulated rotation (deg) of each part, so a part can cancel its parent's (`keep`)
  const worldOf = (p) => {
    let w = world.get(p.part);
    if (w) return w;
    const parent = p.parent ? worldOf(byPart.get(p.parent)) : root.m;
    const parentAngle = p.parent ? angle.get(p.parent) : 0;
    let r = rotOf(p.part, p.swing);
    if (p.keep) {
      r -= p.keep * parentAngle;
      // held prop leans out with the mood (at rest too, a still lean is not motion)
      r += reduced ? PROP_REST_DEG : emote === "scary" ? 38 : emote === "angry" ? 16 : emote === "happy" ? 22 : PROP_REST_DEG;
    }
    angle.set(p.part, parentAngle + r);
    w = mul(parent, trs(p.at[0], p.at[1], r));
    world.set(p.part, w);
    return w;
  };

  const ops = [];
  for (const p of rig.parts) {
    let cell = RIG_CELLS[p.part];
    if (p.part === "eyes") cell = RIG_CELLS.eyes[eyeKey];
    else if (p.part === "mouth") cell = RIG_CELLS.mouth[mouthKey];
    ops.push({ op: "cell", part: p.part, cell, px: p.pivot[0], py: p.pivot[1], m: worldOf(p) });
  }
  return { variant, alpha: root.alpha, ops };
}

/** Flat ink silhouette + glowing, blinking eyes. Same root motion as poseOps, so the swap is seamless. */
export function silhouetteOps(rig, state = {}, t = 0) {
  const root = rootOf(rig, state, t);
  const ops = [];
  for (const s of rig.sil.shapes) {
    const [kind, cx, cy, w, h, rot = 0] = s;
    ops.push({ op: "shape", kind, w, h, m: mul(root.m, trs(cx, cy, rot)), fill: INK });
  }
  const blinking = isBlinking(t, rig.seed) || root.emote === "away";
  if (!blinking) {
    const scary = root.scary || root.emote === "angry";
    const r = rig.sil.eyeR * (scary ? 1.35 : 1);
    for (const [ex, ey] of rig.sil.eyes) {
      ops.push({ op: "eye", r, m: mul(root.m, trs(ex, ey)), fill: scary ? GLOW_SCARY : GLOW, glow: scary ? 18 : 10 });
    }
  }
  return { variant: 0, alpha: root.alpha, ops };
}
