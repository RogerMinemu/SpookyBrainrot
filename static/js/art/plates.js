// Plate recipes: what gets painted for each named plate in each room.
// A recipe paints inside the sub-rect [0,w] x [0,h] (the painter has already translated the
// WEBGL origin) and uses ONLY the engine (E) - no p5 calls of its own except through E.p.
// Colours come from theme.css tokens (the painter reads them via getComputedStyle), never from here.
import { mixCol, PAL } from "./engine.js";
import { ROSTER, atlasOf } from "./roster.js";
import { CHAR_RECIPES } from "./rigs.js";

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
export const ROOMS = ["prologue", "backrooms", "poolrooms", "mall", "site19", "hangar", "sahur"];

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

// Room 6 "Sahur dice": a dark street before dawn, a glowing window and a row of drums.
function bgSahur(E, pal, { w, h, m }) {
  const dark = darker(pal.a, .35);
  E.paint(E.rect(-20, -20, w + 40, h + 40, 6 * m), { wash: pal.a, washOp: 255, ink: null });
  // dawn glow on the horizon
  E.paint(E.ell(w * .5, h * .74, w * .8, h * .36, 26, 18 * m), { wash: pal.b, washOp: 200, ink: null });
  E.paint(E.ell(w * .5, h * .78, w * .46, h * .2, 24, 14 * m), { wash: pal.c, washOp: 120, ink: null });
  // crescent moon and a few stars
  E.paint(E.ell(w * .8, h * .2, 90 * m, 90 * m, 24, 4 * m), { wash: lighter(pal.c, .45), washOp: 240, fill: pal.c, fillOp: 60, ink: PAL.ink, sw: 1 });
  E.paint(E.ell(w * .83, h * .18, 80 * m, 80 * m, 22, 4 * m), { wash: pal.a, washOp: 255, ink: null });
  for (let i = 0; i < 18; i++) {
    const x = (.04 + E.hash(i * 3 + 5) * .92) * w, y = (.03 + E.hash(i * 7 + 1) * .38) * h;
    E.paint(E.ell(x, y, (2 + E.hash(i) * 4) * m, (2 + E.hash(i + 4) * 4) * m, 8, m), { wash: lighter(pal.c, .5), washOp: 220, ink: null });
  }
  // sleeping houses with lit windows
  for (let i = 0; i < 5; i++) {
    const hw = w * (.14 + E.hash(i + 20) * .06), hx = w * (.02 + i * .2), hh = h * (.22 + E.hash(i + 30) * .1), hy = h * .8 - hh;
    E.paint(E.rect(hx, hy, hw, hh, 4 * m), { wash: dark, washOp: 255, fill: pal.b, fillOp: 60, ink: PAL.ink, sw: 1.1 });
    E.paint([[hx - 14 * m, hy + 3 * m], [hx + hw / 2, hy - 46 * m], [hx + hw + 14 * m, hy + 3 * m]], { wash: darker(pal.a, .6), washOp: 255, ink: PAL.ink, sw: 1.2 });
    if (E.hash(i + 40) > .35) E.paint(E.rect(hx + hw * .3, hy + hh * .3, hw * .22, hh * .2, 3 * m), { wash: pal.c, washOp: 240, fill: PAL.ochre, fillOp: 120, ink: PAL.ink, sw: .8 });
  }
  // street and a row of drums
  E.paint(E.rect(-30, h * .8, w + 60, h * .3, 12 * m), { wash: darker(pal.a, .5), washOp: 255, fill: pal.b, fillOp: 70, ink: PAL.ink, sw: 1 });
  for (let i = 0; i < 6; i++) {
    const cx = w * (.12 + i * .15), cy = h * .9, rw = 70 * m, rh = 50 * m;
    E.paint(E.rect(cx - rw, cy, rw * 2, rh, 6 * m), { wash: pal.b, washOp: 255, fill: darker(pal.b, .3), fillOp: 120, ink: PAL.ink, sw: 1 });
    E.paint(E.ell(cx, cy, rw, 22 * m, 18, 3 * m), { wash: lighter(pal.c, .3), washOp: 245, ink: PAL.ink, sw: 1 });
  }
}

