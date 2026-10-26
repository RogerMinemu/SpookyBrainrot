// Brushwork helpers shared by the character recipes (rigs.js, cameos.js). Everything here only talks to the
// engine (E): a "pen" paints in the local coordinates of one atlas cell, so a recipe never repeats offsets.
//
// Every shape is a flat colour wash + a soft watercolour shade + a confident ink outline, in the storybook
// style of the Minemi character (style reference only; no code is shared).
import { PAL, mixCol } from "./engine.js";

export const INK = PAL.ink;
export const dark = (c, k) => mixCol(c, "#1a1020", k);
export const light = (c, k) => mixCol(c, "#FFF8E8", k);

/** Watercolour look: flat wash of `base`, a bleeding fill of `shade` on top. */
export const wc = (base, shade, o = {}) => ({ wash: base, washOp: 255, fill: shade, fillOp: 95, bleed: 0, tex: 0, border: 0, ...o });

/** Cheap look for small shapes: flat wash only (the watercolour fill is what costs paint time). */
export const fl = (base, o = {}) => ({ wash: base, washOp: 255, ...o });

/**
 * One painted shape. p5.brush's fill TEXTURE leaves pale, ragged wedges outside the polygon on a transparent plate
 * (measured in static/dev/brush-test.html: they grow with the texture amount), so fills are painted flat
 * (tex 0, border 0, a small bleed): the paper grain comes from the plate multiply, the mottling from the wash.
 */
export function drawShape(E, pts, o) {
  if (!o.fill) { E.paint(pts, o); return; }
  E.paint(pts, { ...o, tex: 0, border: 0, bleed: 0 });
}

/** Closed smooth curve through control points P (Catmull-Rom wrapped around), n samples per span. */
export function closedCurve(E, P, n = 5) {
  const k = P.length;
  if (k < 3) return P.slice();
  const W = [P[k - 1], ...P, P[0], P[1]];
  const C = E.through(W, n);
  return C.slice(n, n * (k + 1));
}

/** Minemi-style outlines are chunky: the default ink weight of every pen shape. */
export const INK_SW = 1.5;

/**
 * A pen for one atlas cell. Local coordinates are cell pixels; `mirror` flips x about the cell centre (so a
 * right arm is the left arm reversed). `key` seeds the boil jitter: same key + same variant = same wobble.
 * `xf` = { ox, oy, k, tx?, ty? } re-proportions a whole group of shapes by coordinates: the anchor (ox, oy) lands on
 * (tx, ty) and everything scales by k around it (a big chibi head, a small body). Pure maths on the points: the
 * brush is never zoomed (p5.brush drops strokes under a scale transform). Ink weights are not scaled.
 */
export function makePen(E, key, cell, mirror = false, xf = null) {
  const [x0, y0, cw] = cell;
  const k = xf ? xf.k : 1;
  const mx = (x) => (xf ? (xf.tx ?? xf.ox) + (x - xf.ox) * k : x);
  const my = (y) => (xf ? (xf.ty ?? xf.oy) + (y - xf.oy) * k : y);
  const X = (x) => x0 + (mirror ? cw - mx(x) : mx(x)), Y = (y) => y0 + my(y);
  const pt = (p) => [X(p[0]), Y(p[1])];
  let n = 0;
  const seed = () => E.boilSeed(`${key}|${n++}`);
  const wob = (pts, j) => { seed(); return j ? pts.map(([x, y]) => [x + E.jit(j), y + E.jit(j)]) : pts; };
  const pen = {
    X, Y, cell, k,
    /** Closed smooth shape through control points. */
    sh(ctrl, o = {}, j = 2.4) {
      drawShape(E, closedCurve(E, wob(ctrl.map(pt), j)), { ink: INK, sw: INK_SW, ...o });
    },
    /** Ellipse (axis aligned; rot is mirrored with the pen). */
    ell(cx, cy, rx, ry, o = {}, j = 2.2, rot = 0) {
      seed();
      drawShape(E, E.ell(X(cx), Y(cy), rx * k, ry * k, 24, j, mirror ? -rot : rot), { ink: INK, sw: INK_SW, ...o });
    },
    /** Tapered ribbon along a path (width w0 -> w1). */
    rib(path, w0, w1, o = {}, j = 1.6) {
      // ribbons are long and thin: a watercolour fill leaves fringes there, so they are a flat wash + ink
      const P = wob(path.map(pt), j), a = { ink: INK, sw: 1.3, ...o };
      E.paint(E.ribbon(P, w0 * k, w1 * k), { wash: a.wash, washOp: a.washOp, ink: a.ink, sw: a.sw });
    },
    /** Ink line through points (smoothed). */
    ln(pts, sw = .8, col = INK, br = "ink", j = 1.4) {
      const P = pts.map(pt);
      if (P.length === 2) P.splice(1, 0, [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2]); // brush splines need 3+ points
      E.inkLine(E.through(wob(P, j)), sw, col, br);
    },
    /** Straight polygon (hard edges: teeth, zig-zags). */
    poly(pts, o = {}, j = 1.2) {
      drawShape(E, wob(pts.map(pt), j), { ink: INK, sw: .9, ...o });
    },
    /**
     * Highlight / shadow blobs: an OPAQUE lighter / darker tone of `base`, kept well inside its host shape. (A
     * translucent wash on a transparent plate goes pale and ragged, so tones are mixed, never faded.)
     */
    shine(cx, cy, rx, ry, base, rot = 0) {
      seed();
      E.paint(E.ell(X(cx), Y(cy), rx * k, ry * k, 14, 1, mirror ? -rot : rot), { wash: light(base, .3), washOp: 255, ink: null });
    },
    shade(cx, cy, rx, ry, base, rot = 0) {
      seed();
      E.paint(E.ell(X(cx), Y(cy), rx * k, ry * k, 14, 1.5, mirror ? -rot : rot), { wash: dark(base, .22), washOp: 255, ink: null });
    },
  };
  return pen;
}

