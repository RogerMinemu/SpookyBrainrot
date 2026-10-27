// Story runner: pure maths from (scenes, elapsed ms) to what the cutscene shows (no DOM, no clock, no RNG).
// The TV drives it with its own clock; the phones use lineFor() to print the beat the TV announces.
//
//   compile(sceneIds, vars) -> { beats: [...], total }   every beat with absolute start / revealEnd / end (ms)
//   frameAt(c, ms)          -> { index, beat, shown, revealed, ended }
//   nextStop(c, ms)         -> the ms a "next" press jumps to (finish the line, then the next beat)
//   mouthAt(beat, shown, ms)-> "closed" | "mid" | "open" | "scary"
//   pickReader(players, prevId, rnd) -> the connected player who reads the next line aloud (the RNG is passed in)
import { SCENES, PLAYLISTS, VOICES, SPEAKERS, RIDDLE_PLACEHOLDER } from "./script.js";

export const START_MS = 300;    // a breath before the first beat
export const READER_MIN_MS = 600; // a reader's "Siguiente" is ignored this soon after the line appears (double taps)
export const CARD_MS = 2400;    // title cards
export const GAP_MS = 400;      // between scenes
export const RIDDLE_CPS = 24;   // riddles are read slower
export const PAUSE_MS = { ",": 130, ";": 200, ":": 200, ".": 320, "!": 320, "?": 320, "…": 420, "—": 180 };
const DEFAULT_CPS = 32;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const VOWEL = /[aeiouáéíóúàèìòùü]/i;
const LETTER = /[\p{L}\p{N}]/u;

/** How long a fully revealed line stays up before the next beat. */
export function holdMs(len, isRiddle) {
  return isRiddle ? clamp(2500 + 25 * len, 4000, 9000) : clamp(700 + 16 * len, 1300, 3600);
}

/** Which story belongs to a state: intro:<room>, search:<room>, unlocked:<room>, ending:<band>, or null. */
export function storyKeyFor(state) {
  const g = state && state.game, v = state && state.view;
  if (!g || !v) return null;
  if (v.kind === "ending") return `ending:${v.band}`;
  if (g.status !== "running") return null;
  if (v.kind === "intro" || v.kind === "search" || v.kind === "unlocked") return `${v.kind}:${g.room_no}`;
  return null;
}

/** A riddle the host really wrote (not empty, not the server placeholder). */
export function riddleOk(riddle) {
  const r = String(riddle || "").trim();
  return !!r && r !== RIDDLE_PLACEHOLDER;
}

/** Scene ids for a story key. A search plays riddle_<n>, or riddle_<n>_none when there is no real riddle. */
export function playlistFor(key, state) {
  if (!key) return [];
  const m = /^search:(\d+)$/.exec(key);
  if (m) {
    const id = riddleOk(state && state.game && state.game.riddle) ? `riddle_${m[1]}` : `riddle_${m[1]}_none`;
    return SCENES[id] ? [id] : [];
  }
  return (PLAYLISTS[key] || []).filter((id) => SCENES[id]);
}

export function varsFor(state) {
  const players = (state && state.game && state.game.players) || [];
  const on = players.filter((p) => p.connected).length;
  return { count: String(on || players.length), riddle: String((state && state.game && state.game.riddle) || "").trim() };
}

