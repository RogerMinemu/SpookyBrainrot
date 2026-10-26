// Painter: the engine adapter. Owns ONE p5 instance (instance mode) with ONE fixed WEBGL work
// canvas, paints named plates in its sub-rect and exports them as WebP blob URLs.
// Screens never import this file (boot.js is the only entry point).
//
// Rules proven by the gate (decision/watercolor-p5-mode):
//  - never resizeCanvas(), never re-init; rotating = repainting the bg at the new aspect
//  - the first two redraws after setup are warm-up (blank + uniform warnings), so run two throwaways
//  - one plate = one `await p.redraw()` followed by a yielded frame, so input is never blocked
import { createEngine } from "./engine.js";
import { PLATE_SPECS, RECIPES } from "./plates.js";

export const ART_VERSION = 1;
const TV_W = 1920, TV_H = 1080;

export const clampNum = (x, a, b) => Math.max(a, Math.min(b, x));
/** Flex (phone / home) work canvas: a square sized from the viewport, at most 1.5x dpr. */
export function flexSize(vw, vh, dpr = 1) {
  return Math.round(clampNum(Math.max(vw, vh) * Math.min(dpr, 1.5), 720, 1440));
}
/** bg size for a viewport: the long side maps to the work canvas, the aspect is kept. */
export function bgSize(layout, vw, vh, dpr = 1) {
  if (layout === "tv") return [TV_W, TV_H];
  const S = flexSize(vw, vh, dpr), k = S / Math.max(vw, vh);
  return [Math.max(2, Math.round(vw * k)), Math.max(2, Math.round(vh * k))];
}

const frame = () => new Promise((r) => { const t = setTimeout(r, 60); requestAnimationFrame(() => { clearTimeout(t); r(); }); });
const css = () => getComputedStyle(document.documentElement);

/** Palette: single source is theme.css (tokens per html[data-room]). */
export function readPalette() {
  const cs = css(), v = (n, d) => (cs.getPropertyValue(n).trim() || d);
  return {
    a: v("--room-a", "#1F2550"), b: v("--room-b", "#2F3C7A"), c: v("--room-c", "#E8AA38"),
    btn: v("--btn", "#E8AA38"), ink: v("--ink", "#2B2233"), paper: v("--paper", "#F3EBDC"),
    surface: v("--surface", "#FFF5E2"), danger: v("--danger", "#B8323A"),
  };
}

