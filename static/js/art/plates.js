// Plate recipes: what gets painted for each named plate in each room.
// A recipe paints inside the sub-rect [0,w] x [0,h] (the painter has already translated the
// WEBGL origin) and uses ONLY the engine (E) - no p5 calls of its own except through E.p.
// Colours come from theme.css tokens (the painter reads them via getComputedStyle), never from here.
import { mixCol, PAL } from "./engine.js";

/** Plates in queue order. `size(o)` -> [w, h]; `opaque` plates are full-bleed backgrounds. */
export const PLATE_SPECS = {
  bg: { opaque: true, vignette: true, size: (o) => [o.w, o.h], css: (v) => `--plate-bg-${v}` },
  panel: { size: () => [640, 420], css: () => "--tex-panel" },
  btn: { size: () => [360, 132], css: () => "--tex-btn" },
  swash: { size: () => [1400, 280], css: () => "--tex-swash" },
  frame: { size: () => [520, 520], css: () => "--tex-frame", hole: { inset: 46, r: 14 } },
  splat: { size: () => [512, 512], css: () => "--tex-splat" },
};
export const PLATE_ORDER = ["panel", "btn", "swash", "frame", "splat"];
export const ROOMS = ["prologue", "backrooms", "poolrooms"];

const darker = (c, k) => mixCol(c, "#0a0812", k);
const lighter = (c, k) => mixCol(c, "#FFF8E8", k);

// ------------------------------------------------------------------ backgrounds
function bgPrologue(E, pal, { w, h, m }) {
  const dark = darker(pal.a, .55), mid = darker(pal.a, .25);
  E.paint(E.rect(-20, -20, w + 40, h + 40, 6 * m), { wash: pal.a, washOp: 255, ink: null });
  // sky glow behind the moon + fog bands
  E.paint(E.ell(w * .76, h * .26, 330 * m, 250 * m, 24, 14 * m), { wash: pal.b, washOp: 150, ink: null });
  E.paint(E.ell(w * .5, h * .72, w * .62, 150 * m, 26, 16 * m), { wash: pal.b, washOp: 110, ink: null });
  // stars
  for (let i = 0; i < 26; i++) {
    const x = (.04 + E.hash(i * 3 + 1) * .92) * w, y = (.03 + E.hash(i * 7 + 2) * .5) * h;
    E.paint(E.ell(x, y, (3 + E.hash(i) * 5) * m, (3 + E.hash(i + 9) * 5) * m, 8, m), { wash: lighter(pal.c, .4), washOp: 230, ink: null });
  }
  // the moon
  E.paint(E.ell(w * .76, h * .26, 120 * m, 120 * m, 26, 4 * m), { wash: lighter(pal.c, .55), washOp: 245, fill: pal.c, fillOp: 70, bleed: .15, ink: PAL.ink, sw: 1.1 });
  E.paint(E.ell(w * .8, h * .23, 92 * m, 92 * m, 22, 6 * m), { wash: darker(pal.c, .2), washOp: 70, ink: null });
  // ground
  E.paint(E.rect(-30, h * .78, w + 60, h * .3, 12 * m), { wash: dark, washOp: 255, fill: pal.b, fillOp: 90, ink: PAL.ink, sw: 1 });
  // the house: body, roof, tower
  const hx = w * .2, hy = h * .46, hw = w * .24, hh = h * .34;
  E.paint(E.rect(hx, hy + hh * .25, hw, hh * .75, 5 * m), { wash: dark, washOp: 255, fill: mid, fillOp: 90, hatch: { d: 22 * m, a: 80, c: pal.b, w: .7 }, ink: PAL.ink, sw: 1.2 });
  E.paint([[hx - 30 * m, hy + hh * .27], [hx + hw / 2, hy - hh * .1], [hx + hw + 30 * m, hy + hh * .27]].map(([x, y]) => [x + E.jit(5 * m), y + E.jit(5 * m)]), { wash: darker(pal.a, .75), washOp: 255, ink: PAL.ink, sw: 1.3 });
  E.paint(E.rect(hx + hw * .72, hy - hh * .02, hw * .2, hh * .4, 4 * m), { wash: dark, washOp: 255, ink: PAL.ink, sw: 1 });
  for (const [fx, fy] of [[.16, .5], [.56, .5], [.38, .74]]) {
    E.paint(E.rect(hx + hw * fx, hy + hh * fy, hw * .16, hh * .17, 3 * m), { wash: pal.c, washOp: 240, fill: PAL.ochre, fillOp: 120, ink: PAL.ink, sw: .8 });
  }
  // dead tree
  const tx = w * .9;
  E.inkLine(E.through([[tx, h * .85], [tx - 10 * m, h * .62], [tx + 20 * m, h * .45], [tx + 4 * m, h * .3]]), 2.2, PAL.ink);
  E.inkLine(E.through([[tx + 8 * m, h * .5], [tx - 70 * m, h * .42], [tx - 120 * m, h * .35]]), 1.4, PAL.ink);
  E.inkLine(E.through([[tx + 16 * m, h * .42], [tx + 80 * m, h * .34], [tx + 120 * m, h * .27]]), 1.4, PAL.ink);
  // slime drips from the top edge
  for (let i = 0; i < 9; i++) {
    const x = (.06 + E.hash(i * 5 + 3) * .88) * w, len = (40 + E.hash(i * 11) * 120) * m;
    E.paint(E.rr(x - 9 * m, -10, 18 * m, len + 10, 9 * m, 1.5 * m), { wash: darker(pal.a, .35), washOp: 235, ink: PAL.ink, sw: .6 });
  }
}

