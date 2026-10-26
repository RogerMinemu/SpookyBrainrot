// Multitouch hold pad. State-based input: the phone always sends the full mask of held buttons,
// so a lost or repeated frame is harmless (L=1 R=2 J=4 A=8, see GAME_DESIGN).
import { h } from "/static/js/shared/dom.js";

export const BIT = { L: 1, R: 2, J: 4, A: 8 };
const THROTTLE_MS = 33;   // trailing throttle: at most ~30 frames/s
const HEARTBEAT_MS = 1000; // re-send the held mask so the TV never keeps a stale one

export const DEFAULT_BUTTONS = [
  { bit: BIT.L, label: "←", aria: "Izquierda", cls: "pad-left" },
  { bit: BIT.R, label: "→", aria: "Derecha", cls: "pad-right" },
  { bit: BIT.J, label: "SALTAR", aria: "Saltar", cls: "pad-jump" },
];

/**
 * Mount a pad into `root`.
 * @param {HTMLElement} root
 * @param {{sendInput:(mask:number)=>any}} ctx
 * @param {{buttons?:Array, groups?:Array<Array<number>>}} [opts] buttons by index; groups split them into rows
 * @returns {{resend():void, pause(on:boolean):void, mask():number, destroy():void, el:HTMLElement}}
 */
export function mountPad(root, ctx, opts = {}) {
  const buttons = opts.buttons || DEFAULT_BUTTONS;
  const held = new Map(buttons.map((b) => [b, new Set()])); // button -> active pointer ids
  const cleanup = [];
  let mask = 0;
  let lastSent = -1;
  let lastAt = 0;
  let timer = null;
  let paused = false;

  const emit = () => {
    timer = null;
    if (paused) return;
    lastSent = mask;
    lastAt = performance.now();
    ctx.sendInput(mask);
  };
  const schedule = () => {
    if (paused || mask === lastSent || timer) return;
    const wait = Math.max(0, THROTTLE_MS - (performance.now() - lastAt));
    if (wait === 0) emit();
    else timer = setTimeout(emit, wait);
  };
  let forced = 0; // bits held by the demo bots / keyboard (window.__sb), OR-ed with the real pointers
  const recompute = () => {
    let m = forced;
    for (const [b, ids] of held) if (ids.size) m |= b.bit;
    mask = m;
    for (const [b, ids] of held) b.el.classList.toggle("down", ids.size > 0 || (forced & b.bit) !== 0);
    schedule();
  };
  const releaseAll = () => {
    for (const ids of held.values()) ids.clear();
    recompute();
    if (!paused && mask !== lastSent) { clearTimeout(timer); emit(); } // a backgrounded tab may starve timers: send now
  };

  const els = buttons.map((b) => {
    b.el = h("button", { class: `btn pad-btn ${b.cls || ""}`, type: "button", "aria-label": b.aria || b.label },
      h("span", { class: "pad-label" }, b.label));
    const on = (type, fn) => b.el.addEventListener(type, fn);
    on("pointerdown", (e) => {
      e.preventDefault();
      try { b.el.setPointerCapture(e.pointerId); } catch (_) {}
      held.get(b).add(e.pointerId);
      recompute();
    });
    const up = (e) => { held.get(b).delete(e.pointerId); recompute(); };
    on("pointerup", up);
    on("pointercancel", up);
    on("lostpointercapture", up);
    on("contextmenu", (e) => e.preventDefault());
    return b.el;
  });

  const el = h("div", { class: "pad" }, h("div", { class: "pad-move" }, els.filter((_, i) => buttons[i].bit <= BIT.R)),
    h("div", { class: "pad-act" }, els.filter((_, i) => buttons[i].bit > BIT.R)));
  root.appendChild(el);

  const listen = (target, type, fn) => { target.addEventListener(type, fn); cleanup.push(() => target.removeEventListener(type, fn)); };
  listen(window, "blur", releaseAll);
  listen(window, "pagehide", releaseAll);
  listen(document, "visibilitychange", () => { if (document.hidden) releaseAll(); });

  const beat = setInterval(() => { if (!paused) { lastSent = mask; lastAt = performance.now(); ctx.sendInput(mask); } }, HEARTBEAT_MS);

  const api = {
    el,
    mask: () => mask,
    /** Demo only: hold these bits as if fingers were on the buttons. Goes through the same throttle and send path. */
    force(bits) { forced = Number.isInteger(bits) ? bits & 15 : 0; recompute(); },
    resend() { lastSent = -1; schedule(); },
    pause(on) {
      paused = !!on;
      if (paused) { clearTimeout(timer); timer = null; releaseAll(); lastSent = -1; }
      else schedule();
    },
    destroy() {
      clearInterval(beat);
      clearTimeout(timer);
      for (const ids of held.values()) ids.clear();
      mask = 0;
      forced = 0;
      if (!paused) ctx.sendInput(0); // never leave the character running
      cleanup.forEach((fn) => fn());
      if (globalThis.__sb && globalThis.__sb.pad === api) globalThis.__sb.pad = null;
      el.remove();
    },
  };
  if (globalThis.__sb) globalThis.__sb.pad = api; // seat mode only: the page exposes the live pad to the demo
  return api;
}
