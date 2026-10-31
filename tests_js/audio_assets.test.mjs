// Every recorded sound the code asks for exists, is an mp3 (decodable on every phone, iPhones included) and is credited.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SAMPLES } from "../static/js/shared/audio.js";
import { musicFor } from "../static/js/tv/music.js";

const AUDIO = new URL("../static/audio/", import.meta.url);
const credits = readFileSync(new URL("CREDITS.md", AUDIO), "utf8");
const isMp3 = (url) => {
  const b = readFileSync(url);
  return b.length > 1000 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
};

test("every sample of the sound bank is a credited mp3 in static/audio/sfx", () => {
  for (const [name, [file, vol]] of Object.entries(SAMPLES)) {
    const url = new URL(`sfx/${file}.mp3`, AUDIO);
    assert.ok(existsSync(url) && isMp3(url), `${name}: sfx/${file}.mp3`);
    assert.ok(vol > 0 && vol <= 4, name); // above 1 only for quiet recordings
    assert.ok(credits.includes(`sfx/${file}.mp3`), `${file} is credited`);
  }
});

test("every music track and ambience loop the TV can ask for exists", () => {
  const kinds = ["lobby", "idle", "intro", "search", "unlocked", "ending", "hold_together", "coop_platformer", "red_light",
    "shape_count", "backrooms_trivia", "bomb_defusal", "sahur_dice", "sahur_platformer"];
  const seen = new Set();
  for (const kind of kinds) {
    for (const room of [0, 1, 2, 3, 4, 6, 7]) {
      const plan = musicFor({ game: { room_no: room }, view: { kind, room_no: room, band: "escape" } });
      seen.add(`music/${plan.track}`);
      if (plan.ambience) seen.add(`ambience/${plan.ambience}`);
    }
  }
  for (const path of seen) assert.ok(isMp3(new URL(`${path}.mp3`, AUDIO)), path);
  for (const path of ["music/room3_mall", "music/room4_quiz", "music/search"]) {
    assert.ok(seen.has(path), `${path} is used`);
    assert.ok(credits.includes(`${path}.mp3`) && credits.includes("Kevin MacLeod"), `${path} is credited`);
  }
  for (const amb of ["fluorescent", "pool", "hangar", "night"]) assert.ok(credits.includes(`ambience/${amb}.mp3`), amb);
});
