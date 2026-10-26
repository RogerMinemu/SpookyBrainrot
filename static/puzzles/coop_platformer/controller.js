// Room 1 "Nivel 0" - phone controller. Contract: mount(root, ctx), update(view, state), unmount().
// The phone only sends the held-button mask (shared pad); the TV runs the game and answers with fx.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { mountPad } from "/static/js/shared/input.js";
import { createIdentity } from "/static/js/play/identity.js";
import { play, vibrate } from "/static/js/shared/audio.js";
import { LEVELS } from "./levels.js";

let st = null;

export function mount(root, ctx) {
  const heading = h("p", { class: "lead" }, "Mirad la tele y moveos juntos.");
  const hint = h("p", { class: "muted" }, "");
  const padHost = h("div", { class: "pad-host" });
  const who = createIdentity(padHost);
  fill(root, title("Nivel 0", { cls: "phone-title" }), who.el, panel([heading, hint], { cls: "phone-panel" }), padHost);
  const pad = mountPad(padHost, ctx);
  st = { pad, heading, hint, who, ctx };
}

export function update(view, state) {
  if (!st) return;
  st.who.update(state, st.ctx.playerId());
  const def = LEVELS[view.level];
  st.heading.textContent = `Nivel ${view.level + 1} de ${view.levels}${def ? `: ${def.title}` : ""}`;
  st.hint.textContent = def ? def.hint : "";
}

// Effects the TV sends: sound for everybody, a buzz when you fall.
export function onFx(fx) {
  play(fx.kind, fx.data);
  if (fx.kind === "fail") vibrate([120, 60, 120]);
  else if (fx.kind === "ring" || fx.kind === "open" || fx.kind === "win") vibrate(50);
}

export function onTvOnline(online) {
  if (st) st.pad.pause(!online); // never send input to a TV that is not there
}

export function resend() {
  if (st) st.pad.resend();
}

export function unmount() {
  if (!st) return;
  st.pad.destroy();
  st = null;
}
