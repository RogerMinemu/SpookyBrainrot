// Painting recipes for the five cameo pose sprites. Each cameo is one 1024x512 atlas: idle in the left 512x512
// cell, scary in the right one (cells from roster.js). One call paints one boil variant. Nothing runs per frame.
//
// Look: the same storybook recipe as the rigs (flat wash + soft watercolour shade + confident ink outline),
// cute first, creepy second. Scary poses use glowing eyes with an ochre halo, too many teeth, wrong proportions.
import { PAL } from "./engine.js";
import { CAMEO_CELLS, byId } from "./roster.js";
import { makePen, minemiEye, blush, wc, fl, dark, light, INK } from "./pens.js";

const MOUTH = "#5A1F36", TONGUE = "#E5788C", TOOTH = "#FFF8E8", HALO = "#E8AA38", GLOW = "#F2D23C";

/** Rotate control points about (cx, cy) by `a` radians. */
const tilt = (pts, cx, cy, a) => pts.map(([x, y]) => {
  const dx = x - cx, dy = y - cy, c = Math.cos(a), s = Math.sin(a);
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
});

/** A row of triangular teeth along a line from (x0,y0) to (x1,y1); `len` > 0 points down, < 0 points up. */
function teeth(p, x0, y0, x1, y1, n, len, ow = 1) {
  for (let i = 0; i < n; i++) {
    const a = x0 + (x1 - x0) * (i / n), b = x0 + (x1 - x0) * ((i + 1) / n);
    const ya = y0 + (y1 - y0) * (i / n), yb = y0 + (y1 - y0) * ((i + 1) / n);
    const w = (b - a) * ow;
    p.poly([[a + (b - a - w) / 2, ya], [a + (b - a + w) / 2, yb], [(a + b) / 2, (ya + yb) / 2 + len]], { wash: TOOTH, washOp: 255, ink: INK, sw: .55 }, .4);
  }
}

/** Glowing scary eye: ochre halo, bright rim, slit or round pupil. */
function glowEye(p, cx, cy, rx, ry, slit = false) {
  p.ell(cx, cy, rx + 12, ry + 12, fl(HALO, { washOp: 200, ink: null }), 1.2);
  p.ell(cx, cy, rx, ry, fl(GLOW, { sw: 1.2 }), 1);
  if (slit) p.ell(cx, cy, rx * .2, ry * .86, fl(INK, { ink: null }), .5);
  else p.ell(cx, cy, rx * .36, ry * .4, fl(INK, { ink: null }), .5);
}

