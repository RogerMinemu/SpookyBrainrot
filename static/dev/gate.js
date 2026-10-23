// Dev-only gate: p5 INSTANCE mode + p5.brush, one fixed WEBGL canvas, plates clipped to transparent corners.
import { createEngine, PAL } from '../js/art/engine.js';

const FIXED = 1920; // work canvas is 1920x1920 so any tested shape fits as a sub-rect
let P = null, E = null;

function boot() {
  return new Promise((resolve) => {
    new window.p5((p) => {
      window.brush.instance(p);
      p.setup = () => {
        p.createCanvas(FIXED, FIXED, p.WEBGL); p.pixelDensity(1); p.noLoop();
        window.brush.scaleBrushes(5);
        E = createEngine(p, { w: FIXED, h: FIXED });
        E.defineBrushes();
        P = p; resolve();
      };
      p.draw = () => { if (p.__job) p.__job(); };
    });
  });
}

// run one painting job inside a redraw (brush composites on postdraw)
async function run(job) { console.info('MARK run'); P.__job = job; await P.redraw(); P.__job = null; console.info('MARK run done'); }

function paintBg(w, h) {
  const m = Math.min(w, h) / 1080;
  E.setBoil(0); E.boilSeed('bg');
  P.push(); P.translate(-FIXED / 2, -FIXED / 2);
  P.clear(); P.background(PAL.paper);
  E.paint(E.rect(-20, -20, w + 40, h + 40), { wash: '#E8D77A', washOp: 200, ink: null });
  E.paint(E.rect(0, h * .55, w, h * .5, 8 * m), { wash: '#7A6A2A', washOp: 140, ink: null });
  E.paint(E.rr(30 * m, 30 * m, w - 60 * m, h - 60 * m, 30 * m, 3 * m), { ink: PAL.ink, sw: 1.4 });
  P.pop();
}
function paintPanel(w, h) {
  const m = Math.min(w, h) / 1080;
  E.setBoil(0); E.boilSeed('panel');
  P.push(); P.translate(-FIXED / 2, -FIXED / 2);
  P.clear();
  E.paint(E.rr(10 * m, 10 * m, w - 20 * m, h - 20 * m, 48 * m, 2 * m), { wash: PAL.cream, washOp: 230, fill: PAL.teal, fillOp: 120, bleed: .12, hatch: { d: 14 * m, a: 45 }, ink: PAL.ink, sw: 1 });
  P.pop();
}

// copy the sub-rect to a 2D canvas, through a clip path (rounded rect) => transparent corners
function toClipped(w, h, radius, opaque) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  if (!opaque) {
    c.beginPath();
    if (c.roundRect) c.roundRect(0, 0, w, h, radius); else c.rect(0, 0, w, h);
    c.clip();
  }
  c.drawImage(P.drawingContext.canvas, 0, 0, w, h, 0, 0, w, h);
  c.globalCompositeOperation = 'multiply'; c.drawImage(E.grainCanvas(w, h, false), 0, 0);
  return cv;
}
const blobOf = (cv) => new Promise((r) => cv.toBlob(r, 'image/webp', 0.9));
async function decode(blob) { const bm = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bm, 0, 0); return { c, x, mime: blob.type, bytes: blob.size }; }
function variance(x, w, h) {
  const d = x.getImageData(0, 0, w, h).data; let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] + d[i + 1] + d[i + 2]; s += v; s2 += v * v; n++; }
  const m = s / n; return s2 / n - m * m;
}

async function testShape(name, w, h) {
  console.info('MARK shape ' + name);
  const out = { name, w, h };
  let t = performance.now();
  await run(() => paintBg(w, h)); out.bgMs = Math.round(performance.now() - t);
  const bg = toClipped(w, h, 0, true);
  out.bgVariance = Math.round(variance(bg.getContext('2d'), w, h));
  const bgBlob = await blobOf(bg); out.bgMime = bgBlob.type; out.bgBytes = bgBlob.size;
  t = performance.now();
  await run(() => paintPanel(w, h)); out.panelMs = Math.round(performance.now() - t);
  const pc = toClipped(w, h, Math.round(48 * Math.min(w, h) / 1080), false);
  const blob = await blobOf(pc); out.panelMime = blob.type; out.panelBytes = blob.size;
  const dec = await decode(blob);
  const a = (x, y) => dec.x.getImageData(x, y, 1, 1).data[3];
  out.cornerAlpha = [a(0, 0), a(w - 1, 0), a(0, h - 1), a(w - 1, h - 1)];
  out.centreAlpha = a(w >> 1, h >> 1);
  out.panelVariance = Math.round(variance(dec.x, w, h));
  for (const [id, cv] of [['bg', bg], ['panel', dec.c]]) {
    cv.className = 'out'; cv.title = `${name} ${id}`; document.getElementById('shots').appendChild(cv);
  }
  return out;
}

async function main() {
  const diffNew = Object.getOwnPropertyNames(window).filter((k) => !window.__before.includes(k));
  const t0 = performance.now();
  console.info('MARK boot'); await boot(); console.info('MARK booted');
  // warm-up paint (shader compile / first composite); ?nowarm skips it to expose the cold-start behaviour
  if (!location.search.includes('nowarm')) { const tw = performance.now(); const ws = +(new URLSearchParams(location.search).get('warm') || 256); for (let i = 0; i < 2; i++) await run(() => { paintBg(ws, ws); paintPanel(ws, ws); }); window.__warmMs = Math.round(performance.now() - tw); }
  const res = { warmMs: window.__warmMs, bootMs: Math.round(performance.now() - t0), newGlobals: diffNew,
    leaks: { fill: typeof window.fill, clear: typeof window.clear, createCanvas: typeof window.createCanvas, print: String(window.print).includes('[native code]') ? 'native' : 'LEAK' },
    shapes: [], rotate: null };
  res.newGlobalsAfterBoot = Object.getOwnPropertyNames(window).filter((k) => !window.__before.includes(k));
  const gl = P.drawingContext; const e = gl.getExtension('WEBGL_debug_renderer_info');
  res.gpu = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  res.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  res.shapes.push(await testShape('tv', 1920, 1080));
  res.shapes.push(await testShape('square1440', 1440, 1440));
  res.shapes.push(await testShape('square720', 720, 720));
  // rotate by REPAINT on the SAME canvas (portrait -> landscape -> portrait), no resize, no re-init
  const rot = [];
  for (const [w, h] of [[390 * 2, 844 * 2], [844 * 2, 390 * 2], [390 * 2, 844 * 2]]) rot.push(await testShape(`rot${w}x${h}`, w, h));
  res.rotate = rot.map((r) => ({ name: r.name, bgMs: r.bgMs, bgVariance: r.bgVariance, corners: r.cornerAlpha }));
  document.getElementById('log').textContent = JSON.stringify(res, null, 1);
  window.__gate = res; window.__gateDone = true;
}
main().catch((err) => { window.__gate = { error: String(err && err.stack || err) }; window.__gateDone = true; document.getElementById('log').textContent = window.__gate.error; });
