// The cast: 8 brainrots as pure data (no DOM, no drawing, deterministic). Three of them are talking rigs
// (Patapim, Tralalero, Sahur: a part atlas animated by transforms) and five are cameo pose sprites
// (idle + scary). Painting recipes live in rigs.js; the animation lives in puppet.js.
//
// Style inspiration only: ClaudeAnimationBase (CAB, MIT) for the "puppet from cut-out parts + hand-drawn
// boil" idea. No code is copied from it; everything here is original to this project.
//
// Rig space: origin = feet centre, +x right, +y DOWN (so a head sits at a negative y), units = atlas pixels.

/** Rig atlas: 1024x1024, fixed cell layout shared by the three talking rigs. Cells are [x, y, w, h]. */
export const RIG_ATLAS = { w: 1024, h: 1024 };
export const RIG_CELLS = {
  body: [0, 0, 448, 640],
  head: [448, 0, 320, 320],
  armL: [448, 320, 160, 320],
  armR: [608, 320, 160, 320],
  prop: [768, 0, 256, 640],
  legL: [0, 640, 224, 192],
  legR: [224, 640, 224, 192],
  eyes: {
    open: [448, 640, 288, 96],
    closed: [736, 640, 288, 96],
    angry: [448, 736, 288, 96],
    wide: [736, 736, 288, 96],
  },
  mouth: {
    closed: [0, 832, 192, 192],
    mid: [192, 832, 192, 192],
    open: [384, 832, 192, 192],
    scary: [576, 832, 192, 192],
  },
  extra: [768, 832, 256, 192],
};

/** Cameo atlas: 1024x512, two poses side by side. */
export const CAMEO_ATLAS = { w: 1024, h: 512 };
export const CAMEO_CELLS = {
  idle: [0, 0, 512, 512],
  scary: [512, 0, 512, 512],
};

/** Every cell keeps this many px of empty margin on each side, so the filtering never bleeds neighbours. */
export const RIG_GUTTER = 12;

export const EMOTES = ["idle", "talk", "happy", "angry", "surprised", "scary", "away"];

/** [x, y, w, h] of the paintable area of a cell (cell minus gutter). */
export function inner(cell) {
  const g = RIG_GUTTER;
  return [cell[0] + g, cell[1] + g, cell[2] - 2 * g, cell[3] - 2 * g];
}

/** Every [name, cell] of an atlas layout, flattened (eyes.open, mouth.scary, ...). */
export function allCells(layout) {
  const out = [];
  for (const [k, v] of Object.entries(layout)) {
    if (Array.isArray(v)) out.push([k, v]);
    else for (const [k2, v2] of Object.entries(v)) out.push([`${k}.${k2}`, v2]);
  }
  return out;
}

const P = (part, parent, at, pivot, swing = 0, keep = 0, scale = 1) => ({ part, parent, at, pivot, swing, keep, scale });

// Chibi proportions (the Minemi look): the body and everything hanging from it at CHIBI_BODY, the head (and its
// eyes, mouth and hat) at CHIBI_HEAD in world size. Scales multiply down the tree, hence the head's local value.
export const CHIBI_BODY = 0.74, CHIBI_HEAD = 1.5;
const HEAD_LOCAL = CHIBI_HEAD / CHIBI_BODY;

