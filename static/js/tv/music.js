// TV-only soundtrack: the room's music plus, under it, a quiet loop of the room's ambience (pool water, hangar
// machines, Sahur's night). Each layer keeps a single source across repeated snapshots of the same room.
// The rooms the Suno songs did not cover get free tracks by Kevin MacLeod (static/audio/CREDITS.md).
// Level 0 has no ambience: the fluorescent hum loop was grating under the music.
const AMBIENCE = { red_light: "pool", bomb_defusal: "hangar", sahur_platformer: "night" };
const AMBIENCE_VOLUME = 0.1;
// loudness levelling by measured RMS: the hangar loop is ~6x the crickets; the incompetech tracks are quieter masters
const AMBIENCE_GAIN = { pool: 1, hangar: 0.25, night: 1.4 };
const TRACK_GAIN = { room3_mall: 2.2, room4_quiz: 1.8, search: 1.2 };

export function musicFor(state) {
  const v = state.view || {};
  const kind = v.kind;
  const room = v.room_no ?? state.game?.room_no; // the search view carries no room_no: the game does
  if (kind === "ending") return { track: "ending", volume: 0.22, band: v.band, loop: false };
  if (kind === "lobby" || kind === "idle") return { track: "lobby", volume: 0.16 };
  // looking for the QR round the house: on tiptoe (Sahur's own song in the last room)
  if (kind === "search") return room === 7 ? { track: "room7_sahur", volume: 0.12 } : { track: "search", volume: 0.12 * TRACK_GAIN.search };
  if (kind === "unlocked") return { track: room === 7 ? "room7_sahur" : "lobby", volume: 0.12 };
  const tracks = { 0: "tension", 1: "room1_backrooms", 2: "room2_pools", 3: "room3_mall", 4: "room4_quiz", 6: "tension", 7: "room7_sahur" };
  const puzzles = { hold_together: "tension", coop_platformer: "room1_backrooms", red_light: "room2_pools", shape_count: "room3_mall", backrooms_trivia: "room4_quiz", bomb_defusal: "tension", sahur_dice: "room7_sahur", sahur_platformer: "room7_sahur" };
  const track = puzzles[kind] || tracks[room] || "lobby";
  const quiet = kind === "sahur_dice" && ["show", "input"].includes(v.phase);
  const base = quiet ? 0 : room === 3 || kind === "backrooms_trivia" ? 0.1 : 0.16;
  const plan = { track, volume: base * (TRACK_GAIN[track] || 1), ambience: AMBIENCE[kind] || null };
  // the 3 AM mall: its elevator music slowed down and muffled, as if the speakers were dying
  if (track === "room3_mall") Object.assign(plan, { rate: 0.84, lowpass: 2400 });
  return plan;
}

export function createMusic(getContext, { fetchAudio = (url) => fetch(url) } = {}) {
  const buffers = new Map(); // "music/<track>" | "ambience/<name>" -> Promise<AudioBuffer>
  let source = null, gain = null, filter = null, signature = "", request = 0;
  let amb = null, ambGain = null, ambKey = "", ambRequest = 0;
  let state = null, enabled = true, red = false, story = false, stopped = true;
  let failed = "";

  function load(ac, path) {
    if (!buffers.has(path)) {
      buffers.set(path, fetchAudio(`/static/audio/${path}.mp3`)
        .then((r) => { if (!r.ok) throw new Error(`Music HTTP ${r.status}`); return r.arrayBuffer(); })
        .then((data) => ac.decodeAudioData(data))
        .catch((error) => { buffers.delete(path); throw error; }));
    }
    return buffers.get(path);
  }

  function volume() {
    const ac = getContext();
    if (!ac || !state) return;
    const plan = musicFor(state);
    if (gain) gain.gain.setTargetAtTime(enabled && !red ? plan.volume * (story ? 0.35 : 1) : 0, ac.currentTime, 0.06);
    // the ambience stays through Tralalero's red light (the silence is the point) and dips under the cutscenes
    const level = AMBIENCE_VOLUME * (AMBIENCE_GAIN[ambKey] || 1) * (story ? 0.5 : 1);
    if (ambGain) ambGain.gain.setTargetAtTime(enabled ? level : 0, ac.currentTime, 0.3);
  }

  function stopMusic() {
    request += 1;
    if (source) { try { source.stop(); } catch (_) {} source.disconnect(); }
    if (gain) gain.disconnect();
    if (filter) filter.disconnect();
    source = gain = filter = null;
    signature = "";
  }

  function stopAmbience() {
    ambRequest += 1;
    if (amb) { try { amb.stop(); } catch (_) {} amb.disconnect(); }
    if (ambGain) ambGain.disconnect();
    amb = ambGain = null;
    ambKey = "";
  }

  function stop() {
    stopMusic();
    stopAmbience();
    stopped = true;
  }

  async function syncAmbience(ac, plan) {
    const key = plan.ambience || "";
    if (key === ambKey) return;
    stopAmbience();
    ambKey = key;
    if (!key) return;
    const token = ambRequest;
    try {
      const buffer = await load(ac, `ambience/${key}`);
      if (token !== ambRequest || stopped) return;
      amb = ac.createBufferSource();
      amb.buffer = buffer;
      amb.loop = true;
      ambGain = ac.createGain();
      ambGain.gain.value = 0;
      amb.connect(ambGain).connect(ac.destination);
      amb.start();
      volume();
    } catch (error) {
      if (token === ambRequest) ambKey = "";
      console.warn("No se ha podido cargar el ambiente", error);
    }
  }

  async function syncMusic(ac, plan) {
    const key = `${plan.track}:${plan.band || ""}`;
    if (signature === key || failed === key) { volume(); return; }
    stopMusic();
    signature = key;
    const token = request;
    try {
      const buffer = await load(ac, `music/${plan.track}`);
      if (token !== request || stopped) return;
      source = ac.createBufferSource();
      source.buffer = buffer;
      source.loop = plan.loop !== false;
      gain = ac.createGain();
      gain.gain.value = 0;
      filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = plan.lowpass || (plan.band === "brainrots" ? 950 : 20000);
      source.playbackRate.value = plan.rate || (plan.band === "brainrots" ? 0.72 : 1);
      source.connect(filter).connect(gain).connect(ac.destination);
      source.start(); // every ending plays the whole song once; the bad one only slows and muffles it
      volume();
    } catch (error) {
      if (token === request) { failed = key; signature = ""; }
      console.warn("No se ha podido cargar la música", error);
    }
  }

  async function sync(next) {
    state = next;
    stopped = false;
    const ac = getContext();
    if (!ac || ac.state !== "running") return;
    const plan = musicFor(state);
    await syncMusic(ac, plan); // the music first: it is what the room notices
    if (state === next && !stopped) await syncAmbience(ac, plan);
  }

  return {
    sync, stop,
    unlock: () => { failed = ""; if (state && !stopped) sync(state); },
    setEnabled: (value) => { enabled = value; volume(); },
    setRed: (value) => { if (red !== value) { red = value; volume(); } },
    setStory: (value) => { if (story !== value) { story = value; volume(); } },
  };
}
