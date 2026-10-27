// Co-op platformer - TV view (Room 1 "Nivel 0", and Room 7 through sahur_platformer/tv.js). The level set comes in
// view.set. Contract: mount(root, ctx), update(view, state), onInput({pid, mask}), unmount().
// The TV is the physics authority: it runs the sim and only reports outcomes (clear / penalty) to the server.
import { createStage } from "/static/js/sim/draw.js";
import { createHost } from "/static/js/sim/host.js";
import { colorFor } from "/static/js/sim/colors.js";
import { createSim } from "./sim.js";
import { drawScene } from "./render.js";

let st = null;

/** Connected players in join order, each with its join colour. */
function rosterOf(state) {
  const players = (state && state.game && state.game.players) || [];
  return players.map((p, i) => ({ id: p.id, name: p.name, color: colorFor(i), connected: p.connected })).filter((p) => p.connected);
}

export function mount(root, ctx) {
  document.documentElement.dataset.realtime = "1"; // no watercolor boil while the sim runs
  const stage = createStage(root);
  let frames = 0;
  const host = createHost({
    makeSim: (opts) => createSim({ ...opts, set: st && st.set }),
    report: ctx.sendSim,
    fx: ctx.sendFx,
    draw: (sim) => {
      if (++frames % 120 === 0) stage.refresh();
      drawScene(stage.g, stage.tokens, sim.level, sim.snapshot(), performance.now() / 1000);
    },
  });
  host.start();
  st = { stage, host, key: "", set: undefined };
}

export function update(view, state) {
  if (!st) return;
  st.set = view.set; // fixed per puzzle; read by makeSim when the view rebuilds the sim
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
