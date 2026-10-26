// Room 3 "Contad las formas" - TV view. Contract: mount(root, ctx), update(view, state), unmount().
// The TV draws the field the server generated (a reload draws the same one) and who counts which shape. Counters only
// show up at the check. From round 3 the shapes drift. Lirilì keeps watch from the corner.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { play } from "/static/js/shared/audio.js";
import { PALETTE, shapeIcon, shapeNode, svgEl } from "./shapes.js";

const W = 1600, H = 900, CELL = 100, PAD = 70; // PAD: room for the shapes that drift past the edge cells
const TAG_COLOR = "#D8CDBD"; // name tags use a neutral fill: the field colours mean nothing
let st = null;

/** Stable 0..1 per (shape, salt): the drift of a shape is the same on every reload. */
const unit = (i, salt) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };
const clock = (s) => `0:${String(Math.max(0, s)).padStart(2, "0")}`;

function buildField(view) {
  const svg = svgEl("svg", { viewBox: `${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}`, class: `shape-field${view.drift ? " drift" : ""}`, role: "img", "aria-label": "Campo de formas" });
  view.shapes.forEach((sh, i) => {
    const drifter = svgEl("g", { class: "drifter" });
    if (view.drift) {
      const dx = Math.round((unit(i, 1) - 0.5) * 130), dy = Math.round((unit(i, 2) - 0.5) * 100);
      drifter.setAttribute("style", `--dx:${dx}px;--dy:${dy}px;--dur:${(3 + unit(i, 3) * 4).toFixed(2)}s;--delay:${(-unit(i, 4) * 6).toFixed(2)}s`);
    }
    drifter.append(shapeNode(sh.kind, {
      x: sh.x * W, y: sh.y * H, scale: CELL * 0.86 * sh.size, rot: sh.rot, color: PALETTE[sh.color % PALETTE.length], stroke: 0.05,
    }));
    svg.append(drifter);
  });
  return svg;
}

function counterTag(c) {
  return h("span", { class: "pill shape-tag" }, shapeIcon(c.shape, { color: TAG_COLOR }), `${c.name}: ${c.shape_name}`);
}

function resultTag(r) {
  return h("span", { class: `pill shape-tag ${r.ok ? "ok" : "bad"}` }, shapeIcon(r.shape, { color: TAG_COLOR }),
    r.ok ? `${r.name}: ${r.answer} ✔` : `${r.name}: ${r.answer} ✘ (eran ${r.truth})`);
}

export function mount(root, ctx) {
  const round = h("p", { class: "lead" }, "");
  const cue = h("p", { class: "shape-cue", role: "timer" }, "");
  const fieldBox = h("div", { class: "shape-field-box" });
  const tags = h("div", { class: "players shape-tags" });
  const hint = h("p", { class: "muted" }, "");
  fill(root, title("Contad las formas"),
    panel([h("div", { class: "shape-top" }, round, cue), fieldBox, tags, hint], { cls: "stack shape-panel" }));
  st = { ctx, round, cue, fieldBox, tags, hint, epoch: null, phase: null, left: null, host: null, mount: null };
  // Lirilì, who stopped the mall clocks, watches from the corner (flat silhouette until the art is ready)
  const sprite = ctx && ctx.sprite ? ctx.sprite("lirili") : null;
  if (sprite) {
    const me = st;
    me.host = h("div", { class: "guardian-stage", "aria-hidden": "true" });
    root.append(me.host);
    me.mount = sprite.mount(me.host, {
      w: 700, h: 700,
      driver: (g, t) => sprite.drawAny(g, { x: 350, y: 690, h: 640, t, emote: me.phase === "fail" ? "scary" : "idle" }),
    });
  }
}

export function update(view) {
  if (!st) return;
  if (view.epoch !== st.epoch) {
    st.epoch = view.epoch;
    fill(st.fieldBox, buildField(view));
  }
  st.round.textContent = `Ronda ${view.round} de ${view.rounds}`;
  if (view.phase === "count") {
    st.cue.textContent = clock(view.left);
    if (view.left !== st.left && view.left > 0 && view.left <= 5) play("tick");
    st.hint.textContent = "Cada uno cuenta SOLO su forma (el color da igual) y lo marca en su móvil antes de que acabe el tiempo.";
    fill(st.tags, view.counters.map(counterTag));
  } else {
    const ok = view.phase === "pass";
    st.cue.textContent = ok ? "¡Todo cuadra!" : "¡Alguien ha contado mal!";
    if (st.phase === "count") play(ok ? "win" : "fail");
    if (ok) st.hint.textContent = view.round < view.rounds ? "Preparaos: la siguiente ronda trae más formas." : "Lirilì vuelve a darle cuerda al reloj...";
    fill(st.tags, view.results.map(resultTag));
  }
  st.cue.classList.toggle("hurry", view.phase === "count" && view.left <= 5);
  st.left = view.left;
  st.phase = view.phase;
}

// The miss is shown in place, next to the results: no full-screen overlay hiding who got it wrong.
export function onEvent(ev) {
  if (!st || ev.name !== "round_failed") return false;
  const d = ev.data || {};
  st.hint.textContent = `${d.text || "Probad otra vez."} +${d.penalty || 0}% de brainrot.`;
  return true;
}

export function unmount() {
  if (!st) return;
  if (st.mount) st.mount.destroy();
  if (st.host) st.host.remove();
  st = null;
}
