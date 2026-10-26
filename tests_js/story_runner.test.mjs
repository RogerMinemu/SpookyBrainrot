import test from "node:test";
import assert from "node:assert/strict";
import { SCENES, PLAYLISTS, VOICES, SPEAKERS, SCARES, GUARDED_ROOMS, RIDDLE_PLACEHOLDER } from "../static/js/story/script.js";
import {
  storyKeyFor, playlistFor, compile, frameAt, nextStop, mouthAt, shownAt, lineFor, fillText, varsFor, riddleOk,
  revealTimes, holdMs, durationOf, CARD_MS, START_MS,
} from "../static/js/story/runner.js";
import { ROSTER_IDS } from "../static/js/art/roster.js";

const RIDDLE = "Donde el frío guarda la leche y la luz se enciende al abrir, busca detrás del cartón de huevos.";
const st = (status, kind, room_no, extra = {}) => ({
  game: { status, room_no, riddle: RIDDLE, players: [{ connected: true }, { connected: true }, { connected: false }] },
  view: { kind, ...extra },
});

test("storyKeyFor maps intro, search, unlocked and endings; lobby and puzzles have no story", () => {
  assert.equal(storyKeyFor(st("lobby", "lobby", 0)), null);
  assert.equal(storyKeyFor(st("running", "intro", 0)), "intro:0");
  assert.equal(storyKeyFor(st("running", "hold_together", 0)), null);
  assert.equal(storyKeyFor(st("running", "unlocked", 0)), "unlocked:0");
  assert.equal(storyKeyFor(st("running", "intro", 3)), "intro:3");
  assert.equal(storyKeyFor(st("running", "search", 6)), "search:6");
  assert.equal(storyKeyFor(st("finished", "ending", 7, { band: "escape_with_passenger" })), "ending:escape_with_passenger");
  assert.equal(storyKeyFor(null), null);
});

test("every guarded room has an intro, a riddle (and its no-riddle twin) and a hand-off, all playable", () => {
  for (const n of GUARDED_ROOMS) {
    assert.deepEqual(playlistFor(`intro:${n}`), [`intro_${n}`]);
    assert.deepEqual(playlistFor(`search:${n}`, st("running", "search", n)), [`riddle_${n}`]);
    assert.ok(SCENES[`riddle_${n}_none`], n);
    if (n !== 7) assert.deepEqual(playlistFor(`unlocked:${n}`), [`exit_${n}`]);
  }
  assert.deepEqual(playlistFor("unlocked:7"), []);
  for (const band of ["escape", "escape_with_passenger", "brainrots"]) assert.equal(playlistFor(`ending:${band}`).length, 1);
  for (const ids of Object.values(PLAYLISTS)) for (const id of ids) assert.ok(SCENES[id], id);
});