// -------------------------------------------------------------------------------------------------- BOMBARDIRO
function bombardiro(E) {
  const c = byId("bombardiro").palette, id = "bombardiro";
  const metal = (o = {}) => wc(c.metal, c.metalDark, { fillOp: 120, bleed: 0, ...o });
  // ---- idle: chibi Bombardiro (the Minemi look). A big round crocodile head in 3/4 view with two big shiny eyes,
  // aviator goggles pushed up on the brow (the reference's "goggles" hat) and rosy cheeks, on a small bomber body.
  // The body pen shrinks the old full-size plane behind the head; the head is drawn at its own, chibi size.
  {
    const p = makePen(E, `${id}|idle`, CAMEO_CELLS.idle, false, { ox: 200, oy: 330, k: .72, tx: 170 });
    const hp = makePen(E, `${id}|idle.head`, CAMEO_CELLS.idle);
    p.sh([[240, 256], [334, 248], [352, 152], [304, 122], [252, 130]], wc(c.metalDark, dark(c.metalDark, .3), { fillOp: 100, bleed: 0 }), 1.8); // far wing
    p.sh([[52, 286], [84, 196], [124, 192], [138, 262]], metal(), 1.6); // tail fin
    p.sh([[70, 304], [34, 300], [22, 312], [40, 326], [110, 338]], wc(c.croc, c.crocDark, { fillOp: 110, bleed: 0 }), 1.6); // tail
    p.sh([[60, 300], [100, 264], [182, 240], [272, 238], [352, 246], [404, 264], [422, 302], [394, 340], [302, 360], [190, 360], [110, 342]], wc(c.croc, c.crocDark, { fillOp: 125, bleed: 0 }), 2.4); // fuselage
    p.sh([[110, 336], [200, 352], [302, 352], [392, 332], [380, 346], [300, 362], [190, 362], [124, 348]], fl(c.belly, { sw: .8 }), 1.4);
    for (let i = 0; i < 6; i++) { const x = 126 + i * 36; p.ln([[x - 9, 252 + i * .8], [x, 242 + i * .8], [x + 9, 252 + i * .8]], .9, c.crocDark, "inkfine", .6); }
    // the head: rounded cranium + short round snout, scutes on top, lighter jaw
    for (const [bx, by] of [[296, 150], [336, 132], [380, 130]]) hp.ell(bx, by, 16, 11, wc(c.crocDark, dark(c.crocDark, .3), { fillOp: 90 }), 1);
    hp.sh([[252, 250], [258, 182], [300, 142], [360, 128], [414, 140], [446, 178], [470, 214], [482, 254], [470, 290], [420, 308], [350, 314], [290, 302], [260, 282]],
      wc(c.croc, c.crocDark, { fillOp: 120, bleed: 0 }), 2.4);
    hp.shine(316, 168, 34, 10, c.croc, -.3);
    hp.sh([[298, 292], [360, 300], [430, 294], [468, 280], [462, 296], [424, 312], [352, 318], [296, 306]], fl(c.belly, { sw: 1 }), 1.2);
    hp.ln([[322, 282], [376, 296], [430, 292], [468, 274]], 1.9, INK, "ink", .5); // smile
    teeth(hp, 384, 294, 462, 280, 4, 9, .8);
    hp.ell(470, 236, 5, 4, fl(INK, { ink: null }), .4);
    hp.ell(458, 228, 4, 3, fl(INK, { ink: null }), .3);
    // two big shiny eyes (3/4 view: the far one narrower), cheeks
    minemiEye(hp, 300, 218, 24, 35, "#3F7A2A", { side: -1, glance: 2 });
    minemiEye(hp, 384, 222, 32, 40, "#3F7A2A", { side: 1, glance: 2 });
    blush(hp, 282, 266, 12, 7, -1);
    blush(hp, 424, 268, 18, 10, 1);
    // aviator goggles pushed up on the brow, like the reference's goggles hat
    hp.poly([[258, 168], [444, 140], [448, 158], [262, 186]], { wash: "#3A2E2C", washOp: 255, ink: INK, sw: 1.1 }, .6);
    for (const [gx, gy] of [[318, 158], [394, 146]]) {
      hp.ell(gx, gy, 27, 22, fl("#3A2E2C", { sw: 1.4 }), .8);
      hp.ell(gx, gy, 19, 15, wc(c.goggles, dark(c.goggles, .35), { fillOp: 80, sw: .8 }), .6);
      hp.ell(gx - 6, gy - 5, 6, 4, fl(light(c.goggles, .6), { ink: null }), .2);
    }
    hp.poly([[350, 144], [362, 142], [364, 156], [352, 158]], { wash: "#3A2E2C", washOp: 255, ink: INK, sw: .8 }, .3);
    // near wing and bombs (small, under the head), propeller at the snout
    p.ell(124, 384, 18, 34, wc(c.metalDark, INK, { fillOp: 80, sw: 1.2 }), 1.2);
    p.poly([[110, 360], [138, 360], [150, 344], [100, 344]], { wash: c.metal, washOp: 255, ink: INK, sw: .9 }, .6);
    p.ell(168, 394, 15, 28, wc(c.metalDark, INK, { fillOp: 80, sw: 1.2 }), 1.2);
    p.sh([[206, 334], [326, 334], [376, 434], [286, 452], [172, 414]], metal(), 2);
    p.ln([[236, 346], [290, 438]], .8, c.metalDark, "inkfine", 1.2);
    for (const [rx, ry] of [[232, 350], [300, 350], [262, 414], [330, 400]]) p.ell(rx, ry, 4, 4, fl(c.metalDark, { sw: .6 }), .3);
    p.shine(240, 360, 30, 6, c.metal, .5);
    hp.ell(488, 258, 8, 62, fl("#DDE4EA", { washOp: 120, ink: INK, sw: .7 }), 1); // spinning blades
    hp.ell(486, 258, 9, 11, fl(c.metalDark, { sw: 1 }), .6);
  }
  // ---- scary: diving at the camera, jaws wide
  {
    const p = makePen(E, `${id}|scary`, CAMEO_CELLS.scary);
    p.sh([[38, 252], [146, 228], [196, 322], [42, 366]], metal({ fillOp: 110 }), 2); // wings spread, foreshortened
    p.sh([[474, 252], [366, 228], [316, 322], [470, 366]], metal({ fillOp: 110 }), 2);
    p.ln([[66, 270], [150, 276]], .8, c.metalDark, "inkfine", 1);
    p.ln([[446, 270], [362, 276]], .8, c.metalDark, "inkfine", 1);
    p.ell(256, 250, 214, 40, fl("#DDE4EA", { washOp: 90, ink: null }), 2, .0); // blurred propeller disc
    p.sh([[114, 206], [256, 118], [398, 206], [424, 300], [388, 336], [256, 346], [124, 336], [88, 300]], wc(c.croc, c.crocDark, { fillOp: 130, bleed: 0 }), 2.4);
    for (const x of [200, 312]) p.ell(x, 178, 8, 6, fl(INK, { ink: null }), .4);
    for (const sx of [-1, 1]) {
      p.ell(256 + sx * 92, 214, 52, 50, fl(c.goggles, { sw: 1.3 }), 1.2);
      glowEye(p, 256 + sx * 92, 214, 34, 32, true);
    }
    p.sh([[126, 318], [256, 336], [386, 318], [372, 360], [256, 372], [140, 360]], wc(c.croc, c.crocDark, { fillOp: 120 }), 1.6); // top lip
    teeth(p, 134, 340, 380, 340, 11, 28, .85);
    p.sh([[130, 352], [256, 368], [382, 352], [392, 420], [320, 482], [256, 492], [192, 482], [120, 420]], wc(MOUTH, dark(MOUTH, .4), { fillOp: 120, sw: 1.3 }), 2); // gaping throat
    p.ell(256, 440, 78, 30, fl(TONGUE, { sw: .9 }), 1.4);
    teeth(p, 136, 420, 376, 420, 10, -24, .85);
    p.sh([[110, 400], [150, 470], [256, 500], [362, 470], [402, 400], [380, 468], [256, 496], [132, 468]], wc(c.croc, c.crocDark, { fillOp: 120 }), 2); // lower jaw edge
    p.ell(256, 236, 18, 10, fl(INK, { ink: null, washOp: 160 }), .6);
  }
}

