// Art bootstrap: the ONLY art entry point. Pages call startArt({ layout }) once from their
// composition root (tv/main.js, home.js, ...); screens never touch the painter.
//
//   html[data-art] = loading | ready | fallback | lost
//
// Characters: on the TV, after the room's backgrounds, the character atlases are painted lazily (room guardian
// first, never while html[data-realtime] is set), decoded to <img> and handed to the sprite layer. Pages get
// `api.sprite(id)` (also in fallback: it then draws the flat-ink silhouette).
//
// Fallback triggers: ?art=off, no WebGL2 (failIfMajorPerformanceCaveat), script load failure,
// first plate slower than 4 s, webglcontextlost. In fallback there is no GL at all: a 2D paper
// tile + the CSS washes in theme.css, and the UI keeps working.
import { PLATE_ORDER, PLATE_SPECS, CHAR_PLATE } from "./plates.js";
import { paintPaperTile } from "./paper2d.js";
import { plateQueue } from "./roster.js";
import { createSprites } from "./sprites.js";
import { runCharQueue } from "./queue.js";

const P5_SRC = "/static/vendor/p5/2.3.3/p5.min.js";
const BRUSH_SRC = "/static/vendor/p5.brush/2.2.3/p5.brush.js";
const FIRST_PLATE_MS = 4000;
const RESIZE_DEBOUNCE_MS = 400;
const root = document.documentElement;

let instance = null;

function webgl2Ok() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return true;
  } catch { return false; }
}

const loadScript = (src) => new Promise((resolve, reject) => {
  const s = document.createElement("script");
  s.src = src; s.async = false;
  s.onload = resolve; s.onerror = () => reject(new Error(`script failed: ${src}`));
  document.head.append(s);
});

function ensureLayers() {
  let art = document.getElementById("art");
  if (!art) { art = document.createElement("div"); art.id = "art"; document.body.prepend(art); }
  art.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) {
    if (!art.querySelector(`.art-bg[data-v="${i}"]`)) {
      const d = document.createElement("div"); d.className = "art-bg"; d.dataset.v = String(i); art.append(d);
    }
  }
  return art;
}

export function startArt({ layout = "flex" } = {}) {
  if (instance) return instance;
  const api = {
    layout, painter: null, epoch: 0, repaints: 0, paints: 0, ready: null, fallbackWhy: null,
    state: () => root.dataset.art,
    atlases: new Map(), // `${id}:${variant}` -> decoded <img>
  };
  api.atlas = (id, variant) => api.atlases.get(`${id}:${variant}`) || null;
  const sprites = createSprites({ atlas: api.atlas, art: () => root.dataset.art === "ready" });
  api.sprite = sprites.sprite;
  api.setDegradation = sprites.setDegradation;
  instance = api;
  window.__art = api;
  ensureLayers();
  root.dataset.art = "loading";
  root.dataset.artLayout = layout;
  if (!root.dataset.room) root.dataset.room = "prologue";

  const params = new URLSearchParams(location.search);
  if (params.get("art") === "off") { enterFallback(api, "off"); return api; }
  if (!webgl2Ok()) { enterFallback(api, "nowebgl2"); return api; }

  api.ready = (async () => {
    await loadScript(P5_SRC);
    await loadScript(BRUSH_SRC);
    const { createPainter, bgSize } = await import("./painter.js");
    if (api.fallbackWhy) return;
    const painter = createPainter({ layout });
    api.painter = painter; api.bgSize = bgSize;
    painter.onContextLost(() => enterFallback(api, "lost"));
    api.slowTimer = setTimeout(() => { if (root.dataset.art === "loading") enterFallback(api, "slow"); }, FIRST_PLATE_MS);
    await painter.ready;
    if (api.fallbackWhy) return;
    watch(api);
    queueRoom(api);
  })().catch((e) => { console.warn("art: falling back", e && e.message); enterFallback(api, "error"); });
  return api;
}

function setVar(name, url) { root.style.setProperty(name, `url("${url}")`); }

const sizeNow = (api) => api.bgSize(api.layout, innerWidth, innerHeight, devicePixelRatio || 1);

