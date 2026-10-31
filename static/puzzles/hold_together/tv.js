// Room 0 "Agarraos fuerte" - TV view. Contract: mount(root, ctx), update(view, state), unmount().
import { h, clear, fill } from "/static/js/shared/dom.js";
import { panel, title, pill } from "/static/js/ui/kit.js";
import { play } from "/static/js/shared/audio.js";

let els = null;

export function mount(root) {
  const bar = h("div", { class: "hold-bar-fill" });
  els = {
    title: title("Agarraos fuerte"),
    hint: h("p", { class: "lead" }, "Todos los supervivientes: mantened el dedo pulsado a la vez."),
    bar,
    track: h("div", { class: "hold-bar" }, bar),
    list: h("div", { class: "players" }),
    last: 0,
  };
  fill(root, els.title, panel([els.hint, els.track, els.list], { cls: "stack hold-panel" }));
}

export function update(view) {
  if (!els) return;
  const p = view.progress || 0;
  els.bar.style.width = `${Math.round(p * 100)}%`;
  // a clock tick at every quarter of the way, a buzzer when somebody lets go and it drops back to zero
  if (els.last > 0.05 && p === 0) play("wrong");
  else if (p < 1 && Math.floor(p * 4) > Math.floor(els.last * 4)) play("tick");
  els.last = p;
  fill(els.list, 
    ...(view.players || []).map((p) =>
      pill(p.name + (p.holding ? "" : " (suelta)"), { off: !p.holding })));
}

export function unmount() {
  els = null;
}
