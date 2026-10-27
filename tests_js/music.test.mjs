import test from "node:test";
import assert from "node:assert/strict";
import { createMusic, musicFor } from "../static/js/tv/music.js";

const state = (kind, extra = {}) => ({ game: {}, view: { kind, ...extra } });

function rig(fetchAudio) {
  const sources = [], gains = [];
  const node = () => ({ connect(other) { return other; }, disconnect() {} });
  const ac = { state: "running", currentTime: 0, destination: {},
    decodeAudioData: async () => ({ duration: 160 }),
    createBufferSource() { const s = { ...node(), playbackRate: {}, starts: 0, stops: 0, start() { this.starts++; }, stop() { this.stops++; } }; sources.push(s); return s; },
    createGain() { const g = { ...node(), gain: { value: 0, setTargetAtTime(v) { this.value = v; } } }; gains.push(g); return g; },
    createBiquadFilter: () => ({ ...node(), frequency: {} }),
  };
  const music = createMusic(() => ac, { fetchAudio: fetchAudio || (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })) });
  return { music, sources, gains, ac };
}

test("all playable rooms have the intended track and listening phases are silent", () => {
  const expected = { hold_together: "tension", coop_platformer: "room1_backrooms", red_light: "room2_pools", shape_count: "room1_backrooms", backrooms_trivia: "lobby", bomb_defusal: "tension", sahur_dice: "room7_sahur", sahur_platformer: "room7_sahur" };
  for (const [kind, track] of Object.entries(expected)) assert.equal(musicFor(state(kind)).track, track);
  for (const phase of ["show", "input"]) assert.equal(musicFor(state("sahur_dice", { phase })).volume, 0);
  assert.ok(musicFor(state("sahur_dice", { phase: "pass" })).volume > 0);
});

test("snapshots, mute and red light preserve playback position", async () => {
  const { music, sources, gains } = rig();
  await music.sync(state("red_light"));
  await music.sync(state("red_light"));
  assert.equal(sources.length, 1);
  music.setRed(true); assert.equal(gains[0].gain.value, 0);
  music.setRed(false); assert.ok(gains[0].gain.value > 0);
  music.setEnabled(false); assert.equal(gains[0].gain.value, 0);
  music.setEnabled(true); assert.equal(sources[0].starts, 1);
  music.setStory(true); assert.ok(gains[0].gain.value < 0.1);
  music.setStory(false); assert.ok(gains[0].gain.value > 0.1);
});

test("late downloads cannot start an obsolete room or restart a stopped TV", async () => {
  const pending = [];
  const { music, sources } = rig(() => new Promise((resolve) => pending.push(resolve)));
  const a = music.sync(state("lobby"));
  const b = music.sync(state("bomb_defusal"));
  const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  pending[0](response); await a; assert.equal(sources.length, 0);
  pending[1](response); await b; assert.equal(sources.length, 1);
  music.stop(); music.unlock(); assert.equal(sources[0].stops, 1);
});

test("endings reuse one recording, play it whole once and do not restart after completion", async () => {
  let downloads = 0;
  const { music, sources } = rig(async () => { downloads++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; });
  await music.sync(state("ending", { band: "escape" }));
  assert.equal(sources[0].loop, false);
  await music.sync(state("ending", { band: "brainrots" }));
  assert.equal(downloads, 1);
  assert.equal(sources[1].playbackRate.value, 0.72);
  assert.equal(sources[1].loop, false);
  await music.sync(state("ending", { band: "brainrots" }));
  assert.equal(sources.length, 2);
  await music.sync(state("ending", { band: "escape_with_passenger" }));
  assert.equal(sources[2].loop, false);
  assert.equal(sources[2].stops, 0, "the passenger ending is not cut short");
});