function bgBackrooms(E, pal, { w, h, m }) {
  const vx = w * .5, vy = h * .46, fw = w * .2, fh = h * .2;
  const wall = pal.a, dk = pal.b, lt = pal.c;
  E.paint(E.rect(-20, -20, w + 40, h + 40, 6 * m), { wash: wall, washOp: 255, ink: null });
  // far wall
  E.paint(E.rect(vx - fw / 2, vy - fh / 2, fw, fh, 3 * m), { wash: darker(wall, .12), washOp: 255, ink: PAL.ink, sw: 1 });
  // side walls with wallpaper stripes
  E.paint([[-20, -20], [vx - fw / 2, vy - fh / 2], [vx - fw / 2, vy + fh / 2], [-20, h + 20]], { wash: wall, washOp: 255, fill: dk, fillOp: 60, hatch: { d: 30 * m, a: 90, c: dk, w: .8 }, ink: PAL.ink, sw: 1.2 });
  E.paint([[w + 20, -20], [vx + fw / 2, vy - fh / 2], [vx + fw / 2, vy + fh / 2], [w + 20, h + 20]], { wash: darker(wall, .08), washOp: 255, fill: dk, fillOp: 60, hatch: { d: 30 * m, a: 90, c: dk, w: .8 }, ink: PAL.ink, sw: 1.2 });
  // ceiling and carpet
  E.paint([[-20, -20], [w + 20, -20], [vx + fw / 2, vy - fh / 2], [vx - fw / 2, vy - fh / 2]], { wash: lighter(wall, .25), washOp: 255, fill: dk, fillOp: 50, ink: PAL.ink, sw: 1.1 });
  E.paint([[-20, h + 20], [w + 20, h + 20], [vx + fw / 2, vy + fh / 2], [vx - fw / 2, vy + fh / 2]], { wash: dk, washOp: 255, fill: darker(dk, .3), fillOp: 120, hatch: { d: 18 * m, a: 0, c: darker(dk, .35), w: .7 }, ink: PAL.ink, sw: 1.1 });
  // fluorescent panels receding down the ceiling
  for (let i = 0; i < 4; i++) {
    const t = i / 4, cy = vy - fh / 2 - (vy - fh / 2) * (1 - t) * .72 - 10 * m, ww = (fw * .9) * (1 + (1 - t) * 3.2), hh = 26 * m * (1 + (1 - t) * 2.2);
    E.paint(E.rect(vx - ww / 2, cy - hh / 2, ww, hh, 2 * m), { wash: "#FFFBE0", washOp: 250, fill: lt, fillOp: 90, ink: PAL.ink, sw: .9 });
  }
  // perspective seams and a door at the end
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    E.inkLine([[x, y], [x < vx ? vx - fw / 2 : vx + fw / 2, y < vy ? vy - fh / 2 : vy + fh / 2]], 1.1, PAL.ink, "inkfine");
  }
  E.paint(E.rect(vx - 22 * m, vy - fh * .35, 44 * m, fh * .7, 2 * m), { wash: darker(wall, .45), washOp: 255, ink: PAL.ink, sw: .8 });
  // a damp stain
  E.paint(E.ell(w * .14, h * .3, 120 * m, 80 * m, 22, 16 * m), { wash: darker(wall, .3), washOp: 70, ink: null });
}

