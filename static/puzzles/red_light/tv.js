// Room 2 "Un, dos, tres... ¡Tralalero!" - TV view. Contract: mount(root, ctx), update(view, state), onInput({pid, mask}), unmount().
// The TV runs the lane sim and only reports outcomes (arrive / clear / penalty) to the server.
import { createStage } from "/static/js/sim/draw.js";
import { createHost } from "/static/js/sim/host.js";
import { colorFor } from "/static/js/sim/colors.js";
import { play } from "/static/js/shared/audio.js";
import { createSim } from "./sim.js";
import { drawScene } from "./render.js";

let st = null;

/** Connected players in join order, each with its join colour. */
function rosterOf(state) {
  const players = (state && state.game && state.game.players) || [];
  return players.map((p, i) => ({ id: p.id, name: p.name, color: colorFor(i), connected: p.connected })).filter((p) => p.connected);
}

// Cue sounds are for the room (TV speakers); everything also goes to the phones as fx. On the TV a catch splashes and
// every arrival rings Tralalero's bell (softly: with a big group there are many).
const TV_SOUNDS = { warn: "warn", green: "green", red: "red", fail: "caught", win: "win", blip: "blip", ring: "ring" };

export function mount(root, ctx) {
  document.documentElement.dataset.realtime = "1"; // no watercolor boil while the sim runs
  const stage = createStage(root);
  const guardian = ctx.sprite ? ctx.sprite("tralalero") : null; // painted Tralalero (or null: procedural)
  let frames = 0;
  const host = createHost({
    makeSim: createSim,
    report: ctx.sendSim,
    fx: (to, kind, data) => {
      if (ctx.musicRed && (kind === "red" || kind === "green")) ctx.musicRed(kind === "red");
      if (TV_SOUNDS[kind]) play(TV_SOUNDS[kind], kind === "ring" ? { vol: 0.5 } : data);
      ctx.sendFx(to, kind, data);
    },
    draw: (sim) => {
      if (++frames % 120 === 0) stage.refresh();
      drawScene(stage.g, stage.tokens, sim.snapshot(), performance.now() / 1000, guardian);
    },
  });
  host.start();
  st = { stage, host, key: "" };
}

export function update(view, state) {
  if (!st) return;
  const roster = rosterOf(state);
  const key = roster.map((p) => `${p.id}:${p.name}:${p.color}`).join("|");
  if (key !== st.key) { st.key = key; st.host.setRoster(roster); }
  st.host.setView({ epoch: view.epoch, level: view.level, seed: view.seed });
}

export function onInput(m) {
  if (st) st.host.setInput(m.pid, m.mask);
}

export function unmount() {
  if (!st) return;
  st.host.stop();
  st.stage.destroy();
  delete document.documentElement.dataset.realtime;
  st = null;
}