export const BLUSH = "#FF8FA3", BLUSH_LINE = "#E0607E";
const HIGHLIGHT = "#FFF8E8";

/**
 * Rosy cheek, as the reference Minemi wears it (MinemiSongs src/minemi.js): a soft blot with three short diagonal
 * strokes on top. side (-1 | 1) mirrors the strokes; painted over skin, never on bare plate.
 */
export function blush(pen, cx, cy, rx = 24, ry = 13, side = 1) {
  pen.ell(cx, cy, rx, ry, { wash: BLUSH, washOp: 150, ink: null }, 1.2);
  const u = rx / .58;
  for (let k = 0; k < 3; k++) {
    pen.ln([[cx + side * (-.3 + k * .25) * u, cy + .1 * u], [cx + side * (-.18 + k * .25) * u, cy - .13 * u]], .8, BLUSH_LINE, "inkfine", 0);
  }
}

/**
 * A big shiny Minemi eye centred at (cx, cy), measured on the reference (MinemiSongs src/minemi.js, white .66s x .8s):
 * an unlined white, an iris dark at the top and light at the bottom, a dark pupil, two cream highlights (big up-left,
 * small down-right), a heavy upper lash that starts at the outer corner with a filled ink wing, and a fine lower lash.
 * side = which eye (-1 left, 1 right: the wing goes outward). angry draws a heavy slanted lid instead of the lashes.
 */
export function minemiEye(pen, cx, cy, rx, ry, iris, { glance = 0, angry = false, lid = "#7A5233", side = 1, lash = true } = {}) {
  const sx = rx / .66, sy = ry / .8; // reference units
  pen.ell(cx, cy, rx, ry, { wash: "#FFFDF8", washOp: 255, ink: null }, 1);
  const ix = cx + glance, ir = rx * .79, iy = ry * .83;
  pen.ell(ix, cy + .08 * sy, ir, iy, { wash: iris, washOp: 255, ink: null }, .8);
  pen.ell(ix, cy - .22 * sy, ir * .92, iy * .4, { wash: dark(iris, .5), washOp: 150, ink: null }, .6);
  pen.ell(ix, cy + .34 * sy, ir * .8, iy * .45, { wash: light(iris, .42), washOp: 255, ink: null }, .6);
  pen.ell(ix, cy + .04 * sy, ir * .46, iy * .5, { wash: dark(iris, .62), washOp: 255, ink: null }, .4);
  pen.ell(ix - .2 * sx, cy - .2 * sy, .17 * sx, .19 * sy, { wash: HIGHLIGHT, washOp: 255, ink: null }, .3);
  pen.ell(ix + .2 * sx, cy + .3 * sy, .08 * sx, .08 * sy, { wash: HIGHLIGHT, washOp: 255, ink: null }, .2);
  if (angry) {
    const inner = cx - side * rx, outer = cx + side * rx, top = cy - ry - 6;
    pen.poly([[inner - side * 4, cy - ry * .1], [outer + side * 5, cy - ry * .75], [outer + side * 5, top], [inner - side * 4, top]], { wash: lid, washOp: 255, ink: null }, .5);
    pen.ln([[inner - side * 3, cy - ry * .1], [cx, cy - ry * .55], [outer + side * 3, cy - ry * .8]], 2.4, INK, "ink", .5);
    return;
  }
  if (!lash) return;
  // the ink brush is heaviest where a stroke starts: start at the outer corner, hug the top, end inside
  pen.ln([[cx + side * .74 * sx, cy - .4 * sy], [cx + side * .6 * sx, cy - .64 * sy], [cx + side * .18 * sx, cy - .86 * sy],
    [cx - side * .3 * sx, cy - .8 * sy], [cx - side * .58 * sx, cy - .52 * sy]], 2.6, INK, "ink", .5);
  pen.poly([[cx + side * .35 * sx, cy - .8 * sy], [cx + side * .8 * sx, cy - .56 * sy], [cx + side * 1.02 * sx, cy - .56 * sy],
    [cx + side * .76 * sx, cy - .3 * sy], [cx + side * .55 * sx, cy - .55 * sy]], { wash: INK, washOp: 255, ink: null }, .4);
  pen.ln([[cx - side * .25 * sx, cy + .76 * sy], [cx + side * .25 * sx, cy + .77 * sy]], .9, INK, "inkfine", .3);
}

