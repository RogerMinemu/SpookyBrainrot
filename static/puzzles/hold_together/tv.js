// Room 0 "Agarraos fuerte" - TV view. Contract: mount(root, ctx), update(view, state), unmount().
import { h, clear, fill } from "/static/js/shared/dom.js";

let els = null;

export function mount(root) {
  const bar = h("div", { class: "hold-bar-fill" });
  els = {
    title: h("h1", {}, "Agarraos fuerte"),
    hint: h("p", { class: "muted" }, "Todos los supervivientes: mantened el dedo pulsado a la vez."),
    bar,
    track: h("div", { class: "hold-bar" }, bar),
    list: h("div", { class: "players" }),
  };
  fill(root, els.title, els.hint, els.track, els.list);
}

export function update(view) {
  if (!els) return;
  els.bar.style.width = `${Math.round((view.progress || 0) * 100)}%`;
  fill(els.list, 
    ...(view.players || []).map((p) =>
      h("span", { class: "pill" + (p.holding ? "" : " off") }, p.name + (p.holding ? "" : " (suelta)"))));
}

export function unmount() {
  els = null;
}