function bgPoolrooms(E, pal, { w, h, m }) {
  const wall = pal.a, deep = pal.b, tile = pal.c;
  E.paint(E.rect(-20, -20, w + 40, h + 40, 6 * m), { wash: wall, washOp: 255, ink: null });
  // tiled wall: faint grid + shiny tiles
  const cols = 9, rows = 5, tw = w / cols, th = (h * .64) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (E.hash(r * 17 + c) < .55) continue;
      E.paint(E.rect(c * tw + 4 * m, r * th + 4 * m, tw - 8 * m, th - 8 * m, 3 * m), { wash: tile, washOp: 90, ink: null });
    }
  }
  for (let c = 1; c < cols; c++) E.inkLine([[c * tw, 0], [c * tw + E.jit(3 * m), h * .64]], .8, mixCol(deep, "#000000", .1), "inkfine");
  for (let r = 1; r <= rows; r++) E.inkLine([[0, r * th], [w, r * th + E.jit(3 * m)]], .8, mixCol(deep, "#000000", .1), "inkfine");
  // arches / pillars
  for (const px of [.14, .5, .86]) {
    E.paint(E.rect(w * px - 36 * m, h * .12, 72 * m, h * .6, 4 * m), { wash: lighter(tile, .5), washOp: 235, fill: tile, fillOp: 60, ink: PAL.ink, sw: 1.1 });
  }
  E.paint(E.ell(w * .32, h * .3, w * .12, h * .2, 30, 6 * m), { wash: darker(wall, .3), washOp: 90, ink: null });
  E.paint(E.ell(w * .68, h * .3, w * .12, h * .2, 30, 6 * m), { wash: darker(wall, .3), washOp: 90, ink: null });
  // the pool: deep water with ripples
  E.paint(E.rect(-30, h * .66, w + 60, h * .45, 10 * m), { wash: deep, washOp: 255, fill: darker(deep, .3), fillOp: 110, ink: PAL.ink, sw: 1.2 });
  for (let i = 0; i < 5; i++) {
    const y = h * (.72 + i * .055), amp = (8 + i * 2) * m, pts = [];
    for (let k = 0; k <= 8; k++) pts.push([w * k / 8, y + Math.sin(k * 1.7 + i * 2) * amp]);
    E.inkLine(E.through(pts), 1.1, lighter(tile, .3), "inkfine");
  }
  // edge of the pool
  E.paint(E.rect(-30, h * .62, w + 60, 24 * m, 3 * m), { wash: lighter(tile, .55), washOp: 250, ink: PAL.ink, sw: .9 });
}

const BG_BY_ROOM = { prologue: bgPrologue, backrooms: bgBackrooms, poolrooms: bgPoolrooms };