// -------------------------------------------------------------------------------------------------- BALLERINA
function ballerina(E) {
  const c = byId("ballerina").palette, id = "ballerina";
  const skin = light(c.cupShade, .5), skinDk = c.cupShade;
  const cup = (p, ang, face) => {
    const cx = 256, cy = 150;
    const T = (pts) => (ang ? tilt(pts, cx, cy + 40, ang) : pts);
    // steam
    for (const [sx, off] of [[222, 0], [270, 1.6]]) {
      p.ln(T([[sx, 76], [sx + 14, 58 + off * 3], [sx - 6, 40], [sx + 10, 22]]), 1.4, light(c.cupShade, .1), "ink", 1.2);
    }
    // handle
    p.sh(T([[342, 108], [392, 106], [410, 140], [388, 176], [340, 176], [350, 160], [378, 156], [386, 140], [372, 122], [344, 124]]), fl(c.cup, { sw: 1.1 }), 1.4);
    // cup body
    p.sh(T([[160, 102], [352, 102], [346, 150], [316, 194], [256, 208], [196, 194], [166, 150]]), wc(c.cup, c.cupShade, { fillOp: 120, bleed: 0 }), 1.8);
    const tell = (x, y, rx, ry, o, j) => { const [tx, ty] = T([[x, y]])[0]; p.ell(tx, ty, rx, ry, o, j, ang); };
    tell(196, 150, 10, 34, fl(light(c.cup, .6), { ink: null }), 1);
    // rim + coffee + foam
    tell(256, 104, 98, 26, fl(c.cup, { sw: 1.1 }), 1.2);
    tell(256, 106, 86, 19, fl(c.coffee, { sw: .8 }), 1);
    tell(256, 106, 60, 12, fl(c.foam, { ink: null }), 1);
    p.sh(T([[256, 114], [236, 100], [244, 94], [256, 100], [268, 94], [276, 100]]), fl(c.coffee, { ink: null }), .6);
    return T;
  };
  // ---- idle: ballerina on pointe, cup for a head, serene. Chibi (the Minemi look): the dancer shrinks toward her
  // pointes and the cup grows on the new neck, two pens re-proportioning the same drawing by coordinates
  {
    const BODY_K = .8, HEAD_K = 1.16, neck = 498 - (498 - 214) * BODY_K;
    const p = makePen(E, `${id}|idle`, CAMEO_CELLS.idle, false, { ox: 256, oy: 498, k: BODY_K });
    const hp = makePen(E, `${id}|idle.head`, CAMEO_CELLS.idle, false, { ox: 256, oy: 206, k: HEAD_K, ty: neck - 6 });
    // arms in second position (graceful curve)
    for (const sx of [-1, 1]) p.rib([[256 + sx * 34, 232], [256 + sx * 100, 238], [256 + sx * 150, 214], [256 + sx * 176, 190]], 18, 9, wc(skin, skinDk, { fillOp: 90, sw: .9 }), 1.4);
    // legs on pointe
    for (const sx of [-1, 1]) {
      p.rib([[256 + sx * 22, 320], [256 + sx * 20, 400], [256 + sx * 12, 480]], 22, 12, wc(skin, skinDk, { fillOp: 90, sw: .9 }), 1.4);
      p.sh([[256 + sx * 20, 462], [256 + sx * 4, 462], [256 + sx * 4, 494], [256 + sx * 14, 498], [256 + sx * 22, 480]], fl(c.tutuLight, { sw: .9 }), 1);
    }
    p.sh([[220, 224], [292, 224], [284, 272], [228, 272]], wc(c.tutu, dark(c.tutu, .3), { fillOp: 100 }), 1.4); // bodice
    p.sh([[226, 216], [286, 216], [276, 204], [236, 204]], fl(skin, { sw: .8 }), 1);
    // tutu
    p.sh([[128, 322], [168, 276], [256, 262], [344, 276], [384, 322], [352, 340], [320, 330], [288, 344], [256, 332], [224, 344], [192, 330], [160, 340]], wc(c.tutuLight, c.tutu, { fillOp: 110, bleed: 0 }), 2.4);
    for (let i = 0; i < 6; i++) { const x = 150 + i * 42; p.ln([[256 + (x - 256) * .2, 276], [x, 326]], .8, c.tutu, "inkfine", 1.2); }
    p.sh([[200, 270], [312, 270], [304, 284], [208, 284]], fl(c.tutu, { sw: .8 }), 1);
    cup(hp, 0);
    // serene face on the cup front: happy closed eyes with a lash flick, blush, tiny smile
    for (const sx of [-1, 1]) {
      hp.ln([[256 + sx * 52 - 18, 150], [256 + sx * 52, 161], [256 + sx * 52 + 18, 150]], 2.4, INK, "ink", .5);
      hp.ln([[256 + sx * 70, 150], [256 + sx * 79, 143]], 1.4, INK, "ink", .3);
      blush(hp, 256 + sx * 76, 170, 18, 9, sx);
    }
    hp.ln([[240, 172], [256, 182], [272, 172]], 1.9, INK, "ink", .5);
  }
  // ---- scary: the cup tilts, coffee tears, a hollow face, arms rigid
  {
    const p = makePen(E, `${id}|scary`, CAMEO_CELLS.scary);
    for (const sx of [-1, 1]) p.rib([[256 + sx * 34, 232], [256 + sx * 110, 218], [256 + sx * 170, 190], [256 + sx * 214, 140]], 18, 8, wc(skin, skinDk, { fillOp: 90, sw: .9 }), 1.4);
    for (const sx of [-1, 1]) {
      p.rib([[256 + sx * 24, 320], [256 + sx * 22, 400], [256 + sx * 12, 480]], 22, 12, wc(skin, skinDk, { fillOp: 90, sw: .9 }), 1.4);
      p.sh([[256 + sx * 20, 462], [256 + sx * 4, 462], [256 + sx * 4, 494], [256 + sx * 14, 498], [256 + sx * 22, 480]], fl(c.tutuLight, { sw: .9 }), 1);
    }
    p.sh([[220, 224], [292, 224], [284, 272], [228, 272]], wc(dark(c.tutu, .2), dark(c.tutu, .5), { fillOp: 100 }), 1.4);
    p.sh([[128, 322], [168, 276], [256, 262], [344, 276], [384, 322], [352, 340], [320, 330], [288, 344], [256, 332], [224, 344], [192, 330], [160, 340]], wc(c.tutu, dark(c.tutu, .45), { fillOp: 120, bleed: 0 }), 2.8);
    const ang = -.3;
    cup(p, ang);
    const T = (pts) => tilt(pts, 256, 190, ang);
    // spill over the rim and down the cup
    p.sh(T([[190, 108], [160, 140], [168, 220], [186, 150], [200, 118]]), fl(c.coffee, { sw: .7 }), 1.2);
    // hollow face: black eyes with a tiny white pupil, coffee tears, a black mouth
    for (const sx of [-1, 1]) {
      const [ex, ey] = T([[256 + sx * 50, 152]])[0];
      p.ell(ex, ey, 20, 26, fl(INK, { sw: 1 }), 1);
      p.ell(ex, ey + 2, 5, 5, fl("#FFFFFF", { ink: null }), .3);
      p.ln([[ex, ey + 26], [ex + sx * 4, ey + 56], [ex - sx * 2, ey + 92]], 2.4, c.coffee, "ink", 1.4);
      p.ell(ex - sx * 2, ey + 94, 5, 8, fl(c.coffee, { ink: null }), .5);
    }
    const [mx, my] = T([[256, 184]])[0];
    p.ell(mx, my, 24, 17, fl(INK, { sw: 1 }), 1);
    p.ell(mx, my + 6, 12, 6, fl(MOUTH, { ink: null }), .6);
  }
}

