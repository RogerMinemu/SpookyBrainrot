// TV reactions to server `event` messages. Placeholder visuals (no art yet).
import { h } from "/static/js/shared/dom.js";

function overlay(cls, children, ms) {
  const el = h("div", { class: `overlay ${cls}` }, children);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

const handlers = {
  jumpscare: (d) => overlay("jumpscare", [
    h("div", { class: "overlay-big" }, d.cameo || "???"),
    h("div", {}, "os ha encontrado...")], 2800),
  splash: () => overlay("splash-flash", [h("div", { class: "overlay-big" }, "SPLASH")], 900),
  round_failed: (d) => overlay("round-failed", [
    h("div", { class: "overlay-big" }, "La palabra se ha podrido"),
    h("div", {}, `+${d.penalty || 0}% de brainrot. Nueva palabra.`)], 3200),
  toast: (d) => overlay("note", [d.text || ""], 3000),
  anchor_unlocked: () => overlay("note", ["Ancla encontrada"], 2500),
};

/** Global hook; returns true if handled. Puzzle modules may also export onEvent(ev). */
export function handleEvent(ev) {
  const fn = handlers[ev.name];
  if (!fn) return false;
  fn(ev.data || {});
  return true;
}