function bg(E, pal, o) {
  (BG_BY_ROOM[o.room] || bgPrologue)(E, pal, o);
  // hand-inked frame, pushed in from the edge
  E.paint(E.rr(26 * o.m, 26 * o.m, o.w - 52 * o.m, o.h - 52 * o.m, 34 * o.m, 3 * o.m), { ink: PAL.ink, sw: 1.5 });
}

// ------------------------------------------------------------------ textures
function panel(E, pal, { w, h, m }) {
  const k = w / 640;
  const faint = mixCol(pal.surface, pal.b, .1);
  E.paint(E.rr(12 * k, 12 * k, w - 24 * k, h - 24 * k, 40 * k, 2 * k), { wash: pal.surface, washOp: 255, fill: pal.a, fillOp: 38, bleed: .14, hatch: { d: 20 * k, a: 45, c: faint, w: .5 }, ink: PAL.ink, sw: .9 });
  E.inkLine(E.rr(26 * k, 26 * k, w - 52 * k, h - 52 * k, 28 * k, 2 * k), .6, mixCol(pal.ink, pal.surface, .55), "inkfine");
}

function btn(E, pal, { w, h }) {
  const k = w / 360;
  E.paint(E.rr(10 * k, 10 * k, w - 20 * k, h - 20 * k, 44 * k, 2.5 * k), { wash: pal.btn, washOp: 255, fill: lighter(pal.btn, .3), fillOp: 90, bleed: .14, ink: PAL.ink, sw: 1 });
  E.inkLine([[40 * k, 28 * k], [w * .5, 24 * k], [w - 60 * k, 30 * k]], .7, lighter(pal.btn, .7), "dry");
}

function swash(E, pal, { w, h }) {
  const k = w / 1400;
  const ink = mixCol(PAL.ink, pal.a, .12);
  E.paint(E.rect(10 * k, 30 * k, w - 20 * k, h - 60 * k, 16 * k), { wash: ink, washOp: 240, fill: pal.b, fillOp: 70, bleed: .2, ink: PAL.ink, sw: 1.1 });
  E.inkLine([[40 * k, 30 * k], [w * .3, 22 * k], [w * .7, 34 * k], [w - 40 * k, 26 * k]], 1.3, pal.c, "dry");
  E.inkLine([[60 * k, h - 30 * k], [w * .4, h - 22 * k], [w * .8, h - 36 * k], [w - 50 * k, h - 28 * k]], 1.3, pal.c, "dry");
}

function frame(E, pal, { w, h }) {
  const k = w / 520;
  E.paint(E.rr(10 * k, 10 * k, w - 20 * k, h - 20 * k, 46 * k, 2 * k), { wash: pal.c, washOp: 255, fill: pal.btn, fillOp: 100, bleed: .12, ink: PAL.ink, sw: 1.1 });
  E.paint(E.rr(46 * k, 46 * k, w - 92 * k, h - 92 * k, 14 * k, 1.5 * k), { ink: PAL.ink, sw: .9 });
}

function splat(E, pal, { w, h }) {
  const k = w / 512, cx = w / 2, cy = h / 2;
  E.paint(E.ell(cx, cy, 120 * k, 105 * k, 24, 16 * k), { wash: pal.c, washOp: 235, fill: PAL.ink, fillOp: 60, bleed: .3, ink: PAL.ink, sw: .8 });
  for (let i = 0; i < 12; i++) {
    const a = E.hash(i * 3 + 1) * Math.PI * 2, d = (140 + E.hash(i * 5 + 2) * 90) * k, r = (8 + E.hash(i * 7) * 20) * k;
    E.paint(E.ell(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * .85, 10, 2 * k), { wash: i % 3 ? pal.c : PAL.ink, washOp: 235, ink: PAL.ink, sw: .5 });
  }
}

export const RECIPES = { bg, panel, btn, swash, frame, splat };
