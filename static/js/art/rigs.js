// Painting recipes for the three talking rigs (Patapim, Tralalero, Sahur). Each recipe paints ONE boil variant of
// the whole part atlas (cells from roster.js) with the watercolour engine; nothing here runs per frame. Art stays
// inside each cell's 12 px gutter so filtering never bleeds a neighbour.
//
// Look (all three): flat colour wash + soft watercolour shade + confident ink outline, big expressive eyes and
// mouth states, cute-creepy. Palettes come from the roster.
import { PAL } from "./engine.js";
import { RIG_CELLS, byId } from "./roster.js";
import { makePen, eyePair, wc, fl, dark, light, INK } from "./pens.js";
import { CAMEO_RECIPES } from "./cameos.js";

const PINK = "#D9707F", TONGUE = "#E5788C", MOUTH_IN = "#4A1E2E", TOOTH = "#FFF8E8";

/** Generic mouth set. style: { w (half width), col (lip/ink), tooth, inner, fangs } */
function mouths(E, id, kind, st) {
  const c = RIG_CELLS.mouth[kind];
  const pen = makePen(E, `${id}|mouth.${kind}`, c);
  const { w = 46, lip = PINK, inner = MOUTH_IN, tooth = TOOTH, cy = 96, grin = 14 } = st;
  if (kind === "closed") {
    pen.ln([[96 - w, cy - 4], [96 - w * .5, cy + grin * .6], [96, cy + grin * .8], [96 + w * .5, cy + grin * .6], [96 + w, cy - 4]], 1.6, INK, "ink", .6);
    pen.ln([[96 - w - 2, cy - 8], [96 - w + 6, cy - 3]], .9, INK, "inkfine", .3);
    pen.ln([[96 + w + 2, cy - 8], [96 + w - 6, cy - 3]], .9, INK, "inkfine", .3);
    if (st.fangs) for (const sx of [-1, 1]) pen.poly([[96 + sx * (w * .5) - 6, cy + grin * .5], [96 + sx * (w * .5) + 6, cy + grin * .5], [96 + sx * (w * .5), cy + grin * .5 + 14]], { wash: tooth, washOp: 255, ink: INK, sw: .6 }, .4);
  } else if (kind === "mid") {
    pen.ell(96, cy + 4, w * .5, 15, wc(inner, dark(inner, .3), { fillOp: 60 }), 1.2);
    pen.ln([[96 - w * .5 + 2, cy + 2], [96 + w * .5 - 2, cy + 2]], .7, lip, "inkfine", .3);
  } else if (kind === "open") {
    pen.sh([[96 - w * .8, cy - 14], [96, cy - 18], [96 + w * .8, cy - 14], [96 + w * .7, cy + 18], [96, cy + 36], [96 - w * .7, cy + 18]],
      wc(inner, dark(inner, .35), { fillOp: 80 }), 1.6);
    pen.ell(96, cy + 24, w * .46, 11, wc(TONGUE, dark(TONGUE, .25), { fillOp: 70, ink: null }), 1);
    pen.poly([[96 - w * .6, cy - 13], [96 + w * .6, cy - 13], [96 + w * .5, cy - 2], [96 - w * .5, cy - 2]], { wash: tooth, washOp: 255, ink: INK, sw: .6 }, .6);
  } else { // scary: a wide dark grin full of teeth (smooth dark shape, then the teeth on top: sharp wash polygons leave wedges)
    const hw = Math.min(w * 1.45, 80);
    pen.sh([[96 - hw, cy - 6], [96 - hw * .5, cy - 18], [96, cy - 20], [96 + hw * .5, cy - 18], [96 + hw, cy - 6], [96 + hw * .8, cy + 16], [96, cy + 30], [96 - hw * .8, cy + 16]],
      wc(inner, dark(inner, .4), { fillOp: 90, sw: 1.3 }), 1.2);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const x = 96 - hw * .86 + (hw * 1.72 * (i + .5)) / n, tw = hw * .86 / n;
      const top = cy - 17 + Math.abs(x - 96) * .12, bot = cy + 24 - Math.abs(x - 96) * .28;
      pen.poly([[x - tw, top], [x + tw, top], [x, top + (i % 2 ? 17 : 24)]], { wash: tooth, washOp: 255, ink: INK, sw: .55 }, .4);
      pen.poly([[x - tw, bot], [x + tw, bot], [x, bot - (i % 2 ? 22 : 15)]], { wash: tooth, washOp: 255, ink: INK, sw: .55 }, .4);
    }
  }
}