export function createPainter({ layout }) {
  const cache = new Map();
  const inflight = new Map();
  const grains = new Map();
  const urls = [];
  const timings = []; // { name, variant, ms } of the last plates: paint + redraw time, for the dev pages
  let P = null, E = null, disposed = false, chain = Promise.resolve();
  const [WC, HC] = layout === "tv" ? [TV_W, TV_H] : (() => { const S = flexSize(innerWidth, innerHeight, devicePixelRatio); return [S, S]; })();

  const host = document.createElement("div");
  host.id = "art-p5"; host.hidden = true; host.style.display = "none";
  document.body.append(host);

  const ready = new Promise((resolve, reject) => {
    try {
      new window.p5((p) => {
        window.brush.instance(p);
        p.setup = () => {
          p.createCanvas(WC, HC, p.WEBGL); p.pixelDensity(1); p.noLoop();
          window.brush.scaleBrushes(5);
          E = createEngine(p, { w: WC, h: HC });
          E.defineBrushes();
          P = p;
          // two throwaway redraws incl. a fill+hatch shape (first is blank, second warns about uniforms)
          const warm = () => { p.push(); p.translate(-WC / 2, -HC / 2); p.clear(); E.paint(E.rr(10, 10, 200, 160, 30, 2), { wash: "#ccc", fill: "#999", hatch: { d: 12, a: 45 }, ink: "#222", sw: 1 }); p.pop(); };
          p.draw = () => { if (p.__job) p.__job(); };
          (async () => { for (let i = 0; i < 2; i++) { p.__job = warm; await p.redraw(); p.__job = null; await frame(); } resolve(); })().catch(reject);
        };
      }, host);
    } catch (e) { reject(e); }
  });

  // plates larger than the work canvas (phones: swash 1400 > 720..1266) are painted smaller; they are
  // stretched by CSS anyway, so only the pixel density changes
  const fit = (w, h) => { const k = Math.min(1, WC / w, HC / h); return k < 1 ? [Math.max(2, Math.floor(w * k)), Math.max(2, Math.floor(h * k))] : [w, h]; };

  const canvasEl = () => P && P.drawingContext && P.drawingContext.canvas;

  function grain(w, h, vignette) {
    const k = `${w}x${h}:${vignette}`;
    if (!grains.has(k)) { if (grains.size > 6) grains.delete(grains.keys().next().value); grains.set(k, E.grainCanvas(w, h, vignette)); }
    return grains.get(k);
  }

  // GL sub-rect -> 2D canvas, grain multiplied only where the plate has pixels
  function toCanvas(w, h, spec) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const c = cv.getContext("2d");
    c.drawImage(canvasEl(), 0, 0, w, h, 0, 0, w, h);
    const g = grain(w, h, !!spec.vignette);
    if (spec.opaque) { c.globalCompositeOperation = "multiply"; c.drawImage(g, 0, 0); return cv; }
    const m = document.createElement("canvas"); m.width = w; m.height = h;
    const mc = m.getContext("2d");
    mc.drawImage(g, 0, 0); mc.globalCompositeOperation = "destination-in"; mc.drawImage(cv, 0, 0);
    c.globalCompositeOperation = "multiply"; c.drawImage(m, 0, 0);
    if (spec.hole) {
      c.globalCompositeOperation = "destination-out"; c.beginPath();
      const i = spec.hole.inset * (w / 520), r = spec.hole.r;
      if (c.roundRect) c.roundRect(i, i, w - 2 * i, h - 2 * i, r); else c.rect(i, i, w - 2 * i, h - 2 * i);
      c.fill();
    }
    return cv;
  }
  const toBlob = (cv) => new Promise((r) => cv.toBlob(r, "image/webp", 0.86));

  async function paintOne(name, o) {
    await ready;
    if (disposed) throw new Error("disposed");
    const spec = PLATE_SPECS[name], recipe = RECIPES[name];
    if (!spec || !recipe) throw new Error(`unknown plate ${name}`);
    // character plates are global (they do not depend on the room): they are never stale
    if (!spec.global && document.documentElement.dataset.room !== o.room) throw new Error("stale");
    const [w, h] = fit(...spec.size(o));
    if (w > WC || h > HC) throw new Error(`plate ${name} ${w}x${h} exceeds work canvas ${WC}x${HC}`);
    const pal = readPalette(), m = Math.min(w, h) / 1080;
    E.resize(w, h);
    const t0 = performance.now();
    P.__job = () => {
      P.push(); P.translate(-WC / 2, -HC / 2); P.clear();
      E.setBoil(o.variant || 0); E.boilSeed(`${name}|${spec.global ? "*" : o.room}|${o.seed || 0}`);
      recipe(E, pal, { ...o, w, h, m });
      P.pop();
    };
    await P.redraw();
    P.__job = null;
    timings.push({ name, variant: o.variant || 0, ms: Math.round(performance.now() - t0) });
    if (timings.length > 64) timings.shift();
    const blob = await toBlob(toCanvas(w, h, spec));
    await frame();
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return { url, w, h };
  }

  /** plate(name, { room, variant, w, h, seed }) -> Promise<{ url, w, h }> (cached, serialised). */
  function plate(name, o = {}) {
    const spec = PLATE_SPECS[name];
    const [w, h] = spec ? fit(...spec.size(o)) : [0, 0];
    const key = `${layout}:${w}x${h}:${spec && spec.global ? "*" : o.room}:${name}:${o.variant || 0}:${o.seed || 0}:${ART_VERSION}`;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inflight.has(key)) return inflight.get(key);
    const job = chain.then(() => paintOne(name, o)).then((res) => { cache.set(key, res); return res; });
    chain = job.catch(() => {});
    inflight.set(key, job);
    job.then(() => inflight.delete(key), () => inflight.delete(key));
    return job;
  }

  function onContextLost(fn) {
    ready.then(() => { const el = canvasEl(); if (el) el.addEventListener("webglcontextlost", (e) => { e.preventDefault(); fn(); }); }).catch(() => {});
  }

  function dispose() {
    disposed = true;
    for (const u of urls) URL.revokeObjectURL(u);
    urls.length = 0; cache.clear();
    try { P && P.remove(); } catch { /* ignore */ }
    host.remove();
  }

  return { ready, plate, dispose, onContextLost, size: [WC, HC], timings, stats: () => ({ cached: cache.size, inflight: inflight.size }) };
}
