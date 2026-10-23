// TV reactions to server `event` messages. Painted overlays: DOM text over ink splashes and torn paper
// (all looks live in tv.css / theme.css). Overlays are position:fixed and pointer-events:none, so they
// never shift the layout underneath. Pure presentation: no art code is imported here.
import { h } from "/static/js/shared/dom.js";
import { portrait } from "/static/js/ui/kit.js";

function overlay(cls, children, ms) {
  const el = h("div", { class: `overlay ${cls}`, role: "status" }, children);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

/** A hand-torn paper strip (clip-path edges) holding DOM text. */
const torn = (text, cls = "") => h("div", { class: `torn ${cls}`.trim() }, h("span", {}, text));
const splat = (cls = "") => h("div", { class: `overlay-splat splat ${cls}`.trim(), "aria-hidden": "true" });

const handlers = {
  // The portrait slot is empty until the art exists: it then shows the brainrot's name in big painted letters.
  jumpscare: (d) => overlay("jumpscare", [
    splat("s1"), splat("s2"),
    h("div", { class: "scare-stage" },
      portrait({ cameo: d.cameo || "???" }),
      torn("os ha encontrado...", "scare-line")),
  ], 2400),
  splash: () => overlay("splash-flash", [
    splat("s1"), splat("s2"), splat("s3"),
    h("div", { class: "overlay-big ink-word" }, "¡Salpicón!")], 1100),
  round_failed: (d) => overlay("round-failed", [
    splat("s1"), splat("s2"),
    h("div", { class: "rot-drips", "aria-hidden": "true" }),
    h("div", { class: "scare-stage" },
      torn("La palabra se ha podrido", "big"),
      torn(`+${d.penalty || 0}% de brainrot. Nueva palabra.`, "small"))], 3200),
  toast: (d) => overlay("note", [torn(d.text || "")], 3000),
  anchor_unlocked: () => overlay("note unlocked-note", [torn("Ancla encontrada", "gold")], 2600),
};

/** Global hook; returns true if handled. Puzzle modules may also export onEvent(ev). */
export function handleEvent(ev) {
  const fn = handlers[ev.name];
  if (!fn) return false;
  fn(ev.data || {});
  return true;
}