// ---------------------------------------------------------------------------------------------------- PATAPIM
function patapim(E) {
  const c = byId("patapim").palette;
  const id = "patapim";
  const fur = c.bark, furDk = c.barkDark, skin = light(c.nose, .32);

  // ---- extra: wet carpet puddle and root tendrils under the feet (behind everything)
  {
    const p = makePen(E, `${id}|extra`, RIG_CELLS.extra);
    p.sh([[24, 100], [60, 70], [128, 62], [196, 70], [232, 100], [204, 134], [128, 146], [52, 134]], wc(dark(c.mossDark, .3), dark(c.mossDark, .6), { fillOp: 120, ink: null }), 3);
    p.shine(100, 82, 54, 9, dark(c.mossDark, .3));
    p.ln([[20, 104], [8, 120], [20, 138]], 1.4, c.barkDark, "ink", .8);
    p.ln([[236, 104], [248, 122], [236, 138]], 1.4, c.barkDark, "ink", .8);
    p.ell(64, 120, 11, 6, fl(c.mould, { ink: null }), 1);
    p.ell(198, 114, 9, 5, fl(c.mould, { ink: null }), 1);
  }

  // ---- body: a mossy trunk
  {
    const p = makePen(E, `${id}|body`, RIG_CELLS.body);
    p.sh([[78, 616], [150, 626], [224, 630], [300, 626], [372, 616], [344, 548], [330, 450], [338, 340], [328, 236], [342, 166], [304, 114], [224, 98], [144, 114], [106, 166], [120, 236], [110, 340], [118, 450], [104, 548]],
      wc(fur, furDk, { fillOp: 120, bleed: 0 }), 3.2);
    E.flushBrush();
    // bark cracks, a knot, belly shade
    p.shade(292, 400, 26, 170, fur);
    p.ln([[170, 150], [162, 230], [176, 330], [164, 420]], 1.1, furDk, "ink", 2);
    p.ln([[258, 170], [270, 250], [254, 360], [268, 470], [256, 560]], 1.1, furDk, "ink", 2);
    p.ln([[210, 450], [200, 520], [212, 590]], .9, furDk, "inkfine", 2);
    p.ell(204, 340, 26, 34, wc(dark(fur, .55), "#2A180C", { fillOp: 120, sw: 1, bleed: 0 }), 1.6);
    p.ell(204, 340, 12, 17, wc("#1B0F08", "#000000", { fillOp: 80, ink: null }), 1);
    p.shine(166, 300, 8, 64, fur, .05);
    // moss on the shoulders and a drip down one side
    p.sh([[104, 168], [134, 124], [200, 106], [260, 112], [322, 128], [350, 170], [330, 200], [304, 182], [284, 218], [256, 190], [226, 224], [196, 190], [166, 214], [140, 188], [120, 212]],
      wc(c.moss, c.mossDark, { fillOp: 130, bleed: 0, sw: .9 }), 3);
    p.shine(190, 142, 40, 7, c.moss, -.1);
    p.ln([[120, 190], [126, 232]], 1, c.mossDark, "inkfine", 1);
    p.ln([[300, 190], [296, 236]], 1, c.mossDark, "inkfine", 1);
    // mould flecks
    for (const [mx, my, mr] of [[150, 500, 14], [292, 520, 11], [238, 280, 9], [138, 400, 8]]) p.ell(mx, my, mr, mr * .7, fl(c.mould, { ink: null }), 1.4);
  }

  // ---- legs: bark stumps ending in HUGE pale human feet (toes toward us)
  for (const [part, mir] of [["legL", false], ["legR", true]]) {
    const p = makePen(E, `${id}|${part}`, RIG_CELLS[part], mir);
    p.sh([[84, 14], [140, 14], [134, 56], [142, 82], [82, 82], [90, 56]], wc(fur, furDk, { fillOp: 110, bleed: 0 }), 1.6);
    p.ell(112, 114, 84, 44, wc(c.feet, c.feetShade, { fillOp: 120, bleed: 0 }), 2);
    p.shade(112, 134, 62, 10, c.feet);
    p.shine(84, 98, 28, 7, c.feet, -.2);
    // five toes (big one first)
    const toes = [[40, 142, 17, 15], [74, 156, 16, 15], [108, 160, 15, 14], [141, 156, 14, 13], [172, 144, 12, 11]];
    for (const [tx, ty, trx, tr] of toes) {
      p.ell(tx, ty, trx, tr, fl(c.feet, { sw: 1 }), 1);
    }
    p.ln([[48, 108], [64, 100]], .6, c.feetShade, "inkfine", .5);
  }

  // ---- arms: branches with twig fingers and a couple of leaves
  for (const [part, mir] of [["armL", false], ["armR", true]]) {
    const p = makePen(E, `${id}|${part}`, RIG_CELLS[part], mir);
    p.rib([[84, 34], [66, 110], [56, 190], [70, 262]], 58, 26, wc(fur, furDk, { fillOp: 110, bleed: 0 }), 1.6);
    p.ln([[70, 70], [62, 150], [66, 220]], .8, furDk, "inkfine", 2);
    p.rib([[62, 150], [40, 190], [26, 214]], 18, 8, wc(fur, furDk, { fillOp: 100 }), 1);
    for (const [fx, fy] of [[36, 304], [70, 312], [104, 296]]) p.rib([[70, 262], [(70 + fx) / 2, (262 + fy) / 2 + 4], [fx, fy]], 14, 6, fl(fur), .8);
    p.sh([[36, 118], [56, 98], [76, 112], [58, 134]], fl(c.moss, { sw: .8 }), 1);
    p.sh([[86, 186], [110, 170], [124, 192], [100, 204]], fl(c.moss, { sw: .8 }), 1);
    p.ln([[60, 112], [74, 116]], .6, c.mossDark, "inkfine", .5);
  }

  // ---- head: monkey face, big drooping nose, mossy crown
  {
    const p = makePen(E, `${id}|head`, RIG_CELLS.head);
    for (const ex of [48, 272]) {
      p.ell(ex, 178, 32, 36, wc(fur, furDk, { fillOp: 100 }), 1.6);
      p.ell(ex + (ex < 100 ? 4 : -4), 180, 17, 22, fl(light(c.nose, .1), { sw: .7 }), 1.2);
    }
    p.ell(160, 172, 118, 112, wc(fur, furDk, { fillOp: 110, bleed: 0 }), 2.4);
    E.flushBrush();
    p.sh([[96, 150], [124, 120], [160, 112], [196, 120], [224, 150], [236, 196], [214, 246], [160, 270], [106, 246], [84, 196]], wc(skin, c.nose, { fillOp: 80, bleed: 0, ink: INK, sw: .8 }), 2);
    p.shine(132, 150, 20, 7, skin, -.4);
    // moss crown
    p.sh([[62, 124], [78, 78], [116, 46], [160, 34], [204, 46], [244, 78], [260, 124], [238, 104], [214, 118], [190, 96], [160, 118], [130, 96], [106, 118], [84, 104]],
      wc(c.moss, c.mossDark, { fillOp: 130, bleed: 0, sw: .9 }), 2.5);
    for (const [lx, ly, ang] of [[80, 70, -.8], [112, 46, -.4], [208, 46, .4], [240, 72, .8]]) p.ell(lx, ly, 20, 8, fl(c.moss, { sw: .6 }), 1, ang);
    // the nose: long, droopy, shaded
    p.sh([[142, 126], [182, 124], [200, 164], [198, 208], [180, 238], [152, 242], [134, 222], [142, 176]], wc(c.nose, dark(c.nose, .35), { fillOp: 110, bleed: 0 }), 2);
    p.shine(160, 150, 8, 22, c.nose, .1);
    p.ell(150, 228, 8, 5, fl(dark(c.nose, .55), { ink: null, washOp: 200 }), .6);
    p.ell(172, 230, 8, 5, fl(dark(c.nose, .55), { ink: null, washOp: 200 }), .6);
    p.ln([[136, 214], [128, 238]], .7, dark(c.nose, .5), "inkfine", .6);
    // cheek wrinkles
    p.ln([[108, 220], [124, 236]], .8, dark(skin, .35), "inkfine", .6);
    p.ln([[212, 220], [196, 236]], .8, dark(skin, .35), "inkfine", .6);
  }

  // ---- eyes
  const eyeLook = { sep: 54, rx: 24, ry: 28, pupil: 12, lid: skin, brow: furDk };
  for (const k of ["open", "closed", "angry"]) eyePair(E, `${id}|eyes.${k}`, RIG_CELLS.eyes[k], k, eyeLook);
  eyePair(E, `${id}|eyes.wide`, RIG_CELLS.eyes.wide, "wide", { ...eyeLook, rx: 24, ry: 28, pupil: 14, pupilCol: "#F2D23C", ringCol: "#E8AA38" });

  // ---- mouths
  for (const k of ["closed", "mid", "open", "scary"]) mouths(E, id, k, { w: 40, cy: 98, lip: dark(c.nose, .2), grin: 12, inner: "#4A1E1E", tooth: "#E8D9A0" });

  // ---- prop: a small brown felt hat with a red band
  {
    const p = makePen(E, `${id}|prop`, RIG_CELLS.prop);
    p.sh([[34, 548], [50, 522], [78, 500], [90, 474], [128, 462], [166, 474], [178, 500], [206, 522], [222, 548], [190, 568], [128, 574], [66, 568]], wc(c.hat, dark(c.hat, .35), { fillOp: 100, bleed: 0 }), 2);
    p.sh([[84, 540], [92, 508], [128, 500], [164, 508], [172, 540], [128, 546]], wc(c.hatBand, dark(c.hatBand, .35), { fillOp: 100, sw: .8 }), 1.4);
    p.ell(128, 524, 12, 10, wc(PAL.ochre, dark(PAL.ochre, .3), { fillOp: 80, sw: .7 }), .8);
    p.shine(104, 486, 16, 7, c.hat, -.5);
    p.ln([[48, 546], [128, 560], [208, 546]], .7, dark(c.hat, .5), "inkfine", 1);
  }
}