// -------------------------------------------------------------------------------------------------- LIRILI
function lirili(E) {
  const c = byId("lirili").palette, id = "lirili";
  const ear = light(c.grey, .1);
  const cactusBody = (p, spiky) => {
    for (const sx of [-1, 1]) {
      p.rib([[256 + sx * 52, 340], [256 + sx * 112, 332], [256 + sx * 124, 270], [256 + sx * 120, 236]], 42, 32, wc(c.cactus, c.cactusDark, { fillOp: 120, bleed: 0 }), 1.8);
    }
    p.sh([[196, 478], [316, 478], [334, 400], [326, 300], [302, 234], [256, 218], [210, 234], [186, 300], [178, 400]], wc(c.cactus, c.cactusDark, { fillOp: 125, bleed: 0 }), 2.6);
    for (const x of [222, 256, 290]) p.ln([[x, 244], [x + (x - 256) * .15, 360], [x + (x - 256) * .1, 470]], .9, c.cactusDark, "inkfine", 1.4);
    const n = spiky ? 18 : 10, len = spiky ? 22 : 12;
    for (let i = 0; i < n; i++) {
      const x = 196 + E.hash(i * 3 + 1) * 120, y = 270 + E.hash(i * 5 + 2) * 190, a = (E.hash(i * 7) - .5) * 1.6;
      p.ln([[x, y], [x + Math.sin(a) * len, y - Math.cos(a) * len]], .9, light(c.cactus, .6), "inkfine", .3);
    }
    for (const sx of [-1, 1]) {
      p.sh([[256 + sx * 50, 480], [256 + sx * 100, 480], [256 + sx * 108, 498], [256 + sx * 44, 498]], fl(c.straps, { sw: 1 }), 1); // sandals
      p.ln([[256 + sx * 64, 482], [256 + sx * 70, 466]], 1.2, c.straps, "ink", .4);
    }
    p.shine(214, 360, 8, 80, c.cactus, .03);
  };
  const clock = (p, cx, cy, r, hands = 0) => {
    p.ell(cx, cy, r, r, fl(c.clock, { sw: 1.2 }), 1);
    p.ell(cx, cy, r * .78, r * .78, fl(c.clockFace, { sw: .8 }), .8);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; p.ln([[cx + Math.cos(a) * r * .6, cy + Math.sin(a) * r * .6], [cx + Math.cos(a) * r * .72, cy + Math.sin(a) * r * .72]], .7, INK, "inkfine", .2); }
    p.ln([[cx, cy], [cx + Math.cos(hands) * r * .42, cy + Math.sin(hands) * r * .42]], 1.3, INK, "ink", .2);
    p.ln([[cx, cy], [cx + Math.cos(hands * 5.3) * r * .62, cy + Math.sin(hands * 5.3) * r * .62]], 1, INK, "ink", .2);
  };
  // ---- idle: elephant head on a cactus, pocket clock
  {
    const p = makePen(E, `${id}|idle`, CAMEO_CELLS.idle);
    cactusBody(p, false);
    p.ln([[372, 300], [376, 330]], 1.1, INK, "ink", .4);
    clock(p, 376, 360, 36, -1);
    // big floppy ears + head
    for (const sx of [-1, 1]) {
      p.sh([[256 + sx * 70, 96], [256 + sx * 150, 76], [256 + sx * 196, 130], [256 + sx * 182, 200], [256 + sx * 130, 226], [256 + sx * 84, 188]], wc(ear, dark(c.grey, .25), { fillOp: 110, bleed: 0 }), 2.4);
      p.sh([[256 + sx * 88, 118], [256 + sx * 148, 104], [256 + sx * 168, 144], [256 + sx * 150, 194], [256 + sx * 112, 188]], fl("#E7A9B4", { ink: null, washOp: 170 }), 2);
    }
    p.sh([[148, 150], [166, 96], [256, 66], [346, 96], [364, 150], [334, 212], [256, 234], [178, 212]], wc(c.grey, dark(c.grey, .3), { fillOp: 120, bleed: 0 }), 2.4);
    p.shine(204, 100, 30, 9, c.grey, -.3);
    // trunk
    p.rib([[256, 150], [256, 214], [244, 258], [276, 276]], 62, 36, wc(c.grey, dark(c.grey, .3), { fillOp: 120, bleed: 0 }), 1.6);
    for (const y of [180, 200, 222]) p.ln([[236, y], [256, y + 4], [276, y]], .8, dark(c.grey, .35), "inkfine", .5);
    // tiny tusks, big shiny eyes (no brows at rest, like the reference), rosy cheeks
    for (const sx of [-1, 1]) {
      p.sh([[256 + sx * 40, 214], [256 + sx * 54, 214], [256 + sx * 60, 244]], fl(c.clockFace, { sw: .8 }), .6);
      minemiEye(p, 256 + sx * 54, 140, 23, 26, "#3B4A7A", { glance: -sx * 2, side: sx });
      blush(p, 256 + sx * 76, 182, 18, 10, sx);
    }
    // a little cactus flower on the head
    p.ell(300, 74, 14, 11, fl(PAL.rose, { sw: .9 }), .8);
    p.ell(300, 74, 5, 4, fl(PAL.ochre, { ink: null }), .3);
  }
  // ---- scary: clock-face eyes with spinning hands, ears flared, spines out, a gaping mouth
  {
    const p = makePen(E, `${id}|scary`, CAMEO_CELLS.scary);
    cactusBody(p, true);
    for (const sx of [-1, 1]) {
      // flared ears, kept inside the 512 cell (the bold ink needs ~12 px of gutter)
      p.sh([[256 + sx * 60, 96], [256 + sx * 160, 40], [256 + sx * 208, 124], [256 + sx * 198, 220], [256 + sx * 126, 250], [256 + sx * 78, 190]], wc(ear, dark(c.grey, .35), { fillOp: 120, bleed: 0 }), 2.4);
      p.sh([[256 + sx * 84, 118], [256 + sx * 160, 80], [256 + sx * 184, 140], [256 + sx * 168, 210], [256 + sx * 116, 200]], fl(dark("#E7A9B4", .3), { ink: null, washOp: 170 }), 2);
    }
    p.sh([[148, 150], [166, 96], [256, 66], [346, 96], [364, 150], [334, 212], [256, 236], [178, 212]], wc(dark(c.grey, .1), dark(c.grey, .45), { fillOp: 125, bleed: 0 }), 2.4);
    for (const sx of [-1, 1]) { clock(p, 256 + sx * 54, 134, 40, sx * 2.1 + .4); p.ln([[256 + sx * 54, 134], [256 + sx * 54 + sx * 18, 104]], 1.2, c.clock, "ink", .3); }
    p.rib([[256, 176], [256, 220], [262, 252], [236, 262]], 54, 30, wc(c.grey, dark(c.grey, .4), { fillOp: 125 }), 1.6);
    p.sh([[206, 228], [256, 214], [306, 228], [296, 268], [256, 278], [216, 268]], wc(MOUTH, dark(MOUTH, .4), { fillOp: 120, sw: 1.1 }), 1.6);
    teeth(p, 212, 232, 300, 232, 6, 22, .8);
    teeth(p, 218, 268, 296, 268, 5, -18, .8);
    p.ell(300, 74, 14, 11, fl(dark(PAL.rose, .3), { sw: .9 }), .8);
  }
}