// `at` = where the part's pivot sits relative to its parent's pivot; `pivot` = pivot inside the part's own
// cell (px from the cell corner). Array order is the draw order (back to front).
// Shoulders swing in opposite phases (swing +1 / -1); bigger |swing| = bigger arc. keep = share of the parent's
// rotation the part cancels (a held bat stays upright while the arm moves). scale = size relative to the parent.
const PATAPIM_PARTS = [
  P("extra", "body", [0, 100], [128, 96]),
  P("body", null, [0, 0], [224, 628], 0, 0, CHIBI_BODY),
  P("legL", "body", [-86, -6], [112, 24]),
  P("legR", "body", [86, -6], [112, 24]),
  P("armL", "body", [-118, -440], [84, 34], 1),
  P("head", "body", [0, -500], [160, 288], 0, 0, HEAD_LOCAL),
  P("eyes", "head", [0, -150], [144, 48]),
  P("mouth", "head", [0, -36], [96, 96]),
  P("prop", "head", [0, -224], [128, 560]), // felt hat
  P("armR", "body", [118, -440], [84, 34], -1),
];
const TRALALERO_PARTS = [
  P("body", null, [0, 0], [224, 628], 0, 0, CHIBI_BODY),
  P("legL", "body", [-112, -6], [112, 24]),
  P("prop", "body", [0, -8], [128, 40]), // the third leg, in the middle
  P("legR", "body", [112, -6], [112, 24]),
  P("armL", "body", [-112, -380], [80, 36], 1.2),
  P("head", "body", [0, -470], [160, 288], 0, 0, HEAD_LOCAL),
  P("eyes", "head", [0, -142], [144, 48]),
  P("mouth", "head", [0, -48], [96, 96]),
  P("armR", "body", [112, -380], [80, 36], -1.2),
];
const SAHUR_PARTS = [
  P("body", null, [0, 0], [224, 628], 0, 0, CHIBI_BODY),
  P("legL", "body", [-70, -6], [112, 24]),
  P("legR", "body", [70, -6], [112, 24]),
  P("armL", "body", [-128, -420], [80, 36], 1),
  P("head", "body", [0, -520], [160, 288], 0, 0, HEAD_LOCAL),
  P("eyes", "head", [0, -122], [144, 48]),
  P("mouth", "head", [0, -44], [96, 96]),
  P("armR", "body", [128, -420], [80, 36], -1.4),
  P("prop", "armR", [10, 220], [128, 520], 0, 1), // the bat, held by the right arm (keep: it stays upright)
];

// Silhouette: flat ink shapes [kind, cx, cy, w, h] (kind ell|rect|tri) + glowing eyes [x, y] (rig space).
const sil = (shapes, eyes, eyeR = 12) => ({ shapes, eyes, eyeR });

/**
 * A rig silhouette drawn for the old full-size layout, re-proportioned like the painted puppet: what sat above the
 * old chin follows the head (CHIBI_HEAD around the new chin), the rest shrinks with the body (CHIBI_BODY around the
 * feet), so the swap silhouette -> watercolour never jumps. chinOld = old head `at` y; chinNew = new head `at` y.
 */
function chibiSil(s, chinOld, chinNew) {
  const chin = chinNew * CHIBI_BODY;
  const head = (x, y) => [x * CHIBI_HEAD, chin + (y - chinOld) * CHIBI_HEAD];
  const shapes = s.shapes.map(([kind, cx, cy, w, h, rot = 0]) => {
    if (cy < chinOld) { const [x, y] = head(cx, cy); return [kind, x, y, w * CHIBI_HEAD, h * CHIBI_HEAD, rot]; }
    return [kind, cx * CHIBI_BODY, cy * CHIBI_BODY, w * CHIBI_BODY, h * CHIBI_BODY, rot];
  });
  return { shapes, eyes: s.eyes.map(([x, y]) => head(x, y)), eyeR: s.eyeR * CHIBI_HEAD };
}

const TALK_EMOTES = EMOTES.slice();
const CAMEO_EMOTES = ["idle", "scary"];