/** "{count}" -> vars.count. Unknown vars become "" (never "undefined"). */
export function fillText(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

export const cpsOf = (beat) => (beat.riddle ? RIDDLE_CPS : (VOICES[beat.who] && VOICES[beat.who].cps) || DEFAULT_CPS);

/** Reveal time (ms from the beat start) of every character of `text`, with the punctuation pauses. */
export function revealTimes(text, cps) {
  const step = 1000 / cps;
  const out = new Array(text.length);
  let t = 0;
  for (let i = 0; i < text.length; i++) {
    t += step;
    out[i] = t;
    if (i < text.length - 1 && PAUSE_MS[text[i]] && text[i + 1] === " ") t += PAUSE_MS[text[i]];
  }
  return out;
}

/** The playlist as one timeline. */
export function compile(sceneIds, vars = {}) {
  const beats = [];
  let t = START_MS;
  sceneIds.forEach((id, si) => {
    const scene = SCENES[id];
    if (!scene) return;
    if (si > 0) t += GAP_MS;
    scene.beats.forEach((b, i) => {
      const base = { scene: id, sceneStart: si, i, beats: scene.beats.length, cast: scene.cast || [], title: scene.title || "", ...b };
      if (b.card) {
        beats.push({ ...base, text: "", times: [], start: t, revealEnd: t, end: t + CARD_MS });
        t += CARD_MS;
        return;
      }
      const text = fillText(b.text, vars);
      const times = revealTimes(text, cpsOf(b));
      const revealEnd = t + (times.length ? times[times.length - 1] : 0);
      const end = revealEnd + holdMs(text.length, !!b.riddle);
      beats.push({ ...base, text, times, start: t, revealEnd, end });
      t = end;
    });
  });
  return { beats, total: t };
}

/** Characters of `beat` visible at `ms`. */
export function shownAt(beat, ms) {
  const e = ms - beat.start;
  if (e <= 0) return 0;
  const ts = beat.times;
  let lo = 0, hi = ts.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ts[mid] <= e) lo = mid + 1; else hi = mid; }
  return lo;
}

export function frameAt(c, ms) {
  if (!c.beats.length || ms >= c.total) return { index: c.beats.length, beat: null, shown: 0, revealed: true, ended: true };
  let index = 0;
  while (index < c.beats.length - 1 && ms >= c.beats[index].end) index++;
  const beat = c.beats[index];
  const shown = shownAt(beat, ms);
  return { index, beat, shown, revealed: shown >= beat.text.length, ended: false };
}

/** Where a "next" press jumps: the end of the reveal if the line is still typing, else the next beat's start. */
export function nextStop(c, ms) {
  const f = frameAt(c, ms);
  if (f.ended) return c.total;
  if (ms < f.beat.revealEnd) return f.beat.revealEnd;
  const next = c.beats[f.index + 1];
  return next ? next.start : c.total;
}

/** Mouth for a talking rig: vowels open it, consonants half, pauses and the end close it. */
export function mouthAt(beat, shown, ms) {
  if (!beat || beat.card || !beat.text || shown <= 0 || shown >= beat.text.length) return "closed";
  const since = ms - beat.start - beat.times[shown - 1];
  if (since > 1000 / cpsOf(beat) * 1.6) return "closed"; // a punctuation pause
  const ch = beat.text[shown - 1];
  if (!LETTER.test(ch)) return "closed";
  if (beat.emote === "scary") return shown % 4 < 2 ? "scary" : "open";
  return VOWEL.test(ch) ? "open" : "mid";
}

/**
 * A random connected player reads the next line aloud: never the same one twice in a row while there is a choice.
 * `rnd` is a () => [0, 1) source (the TV passes its RNG in, the tests a fixed one). Null when nobody is connected.
 */
export function pickReader(players, prevId, rnd) {
  const on = (players || []).filter((p) => p && p.connected);
  if (!on.length) return null;
  const pool = on.length > 1 ? on.filter((p) => p.id !== prevId) : on;
  const p = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
  return { id: p.id, name: p.name };
}

/** True for characters that make a voice blip. */
export const blips = (ch) => LETTER.test(ch);

/** What a phone prints for beat `i` of `sceneId`: { who, name, text, card }. */
export function lineFor(sceneId, i, vars = {}) {
  const scene = SCENES[sceneId];
  const b = scene && scene.beats[i];
  if (!b) return null;
  if (b.card) return { who: null, name: "", text: b.card, card: true };
  return { who: b.who, name: SPEAKERS[b.who] || "", text: fillText(b.text, vars), card: false };
}

/** Sum of every narrated beat (ms) of a key, for tests and the phone fallback. */
export function durationOf(key, state) {
  return compile(playlistFor(key, state), varsFor(state)).total;
}
