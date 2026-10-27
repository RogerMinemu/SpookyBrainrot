// TV-only soundtrack. A single source survives repeated snapshots of the same room.
export function musicFor(state) {
  const v = state.view || {};
  const kind = v.kind;
  if (kind === "ending") return { track: "ending", volume: 0.22, band: v.band, loop: false };
  if (kind === "lobby" || kind === "idle") return { track: "lobby", volume: 0.16 };
  if (kind === "search" || kind === "unlocked") return { track: v.room_no === 7 ? "room7_sahur" : "lobby", volume: 0.12 };
  const room = v.room_no ?? state.game?.room_no;
  const tracks = { 0: "tension", 1: "room1_backrooms", 2: "room2_pools", 3: "room1_backrooms", 4: "lobby", 6: "tension", 7: "room7_sahur" };
  const puzzles = { hold_together: "tension", coop_platformer: "room1_backrooms", red_light: "room2_pools", shape_count: "room1_backrooms", backrooms_trivia: "lobby", bomb_defusal: "tension", sahur_dice: "room7_sahur", sahur_platformer: "room7_sahur" };
  const track = puzzles[kind] || tracks[room] || "lobby";
  const quiet = kind === "sahur_dice" && ["show", "input"].includes(v.phase);
  return { track, volume: quiet ? 0 : room === 3 || kind === "backrooms_trivia" ? 0.1 : 0.16 };
}

export function createMusic(getContext, { fetchAudio = (url) => fetch(url) } = {}) {
  const buffers = new Map();
  let source = null, gain = null, filter = null, signature = "", request = 0;
  let state = null, enabled = true, red = false, story = false, stopped = true;
  let failed = "";

  function volume() {
    const ac = getContext();
    if (!gain || !ac || !state) return;
    const plan = musicFor(state);
    const target = enabled && !red ? plan.volume * (story ? 0.35 : 1) : 0;
    gain.gain.setTargetAtTime(target, ac.currentTime, 0.06);
  }

  function stop() {
    request += 1;
    if (source) { try { source.stop(); } catch (_) {} source.disconnect(); }
    if (gain) gain.disconnect();
    if (filter) filter.disconnect();
    source = gain = filter = null;
    signature = "";
    stopped = true;
  }

  async function sync(next) {
    state = next;
    stopped = false;
    const ac = getContext();
    if (!ac || ac.state !== "running") return;
    const plan = musicFor(state);
    const key = `${plan.track}:${plan.band || ""}`;
    if (signature === key || failed === key) { volume(); return; }
    stop();
    stopped = false;
    signature = key;
    const token = request;
    try {
      if (!buffers.has(plan.track)) {
        buffers.set(plan.track, fetchAudio(`/static/audio/music/${plan.track}.mp3`)
          .then((r) => { if (!r.ok) throw new Error(`Music HTTP ${r.status}`); return r.arrayBuffer(); })
          .then((data) => ac.decodeAudioData(data))
          .catch((error) => { buffers.delete(plan.track); throw error; }));
      }
      const buffer = await buffers.get(plan.track);
      if (token !== request || stopped) return;
      source = ac.createBufferSource();
      source.buffer = buffer;
      source.loop = plan.loop !== false;
      gain = ac.createGain();
      gain.gain.value = 0;
      filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = plan.band === "brainrots" ? 950 : 20000;
      source.playbackRate.value = plan.band === "brainrots" ? 0.72 : 1;
      source.connect(filter).connect(gain).connect(ac.destination);
      source.start(); // every ending plays the whole song once; the bad one only slows and muffles it
      volume();
    } catch (error) {
      if (token === request) { failed = key; signature = ""; }
      console.warn("No se ha podido cargar la música", error);
    }
  }

  return {
    sync, stop,
    unlock: () => { failed = ""; if (state && !stopped) sync(state); },
    setEnabled: (value) => { enabled = value; volume(); },
    setRed: (value) => { if (red !== value) { red = value; volume(); } },
    setStory: (value) => { if (story !== value) { story = value; volume(); } },
  };
}