// Room 3 "Contad las formas": an empty mall at 3 AM. Shutters down, one shop still lit, a dead escalator, Lirilì's clock.
function bgMall(E, pal, { w, h, m }) {
  const dark = darker(pal.a, .35);
  E.paint(E.rect(-20, -20, w + 40, h + 40, 6 * m), { wash: pal.a, washOp: 255, ink: null });
  // two floors of shop fronts with their signs
  for (let row = 0; row < 2; row++) {
    const y = row ? h * .42 : h * .08, hh = row ? h * .3 : h * .15;
    for (let i = 0; i < 5; i++) {
      const sx = w * (.03 + i * .195), sw = w * .17, lit = E.hash(i * 7 + row * 13) > .6;
      E.paint(E.rect(sx, y, sw, hh, 4 * m), { wash: lit ? lighter(pal.c, .2) : dark, washOp: lit ? 170 : 255, fill: pal.b, fillOp: 60,
        hatch: lit ? null : { d: 14 * m, a: 0, c: darker(pal.b, .3), w: .6 }, ink: PAL.ink, sw: 1 });
      E.paint(E.rect(sx + sw * .15, y - 24 * m, sw * .7, 18 * m, 2 * m), { wash: lit ? pal.c : darker(pal.b, .2), washOp: 235, ink: PAL.ink, sw: .8 });
    }
  }
  // the upper gallery: a balcony slab with its railing
  E.paint(E.rect(-30, h * .3, w + 60, h * .05, 4 * m), { wash: pal.b, washOp: 255, fill: dark, fillOp: 90, ink: PAL.ink, sw: 1.1 });
  E.inkLine([[0, h * .25], [w, h * .25 + E.jit(3 * m)]], 1.2, PAL.ink);
  for (let i = 0; i <= 24; i++) E.inkLine([[w * i / 24, h * .25], [w * i / 24 + E.jit(2 * m), h * .3]], .8, PAL.ink, "inkfine");
  // the floor: big tiles fading into the dark
  E.paint(E.rect(-30, h * .74, w + 60, h * .32, 10 * m), { wash: darker(pal.b, .2), washOp: 255, fill: pal.b, fillOp: 70, ink: PAL.ink, sw: 1 });
  for (let i = 1; i < 10; i++) E.inkLine([[w * i / 10, h * .74], [w * (i / 10 - .5) * 1.6 + w * .5, h]], .7, darker(pal.b, .45), "inkfine");
  // a dead escalator climbing to the gallery
  E.paint([[w * .56, h * .76], [w * .66, h * .76], [w * .9, h * .33], [w * .82, h * .33]], { wash: darker(pal.a, .5), washOp: 255, fill: pal.b, fillOp: 80, ink: PAL.ink, sw: 1.2 });
  for (let k = 1; k < 9; k++) {
    const t = k / 9;
    E.inkLine([[E.lerp(w * .56, w * .82, t), E.lerp(h * .76, h * .33, t)], [E.lerp(w * .66, w * .9, t), E.lerp(h * .76, h * .33, t)]], .7, lighter(pal.b, .2), "inkfine");
  }
  // planters
  for (const px of [.08, .4]) {
    E.paint(E.rect(w * px, h * .66, 110 * m, 70 * m, 4 * m), { wash: darker(pal.b, .3), washOp: 255, ink: PAL.ink, sw: 1 });
    E.paint(E.ell(w * px + 55 * m, h * .64, 80 * m, 50 * m, 22, 8 * m), { wash: PAL.sap, washOp: 200, fill: darker(PAL.sap, .3), fillOp: 90, ink: PAL.ink, sw: .9 });
  }
  // Lirilì's clock above the gallery, stopped at three
  const cx = w * .5, cy = h * .17, r = 54 * m;
  E.paint(E.ell(cx, cy, r, r, 30, 2 * m), { wash: lighter(pal.c, .55), washOp: 245, fill: pal.c, fillOp: 70, ink: PAL.ink, sw: 1.2 });
  E.inkLine([[cx, cy], [cx, cy - r * .7]], 1.4, PAL.ink);
  E.inkLine([[cx, cy], [cx + r * .5, cy]], 1.6, PAL.ink);
}

