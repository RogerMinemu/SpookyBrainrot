// Shared WebAudio synth for TV and phones. Nothing makes a sound (or throws) until a user gesture
// has called unlockAudio(): TV splash click, phone first pointerdown.
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
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return true;
  } catch (_) {
    ctx = null;
    return false;
  }
}

export const isUnlocked = () => !!ctx && ctx.state === "running";

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

// Named effects. `fx` kinds from the TV map here; unknown kinds are ignored.
const SOUNDS = {
  blip: () => tone(660, 0.08),
  jump: () => tone(380, 0.14, { type: "triangle", slide: 420 }),
  ring: () => { tone(988, 0.5, { type: "sine", vol: 0.6 }); tone(1319, 0.7, { type: "sine", vol: 0.4, at: 0.08 }); },
  open: () => { tone(392, 0.12); tone(523, 0.12, { at: 0.1 }); tone(784, 0.25, { at: 0.2 }); },
  fail: () => { tone(220, 0.25, { type: "sawtooth", slide: -120 }); tone(150, 0.35, { type: "sawtooth", at: 0.18, slide: -80 }); },
  caught: () => tone(180, 0.4, { type: "sawtooth", slide: -110, vol: 0.6 }),
  warn: () => { tone(880, 0.1); tone(880, 0.1, { at: 0.2 }); },
  green: () => tone(523, 0.18, { type: "triangle" }),
  red: () => tone(147, 0.5, { type: "sawtooth", vol: 0.55 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: "triangle", at: i * 0.11 })),
  tick: () => tone(1200, 0.03, { vol: 0.25 }),
  drum: (d) => tone(d && d.freq ? d.freq : 110, 0.22, { type: "sine", vol: 0.8, slide: -60 }),
  snip: () => tone(1500, 0.06, { type: "triangle", vol: 0.4, slide: -700 }),
  boom: () => { tone(90, 0.9, { type: "sawtooth", vol: 0.8, slide: -60 }); tone(55, 1.3, { type: "square", vol: 0.5, at: 0.05, slide: -25 }); },
};

export function play(kind, data) {
  const fn = SOUNDS[kind];
  if (fn) { try { fn(data); } catch (_) {} }
}

/** Optional haptics: a missing API (iOS Safari) is silent. */
export function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
}