async function queueRoom(api) {
  const epoch = ++api.epoch;
  const room = root.dataset.room || "prologue";
  const alive = () => epoch === api.epoch && !api.fallbackWhy;
  root.dataset.boil = "off";
  const run = async (name, o = {}) => {
    if (!alive()) return false;
    try {
      api.paints += 1;
      const r = await api.painter.plate(name, { room, ...o });
      if (!alive()) return false;
      setVar(PLATE_SPECS[name].css(o.variant || 0), r.url);
      return true;
    } catch (e) {
      if (e && (e.message === "stale" || e.message === "disposed")) return false;
      throw e;
    }
  };
  // a character atlas: paint (cached globally), decode, register. Failure keeps the silhouette, never the art.
  const runChar = async (id, variant) => {
    if (!alive()) return false;
    try {
      api.paints += 1;
      const r = await api.painter.plate(CHAR_PLATE(id), { room, variant });
      if (!alive()) return false; // late: cached by the painter, but not registered by this old queue
      const key = `${id}:${variant}`;
      if (!api.atlases.has(key)) {
        const img = new Image();
        img.src = r.url;
        await img.decode();
        if (!alive()) return false;
        api.atlases.set(key, img);
      }
      return true;
    } catch (e) {
      if (e && (e.message === "stale" || e.message === "disposed")) return false;
      console.warn("art: character plate failed", id, e && e.message);
      return true;
    }
  };
  const [w, h] = sizeNow(api);
  api.lastBg = `${w}x${h}`;
  if (!(await run("bg", { variant: 0, w, h }))) return;
  clearTimeout(api.slowTimer);
  root.dataset.art = "ready";
  const layer = document.getElementById("art");
  if (layer) layer.classList.add("on");
  for (const name of PLATE_ORDER) { if (!(await run(name))) return; }
  if (api.layout === "tv") {
    for (const variant of [1, 2]) { if (!(await run("bg", { variant, w, h }))) return; }
    if (alive() && !matchMedia("(prefers-reduced-motion: reduce)").matches) root.dataset.boil = "on";
    await runCharQueue({
      order: plateQueue(room), alive, paint: runChar,
      paused: () => !!root.dataset.realtime, // never while a sim runs
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    });
  }
}

function watch(api) {
  new MutationObserver(() => { if (!api.fallbackWhy) queueRoom(api); })
    .observe(root, { attributes: true, attributeFilter: ["data-room"] });
  if (api.layout === "tv") return; // the TV canvas is fixed 1920x1080; object-fit handles the rest
  let timer = null;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (api.fallbackWhy) return;
      const [w, h] = sizeNow(api);
      if (api.lastBg === `${w}x${h}`) return;
      api.lastBg = `${w}x${h}`; api.repaints += 1;
      const room = root.dataset.room || "prologue", epoch = api.epoch;
      try {
        api.paints += 1;
        const r = await api.painter.plate("bg", { room, variant: 0, w, h });
        if (epoch === api.epoch && !api.fallbackWhy) setVar("--plate-bg-0", r.url);
      } catch (e) { if (!e || (e.message !== "stale" && e.message !== "disposed")) console.warn("art: repaint failed", e && e.message); }
    }, RESIZE_DEBOUNCE_MS);
  };
  addEventListener("resize", onChange);
  matchMedia("(orientation: portrait)").addEventListener("change", onChange);
}

async function enterFallback(api, why) {
  if (api.fallbackWhy) return;
  api.fallbackWhy = why; api.epoch += 1;
  clearTimeout(api.slowTimer);
  root.dataset.art = "fallback"; root.dataset.artWhy = why; root.dataset.boil = "off";
  api.atlases.clear();
  for (const n of ["--plate-bg-0", "--plate-bg-1", "--plate-bg-2", "--tex-panel", "--tex-btn", "--tex-swash", "--tex-frame", "--tex-splat"]) root.style.removeProperty(n);
  try { if (api.painter) api.painter.dispose(); } catch { /* ignore */ }
  try {
    const tile = await paintPaperTile();
    if (tile) root.style.setProperty("--paper-tile", `url("${tile}")`);
  } catch { /* the CSS washes are enough */ }
}