/** Ordered like app.content.CAMEOS; `name` is that exact string. */
export const ROSTER = [
  {
    id: "sahur", name: "Tung Tung Tung Sahur", kind: "rig", room: 6, voice: "sahur", seed: 0.83,
    box: { w: 420, h: 920 }, foot: Math.round(150 * CHIBI_BODY), // the legs shrink with the body
    palette: { wood: "#C08A55", woodDark: "#9A6A3E", grain: "#5A3A22", rings: "#E0B27A", bat: "#D9B07A", tape: "#2B2233", ring: "#B8323A" },
    parts: SAHUR_PARTS, emotes: TALK_EMOTES,
    sil: chibiSil(sil([["rect", 0, -253, 250, 506], ["rect", 0, -640, 236, 214], ["ell", 0, -742, 236, 62], ["rect", 152, -440, 70, 480], ["rect", -128, -290, 26, 280], ["rect", -70, 78, 30, 150], ["rect", 70, 78, 30, 150], ["ell", -70, 140, 120, 46], ["ell", 70, 140, 120, 46]], [[-72, -660], [72, -660]], 20), -540, -520),
  },
  {
    id: "tralalero", name: "Tralalero Tralala", kind: "rig", room: 2, voice: "tralalero", seed: 0.58,
    box: { w: 440, h: 930 }, foot: Math.round(146 * CHIBI_BODY),
    palette: { skin: "#5B7AA3", skinLight: "#6E8FB8", belly: "#E7EDF5", sneaker: "#2F6FD6", stripe: "#FFFFFF", sole: "#F3EBDC", drip: "#3A9C98" },
    parts: TRALALERO_PARTS, emotes: TALK_EMOTES,
    sil: chibiSil(sil([["ell", 0, -250, 300, 500], ["ell", 0, -610, 262, 230], ["tri", 34, -770, 100, 120], ["ell", -122, -250, 62, 270], ["ell", 122, -250, 62, 270], ["rect", -112, 30, 66, 70], ["rect", 112, 30, 66, 70], ["rect", 0, 34, 66, 70], ["rect", -112, 104, 170, 84], ["rect", 112, 104, 170, 84], ["rect", 0, 108, 150, 80]], [[-74, -642], [74, -642]], 15), -500, -470),
  },
  {
    id: "bombardiro", name: "Bombardiro Crocodilo", kind: "cameo", room: null, voice: "bombardiro", seed: 0.11,
    box: { w: 512, h: 512 },
    palette: { croc: "#5E8C4A", crocDark: "#3F6B3A", belly: "#D9C98A", metal: "#8A9AA6", metalDark: "#5C6B78", goggles: "#E8AA38" },
    parts: [], poses: ["idle", "scary"], emotes: CAMEO_EMOTES,
    sil: sil([["ell", -10, -205, 380, 125], ["ell", 0, -100, 190, 120], ["tri", -150, -250, 70, 100], ["rect", 220, -195, 110, 60], ["rect", 0, -330, 80, 180]], [[140, -232]], 15),
  },
  {
    id: "ballerina", name: "Ballerina Cappuccina", kind: "cameo", room: null, voice: "ballerina", seed: 0.34,
    box: { w: 512, h: 512 },
    palette: { cup: "#FFF5E2", cupShade: "#E6CFC2", coffee: "#6B3E26", foam: "#F2E2C4", tutu: "#E27A92", tutuLight: "#F2A6B8" },
    parts: [], poses: ["idle", "scary"], emotes: CAMEO_EMOTES,
    sil: sil([["ell", 0, -370, 200, 150], ["rect", 0, -250, 70, 60], ["ell", 0, -190, 260, 90], ["rect", 0, -90, 50, 180], ["rect", 0, -262, 320, 26]], [[-52, -346], [52, -346]], 11),
  },
  {
    id: "lirili", name: "Lirilì Larilà", kind: "cameo", room: null, voice: "lirili", seed: 0.47,
    box: { w: 512, h: 512 },
    palette: { grey: "#9A9AA6", cactus: "#6E9F58", cactusDark: "#4F7F44", straps: "#B07A4A", clock: "#E8AA38", clockFace: "#FFF5E2" },
    parts: [], poses: ["idle", "scary"], emotes: CAMEO_EMOTES,
    sil: sil([["ell", 0, -350, 310, 230], ["rect", 0, -150, 150, 260], ["rect", 0, -270, 50, 110], ["rect", -100, -190, 40, 130], ["rect", 100, -190, 40, 130]], [[-52, -362], [52, -362]], 14),
  },
  {
    id: "patapim", name: "Brr Brr Patapim", kind: "rig", room: 1, voice: "patapim", seed: 0.21,
    box: { w: 440, h: 1010 }, foot: Math.round(140 * CHIBI_BODY),
    palette: { bark: "#7A5233", barkDark: "#5A3A22", moss: "#6E9F58", mossDark: "#3F6B3A", feet: "#E8C2A0", feetShade: "#C99476", nose: "#C98A6A", hat: "#8A5A3B", hatBand: "#B8323A", mould: "#D9C25A" },
    parts: PATAPIM_PARTS, emotes: TALK_EMOTES,
    sil: chibiSil(sil([["rect", 0, -263, 250, 530], ["ell", 0, -633, 244, 232], ["ell", 0, -792, 204, 64], ["ell", 0, -834, 126, 84], ["rect", -150, -300, 56, 280], ["rect", 150, -300, 56, 280], ["rect", -86, 28, 60, 80], ["rect", 86, 28, 60, 80], ["ell", -86, 96, 176, 92], ["ell", 86, 96, 176, 92]], [[-54, -672], [54, -672]], 14), -520, -500),
  },
  {
    id: "chimpanzini", name: "Chimpanzini Bananini", kind: "cameo", room: null, voice: "chimpanzini", seed: 0.66,
    box: { w: 512, h: 512 },
    palette: { banana: "#F2D23C", bananaDark: "#D9B02A", tips: "#6B4A2A", fur: "#6B4A2A", furLight: "#8A6240", face: "#E0B890" },
    parts: [], poses: ["idle", "scary"], emotes: CAMEO_EMOTES,
    sil: sil([["ell", 0, -139, 170, 240], ["ell", 0, -330, 170, 170], ["rect", -118, -280, 36, 160], ["rect", 118, -280, 36, 160]], [[-34, -336], [34, -336]], 13),
  },
  {
    id: "trippi", name: "Trippi Troppi", kind: "cameo", room: null, voice: "trippi", seed: 0.92,
    box: { w: 512, h: 512 },
    palette: { shrimp: "#E8806A", shrimpDark: "#D96A50", cat: "#E6E0D8", stripes: "#8A8A96", eyes: "#8BC34A" },
    parts: [], poses: ["idle", "scary"], emotes: CAMEO_EMOTES,
    sil: sil([["ell", 44, -48, 92, 68], ["ell", -20, -62, 108, 80], ["ell", -78, -108, 120, 92], ["ell", -106, -172, 128, 100], ["ell", -92, -238, 124, 96], ["ell", -44, -286, 112, 88], ["ell", 74, -320, 172, 164], ["tri", 20, -410, 60, 90], ["tri", 128, -410, 60, 90]], [[40, -324], [108, -324]], 14),
  },
];