// -------------------------------------------------------------------------------------------------- CHIMPANZINI
function chimpanzini(E) {
  const c = byId("chimpanzini").palette, id = "chimpanzini";
  const peel = (p, open) => {
    const k = open ? 1.35 : 1;
    for (const sx of [-1, 1]) {
      p.sh([[256 + sx * 52, 270], [256 + sx * 130 * k, 290], [256 + sx * 150 * k, 380], [256 + sx * 112 * k, 410], [256 + sx * 76, 340]], wc(c.banana, c.bananaDark, { fillOp: 120, bleed: 0 }), 1.8);
      p.ln([[256 + sx * 70, 300], [256 + sx * 126 * k, 372]], .9, c.bananaDark, "inkfine", 1);
    }
  };
  const body = (p, dk = 0) => {
    p.sh([[198, 478], [314, 478], [336, 400], [342, 320], [326, 262], [256, 244], [186, 262], [172, 320], [178, 400]], wc(c.banana, c.bananaDark, { fillOp: 125, bleed: 0 }), 2.4);
    p.sh([[198, 478], [314, 478], [304, 498], [208, 498]], fl(c.tips, { sw: 1 }), 1);
    for (const x of [214, 256, 298]) p.ln([[x, 290], [x + (x - 256) * .12, 380], [x + (x - 256) * .08, 470]], .9, c.bananaDark, "inkfine", 1.6);
    for (const [bx, by] of [[230, 340], [290, 420], [240, 440], [300, 310]]) p.ell(bx, by, 5, 4, fl(c.tips, { ink: null, washOp: 200 }), .6);
    p.shine(214, 350, 8, 70, c.banana, .04);
  };
  // ---- idle: a chimp popping out of a half-peeled banana, cheering. Chibi: the body and peel shrink toward the
  // feet, the head grows on the new neck (two pens re-proportion the same drawing by coordinates)
  {
    const BODY_K = .86, HEAD_K = 1.2, neck = 498 - (498 - 250) * BODY_K;
    const p = makePen(E, `${id}|idle`, CAMEO_CELLS.idle, false, { ox: 256, oy: 498, k: BODY_K });
    const hp = makePen(E, `${id}|idle.head`, CAMEO_CELLS.idle, false, { ox: 256, oy: 250, k: HEAD_K, ty: neck });
    // arms up and wide (the big head must not hide the hands), behind the peel
    for (const sx of [-1, 1]) {
      p.rib([[256 + sx * 54, 262], [256 + sx * 136, 236], [256 + sx * 176, 170], [256 + sx * 188, 116]], 34, 26, wc(c.fur, dark(c.fur, .3), { fillOp: 110, bleed: 0 }), 1.6);
      p.ell(256 + sx * 188, 104, 24, 22, wc(c.furLight, c.fur, { fillOp: 90, sw: 1.2 }), 1.2);
      for (const fx of [-12, 0, 12]) p.ln([[256 + sx * 188 + fx, 90], [256 + sx * 188 + fx * 1.2, 74]], 1.6, c.fur, "ink", .3);
    }
    body(p);
    peel(p, false);
    // head
    for (const sx of [-1, 1]) {
      hp.ell(256 + sx * 90, 164, 30, 32, wc(c.fur, dark(c.fur, .3), { fillOp: 100 }), 1.4);
      hp.ell(256 + sx * 90, 164, 17, 20, fl("#E7A9B4", { sw: .8 }), 1);
    }
    hp.sh([[168, 170], [178, 118], [256, 92], [334, 118], [344, 170], [316, 232], [256, 250], [196, 232]], wc(c.fur, dark(c.fur, .3), { fillOp: 110, bleed: 0 }), 2.4);
    hp.sh([[196, 156], [226, 128], [256, 144], [286, 128], [316, 156], [310, 214], [256, 240], [202, 214]], wc(c.face, dark(c.face, .2), { fillOp: 90, bleed: 0, sw: 1 }), 1.8);
    for (const sx of [-1, 1]) {
      minemiEye(hp, 256 + sx * 34, 166, 20, 23, "#5A3418", { glance: -sx * 2, side: sx });
      blush(hp, 256 + sx * 50, 204, 13, 7, sx);
    }
    hp.ell(256, 200, 26, 17, wc(light(c.face, .1), c.face, { fillOp: 60, sw: 1 }), 1);
    hp.ell(247, 196, 4, 3, fl(INK, { ink: null }), .3);
    hp.ell(265, 196, 4, 3, fl(INK, { ink: null }), .3);
    hp.sh([[228, 212], [256, 224], [284, 212], [280, 228], [256, 240], [232, 228]], fl(MOUTH, { sw: 1.2 }), 1);
    teeth(hp, 238, 215, 274, 215, 4, 7, .8);
  }
  // ---- scary: the peel opens like jaws, too many teeth, the chimp stares
  {
    const p = makePen(E, `${id}|scary`, CAMEO_CELLS.scary);
    // peel flaps wide open behind, lined with teeth
    for (const sx of [-1, 1]) {
      p.sh([[256 + sx * 40, 250], [256 + sx * 150, 150], [256 + sx * 226, 190], [256 + sx * 236, 300], [256 + sx * 150, 330], [256 + sx * 70, 300]], wc(c.banana, c.bananaDark, { fillOp: 130, bleed: 0 }), 2);
      p.sh([[256 + sx * 60, 262], [256 + sx * 150, 176], [256 + sx * 204, 206], [256 + sx * 210, 290], [256 + sx * 146, 306], [256 + sx * 82, 292]], wc("#8A2A3A", dark("#8A2A3A", .4), { fillOp: 120, sw: .8 }), 1.8);
    }
    body(p);
    peel(p, true);
    for (const sx of [-1, 1]) p.rib([[256 + sx * 54, 266], [256 + sx * 126, 300], [256 + sx * 178, 330], [256 + sx * 204, 380]], 30, 18, wc(c.fur, dark(c.fur, .3), { fillOp: 110 }), 1.6);
    for (const sx of [-1, 1]) for (const fx of [-14, 0, 14]) p.poly([[256 + sx * 204 + fx - 5, 380], [256 + sx * 204 + fx + 5, 380], [256 + sx * 204 + fx * 1.4, 412]], { wash: TOOTH, washOp: 255, ink: INK, sw: .8 }, .5);
    for (const sx of [-1, 1]) p.ell(256 + sx * 96, 166, 32, 34, wc(c.fur, dark(c.fur, .3), { fillOp: 100 }), 1.4);
    p.sh([[160, 172], [174, 106], [256, 76], [338, 106], [352, 172], [324, 244], [256, 262], [188, 244]], wc(dark(c.fur, .1), dark(c.fur, .5), { fillOp: 120, bleed: 0 }), 2.4);
    p.sh([[194, 160], [224, 128], [256, 146], [288, 128], [318, 160], [312, 224], [256, 252], [200, 224]], wc(dark(c.face, .1), dark(c.face, .35), { fillOp: 90, sw: .8 }), 1.8);
    for (const sx of [-1, 1]) {
      p.ell(256 + sx * 34, 160, 26, 30, fl("#FFFDF4", { sw: 1.2 }), .8);
      p.ell(256 + sx * 34, 162, 6, 7, fl(INK, { ink: null }), .3);
      p.ln([[256 + sx * 8, 126], [256 + sx * 34, 128], [256 + sx * 62, 118]], 2, dark(c.fur, .6), "ink", .4);
    }
    p.sh([[204, 206], [256, 196], [308, 206], [316, 250], [256, 268], [196, 250]], wc(MOUTH, dark(MOUTH, .45), { fillOp: 120, sw: 1.2 }), 1.6);
    teeth(p, 206, 208, 306, 208, 9, 20, .8);
    teeth(p, 202, 250, 310, 250, 9, -18, .8);
    p.ell(256, 238, 30, 10, fl(TONGUE, { ink: null }), .8);
  }
}

