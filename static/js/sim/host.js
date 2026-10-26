// Sim host: drives a pure sim from requestAnimationFrame at a fixed step and talks to the server.
// raf / caf / now are injectable so node tests replay whole levels without a browser.
import { advance, FIXED_DT } from "./loop.js";

export const STALE_MS = 2500; // a mask older than this is treated as 0 (phone gone silent, never a ghost runner)

/**
 * @param {object} o
 * @param {(opts:{level:number, roster:Array, seed:number})=>object} o.makeSim sim factory
 * @param {(sim:object, alpha:number)=>void} [o.draw] called once per rendered frame
 * @param {(report:object)=>void} [o.report] TV -> server outcome report (sim message)
 * @param {(to:string, kind:string, data?:any)=>void} [o.fx] effect for a phone ("all" or a player id)
 */
export function createHost({ makeSim, draw, report, fx, raf, caf, now, staleMs = STALE_MS }) {
  const clock = now || (() => Date.now());
  const rafFn = raf || ((fn) => globalThis.requestAnimationFrame(fn));
  const cafFn = caf || ((id) => globalThis.cancelAnimationFrame(id));
  const masks = new Map(); // pid -> { mask, at }
  let roster = [];
  let view = null;         // { epoch, level, seed }
  let sim = null;
  let reported = false;    // the clear goes out once per sim instance
  let acc = 0;
  let last = null;
  let handle = null;

  const send = (r) => { if (report) report({ ...r, epoch: view.epoch, level: view.level }); };

  function route(events) {
    for (const e of events) {
      if (e.type === "clear") {
        if (!reported) { reported = true; send({ action: "clear" }); }
      } else if (e.type === "arrive") {
        send({ action: "arrive", pid: e.id });
      } else if (e.type === "penalty") {
        send({ action: "penalty", pid: e.id, why: e.why });
        if (fx) fx(e.id, "fail");
      } else if (e.type === "fx") {
        if (fx) fx(e.to, e.kind, e.data);
      }
    }
  }

  function rebuild() {
    sim = makeSim({ level: view.level, roster, seed: view.seed });
    reported = false;
    acc = 0;
  }

  function applyMasks() {
    const t = clock();
    for (const p of roster) {
      const m = masks.get(p.id);
      sim.setInput(p.id, m && t - m.at <= staleMs ? m.mask : 0);
    }
  }

  const host = {
    get sim() { return sim; },
    get view() { return view; },
    /** New epoch or level (or seed) rebuilds the sim from scratch; the same view is a no-op. */
    setView(next) {
      if (view && view.epoch === next.epoch && view.level === next.level && view.seed === next.seed) return;
      view = { epoch: next.epoch, level: next.level, seed: next.seed };
      rebuild();
    },
    setRoster(list) {
      roster = list.slice();
      if (sim) sim.setRoster(roster);
    },
    setInput(pid, mask) { masks.set(pid, { mask, at: clock() }); },
    /** One rendered frame at timestamp `ts` (ms). */
    frame(ts) {
      if (last === null) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      if (!sim) return;
      applyMasks();
      const r = advance(acc, dt);
      acc = r.acc;
      for (let i = 0; i < r.steps; i++) {
        sim.step();
        route(sim.drain());
      }
      if (draw) draw(sim, acc / FIXED_DT);
    },
    start() {
      if (handle !== null) return;
      const tick = (ts) => { host.frame(ts); if (handle !== null) handle = rafFn(tick); }; // stop() inside a frame ends the loop
      last = null;
      handle = rafFn(tick);
      if (globalThis.__sbtv) globalThis.__sbtv.host = host; // /admin/demo?demo=1 TV only: lets the bots read the live sim
    },
    stop() {
      if (handle !== null) cafFn(handle);
      handle = null;
      if (globalThis.__sbtv && globalThis.__sbtv.host === host) globalThis.__sbtv.host = null;
    },
  };
  return host;
}