/**
 * An expressive eye pair for a 288x96 eyes cell. look: { sep, rx, ry, iris, pupil, lid, glow }.
 * kind: open | closed | angry | wide. The pupils glance slightly so the face has life.
 */
export function eyePair(E, key, cell, kind, look) {
  const pen = makePen(E, key, cell);
  const { sep = 56, rx = 26, ry = 30, iris = null, pupil = 13, lid = "#7A5233", white = "#FFFDF4", ringCol = null, pupilCol = INK, cy = 48, brow = null } = look;
  for (const side of [-1, 1]) {
    const cx = 144 + side * sep;
    if (kind === "closed") {
      // happy closed eye (Minemi "^^"): a thick smiling arc with a lash flick
      pen.ln([[cx - rx, cy + 2], [cx - rx * .4, cy + ry * .5], [cx + rx * .4, cy + ry * .5], [cx + rx, cy + 2]], 2.3, INK, "ink", .6);
      pen.ln([[cx + side * rx, cy + 2], [cx + side * (rx + 11), cy - 7]], 1.3, INK, "ink", .4);
      continue;
    }
    if ((kind === "open" || kind === "angry") && iris) {
      // the big shiny Minemi eye, kept inside the 288x96 cell: the outer lash wing reaches 1.55 rx past the centre
      // (no brow at rest: the reference only draws brows for an expression, here the angry lid)
      const er = Math.min(rx, (144 - 12 - sep) / 1.55), eh = Math.min(ry, 33);
      minemiEye(pen, cx, cy + 2, er, eh, iris, { glance: side * -2, angry: kind === "angry", lid, side });
      continue;
    }
    const wide = kind === "wide";
    // every eye stays inside its 288x96 cell (12 px gutter): wide eyes and the ring are capped to what fits
    const pad = ringCol ? 5 : 0;
    const r2x = Math.min(rx * (wide ? 1.22 : 1), 144 - sep - 14 - pad), r2y = Math.min(ry * (wide ? 1.2 : 1), 35 - pad);
    if (ringCol) pen.ell(cx, cy, r2x + pad, r2y + pad, { wash: ringCol, washOp: 255, ink: null }, 1.6);
    pen.ell(cx, cy, r2x, r2y, { wash: white, washOp: 255, ink: INK, sw: 1.2 }, 1.6);
    if (iris) pen.ell(cx + side * -2, cy + 2, r2x * .66, r2y * .72, { wash: iris, washOp: 255, ink: null }, 1);
    const pr = wide ? pupil * .62 : pupil * (kind === "angry" ? .85 : 1);
    pen.ell(cx + side * -3, cy + 3, pr, pr * 1.12, { wash: pupilCol, washOp: 255, ink: null }, 0.8);
    pen.ell(cx + side * -3 - pr * .38, cy + 3 - pr * .45, Math.max(3, pr * .3), Math.max(3, pr * .3), { wash: "#FFFFFF", washOp: 255, ink: null }, .3);
    if (kind === "angry") {
      // heavy slanted lid: inner end low, outer end high
      const ix = cx - side * r2x, ox = cx + side * r2x;
      const top = Math.max(14, cy - r2y - 10);
      pen.poly([[ix - side * 4, cy - 2], [ox + side * 5, Math.max(top, cy - r2y - 4)], [ox + side * 5, top], [ix - side * 4, top]], { wash: lid, washOp: 255, ink: null }, .6);
      pen.ln([[ix - side * 3, cy - 2], [cx, cy - r2y * .45], [ox + side * 3, Math.max(15, cy - r2y - 5)]], 1.9, INK, "ink", .6);
    }
    if (brow && kind !== "angry") { const by = Math.max(20, cy - ry - 8); pen.ln([[cx - rx, by], [cx, by - 5], [cx + rx, by + 1]], 1.2, brow, "ink", .6); }
  }
}

/** Little deterministic star/leaf scatter helper: n pseudo-random points inside a box. */
export function scatter(E, n, x0, y0, x1, y1, salt = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([x0 + E.hash(i * 7 + salt) * (x1 - x0), y0 + E.hash(i * 13 + salt + 5) * (y1 - y0)]);
  return out;
}
