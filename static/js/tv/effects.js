// TV reactions to server `event` messages. Painted overlays: DOM text over ink splashes and torn paper
// (all looks live in tv.css / theme.css). Overlays are position:fixed and pointer-events:none, so they
// never shift the layout underneath. Pure presentation: cast data only; characters are drawn via ctx.sprite.
import { h } from "/static/js/shared/dom.js";
import { portrait } from "/static/js/ui/kit.js";
import { tone, play } from "/static/js/shared/audio.js";
import { byName } from "/static/js/art/roster.js"; // pure cast data; characters are drawn through ctx.sprite only
import { SCARES, VOICES } from "/static/js/story/script.js";

const SCARE_BLIPS = 26, SCARE_BLIP_S = 0.045;

/** The brainrot says its scare line: a burst of its voice blips, one per letter. */
function speak(id, line) {
  const v = VOICES[id];
  if (!v) return;
  [...line].filter((ch) => /\p{L}/u.test(ch)).slice(0, SCARE_BLIPS).forEach((ch, k) => {
    const lift = /[aeiouáéíóú]/i.test(ch) ? 1.08 : 1;
    tone(v.freq * lift, v.dur, { type: v.type, vol: v.vol, slide: v.slide, at: 0.25 + k * SCARE_BLIP_S });
  });
}

function overlay(cls, children, ms, onEnd) {
  const el = h("div", { class: `overlay ${cls}`, role: "status" }, children);
  document.body.append(el);
  setTimeout(() => { el.remove(); if (onEnd) onEnd(); }, ms);
}

/**
 * The scary pose of a cameo: lunges at the camera inside a portrait frame (the flat silhouette under ?art=off or
 * before the plate is ready). Returns { frame, destroy } or null for a name that is not in the cast.
 */
function scarePortrait(name, ctx) {
  const rig = byName(name);
  if (!rig || !ctx || !ctx.sprite) return null;
  const sp = ctx.sprite(rig.id);
  const frame = h("figure", { class: "portrait scare-portrait", "data-cameo": name });
  let t0 = null;
  const W = 700, H = 700;
  const mount = sp.mount(frame, {
    w: W, h: H, className: "scare-canvas",
    driver: (g, t) => {
      if (t0 === null) t0 = t;
      sp.drawAny(g, { x: W / 2, y: H - 30, h: H * 0.74, t, emote: "scary", lungeT: t0 });
    },
  });
  return { frame, destroy: mount.destroy };
}

/** A hand-torn paper strip (clip-path edges) holding DOM text. */
const torn = (text, cls = "") => h("div", { class: `torn ${cls}`.trim() }, h("span", {}, text));
const splat = (cls = "") => h("div", { class: `overlay-splat splat ${cls}`.trim(), "aria-hidden": "true" });

const handlers = {
  // The portrait slot is empty until the art exists: it then shows the brainrot's name in big painted letters.
  jumpscare: (d, ctx) => {
    const sc = scarePortrait(d.cameo, ctx);
    const rig = byName(d.cameo);
    const line = (rig && SCARES[rig.id]) || "os ha encontrado...";
    play("scare"); // the hit and the scream, then the brainrot says its line
    if (rig && SCARES[rig.id]) speak(rig.id, line);
    overlay("jumpscare", [
      splat("s1"), splat("s2"),
      h("div", { class: "scare-stage" },
        sc ? sc.frame : portrait({ cameo: d.cameo || "???" }),
        torn(line, "scare-line")),
    ], 3000, sc ? sc.destroy : null);
  },
  splash: () => {
    play("splash");
    overlay("splash-flash", [
      splat("s1"), splat("s2"), splat("s3"),
      h("div", { class: "overlay-big ink-word" }, "¡Salpicón!")], 1100);
  },
  round_failed: (d) => {
    play("round_fail");
    overlay("round-failed", [
      splat("s1"), splat("s2"),
      h("div", { class: "rot-drips", "aria-hidden": "true" }),
      h("div", { class: "scare-stage" },
        torn(d.title || "¡Ronda fallida!", "big"),
        torn(`${d.text || "Probad otra vez."} +${d.penalty || 0}% de brainrot.`, "small"))], 3200);
  },
  toast: (d) => overlay("note", [torn(d.text || "")], 3000),
  anchor_unlocked: () => {
    play("anchor");
    overlay("note unlocked-note", [torn("Ancla encontrada", "gold")], 2600);
  },
};

/** Global hook; returns true if handled. Puzzle modules may also export onEvent(ev). */
export function handleEvent(ev, ctx) {
  const fn = handlers[ev.name];
  if (!fn) return false;
  fn(ev.data || {}, ctx);
  return true;
}