// -------------------------------------------------------------------------------------------------- TRALALERO
function tralalero(E) {
  const c = byId("tralalero").palette;
  const id = "tralalero";
  const skinDk = dark(c.skin, .3);

  // tail fin behind the body
  {
    const p = makePen(E, `${id}|body.tail`, RIG_CELLS.body);
    p.sh([[330, 512], [392, 456], [428, 440], [410, 506], [436, 570], [372, 600], [330, 590]], wc(c.skin, skinDk, { fillOp: 120 }), 2.4);
    p.ln([[352, 540], [400, 500]], .8, skinDk, "inkfine", 1.5);
  }
  // body: a chubby upright shark
  {
    const p = makePen(E, `${id}|body`, RIG_CELLS.body);
    p.sh([[128, 604], [224, 628], [320, 604], [364, 540], [374, 450], [350, 350], [318, 250], [292, 184], [256, 140], [224, 130], [192, 140], [156, 184], [130, 250], [98, 350], [74, 450], [84, 540]],
      wc(c.skin, skinDk, { fillOp: 115, bleed: 0 }), 3);
    E.flushBrush();
    p.sh([[224, 280], [292, 348], [322, 450], [304, 548], [224, 596], [144, 548], [126, 450], [156, 348]], wc(c.belly, dark(c.belly, .22), { fillOp: 100, bleed: 0, sw: .9 }), 2.4);
    p.shine(180, 360, 16, 60, c.belly, .12);
    p.shade(296, 300, 18, 70, c.skin, -.25);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = 224 + sx * (92 + i * 2), y = 214 + i * 24;
      p.ln([[x, y], [x + sx * 12, y + 10], [x + sx * 4, y + 20]], 1, skinDk, "inkfine", .6);
    }
    p.ln([[210, 500], [224, 508], [238, 500]], .9, dark(c.belly, .45), "inkfine", .5);
    for (const [dx, dy] of [[112, 560], [338, 420], [96, 330]]) p.ell(dx, dy, 6, 9, fl(c.drip, { sw: .6 }), .6);
  }
  // legs: short grey-blue stumps and BIG blue sneakers with a white zig-zag stripe (no logo), side view
  for (const [part, mir] of [["legL", false], ["legR", true]]) {
    const p = makePen(E, `${id}|${part}`, RIG_CELLS[part], mir);
    p.sh([[84, 16], [140, 16], [136, 66], [88, 66]], wc(c.skin, skinDk, { fillOp: 100 }), 1.4);
    p.sh([[16, 156], [96, 150], [176, 152], [180, 168], [96, 176], [18, 172]], fl(c.sole, { sw: 1 }), 1.2);
    p.sh([[20, 148], [28, 118], [58, 100], [88, 92], [108, 70], [140, 66], [160, 80], [172, 118], [172, 152], [120, 160], [70, 162], [28, 160]], wc(c.sneaker, dark(c.sneaker, .35), { fillOp: 110, bleed: 0 }), 1.8);
    p.sh([[20, 148], [26, 126], [46, 118], [58, 142], [60, 160], [28, 160]], fl(c.sole, { sw: .8 }), 1);
    p.poly([[62, 148], [84, 118], [100, 140], [122, 108], [140, 134], [162, 106], [168, 124], [144, 154], [124, 130], [104, 160], [86, 140], [68, 164]], { wash: c.stripe, washOp: 255, ink: INK, sw: .7 }, .8);
    for (const lx of [90, 106, 122]) p.ln([[lx - 6, 88 - (lx - 90) * .12], [lx + 6, 96 - (lx - 90) * .12]], 1, c.stripe, "inkfine", .4);
    p.shine(70, 112, 22, 6, c.sneaker, -.5);
  }
  {
    const p = makePen(E, `${id}|prop`, RIG_CELLS.prop);
    p.sh([[90, 20], [166, 20], [160, 100], [96, 100]], wc(c.skin, skinDk, { fillOp: 100 }), 1.4);
    p.sh([[44, 188], [128, 182], [212, 188], [216, 204], [128, 212], [40, 204]], fl(c.sole, { sw: 1 }), 1.2);
    p.sh([[50, 178], [54, 134], [86, 104], [128, 96], [170, 104], [202, 134], [206, 178], [128, 188]], wc(c.sneaker, dark(c.sneaker, .35), { fillOp: 110, bleed: 0 }), 1.8);
    p.sh([[70, 178], [74, 154], [128, 140], [182, 154], [186, 178], [128, 184]], fl(c.sole, { sw: .8 }), 1);
    p.poly([[56, 130], [76, 112], [90, 134], [112, 108], [128, 132], [146, 108], [166, 134], [180, 112], [200, 130], [200, 146], [180, 130], [166, 150], [146, 126], [128, 150], [112, 126], [90, 152], [76, 130], [56, 148]], { wash: c.stripe, washOp: 255, ink: INK, sw: .7 }, .8);
    p.ln([[104, 100], [128, 112], [152, 100]], 1, c.stripe, "inkfine", .5);
    p.shine(96, 120, 20, 6, c.sneaker, -.4);
  }
  // fins as arms
  for (const [part, mir] of [["armL", false], ["armR", true]]) {
    const p = makePen(E, `${id}|${part}`, RIG_CELLS[part], mir);
    p.sh([[58, 24], [106, 28], [124, 90], [122, 170], [100, 250], [72, 304], [60, 250], [48, 170], [42, 90]], wc(c.skin, skinDk, { fillOp: 115, bleed: 0 }), 2);
    p.ln([[74, 60], [72, 150], [70, 240]], .9, skinDk, "inkfine", 1.4);
    p.ln([[92, 70], [98, 150], [86, 230]], .8, skinDk, "inkfine", 1.4);
    p.shine(58, 120, 7, 50, c.skin, .08);
  }
  // head
  {
    const p = makePen(E, `${id}|head`, RIG_CELLS.head);
    p.sh([[134, 84], [176, 24], [210, 18], [224, 92]], wc(c.skin, skinDk, { fillOp: 120 }), 2);
    p.sh([[34, 200], [46, 140], [94, 86], [160, 66], [226, 86], [274, 140], [286, 200], [264, 258], [212, 284], [160, 290], [108, 284], [56, 258]], wc(c.skin, skinDk, { fillOp: 115, bleed: 0 }), 2.8);
    E.flushBrush();
    p.sh([[62, 214], [112, 194], [160, 190], [208, 194], [258, 214], [244, 262], [160, 284], [76, 262]], wc(c.belly, dark(c.belly, .2), { fillOp: 90, bleed: 0, sw: .8 }), 2);
    p.shine(116, 106, 28, 8, c.skin, -.35);
    p.shade(256, 160, 14, 40, c.skin, .2);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = 160 + sx * (112 + i * 4), y = 168 + i * 14;
      p.ln([[x, y], [x + sx * 10, y + 4]], 1, skinDk, "inkfine", .5);
    }
    p.ell(146, 150, 4, 3, fl(skinDk, { ink: null, washOp: 200 }), .4);
    p.ell(174, 150, 4, 3, fl(skinDk, { ink: null, washOp: 200 }), .4);
  }
  const look = { sep: 74, rx: 26, ry: 31, pupil: 14, lid: c.skin, brow: skinDk };
  for (const k of ["open", "closed", "angry"]) eyePair(E, `${id}|eyes.${k}`, RIG_CELLS.eyes[k], k, look);
  eyePair(E, `${id}|eyes.wide`, RIG_CELLS.eyes.wide, "wide", { ...look, pupil: 15, pupilCol: "#F2D23C", ringCol: "#E8AA38" });
  for (const k of ["closed", "mid", "open", "scary"]) mouths(E, id, k, { w: 54, cy: 96, lip: dark(c.skin, .3), grin: 16, inner: "#5A1F36", fangs: true });
}

