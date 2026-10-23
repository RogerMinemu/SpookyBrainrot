// Watercolor art engine for SpookyBrainrot.
//
// Adapted from ClaudeAnimationBase src/core.js, (c) 2026 John Heibel, MIT License
// (see static/vendor/claude-animation-base/LICENSE). This is a port, not a copy: it is an
// instance-mode factory (no globals, no const W/H), and the timeline, camera, glow, dev UI
// and PROJECT config of the original have been dropped.
//
// Usage: const E = createEngine(p, { w, h }); then E.paint(...), E.flushBrush(), ...
// `p` is a p5 instance (instance mode). p5.brush must already be loaded (window.brush)
// and bound to the same instance with brush.instance(p) before setup runs.

export const PAL = {
  paper: '#F3EBDC', ink: '#2B2233', clay: '#D97757', clayDk: '#A84D33', clayLt: '#F2A283',
  night: '#1F2550', indigo: '#2F3C7A', rose: '#E27A92', ochre: '#E8AA38', sap: '#6E9F58',
  teal: '#3A9C98', violet: '#7B5CA8', cream: '#FFF5E2', sky: '#8EC3E6',
};

const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, x) => a + (b - a) * x;
export const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// hex colour mix
export function mixCol(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (i) => Math.round(lerp((pa >> i) & 255, (pb >> i) & 255, clamp(k)));
  return '#' + ((1 << 24) + (c(16) << 16) + (c(8) << 8) + c(0)).toString(16).slice(1);
}

