// Room 0 "Agarraos fuerte" - TV view. Contract: mount(root, ctx), update(view, state), unmount().
import { h, clear, fill } from "/static/js/shared/dom.js";
import { panel, title, pill } from "/static/js/ui/kit.js";

let els = null;

export function mount(root) {
  const bar = h("div", { class: "hold-bar-fill" });
  els = {
    title: title("Agarraos fuerte"),
    hint: h("p", { class: "lead" }, "Todos los supervivientes: mantened el dedo pulsado a la vez."),
    bar,
    track: h("div", { class: "hold-bar" }, bar),
    list: h("div", { class: "players" }),
  };
  fill(root, els.title, panel([els.hint, els.track, els.list], { cls: "stack hold-panel" }));
}

export function update(view) {
  if (!els) return;
  els.bar.style.width = `${Math.round((view.progress || 0) * 100)}%`;
  fill(els.list, 
    ...(view.players || []).map((p) =>
      pill(p.name + (p.holding ? "" : " (suelta)"), { off: !p.holding })));
}

export function unmount() {
  els = null;
}
