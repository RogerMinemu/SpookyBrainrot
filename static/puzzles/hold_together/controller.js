// Room 0 "Agarraos fuerte" - phone controller. Contract: mount(root, ctx), update(view, state), unmount().
// ctx.send(action) sends a puzzle action to the server.
import { h, clear, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";

let state = null;

export function mount(root, ctx) {
  const button = h("button", { class: "btn hold-btn", type: "button" }, h("span", { class: "hold-label" }, "MANTÉN PULSADO"));
  const status = h("p", {}, "Mantened todos a la vez.");
  fill(root, title("Agarraos fuerte", { cls: "phone-title" }), button, panel(status, { cls: "phone-panel hold-status" }));

  const s = { ctx, button, status, holding: false, cleanup: [] };
  state = s;

  const press = (e) => {
    e.preventDefault();
    if (s.holding) return;
    s.holding = true;
    button.classList.add("down");
    ctx.send({ type: "hold", down: true });
  };
  const release = () => {
    if (!s.holding) return;
    s.holding = false;
    button.classList.remove("down");
    ctx.send({ type: "hold", down: false });
  };
  const on = (target, ev, fn, opts) => {
    target.addEventListener(ev, fn, opts);
    s.cleanup.push(() => target.removeEventListener(ev, fn, opts));
  };

  on(button, "pointerdown", press);
  on(button, "pointerup", release);
  on(button, "pointercancel", release);
  on(button, "pointerleave", release);
  on(button, "touchcancel", release);
  on(button, "contextmenu", (e) => e.preventDefault());
  on(window, "blur", release);
  on(document, "visibilitychange", () => { if (document.hidden) release(); });
  on(window, "pagehide", release);
  s.release = release;
  // /admin/demo seat: the bots press the very same button through its pointer handlers
  if (window.__sb) {
    window.__sb.hold = (down) => button.dispatchEvent(new PointerEvent(down ? "pointerdown" : "pointerup", { bubbles: true, cancelable: true }));
  }
}

export function update(view) {
  if (!state) return;
  const { button, status, ctx } = state;
  // Server forgot us (reconnect, reset) while the finger is still down: say it again (idempotent).
  if (state.holding && view.holding === false) ctx.send({ type: "hold", down: true });
  const pct = Math.round((view.progress || 0) * 100);
  status.textContent = state.holding ? `Aguantad... ${pct}%` : "Mantened todos a la vez.";
}

export function unmount() {
  if (!state) return;
  state.cleanup.forEach((fn) => fn());
  if (window.__sb) window.__sb.hold = null;
  state = null;
}