// -------------------------------------------------------------------------------------------------- TRIPPI
function trippi(E) {
  const c = byId("trippi").palette, id = "trippi";
  const segs = [[300, 452, 46, 34, -.3], [236, 438, 54, 40, -.6], [178, 392, 60, 46, -1.0], [150, 328, 64, 50, -1.5], [164, 262, 62, 48, -2.0], [212, 214, 56, 44, -2.5]];
  const shrimp = (p, scary) => {
    // tail fan
    for (const [a, l] of [[-.5, 70], [0, 82], [.5, 70]]) {
      p.sh([[330, 460], [330 + Math.cos(a) * l * .6 - 8, 460 + Math.sin(a) * l * .6 - 24], [330 + Math.cos(a) * l + 20, 460 + Math.sin(a) * l * .5 - 6], [330 + Math.cos(a) * l * .7, 470 + Math.sin(a) * l * .6]], wc(c.shrimp, c.shrimpDark, { fillOp: 110, sw: 1 }), 1.2);
    }
    for (const [cx, cy, rx, ry, rot] of segs) {
      p.ell(cx, cy, rx, ry, wc(c.shrimp, c.shrimpDark, { fillOp: 120, bleed: 0 }), 1.6, rot);
      p.ln([[cx - rx * .6, cy - ry * .5], [cx, cy - ry * .9], [cx + rx * .6, cy - ry * .5]].map(([x, y]) => [x, y]), .8, c.shrimpDark, "inkfine", .6);
    }
    // swimmerets
    for (const [cx, cy] of [[300, 482], [236, 476], [180, 440], [146, 380]]) p.ln([[cx, cy], [cx + 6, cy + 18]], 1.3, c.shrimpDark, "ink", .6);
    p.shine(156, 330, 8, 40, c.shrimp, .1);
  };
  const catHead = (p, cx, cy, scary) => {
    const k = scary ? 1.08 : 1;
    for (const sx of [-1, 1]) {
      p.sh([[cx + sx * 40, cy - 56], [cx + sx * 78 * k, cy - 112 * k], [cx + sx * 88 * k, cy - 40]], wc(c.cat, c.stripes, { fillOp: 100, sw: 1.1 }), 1.2);
      p.sh([[cx + sx * 50, cy - 56], [cx + sx * 72 * k, cy - 94 * k], [cx + sx * 76 * k, cy - 50]], fl("#E7A9B4", { ink: null, washOp: 190 }), 1);
    }
    p.sh([[cx - 90 * k, cy + 6], [cx - 78 * k, cy - 52], [cx, cy - 76 * k], [cx + 78 * k, cy - 52], [cx + 90 * k, cy + 6], [cx + 62 * k, cy + 62], [cx, cy + 78], [cx - 62 * k, cy + 62]], wc(c.cat, c.stripes, { fillOp: 100, bleed: 0 }), 2);
    for (const dx of [-22, 0, 22]) p.ln([[cx + dx, cy - 76 * k], [cx + dx * .9, cy - 46]], 2.2, c.stripes, "ink", .6);
    for (const sx of [-1, 1]) for (const dy of [-14, 4]) p.ln([[cx + sx * 88 * k, cy + dy], [cx + sx * 62, cy + dy + 4]], 2, c.stripes, "ink", .6);
    return k;
  };
  const antennae = (p, cx, cy, wild) => {
    for (const sx of [-1, 1]) {
      // the whipping antennae stay inside the cell: the head sits right of centre (cx 330)
      p.rib([[cx + sx * 24, cy - 70], [cx + sx * (50 + wild * 10), cy - 130], [cx + sx * (86 + wild * 16), cy - 150], [cx + sx * (118 + wild * 16), cy - 130 + wild * 40]], 9, 3, fl(c.shrimp, { sw: 1.1 }), 1.2);
      p.ell(cx + sx * (118 + wild * 16), cy - 130 + wild * 40, 8, 8, fl(c.shrimpDark, { sw: 1 }), .6);
    }
  };
  // ---- idle: curled shrimp, tabby cat face, sweet
  {
    const p = makePen(E, `${id}|idle`, CAMEO_CELLS.idle);
    shrimp(p, false);
    antennae(p, 330, 180, 0);
    catHead(p, 330, 180, false);
    for (const sx of [-1, 1]) {
      p.ell(330 + sx * 34, 176, 21, 25, fl(c.eyes, { sw: 1.6 }), .8);
      p.ell(330 + sx * 34, 186, 13, 10, fl(light(c.eyes, .35), { ink: null }), .4);
      p.ell(330 + sx * 34, 176, 5, 18, fl(INK, { ink: null }), .4);
      p.ell(330 + sx * 34 - 7, 167, 6, 5.5, fl("#FFFFFF", { ink: null }), .2);
      p.ell(330 + sx * 34 + 7, 186, 2.6, 2.6, fl("#FFFFFF", { ink: null }), .2);
      p.ln([[330 + sx * 58, 214], [330 + sx * 118, 206]], .9, INK, "inkfine", .6);
      p.ln([[330 + sx * 56, 224], [330 + sx * 114, 232]], .9, INK, "inkfine", .6);
    }
    p.sh([[320, 204], [340, 204], [330, 216]], fl("#E78AA0", { sw: .8 }), .4);
    p.ln([[330, 216], [330, 224], [314, 232]], 1.2, INK, "ink", .4);
    p.ln([[330, 224], [346, 232]], 1.2, INK, "ink", .4);
    blush(p, 280, 206, 15, 8, -1);
    blush(p, 380, 206, 15, 8, 1);
  }
  // ---- scary: huge cat mouth, slit pupils, antennae whipping
  {
    const p = makePen(E, `${id}|scary`, CAMEO_CELLS.scary);
    shrimp(p, true);
    antennae(p, 330, 180, 1);
    catHead(p, 330, 180, true);
    for (const sx of [-1, 1]) {
      p.ell(330 + sx * 36, 168, 25, 29, fl(c.eyes, { sw: 1.3 }), .8);
      p.ell(330 + sx * 36, 168, 4, 24, fl(INK, { ink: null }), .4);
      p.ln([[330 + sx * 12, 134], [330 + sx * 40, 136], [330 + sx * 64, 126]], 2.2, c.stripes, "ink", .4);
    }
    p.sh([[330 - 70, 206], [330, 196], [330 + 70, 206], [330 + 82, 262], [330 + 40, 310], [330, 316], [330 - 40, 310], [330 - 82, 262]], wc(MOUTH, dark(MOUTH, .45), { fillOp: 120, sw: 1.3 }), 1.8);
    teeth(p, 262, 208, 398, 208, 8, 26, .8);
    teeth(p, 270, 290, 392, 290, 8, -22, .8);
    p.ell(330, 276, 36, 16, fl(TONGUE, { ink: null }), .8);
    p.sh([[320, 192], [340, 192], [330, 204]], fl("#E78AA0", { sw: .8 }), .4);
  }
}

export const CAMEO_RECIPES = { bombardiro, ballerina, lirili, chimpanzini, trippi };