// -------------------------------------------------------------------------------------------------- SAHUR
function sahur(E) {
  const c = byId("sahur").palette;
  const id = "sahur";
  const grain = c.grain;
  // body: a wooden log
  {
    const p = makePen(E, `${id}|body`, RIG_CELLS.body);
    p.sh([[92, 606], [150, 622], [224, 628], [298, 622], [356, 606], [348, 520], [342, 400], [346, 280], [340, 190], [332, 134], [224, 122], [116, 134], [108, 190], [102, 280], [106, 400], [100, 520]],
      wc(c.wood, c.woodDark, { fillOp: 125, bleed: 0 }), 3);
    E.flushBrush();
    p.shade(316, 380, 22, 190, c.wood);
    p.shine(152, 330, 8, 140, c.wood, .04);
    for (const [x0, ph] of [[150, 0], [200, 1.4], [262, 2.6], [306, .7]]) {
      p.ln([[x0, 150], [x0 + 8 * Math.sin(ph), 260], [x0 - 7 * Math.cos(ph), 380], [x0 + 6, 480], [x0 - 4, 590]], 1, grain, "inkfine", 2.2);
    }
    p.ell(224, 330, 30, 40, wc(dark(c.wood, .35), grain, { fillOp: 110, sw: 1, bleed: 0 }), 1.6);
    p.ell(224, 330, 14, 20, fl(dark(grain, .3), { ink: null }), 1);
    p.ell(158, 500, 18, 24, wc(dark(c.wood, .25), grain, { fillOp: 80, sw: .8 }), 1.4);
    p.ln([[102, 598], [224, 624], [352, 598]], 1.3, INK, "ink", 1.5);
  }
  // legs: sticks with round wooden feet
  for (const [part, mir] of [["legL", false], ["legR", true]]) {
    const p = makePen(E, `${id}|${part}`, RIG_CELLS[part], mir);
    p.rib([[112, 12], [110, 80], [112, 134]], 28, 22, wc(c.wood, c.woodDark, { fillOp: 100 }), 1.4);
    p.ell(100, 148, 64, 24, wc(c.woodDark, grain, { fillOp: 90, bleed: 0 }), 1.6);
    p.ell(100, 142, 40, 8, fl(light(c.woodDark, .3), { ink: null, washOp: 150 }), 1);
    p.ell(108, 80, 20, 14, wc(dark(c.wood, .2), grain, { fillOp: 80, sw: .8 }), 1);
  }
  // arms: stick arms with knobby elbows; armR ends in a fist around the bat
  for (const [part, mir] of [["armL", false], ["armR", true]]) {
    const p = makePen(E, `${id}|${part}`, RIG_CELLS[part], mir);
    p.rib([[80, 34], [70, 120], [72, 200], [74, 244]], 26, 20, wc(c.wood, c.woodDark, { fillOp: 100 }), 1.4);
    p.ell(80, 38, 22, 20, wc(c.wood, c.woodDark, { fillOp: 100, sw: 1 }), 1);
    p.ell(70, 130, 15, 13, wc(dark(c.wood, .2), grain, { fillOp: 80, sw: .8 }), 1);
    if (part === "armR") {
      p.ell(76, 250, 26, 24, wc(c.wood, c.woodDark, { fillOp: 100, sw: 1 }), 1.2);
      p.ln([[62, 244], [90, 244]], .8, grain, "inkfine", .5);
      p.ln([[64, 256], [90, 256]], .8, grain, "inkfine", .5);
    } else {
      for (const [fx, fy] of [[50, 280], [74, 292], [100, 278]]) p.rib([[74, 244], [(74 + fx) / 2, (244 + fy) / 2 + 3], [fx, fy]], 14, 6, fl(c.wood), .8);
    }
  }
  // head: a thick log slice with the end-grain cap, a heavy brow and the face
  {
    const p = makePen(E, `${id}|head`, RIG_CELLS.head);
    p.sh([[50, 100], [104, 88], [160, 84], [216, 88], [270, 100], [278, 150], [276, 220], [262, 270], [210, 286], [160, 290], [110, 286], [58, 270], [44, 220], [42, 150]],
      wc(c.wood, c.woodDark, { fillOp: 120, bleed: 0 }), 2.6);
    E.flushBrush();
    p.ell(160, 98, 114, 36, wc(c.rings, dark(c.rings, .2), { fillOp: 100, bleed: 0 }), 2);
    p.ell(160, 98, 78, 23, { ink: grain, sw: .55 }, 1.2);
    p.ell(160, 98, 42, 12, { ink: grain, sw: .5 }, 1);
    p.ell(160, 98, 12, 4, fl(grain, { ink: null, washOp: 200 }), .6);
    p.sh([[52, 156], [98, 134], [160, 128], [222, 134], [268, 156], [256, 174], [160, 152], [64, 174]], wc(dark(c.wood, .2), grain, { fillOp: 130, sw: 1 }), 2);
    p.shade(262, 220, 14, 34, c.wood);
    p.ell(86, 238, 12, 16, wc(dark(c.wood, .2), grain, { fillOp: 80, sw: .7 }), 1);
    p.ln([[210, 250], [216, 270]], .8, grain, "inkfine", 1);
  }
  const look = { sep: 72, rx: 44, ry: 42, pupil: 12, lid: dark(c.wood, .2), cy: 50 };
  for (const k of ["open", "closed", "angry"]) eyePair(E, `${id}|eyes.${k}`, RIG_CELLS.eyes[k], k, look);
  eyePair(E, `${id}|eyes.wide`, RIG_CELLS.eyes.wide, "wide", { ...look, rx: 40, ry: 38, pupil: 9, ringCol: c.ring });
  for (const k of ["closed", "mid", "open", "scary"]) mouths(E, id, k, { w: 54, cy: 96, lip: grain, grin: 10, inner: "#2A1018", tooth: "#F3E6C4" });
  // the bat
  {
    const p = makePen(E, `${id}|prop`, RIG_CELLS.prop);
    p.sh([[106, 540], [150, 540], [148, 420], [160, 300], [170, 170], [168, 84], [128, 40], [88, 84], [86, 170], [96, 300], [108, 420]], wc(c.bat, dark(c.bat, .3), { fillOp: 110, bleed: 0 }), 1.8);
    p.shine(108, 160, 7, 76, c.bat, .02);
    p.shade(156, 250, 6, 100, c.bat);
    for (const y of [470, 495, 520]) p.sh([[104, y + 4], [128, y - 2], [152, y - 2], [150, y + 10], [128, y + 12], [106, y + 14]], fl(c.tape, { sw: .6 }), .5);
    p.ell(128, 548, 28, 13, fl(c.tape, { sw: .8 }), .8);
    p.ln([[104, 120], [112, 160]], .7, dark(c.bat, .5), "inkfine", .8);
    p.ln([[140, 210], [150, 250]], .7, dark(c.bat, .5), "inkfine", .8);
  }
}

// ---------------------------------------------------------------------------------------------------- recipes
export const RIG_RECIPES = { patapim, tralalero, sahur };

export const CHAR_RECIPES = { ...RIG_RECIPES, ...CAMEO_RECIPES };