// Room 4 "Trivia de las Backrooms": Site-19, a containment corridor with glowing terminals and a sealed blast door.
function bgSite19(E, pal, { w, h, m }) {
  const wall = pal.a, plate = pal.b, glow = pal.c;
  E.paint(E.rect(-20, -20, w + 40, h + 40, 6 * m), { wash: wall, washOp: 255, ink: null });
  // riveted wall plates
  for (let i = 0; i < 6; i++) {
    E.paint(E.rect(w * i / 6 + 8 * m, h * .08, w / 6 - 16 * m, h * .62, 3 * m), { wash: plate, washOp: 220, fill: darker(plate, .2), fillOp: 70, ink: PAL.ink, sw: .9 });
  }
  // the blast door: a heavy disc with hazard hatching and spokes
  const cx = w * .5, cy = h * .42, r = Math.min(w, h) * .26;
  E.paint(E.ell(cx, cy, r * 1.08, r * 1.08, 40, 3 * m), { wash: darker(wall, .4), washOp: 255, ink: PAL.ink, sw: 1.3 });
  E.paint(E.ell(cx, cy, r, r, 40, 3 * m), { wash: lighter(plate, .15), washOp: 255, fill: plate, fillOp: 90, hatch: { d: 26 * m, a: 45, c: PAL.ochre, w: 1.2 }, ink: PAL.ink, sw: 1.3 });
  E.paint(E.ell(cx, cy, r * .35, r * .35, 28, 2 * m), { wash: darker(plate, .3), washOp: 255, ink: PAL.ink, sw: 1.1 });
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    E.inkLine([[cx + Math.cos(a) * r * .38, cy + Math.sin(a) * r * .38], [cx + Math.cos(a) * r * .95, cy + Math.sin(a) * r * .95]], 1, PAL.ink, "inkfine");
  }
  // terminals glowing on both sides
  for (const tx of [.08, .8]) {
    E.paint(E.rect(w * tx, h * .3, w * .12, h * .18, 3 * m), { wash: darker(wall, .5), washOp: 255, ink: PAL.ink, sw: 1.1 });
    E.paint(E.rect(w * tx + 10 * m, h * .3 + 10 * m, w * .12 - 20 * m, h * .18 - 20 * m, 2 * m), { wash: glow, washOp: 180, fill: lighter(glow, .3), fillOp: 80, ink: null });
    for (let l = 0; l < 4; l++) {
      E.inkLine([[w * tx + 22 * m, h * .33 + l * 20 * m], [w * tx + w * .12 * (.4 + E.hash(l + tx * 10) * .4), h * .33 + l * 20 * m]], .9, darker(glow, .5), "inkfine");
    }
  }
  // the floor, with a yellow and black hazard band
  E.paint(E.rect(-30, h * .72, w + 60, h * .35, 10 * m), { wash: darker(wall, .45), washOp: 255, fill: plate, fillOp: 60, ink: PAL.ink, sw: 1 });
  for (let i = 0; i < 22; i++) {
    const x = w * i / 22;
    E.paint([[x, h * .72], [x + w / 44, h * .72], [x + w / 44 - 24 * m, h * .77], [x - 24 * m, h * .77]], { wash: i % 2 ? PAL.ochre : PAL.ink, washOp: 235, ink: null });
  }
  // ceiling lights
  for (let i = 0; i < 4; i++) E.paint(E.rect(w * (.08 + i * .24), h * .02, w * .12, 14 * m, 2 * m), { wash: lighter(glow, .5), washOp: 230, ink: PAL.ink, sw: .7 });
}

