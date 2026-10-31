// Shared WebAudio synth for TV and phones. Nothing makes a sound (or throws) until a user gesture
// has called unlockAudio(): TV splash click, every phone touch (until the context runs, and again if iOS suspends it).
let ctx = null;
let master = null;

// /admin/demo seats are muted unless the host takes one over: a muted page never even creates an AudioContext.
let muted = false;

export function setMuted(on) { muted = !!on; }

export function unlockAudio() {
  if (muted) return false;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended" || ctx.state === "interrupted") ctx.resume().catch(() => {}); // "interrupted": iOS
    return true;
  } catch (_) {
    ctx = null;
    return false;
  }
}

export const isUnlocked = () => !!ctx && ctx.state === "running";
export const audioContext = () => muted ? null : ctx;

/** One enveloped oscillator note. `at` is seconds from now. Safe no-op while locked. */
export function tone(freq, dur = 0.15, { type = "square", vol = 0.5, at = 0, slide = 0 } = {}) {
  if (muted || !ctx || ctx.state !== "running") return;
  try {
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (_) {}
}

// ---- recorded sounds -------------------------------------------------------------------------------------------
// Free samples in static/audio/sfx (sources and licences: static/audio/CREDITS.md), decoded once and played through
// the same master gain as the synth. A sample that is not loaded (never preloaded, still downloading, failed) falls
// back to the synth effect, so nothing ever goes silent: the TV preloads them all, a phone only the few it uses.
const SFX_BASE = "/static/audio/sfx/";
/** name -> [file, gain]. Gains level the recordings by their measured RMS (quiet ones go above 1). */
export const SAMPLES = {
  scare: ["scare-hit", 1], scream: ["scare-scream", 0.85], anchor: ["anchor", 1.4],
  card: ["card", 0.55], thud: ["thud", 0.45], alarm: ["alarm", 0.35], phone: ["phone-ring", 0.5], static: ["static", 0.6],
  round_fail: ["round-fail", 0.55], clock: ["clock-tick", 3], strike: ["strike", 0.6], module: ["module", 0.7],
  explosion: ["explosion", 1], splash: ["splash", 1.6], whoosh: ["whoosh", 0.55], bell: ["church-bell", 0.5],
  lock: ["lock", 2.5], gate: ["gate", 3], fall: ["fall", 0.55], clear: ["level-clear", 0.6], correct: ["correct", 0.75],
  wrong: ["wrong", 0.75], join: ["join", 0.45], applause: ["applause", 0.5], creature: ["creature", 0.8],
  monsters: ["monsters", 0.8], heartbeat: ["heartbeat", 1.2],
};
const buffers = new Map(); // name -> AudioBuffer, or null when it could not be loaded
const loading = new Map(); // name -> Promise

/** Download + decode samples in the background (after the unlock gesture). Safe to call again. */
export function preloadSamples(names = Object.keys(SAMPLES)) {
  if (muted || !ctx) return Promise.resolve();
  return Promise.all(names.filter((n) => SAMPLES[n] && !buffers.has(n) && !loading.has(n)).map((n) => {
    const p = fetch(`${SFX_BASE}${SAMPLES[n][0]}.mp3`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject))) // callback form: old Safari
      .then((buf) => buffers.set(n, buf))
      .catch(() => buffers.set(n, null))
      .finally(() => loading.delete(n));
    loading.set(n, p);
    return p;
  }));
}

/**
 * Play a loaded sample now (or `at` seconds from now). `vol` scales its own volume, `rate` changes speed and pitch,
 * `dur` cuts it short with a quick fade. True when it played; false (and nothing happens) when it is not loaded.
 */
export function sample(name, { vol = 1, rate = 1, at = 0, dur = 0 } = {}) {
  const buf = buffers.get(name);
  if (muted || !buf || !ctx || ctx.state !== "running") return false;
  try {
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = rate;
    g.gain.value = SAMPLES[name][1] * vol;
    if (dur > 0) {
      g.gain.setValueAtTime(SAMPLES[name][1] * vol, t0 + Math.max(0, dur - 0.15));
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    }
    src.connect(g).connect(master);
    src.start(t0);
    if (dur > 0) src.stop(t0 + dur + 0.02);
    return true;
  } catch (_) {
    return false;
  }
}

