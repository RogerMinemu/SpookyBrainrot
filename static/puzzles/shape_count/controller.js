// Room 3 "Contad las formas" - phone controller. Contract: mount(root, ctx), update(view, state), unmount().
// Two buttons only: -1 and +1 on this phone's counter. A phone knows its own shape and counter, nobody else's.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { play, vibrate } from "/static/js/shared/audio.js";
import { shapeIcon } from "./shapes.js";

let st = null;

function stepButton(label, delta, aria) {
  const btn = h("button", { class: "btn count-btn", type: "button", "aria-label": aria }, label);
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (!st || st.phase !== "count" || !st.shape) return;
    btn.classList.add("down");
    play("blip");
    vibrate(15);
    st.ctx.send({ type: "adjust", delta });
  });
  const up = () => btn.classList.remove("down");
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(ev, up);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  return btn;
}

export function mount(root, ctx) {
  const badge = h("div", { class: "count-badge" });
  const label = h("p", { class: "count-label" }, "");
  const number = h("div", { class: "count-number", role: "status", "aria-live": "polite" }, "0");
  const minus = stepButton("−", -1, "Restar uno");
  const plus = stepButton("+", 1, "Sumar uno");
  const status = h("p", { class: "muted" }, "");
  fill(root, title("Contad las formas", { cls: "phone-title" }),
    panel([h("div", { class: "count-head" }, badge, label), number, h("div", { class: "count-row" }, minus, plus), status],
      { cls: "phone-panel count-panel" }));
  st = { ctx, badge, label, number, minus, plus, status, shape: undefined, phase: null };
  // /admin/demo seat: a bot taps the real buttons (sound, haptics and the WS command)
  if (window.__sb) {
    window.__sb.adjust = (delta) => {
      const btn = st && (delta > 0 ? st.plus : st.minus);
      if (!btn) return false;
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
      return true;
    };
  }
}

function statusText(view) {
  if (!view.shape) return "Espera: en la siguiente ronda te tocará una forma.";
  if (view.phase === "count") return `Ronda ${view.round} de ${view.rounds} · quedan ${view.left} s. Cuenta solo tu forma: el color da igual.`;
  if (view.phase === "pass") return view.round < view.rounds ? "¡Todos bien! Preparaos para la siguiente ronda." : "¡Todo cuadra!";
  if (view.result && view.result.ok) return `Tú lo tenías bien (eran ${view.result.truth}), pero alguien ha fallado. Nuevas formas...`;
  if (view.result) return `Eran ${view.result.truth}. Nuevas formas en un momento...`;
  return "Nuevas formas en un momento...";
}

export function update(view) {
  if (!st) return;
  st.phase = view.phase;
  if (view.shape !== st.shape) {
    st.shape = view.shape;
    fill(st.badge, view.shape ? shapeIcon(view.shape, { color: "#FFF5E2", cls: "shape-icon big" }) : null);
  }
  fill(st.label, view.shape ? ["Tienes que contar:", h("strong", {}, view.shape_name.toUpperCase())] : "Sin forma por ahora");
  st.number.textContent = String(view.answer);
  const live = view.phase === "count" && !!view.shape;
  st.minus.classList.toggle("idle", !live || view.answer <= 0);
  st.plus.classList.toggle("idle", !live);
  st.number.classList.toggle("ok", !!(view.result && view.result.ok));
  st.number.classList.toggle("bad", !!(view.result && !view.result.ok));
  st.status.textContent = statusText(view);
}

export function onFx(fx) {
  play(fx.kind, fx.data);
}

export function unmount() {
  if (window.__sb) window.__sb.adjust = null;
  st = null;
}