export function lcg(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function createEngine(p, { w, h }) {
  const brush = (typeof window !== 'undefined' ? window.brush : undefined) || globalThis.brush;
  if (!brush) throw new Error('p5.brush is not loaded');
  const size = { w, h };
  let boilN = 0;

  // Seeded jitter: whatever is not moving must draw the same until the next boil frame.
  const jit = (a) => (p.random() * 2 - 1) * a;
  const setBoil = (n) => { boilN = n; };
  // Restart the random stream from (boil frame, key). Call before each separate element.
  const boilSeed = (key) => {
    let hh = 2166136261;
    for (const c of key + '|' + boilN) hh = Math.imul(hh ^ c.charCodeAt(0), 16777619);
    p.randomSeed(hh >>> 0);
  };

  // ---------- geometry ----------
  function rect(x, y, ww, hh, j = 0) {
    return [[x + jit(j), y + jit(j)], [x + ww / 2 + jit(j), y + jit(j) * .5], [x + ww + jit(j), y + jit(j)],
      [x + ww + jit(j) * .5, y + hh / 2], [x + ww + jit(j), y + hh + jit(j)], [x + ww / 2 + jit(j), y + hh + jit(j) * .5],
      [x + jit(j), y + hh + jit(j)], [x + jit(j) * .5, y + hh / 2]];
  }
  function ell(cx, cy, rx, ry, n = 28, j = 0, rot = 0) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; out.push([cx + Math.cos(a) * rx + jit(j), cy + Math.sin(a) * ry + jit(j)]); }
    return out;
  }
  function rr(x, y, ww, hh, r, j = 0) {
    const out = [], seg = 5;
    const corner = (cx, cy, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + i / seg * Math.PI / 2; out.push([cx + Math.cos(a) * r + jit(j), cy + Math.sin(a) * r + jit(j)]); } };
    corner(x + ww - r, y + r, -Math.PI / 2); corner(x + ww - r, y + hh - r, 0); corner(x + r, y + hh - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
    return out;
  }
  // Smooth curve through the points (Catmull-Rom), n samples per span.
  function through(P, n = 6) {
    if (P.length < 3) return P.slice();
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let k = 0; k < n; k++) {
        const u = k / n, u2 = u * u, u3 = u2 * u;
        out.push([0, 1].map((d) => .5 * (2 * p1[d] + (p2[d] - p0[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * u3)));
      }
    }
    out.push(P[P.length - 1]);
    return out;
  }
  // Tapered ribbon around a path as one closed outline for paint().
  function ribbon(P, w0, w1 = w0) {
    const C = through(P), n = C.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      const ww = lerp(w0, w1, i / Math.max(1, n - 1)) / 2;
      L.push([C[i][0] - dy / d * ww, C[i][1] + dx / d * ww]); R.push([C[i][0] + dy / d * ww, C[i][1] - dx / d * ww]);
    }
    return L.concat(R.reverse());
  }

  // ---------- paint wrapper ----------
  // p5.brush 2.2.3 loses strokes drawn far from the origin under zoom, so every shape is drawn around its own centre.
  function centred(pts, draw) {
    if (!pts.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    p.push(); p.translate(cx, cy); draw(pts.map(([x, y]) => [x - cx, y - cy])); p.pop();
  }
  function paintAt(pts, o) {
    if (o.wash || o.fill || o.hatch) {
      if (o.wash) brush.wash(o.wash, o.washOp ?? 255); else brush.noWash();
      if (o.fill) { brush.fill(o.fill, o.fillOp ?? 170); brush.fillBleed(o.bleed ?? .1); brush.fillTexture(o.tex ?? .4, o.border ?? .35); } else brush.noFill();
      if (o.hatch) { brush.hatch(o.hatch.d, o.hatch.a, o.hatch.o || { rand: .15 }); brush.hatchStyle(o.hatch.b || 'HB', o.hatch.c || PAL.ink, o.hatch.w || 1); } else brush.noHatch();
      brush.noStroke();
      if (o.curv) { brush.beginShape(o.curv); for (const q of pts) brush.vertex(q[0], q[1]); brush.endShape(true); }
      else brush.polygon(pts);
    }
    if (o.ink !== null) {
      brush.noWash(); brush.noFill(); brush.noHatch(); brush.set(o.br || 'ink', o.ink || PAL.ink, o.sw ?? 1);
      brush.beginShape(o.curv || 0); for (const q of pts) brush.vertex(q[0], q[1]); brush.endShape(true);
    }
  }
  // One call = one painted shape: optional wash, watercolor fill, hatch, ink outline.
  function paint(pts, o = {}) { centred(pts, (P) => paintAt(P, o)); }
  function inkLine(pts, sw = 1, col = PAL.ink, br = 'ink', curv = .5) {
    centred(pts, (P) => { brush.noFill(); brush.noWash(); brush.noHatch(); brush.set(br, col, sw); brush.spline(P, curv); });
  }

  // p5.brush defers washes and strokes into a mask layer; a tiny off-screen fill forces it to composite now.
  function flushBrush() {
    p.push(); p.resetMatrix(); p.translate(-size.w / 2, -size.h / 2);
    brush.noStroke(); brush.noHatch(); brush.noWash(); brush.fill('#000000', 1); brush.fillBleed(0); brush.fillTexture(0, 0);
    brush.polygon([[-50, -50], [-40, -50], [-40, -40]]); brush.noFill(); p.pop();
  }

  function defineBrushes() {
    brush.add('ink', { type: 'default', weight: 5, scatter: .25, sharpness: .8, grain: 40, opacity: 235, spacing: .2, pressure: [1.15, .75], rotate: 'natural', noise: .15 });
    brush.add('inkfine', { type: 'default', weight: 2.6, scatter: .15, sharpness: .85, grain: 40, opacity: 230, spacing: .2, pressure: [1.1, .8], rotate: 'natural', noise: .1 });
    brush.add('dry', { type: 'default', weight: 14, scatter: 3, sharpness: .3, grain: 6, opacity: 90, spacing: .6, pressure: [1, .6], rotate: 'natural', noise: .4 });
  }

  // ---------- paper (2D canvas; works outside WEBGL) ----------
  function paperCanvas(ww = size.w, hh = size.h, base = PAL.paper) {
    const cv = document.createElement('canvas'); cv.width = ww; cv.height = hh;
    const c = cv.getContext('2d'), rnd = lcg(11), k = Math.max(ww, hh) / 1920;
    c.fillStyle = base; c.fillRect(0, 0, ww, hh);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * ww, y = rnd() * hh, r = (120 + rnd() * 380) * k, gr = c.createRadialGradient(x, y, 0, x, y, r), a = .045 * rnd();
      gr.addColorStop(0, `rgba(160,125,80,${a})`); gr.addColorStop(1, 'rgba(160,125,80,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    c.lineWidth = 1;
    for (let i = 0; i < 1400 * k * k; i++) {
      const x = rnd() * ww, y = rnd() * hh, l = (6 + rnd() * 26) * k, a = rnd() * TAU;
      c.strokeStyle = `rgba(110,88,60,${.035 + rnd() * .06})`; c.beginPath(); c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(a + .6) * l * .5, y + Math.sin(a + .6) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    return cv;
  }
  // Static grain + vignette, multiplied over the painted frame so pigment sits "in" the paper.
  function grainCanvas(ww = size.w, hh = size.h, vignette = true) {
    const cv = document.createElement('canvas'); cv.width = ww; cv.height = hh;
    const c = cv.getContext('2d'), rnd = lcg(5), id = c.createImageData(ww, hh), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = 255 - (rnd() < .55 ? rnd() * rnd() * 34 : 0); d[i] = v; d[i + 1] = v - 1; d[i + 2] = v - 3; d[i + 3] = 255; }
    c.putImageData(id, 0, 0);
    if (vignette) {
      const g = c.createRadialGradient(ww / 2, hh / 2, hh * .45, ww / 2, hh / 2, Math.max(ww, hh) * .75);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(120,95,70,.35)');
      c.fillStyle = g; c.fillRect(0, 0, ww, hh);
    }
    return cv;
  }

  function resize(nw, nh) { size.w = nw; size.h = nh; }

  return {
    p, brush, PAL, size, resize,
    jit, setBoil, boilSeed, hash, mixCol, clamp, lerp,
    rect, ell, rr, through, ribbon,
    centred, paint, paintAt, inkLine, flushBrush, defineBrushes,
    paperCanvas, grainCanvas,
  };
}