test("a missing or placeholder riddle plays the _none scene and never prints undefined", () => {
  for (const riddle of ["", "   ", null, RIDDLE_PLACEHOLDER]) {
    const s = st("running", "search", 2);
    s.game.riddle = riddle;
    assert.equal(riddleOk(riddle), false);
    assert.deepEqual(playlistFor("search:2", s), ["riddle_2_none"]);
    const c = compile(playlistFor("search:2", s), varsFor(s));
    for (const b of c.beats) assert.ok(!/undefined|null|\{/.test(b.text), b.text);
  }
  const c = compile(playlistFor("search:2", st("running", "search", 2)), varsFor(st("running", "search", 2)));
  assert.ok(c.beats.some((b) => b.riddle && b.text === RIDDLE));
});

test("every speaker, cast member and scare is a real character with a voice", () => {
  for (const [id, scene] of Object.entries(SCENES)) {
    for (const who of scene.cast) assert.ok(ROSTER_IDS.includes(who), `${id} cast ${who}`);
    for (const b of scene.beats) {
      if (b.card) continue;
      assert.ok(SPEAKERS[b.who] && VOICES[b.who], `${id} speaker ${b.who}`);
      assert.ok(b.who === "fundacion" || ROSTER_IDS.includes(b.who), b.who);
      assert.ok(b.text.trim().length > 4, `${id} empty line`);
    }
  }
  assert.deepEqual(Object.keys(SCARES).sort(), [...ROSTER_IDS].sort());
});

test("the timeline is monotonic and every scene stays short", () => {
  for (const id of Object.keys(SCENES)) {
    const c = compile([id], { count: "4", riddle: RIDDLE });
    let prev = START_MS;
    for (const b of c.beats) {
      assert.ok(b.start >= prev && b.start <= b.revealEnd && b.revealEnd < b.end, `${id} beat ${b.i}`);
      if (b.card) assert.equal(b.end - b.start, CARD_MS);
      prev = b.end;
    }
    assert.equal(c.total, prev);
    assert.ok(c.total >= 8000 && c.total <= 75000, `${id} lasts ${c.total} ms`);
  }
  const all = compile(["prologue", "noclip"], { count: "4" });
  assert.ok(all.beats.find((b) => b.scene === "noclip").start >= all.beats.find((b) => b.scene === "prologue" && b.i === SCENES.prologue.beats.length - 1).end + 400);
});

test("the typewriter reveals letter by letter, pauses on punctuation and holds the line", () => {
  const t = revealTimes("Hola, mundo.", 20);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
  assert.ok(t[5] - t[4] >= 50 + 130 - 1, "comma pause"); // "," then " "
  assert.equal(holdMs(10, false), 1300);
  assert.equal(holdMs(500, false), 3600);
  assert.ok(holdMs(120, true) >= 4000);
  const c = compile(["intro_3"], {});
  const b = c.beats[1]; // first spoken line after the card
  let last = -1;
  for (let ms = b.start; ms <= b.revealEnd + 10; ms += 37) {
    const n = shownAt(b, ms);
    assert.ok(n >= last);
    last = n;
  }
  assert.equal(shownAt(b, b.revealEnd), b.text.length);
});

test("frameAt walks the beats and ends; nextStop finishes the line first, then jumps to the next beat", () => {
  const c = compile(["exit_6"], {});
  const [b0, b1] = c.beats;
  const mid = b0.start + 200;
  assert.equal(frameAt(c, mid).index, 0);
  assert.equal(frameAt(c, mid).revealed, false);
  assert.equal(nextStop(c, mid), b0.revealEnd);
  assert.equal(nextStop(c, b0.revealEnd + 1), b1.start);
  assert.equal(frameAt(c, b1.start + 1).index, 1);
  assert.equal(frameAt(c, c.total).ended, true);
  assert.equal(nextStop(c, c.beats.at(-1).revealEnd + 1), c.total);
  assert.equal(frameAt(compile([], {}), 0).ended, true);
});

test("mouthAt opens on vowels, half-opens on consonants and closes on pauses and at the end", () => {
  const c = compile(["intro_1"], {});
  const b = c.beats.find((x) => x.who === "patapim");
  const at = (n) => b.start + b.times[n - 1] + 1;
  const vowel = [...b.text].findIndex((ch) => /[aeiou]/i.test(ch)) + 1;
  const cons = [...b.text].findIndex((ch) => /[bcdfghjklmnpqrstvwxyz]/i.test(ch)) + 1;
  assert.equal(mouthAt(b, vowel, at(vowel)), "open");
  assert.equal(mouthAt(b, cons, at(cons)), "mid");
  assert.equal(mouthAt(b, b.text.length, b.revealEnd), "closed");
  assert.equal(mouthAt(b, 0, b.start), "closed");
  assert.equal(mouthAt(c.beats[0], 0, 0), "closed"); // the title card
});

test("phones read the same line the TV shows", () => {
  const vars = varsFor(st("running", "intro", 0));
  assert.equal(vars.count, "2");
  const l = lineFor("prologue", 1, vars);
  assert.equal(l.who, "fundacion");
  assert.match(l.text, /Detecto 2 conciencias/);
  assert.deepEqual(lineFor("prologue", 0, vars), { who: null, name: "", text: "3:00 AM", card: true });
  assert.equal(lineFor("prologue", 99, vars), null);
  assert.equal(lineFor("nope", 0, vars), null);
  assert.equal(fillText("{count} y {nada}", { count: 3 }), "3 y ");
});

test("the whole narrated story stays under ten minutes", () => {
  let total = 0;
  for (const key of Object.keys(PLAYLISTS)) total += durationOf(key, st("running", "intro", 0));
  for (const n of GUARDED_ROOMS) total += durationOf(`search:${n}`, st("running", "search", n));
  assert.ok(total < 10 * 60 * 1000, `${Math.round(total / 1000)} s`);
});