// Room 5 "Desactivad la bomba": an abandoned hangar. Ribbed roof, crates, hanging lamps and the big door open to the night.
function bgHangar(E, pal, { w, h, m }) {
  const dark = darker(pal.a, .4);
  E.paint(E.rect(-20, -20, w + 40, h + 40, 6 * m), { wash: pal.a, washOp: 255, ink: null });
  // corrugated back wall
  for (let i = 0; i < 40; i++) E.inkLine([[w * i / 40, h * .2], [w * i / 40 + E.jit(2 * m), h * .74]], .6, darker(pal.a, .3), "inkfine");
  // the open door: night sky and the moon
  const dx = w * .3, dy = h * .22, dw = w * .4, dh = h * .52;
  E.paint(E.rect(dx, dy, dw, dh, 3 * m), { wash: PAL.night, washOp: 255, fill: PAL.indigo, fillOp: 90, ink: PAL.ink, sw: 1.3 });
  E.paint(E.ell(dx + dw * .75, dy + dh * .28, 40 * m, 40 * m, 22, 2 * m), { wash: lighter(pal.c, .5), washOp: 240, ink: PAL.ink, sw: .8 });
  for (let i = 0; i < 10; i++) {
    E.paint(E.ell(dx + dw * (.05 + E.hash(i * 3 + 1) * .9), dy + dh * (.05 + E.hash(i * 5 + 2) * .5), 3 * m, 3 * m, 8, m), { wash: lighter(pal.c, .6), washOp: 220, ink: null });
  }
  // the ribbed roof arch
  for (const k of [0, 1]) {
    E.inkLine(E.through([[-20, h * (.24 + k * .05)], [w * .25, h * (.08 + k * .05)], [w * .5, h * (.03 + k * .05)], [w * .75, h * (.08 + k * .05)], [w + 20, h * (.24 + k * .05)]]), 2 - k * .6, PAL.ink);
  }
  // concrete floor and the yellow guide line
  E.paint(E.rect(-30, h * .74, w + 60, h * .32, 10 * m), { wash: dark, washOp: 255, fill: pal.b, fillOp: 70, ink: PAL.ink, sw: 1 });
  E.inkLine([[w * .5, h * .76], [w * .5 + E.jit(4 * m), h]], 2, pal.c, "dry");
  // crates (level 1 sits on the crate below it)
  const base = h * .74, unit = 130 * m;
  for (const [cx, level, s] of [[.08, 0, 1], [.16, 0, .8], [.115, 1, .7], [.86, 0, 1.1], [.94, 0, .7]]) {
    const size = unit * s, bottom = base - level * unit;
    E.paint(E.rect(w * cx - size / 2, bottom - size, size, size, 3 * m), { wash: pal.b, washOp: 255, fill: lighter(pal.b, .2), fillOp: 90,
      hatch: { d: 16 * m, a: 0, c: darker(pal.b, .3), w: .6 }, ink: PAL.ink, sw: 1.1 });
    E.inkLine([[w * cx - size / 2, bottom - size], [w * cx + size / 2, bottom]], .9, PAL.ink, "inkfine");
  }
  // hanging lamps with their pools of light
  for (const lx of [.2, .5, .8]) {
    E.inkLine([[w * lx, 0], [w * lx, h * .12]], .9, PAL.ink, "inkfine");
    E.paint([[w * lx - 30 * m, h * .15], [w * lx + 30 * m, h * .15], [w * lx + 12 * m, h * .12], [w * lx - 12 * m, h * .12]], { wash: darker(pal.a, .5), washOp: 255, ink: PAL.ink, sw: .8 });
    E.paint(E.ell(w * lx, h * .17, 60 * m, 22 * m, 18, 3 * m), { wash: pal.c, washOp: 120, ink: null });
  }
}

const BG_BY_ROOM = { prologue: bgPrologue, backrooms: bgBackrooms, poolrooms: bgPoolrooms, mall: bgMall, site19: bgSite19, hangar: bgHangar, sahur: bgSahur };

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

// ------------------------------------------------------------------ characters
// One part-atlas plate per character: `char:<id>`, painted once per boil variant. They are GLOBAL (the cache key
// uses `*` instead of the room) and never touch a CSS variable; boot.js decodes them for the sprite layer.
export const CHAR_PLATE = (id) => `char:${id}`;
for (const r of ROSTER) {
  const a = atlasOf(r);
  PLATE_SPECS[CHAR_PLATE(r.id)] = { global: true, size: () => [a.w, a.h], css: null };
  RECIPES[CHAR_PLATE(r.id)] = (E, pal, o) => CHAR_RECIPES[r.id](E, o);
}