// Named effects. `fx` kinds from the TV map here; unknown kinds are ignored. `d` may carry {vol} for the sample.
const vol = (d) => (d && typeof d.vol === "number" ? d.vol : 1);
const SOUNDS = {
  blip: () => tone(660, 0.08),
  jump: () => tone(380, 0.14, { type: "triangle", slide: 420 }),
  ring: (d) => sample("bell", { vol: vol(d) }) || (tone(988, 0.5, { type: "sine", vol: 0.6 }), tone(1319, 0.7, { type: "sine", vol: 0.4, at: 0.08 })),
  open: () => sample("lock") || (tone(392, 0.12), tone(523, 0.12, { at: 0.1 }), tone(784, 0.25, { at: 0.2 })),
  gate: () => sample("gate") || SOUNDS.open(),
  fail: () => sample("fall") || (tone(220, 0.25, { type: "sawtooth", slide: -120 }), tone(150, 0.35, { type: "sawtooth", at: 0.18, slide: -80 })),
  caught: () => sample("splash") || tone(180, 0.4, { type: "sawtooth", slide: -110, vol: 0.6 }),
  warn: () => { tone(880, 0.1); tone(880, 0.1, { at: 0.2 }); },
  green: () => tone(523, 0.18, { type: "triangle" }),
  red: () => { sample("whoosh"); tone(147, 0.5, { type: "sawtooth", vol: 0.55 }); }, // Tralalero turns round
  win: () => sample("clear") || [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: "triangle", at: i * 0.11 })),
  correct: () => sample("correct") || SOUNDS.win(),
  wrong: () => sample("wrong") || SOUNDS.fail(),
  tick: (d) => sample("clock", { vol: vol(d) }) || tone(1200, 0.03, { vol: 0.25 }),
  drum: (d) => tone(d && d.freq ? d.freq : 110, 0.22, { type: "sine", vol: 0.8, slide: -60 }),
  snip: () => tone(1500, 0.06, { type: "triangle", vol: 0.4, slide: -700 }),
  strike: () => sample("strike") || SOUNDS.warn(),
  module: () => sample("module") || SOUNDS.win(),
  boom: () => sample("explosion") || (tone(90, 0.9, { type: "sawtooth", vol: 0.8, slide: -60 }), tone(55, 1.3, { type: "square", vol: 0.5, at: 0.05, slide: -25 })),
  // a decoy QR: the hit, then the scream on top
  scare: () => { if (!sample("scare")) tone(70, 0.8, { type: "sawtooth", vol: 0.9, slide: -30 }); sample("scream", { at: 0.12 }); },
  anchor: () => sample("anchor") || SOUNDS.open(),
  round_fail: () => sample("round_fail") || SOUNDS.fail(),
  splash: () => sample("splash") || SOUNDS.caught(),
  card: () => sample("card"),
  thud: () => sample("thud"),
  alarm: () => sample("alarm", { dur: 3.5 }),
  phone: () => sample("phone", { dur: 2.6 }),
  static: () => sample("static"),
  join: () => sample("join") || tone(880, 0.08, { type: "triangle" }),
  lantern: () => { tone(784, 0.16, { type: "triangle", vol: 0.4 }); tone(1175, 0.24, { type: "triangle", vol: 0.32, at: 0.09 }); },
  heartbeat: () => sample("heartbeat"),
  applause: () => sample("applause"),
  creature: () => sample("creature"),
  monsters: () => sample("monsters", { dur: 6 }),
};

export function play(kind, data) {
  const fn = SOUNDS[kind];
  if (fn) { try { fn(data); } catch (_) {} }
}

/** Optional haptics: a missing API (iOS Safari) is silent. */
export function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
}
