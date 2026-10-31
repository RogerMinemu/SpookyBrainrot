// Room 5 "Desactivad la bomba" - TV view. Contract: mount(root, ctx), update(view, state), unmount().
// Only the clock, the strikes and the module lights: the bomb itself lives on the artificiero's phone alone and the
// manual is torn across the other phones. Bombardiro Crocodilo circles from the corner.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { play } from "/static/js/shared/audio.js";

let st = null;

export function mount(root, ctx) {
  const clock = h("div", { class: "bomb-clock", role: "timer" }, "");
  const strikes = h("div", { class: "bomb-strikes", "aria-label": "Errores" });
  const modules = h("div", { class: "bomb-modules" });
  const role = h("p", { class: "lead" }, "");
  const experts = h("p", { class: "muted" }, "");
  fill(root, title("Desactivad la bomba"),
    panel([h("div", { class: "bomb-head" }, clock, strikes), modules, role, experts], { cls: "stack bomb-panel" }));
  st = { ctx, clock, strikes, modules, role, experts, left: null, strikeCount: 0, solved: 0, phase: null, epoch: null, host: null, mount: null };
  const sprite = ctx && ctx.sprite ? ctx.sprite("bombardiro") : null;
  if (sprite) {
    const me = st;
    me.host = h("div", { class: "guardian-stage", "aria-hidden": "true" });
    root.append(me.host);
    me.mount = sprite.mount(me.host, {
      w: 700, h: 700,
      driver: (g, t) => sprite.drawAny(g, { x: 350, y: 690, h: 640, t, emote: me.phase === "boom" ? "scary" : "idle" }),
    });
  }
}

export function update(view) {
  if (!st) return;
  const solved = view.modules.filter((m) => m.solved).length;
  if (view.epoch !== st.epoch) { st.epoch = view.epoch; st.strikeCount = view.strikes; st.solved = solved; }
  const boom = view.phase === "boom";
  st.clock.textContent = boom ? "¡BUM!" : view.clock;
  st.clock.classList.toggle("hurry", !boom && view.left <= 30);
  st.clock.classList.toggle("boom", boom);
  fill(st.strikes, Array.from({ length: view.max_strikes }, (_, i) => h("span", { class: i < view.strikes ? "on" : "" }, "✘")));
  fill(st.modules, view.modules.map((m) => h("span", { class: `bomb-module${m.solved ? " solved" : ""}` },
    h("span", { class: "bomb-led", "aria-hidden": "true" }), `${m.title}${m.solved ? " ✔" : ""}`)));
  st.role.textContent = boom
    ? "La bomba ha explotado. Bombardiro trae otra..."
    : `Artificiero: ${view.defuser}. Solo su móvil tiene la bomba: describidla en voz alta.`;
  st.experts.textContent = view.experts.length
    ? `El manual está repartido: ${view.experts.map((e) => `${e.name} (${e.pages} pág.)`).join(" · ")}. Cada error quita ${view.strike_s} s.`
    : "Sin expertos: el artificiero tiene la bomba y el manual entero.";
  // sounds: no per-second tick (it grated), a heart races from the last 10 s, a strike buzzes, a module done chimes,
  // the boom booms
  if (!boom && view.left === 10 && st.left !== 10) play("heartbeat");
  if (view.strikes > st.strikeCount && !boom) play("strike");
  if (solved > st.solved) play("module");
  if (boom && st.phase !== "boom") play("boom");
  st.left = view.left;
  st.strikeCount = view.strikes;
  st.solved = solved;
  st.phase = view.phase;
}

export function unmount() {
  if (!st) return;
  if (st.mount) st.mount.destroy();
  if (st.host) st.host.remove();
  st = null;
}