const BY_ID = new Map(ROSTER.map((r) => [r.id, r]));

export const ROSTER_IDS = ROSTER.map((r) => r.id);
export const ROSTER_NAMES = ROSTER.map((r) => r.name);

/** Character by id, or null (unknown ids are never an error: callers fall back to a generic silhouette). */
export function byId(id) { return BY_ID.get(id) || null; }

/** Character by its CAMEOS display name (what the server sends in `jumpscare`), or null. */
export function byName(name) {
  for (const r of ROSTER) if (r.name === name) return r;
  return null;
}

/** Room theme (html[data-room]) -> the character that guards it (a talking rig, or a cameo in rooms 3, 4 and 6). */
export const ROOM_GUARDIAN = { backrooms: "patapim", poolrooms: "tralalero", mall: "lirili", site19: "ballerina", hangar: "bombardiro", sahur: "sahur" };

/**
 * Order in which the character plates are painted once a room's backgrounds are done:
 * the room guardian v0, v1, then every other character v0, then every other character v1.
 * Returns [{ id, variant }].
 */
export function plateQueue(room) {
  const g = ROOM_GUARDIAN[room] || null;
  const others = ROSTER_IDS.filter((id) => id !== g);
  const out = [];
  if (g) out.push({ id: g, variant: 0 }, { id: g, variant: 1 });
  for (const id of others) out.push({ id, variant: 0 });
  for (const id of others) out.push({ id, variant: 1 });
  return out;
}

/** Atlas layout a character is painted into. */
export function atlasOf(rig) { return rig.kind === "rig" ? RIG_ATLAS : CAMEO_ATLAS; }
