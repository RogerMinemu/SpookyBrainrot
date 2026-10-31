// Co-op platformer scene renderer (Rooms 1 and 7): tiles, gadgets and blobs on the shared 1920x1080 stage.
// Render-only, reads sim snapshots. The colours are the room's theme tokens, so Room 7 gets Sahur's palette.
// Room 1 is the Backrooms on one screen; Room 7 is Sahur's village at night, scrolling with the group (snap.cam).
import { TILE, STAGE_W, STAGE_H, drawBlob, label, roundRect } from "/static/js/sim/draw.js";
import { VIEW_W } from "./levels.js";

const T = TILE;
const BODY_W = 0.8;
const BODY_H = 0.9;
const BLOB_SCALE = 1.3;   // characters are drawn bigger than their physics box (render only, anchored at the feet)

// Camera: the view is VIEW_W tiles across the 1920x1080 stage. The outer wall columns and the ceiling row carry no
// gameplay, so the camera crops them and zooms in (1920 / 30 tiles), anchored to the floor. A one-screen level
// (Room 1) always shows columns 1..30; a long one follows snap.cam, eased a little so a respawn does not jolt it.
const ZOOM = STAGE_W / (VIEW_W * T);
const CAM_Y = STAGE_H - STAGE_H * ZOOM;
const CEIL_H = 46;        // ceiling strip with the fluorescent panels (screen space)
const view = { key: "", x: 1 };

/** The ink token at `a` percent opacity (hex tokens are converted, so no CSS colour-mix support is needed). */
const ink = (k, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(k.ink);
  if (!m) return k.ink;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a / 100})`;
};
/** Deterministic noise in [0, 1) for the scenery. */
const rnd = (v) => { const s = Math.sin(v * 12.9898) * 43758.5453; return s - Math.floor(s); };

/** Opaque side-view Backrooms: mono-yellow wallpaper, ceiling strip with flickering fluorescent panels, damp stains. */
function drawBackdrop(g, k, time) {
  g.fillStyle = k.roomA;
  g.fillRect(0, 0, STAGE_W, STAGE_H);
  // wallpaper: faint vertical stripes with a small repeated lozenge between them
  g.fillStyle = ink(k, 7);
  for (let x = 0; x < STAGE_W; x += 64) g.fillRect(x, 0, 14, STAGE_H);
  g.strokeStyle = ink(k, 10);
  g.lineWidth = 2;
  for (let y = CEIL_H + 40; y < STAGE_H; y += 96) {
    for (let x = 39; x < STAGE_W; x += 64) {
      g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 8, y); g.lineTo(x, y + 9); g.lineTo(x - 8, y); g.closePath(); g.stroke();
    }
  }
  // damp: dark patches that climb from the carpet
  for (const [cx, w, a] of [[300, 260, 16], [980, 340, 12], [1620, 280, 16]]) {
    const grd = g.createRadialGradient(cx, STAGE_H - 140, 10, cx, STAGE_H - 140, w);
    grd.addColorStop(0, ink(k, a));
    grd.addColorStop(1, "transparent");
    g.fillStyle = grd;
    g.fillRect(cx - w, STAGE_H - 140 - w, w * 2, w * 2);
  }
  // ceiling with fluorescent panels; each panel flickers on its own rhythm
  g.fillStyle = k.roomB;
  g.fillRect(0, 0, STAGE_W, CEIL_H);
  g.fillStyle = ink(k, 35);
  g.fillRect(0, CEIL_H - 8, STAGE_W, 8);
  for (let i = 0; i < 5; i++) {
    const cx = 200 + i * 380;
    const n = Math.sin(time * (2.3 + i * 0.7) + i * 5.1) * Math.sin(time * (9.1 + i * 1.3) + i);
    const lit = n > 0.88 ? 0.35 : n > 0.8 ? 0.7 : 1;
    const glow = g.createRadialGradient(cx, CEIL_H, 4, cx, CEIL_H, 300);
    glow.addColorStop(0, `rgba(255, 252, 222, ${0.34 * lit})`);
    glow.addColorStop(1, "rgba(255, 252, 222, 0)");
    g.fillStyle = glow;
    g.fillRect(cx - 300, CEIL_H, 600, 330);
    g.fillStyle = k.roomC;
    g.globalAlpha = 0.45 + 0.55 * lit;
    roundRect(g, cx - 110, 9, 220, 24, 6);
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 3; g.strokeStyle = k.ink; g.stroke();
  }
  g.fillStyle = k.ink;
  g.fillRect(0, CEIL_H, STAGE_W, 4);
}

/** One row of house silhouettes that slides `speed` times as fast as the level (parallax), with lit windows. */
function drawHouses(g, k, camPx, { speed, base, scale, fill, light, seed }) {
  const step = 250 * scale;
  const off = camPx * speed;
  const first = Math.floor(off / step) - 1;
  for (let n = first; n < first + STAGE_W / step + 3; n++) {
    const w = (150 + rnd(n * 7.31 + seed) * 90) * scale;
    const h = (120 + rnd(n * 3.71 + seed) * 200) * scale;
    const x = n * step - off + (rnd(n + seed) * 40 - 20) * scale;
    const y = base - h;
    g.fillStyle = fill;
    g.fillRect(x, y, w, STAGE_H - y);
    g.beginPath();                                        // a pitched roof, its height varies per house
    g.moveTo(x - 14 * scale, y);
    g.lineTo(x + w / 2, y - (30 + rnd(n * 5.3 + seed) * 60) * scale);
    g.lineTo(x + w + 14 * scale, y);
    g.closePath();
    g.fill();
    g.fillStyle = light;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        if (rnd(n * 13.1 + c * 3.3 + r * 5.7 + seed) < 0.55) continue; // some windows are dark: Sahur already passed
        g.fillRect(x + w * (0.18 + c * 0.42), y + h * (0.2 + r * 0.32), w * 0.2, h * 0.15);
      }
    }
  }
}

/** A crescent moon cut out on its own little canvas (cutting it on the stage would punch through the sky). */
const moons = new Map();
function crescent(colour) {
  if (!moons.has(colour)) {
    const c = document.createElement("canvas");
    c.width = 120; c.height = 120;
    const m = c.getContext("2d");
    m.fillStyle = colour;
    m.beginPath(); m.arc(60, 60, 58, 0, Math.PI * 2); m.fill();
    m.globalCompositeOperation = "destination-out";
    m.beginPath(); m.arc(82, 46, 52, 0, Math.PI * 2); m.fill();
    moons.set(colour, c);
  }
  return moons.get(colour);
}

/** Sahur's village at night: sky, stars, the moon and two rows of houses sliding behind the level. */
function drawNight(g, k, time, camPx) {
  const sky = g.createLinearGradient(0, 0, 0, STAGE_H);
  sky.addColorStop(0, "#0D0A1C");
  sky.addColorStop(0.6, "#22122A");
  sky.addColorStop(1, k.roomA);
  g.fillStyle = sky;
  g.fillRect(0, 0, STAGE_W, STAGE_H);
  g.fillStyle = k.surface;
  for (let i = 0; i < 90; i++) {
    const x = (((i * 397.3) - camPx * 0.03) % 2200 + 2200) % 2200 - 140;
    const y = 10 + rnd(i * 2.17) * 560;
    g.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(time * (0.6 + (i % 5) * 0.3) + i));
    g.fillRect(x, y, 3, 3);
  }
  g.globalAlpha = 1;
  const mx = 1690 - camPx * 0.05;
  const halo = g.createRadialGradient(mx, 340, 30, mx, 340, 220);
  halo.addColorStop(0, "rgba(255, 236, 190, 0.28)");
  halo.addColorStop(1, "rgba(255, 236, 190, 0)");
  g.fillStyle = halo;
  g.fillRect(mx - 220, 120, 440, 440);
  g.drawImage(crescent(k.roomC), mx - 60, 280);
  drawHouses(g, k, camPx, { speed: 0.25, base: 820, scale: 0.7, fill: "#24152B", light: "rgba(232, 192, 122, 0.2)", seed: 1 });
  drawHouses(g, k, camPx, { speed: 0.5, base: 920, scale: 0.9, fill: "#170D16", light: "rgba(232, 192, 122, 0.42)", seed: 9 });
}

const isButtonCell = (level, r, c) => level.buttons.some((b) => r === b.y && c >= b.x && c < b.x + b.w);

/** Solid blocks of the visible columns: carpet (or lit roof edge) on the top face, ink outline, brick seams inside.
 * In the village (`night`) the inside of a big block gets windows, so it reads as a house. */
function drawTiles(g, k, level, c0, c1, night) {
  const solid = level.solid;
  const isSolid = (r, c) => r >= 0 && c >= 0 && r < level.h && c < level.w && solid[r][c];
  // pit: below the floor line an empty cell is a drop into the dark
  for (let r = level.h - 2; r < level.h; r++) {
    for (let c = Math.max(1, c0); c < Math.min(level.w - 1, c1); c++) {
      if (solid[r][c]) continue;
      const grd = g.createLinearGradient(0, r * T, 0, (r + 1) * T);
      grd.addColorStop(0, ink(k, 80)); grd.addColorStop(1, ink(k, 96));
      g.fillStyle = grd;
      g.fillRect(c * T, r * T, T + 1, T);
    }
  }
  for (let r = 0; r < level.h; r++) {
    for (let c = Math.max(0, c0); c < Math.min(level.w, c1); c++) {
      if (!solid[r][c] || level.drum[r][c] || isButtonCell(level, r, c)) continue;
      const x = c * T;
      const y = r * T;
      const top = !isSolid(r - 1, c);
      g.fillStyle = k.roomB;
      g.fillRect(x, y, T, T);
      g.fillStyle = ink(k, 14);                           // brick seams: a half-offset row of joints
      g.fillRect(x, y + T / 2 - 1, T, 2);
      g.fillRect(x + ((r + c) % 2 ? T * 0.25 : T * 0.75) - 1, y, 2, T / 2);
      g.fillRect(x + ((r + c) % 2 ? T * 0.75 : T * 0.25) - 1, y + T / 2, 2, T / 2);
      if (top) {
        g.fillStyle = k.roomC; g.fillRect(x, y, T, 14);   // damp carpet / a lit roof edge
        g.fillStyle = ink(k, 22); g.fillRect(x, y + 10, T, 4);
      }
      if (night && c % 3 === 1 && r % 3 === 1 && r < level.h - 3 && isSolid(r - 1, c) && isSolid(r + 1, c)
        && isSolid(r, c - 1) && isSolid(r, c + 1)) {
        g.fillStyle = rnd(c * 7.7 + r * 3.1) < 0.45 ? ink(k, 45) : "rgba(232, 192, 122, 0.55)";
        g.fillRect(x + 14, y + 10, T - 28, T - 20);
        g.strokeStyle = ink(k, 70); g.lineWidth = 4; g.strokeRect(x + 14, y + 10, T - 28, T - 20);
      }
      g.strokeStyle = k.ink;
      g.lineWidth = 5;
      g.lineCap = "square";
      g.beginPath();
      if (top) { g.moveTo(x, y); g.lineTo(x + T, y); }
      if (!isSolid(r, c - 1)) { g.moveTo(x, y); g.lineTo(x, y + T); }
      if (!isSolid(r, c + 1)) { g.moveTo(x + T, y); g.lineTo(x + T, y + T); }
      if (!isSolid(r + 1, c) && r + 1 < level.h) { g.moveTo(x, y + T); g.lineTo(x + T, y + T); }
      g.stroke();
      g.lineCap = "butt";
    }
  }
}

function drawDoor(g, k, door, open) {
  const x = door.x * T;
  const y = door.y * T;
  const w = door.w * T;
  const h = door.h * T;
  roundRect(g, x, y, w, h, 18);
  g.fillStyle = open ? k.surface : k.ink;
  g.fill();
  g.lineWidth = 5; g.strokeStyle = open ? k.roomC : k.danger; g.stroke();
  if (!open) {
    g.fillStyle = k.roomC;
    g.beginPath(); g.arc(x + w - 20, y + h / 2, 7, 0, Math.PI * 2); g.fill();
  }
}

function drawBell(g, k, bell, rung, time) {
  const cx = (bell.x + 0.5) * T;
  const top = bell.y * T;
  g.strokeStyle = k.ink; g.lineWidth = 5;                 // rope up to the ceiling: the bell hangs, it does not stand on anything
  g.beginPath(); g.moveTo(cx, CEIL_H / ZOOM - CAM_Y / ZOOM); g.lineTo(cx, top + 6); g.stroke();
  g.save();
  g.translate(cx, top);
  if (rung) g.rotate(Math.sin(time * 22) * 0.18);
  g.beginPath();
  g.moveTo(-26, 52); g.quadraticCurveTo(-30, 8, 0, 4); g.quadraticCurveTo(30, 8, 26, 52); g.closePath();
  g.fillStyle = k.roomC; g.fill(); g.lineWidth = 4; g.strokeStyle = k.ink; g.stroke();
  g.beginPath(); g.arc(0, 56, 7, 0, Math.PI * 2); g.fillStyle = k.ink; g.fill();
  g.restore();
}

/** A row of ink spikes on the floor of each "^" cell; only their tips (the bottom quarter of the cell) hurt. */
function drawSpikes(g, k, spikes) {
  g.fillStyle = k.danger;
  g.strokeStyle = k.ink;
  g.lineWidth = 4;
  g.lineJoin = "round";
  for (const s of spikes) {
    const x = s.x * T;
    const base = (s.y + s.h) * T;
    const tip = base - T * 0.55; // drawn taller than the part that hurts: readable from the sofa
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const x0 = x + (i * T) / 3;
      g.moveTo(x0, base); g.lineTo(x0 + T / 6, tip); g.lineTo(x0 + T / 3, base);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.lineJoin = "miter";
}

/** The heavy button shows weight/need and a bar while the weight is held; a small one just lights while pressed. */
function drawButton(g, k, b, state, gateOpen) {
  const x = b.x * T;
  if (b.kind === "small") {
    const down = state.weight > 0;
    g.fillStyle = k.roomB; g.fillRect(x, b.y * T, b.w * T, T);
    roundRect(g, x + 6, b.y * T + (down ? 12 : 2), b.w * T - 12, 18, 9);
    g.fillStyle = down ? k.roomC : k.btn; g.fill();
    g.lineWidth = 4; g.strokeStyle = k.ink; g.stroke();
    return;
  }
  const pressed = Math.min(1, state.weight / Math.max(1, state.need));
  const y = b.y * T + 6 + pressed * 8;
  roundRect(g, x, y, b.w * T, T - 6 - pressed * 8, 10);
  g.fillStyle = gateOpen ? k.surface : k.btn; g.fill();
  g.lineWidth = 4; g.strokeStyle = k.ink; g.stroke();
  label(g, k, `${state.weight}/${state.need}`, x + (b.w * T) / 2, y + 40, { size: 30, font: k.fontTitle, weight: 400 });
  if (!gateOpen && state.hold > 0) {
    const f = Math.min(1, state.hold / 60);
    g.fillStyle = k.ink; g.fillRect(x, y - 22, b.w * T, 12);
    g.fillStyle = k.roomC; g.fillRect(x + 2, y - 20, (b.w * T - 4) * f, 8);
  }
}

/** Heavy gates are ink bars with red bands; small gates have the small buttons' colour, so you see which opens which. */
function drawGate(g, k, gate, open, time) {
  const x = gate.x * T;
  const y = gate.y * T;
  const h = gate.h * T;
  g.globalAlpha = open ? 0.18 + Math.max(0, Math.sin(time * 6)) * 0.06 : 1;
  g.fillStyle = k.ink;
  g.fillRect(x + 8, y, T - 16, h);
  g.strokeStyle = gate.kind === "small" ? k.btn : k.danger;
  g.lineWidth = 4;
  for (let yy = y + 30; yy < y + h; yy += 60) { g.beginPath(); g.moveTo(x + 8, yy); g.lineTo(x + T - 8, yy); g.stroke(); }
  g.globalAlpha = 1;
}

function drawPlatform(g, k, plat) {
  const x = plat.x * T;
  const y = plat.y * T;
  roundRect(g, x, y, plat.w * T, T * 0.55, 10);
  g.fillStyle = k.btn; g.fill(); g.lineWidth = 4; g.strokeStyle = k.ink; g.stroke();
  g.fillStyle = k.ink;
  for (let i = 0; i < plat.w; i++) { g.beginPath(); g.arc(x + (i + 0.5) * T, y + T * 0.3, 6, 0, Math.PI * 2); g.fill(); }
}

/** A lift: rails from its bottom stop to its top stop, a pulley above, the cage floor riding on them. */
function drawLift(g, k, def, plat) {
  const x0 = def.x * T + 6;
  const x1 = (def.x + def.w) * T - 6;
  const top = def.y1 * T - 2 * T;
  g.strokeStyle = ink(k, 70); g.lineWidth = 6;
  g.beginPath(); g.moveTo(x0, top); g.lineTo(x0, (def.y0 + 1) * T); g.moveTo(x1, top); g.lineTo(x1, (def.y0 + 1) * T); g.stroke();
  g.strokeStyle = k.ink; g.lineWidth = 3;
  g.beginPath(); g.moveTo((x0 + x1) / 2, top + 20); g.lineTo((x0 + x1) / 2, plat.y * T); g.stroke();
  g.beginPath(); g.arc((x0 + x1) / 2, top + 14, 16, 0, Math.PI * 2); g.fillStyle = k.roomC; g.fill(); g.lineWidth = 4; g.stroke();
  drawPlatform(g, k, plat);
}

/** A wooden drum in the floor: its skin on top, two hoops around it. */
function drawDrum(g, k, d, time) {
  const x = d.x * T;
  const y = d.y * T;
  const throb = Math.sin(time * 5 + d.x) * 1.5;
  roundRect(g, x + 3, y + 8, T - 6, T - 8, 8);
  g.fillStyle = k.btn; g.fill(); g.lineWidth = 4; g.strokeStyle = k.ink; g.stroke();
  g.fillStyle = ink(k, 35);
  g.fillRect(x + 3, y + 26, T - 6, 5);
  g.fillRect(x + 3, y + 44, T - 6, 5);
  g.beginPath(); g.ellipse(x + T / 2, y + 9, T / 2 - 4, 8 + throb, 0, 0, Math.PI * 2);
  g.fillStyle = k.surface; g.fill(); g.lineWidth = 4; g.stroke();
}

/** A lantern on a post: dark until the group has passed it, then it glows (a checkpoint). */
function drawLantern(g, k, l, lit, time) {
  const x = (l.x + 0.3) * T;
  const foot = l.y * T;
  g.strokeStyle = k.ink; g.lineWidth = 6;
  g.beginPath(); g.moveTo(x, foot); g.lineTo(x, foot - 130); g.lineTo(x + 30, foot - 130); g.stroke();
  const cx = x + 30;
  const cy = foot - 100;
  if (lit) {
    const glow = g.createRadialGradient(cx, cy, 6, cx, cy, 130);
    glow.addColorStop(0, `rgba(255, 214, 140, ${0.42 + Math.sin(time * 7 + l.x) * 0.05})`);
    glow.addColorStop(1, "rgba(255, 214, 140, 0)");
    g.fillStyle = glow;
    g.fillRect(cx - 130, cy - 130, 260, 260);
  }
  g.beginPath(); g.ellipse(cx, cy, 17, 24, 0, 0, Math.PI * 2);
  g.fillStyle = lit ? k.roomC : ink(k, 60); g.fill(); g.lineWidth = 4; g.strokeStyle = k.ink; g.stroke();
}

function drawKey(g, k, key, time) {
  const x = (key.x + 0.5) * T;
  const y = (key.y + 0.5) * T + (key.state === "home" ? Math.sin(time * 4) * 4 : 0);
  g.lineWidth = 4; g.strokeStyle = k.ink; g.fillStyle = k.roomC;
  g.beginPath(); g.arc(x - 10, y, 12, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillRect(x, y - 4, 24, 8); g.strokeRect(x, y - 4, 24, 8);
  g.fillRect(x + 14, y + 4, 6, 10); g.strokeRect(x + 14, y + 4, 6, 10);
}

/** First solid row from the top in column c (the ground Sahur walks on). */
const groundAt = (level, c) => {
  for (let r = 1; r < level.h; r++) if (level.solid[r][Math.max(0, Math.min(level.w - 1, c))]) return r;
  return level.h;
};

/** Sahur's chase: the dark he drags behind him and Sahur himself, bat up, at its edge. */
function drawChase(g, k, level, chase, time, sprite) {
  const x = chase.x * T;
  const fade = g.createLinearGradient(x - 5 * T, 0, x, 0);
  fade.addColorStop(0, "rgba(8, 3, 10, 0.9)");
  fade.addColorStop(1, "rgba(8, 3, 10, 0)");
  g.fillStyle = fade;
  g.fillRect(x - 5 * T, 0, 5 * T, level.h * T);
  g.fillStyle = "rgba(8, 3, 10, 0.9)";
  g.fillRect(x - 5 * T - level.w * T, 0, level.w * T, level.h * T);
  if (sprite) {
    const y = groundAt(level, Math.floor(chase.x - 1)) * T;
    sprite("sahur").drawAny(g, { x: x - T, y, h: 5 * T, t: time, emote: "scary", talking: true });
  }
}

/** A long level's map, top centre: the view, lanterns, the door, the key, Sahur and a dot per player. */
function drawMinimap(g, k, level, snap) {
  const x0 = 560;
  const w = 800;
  const y = CEIL_H + 130;
  const sx = (tx) => x0 + (tx / level.w) * w;
  roundRect(g, x0 - 10, y - 13, w + 20, 26, 13);
  g.fillStyle = ink(k, 60); g.fill();
  g.strokeStyle = k.surface; g.lineWidth = 3;
  roundRect(g, sx(view.x), y - 16, (VIEW_W / level.w) * w, 32, 8); g.stroke();
  level.lanterns.forEach((l, i) => {
    g.beginPath(); g.arc(sx(l.x + 0.5), y, 6, 0, Math.PI * 2);
    g.fillStyle = snap.lanterns[i] ? k.roomC : ink(k, 80); g.fill();
  });
  if (level.door) { g.fillStyle = snap.doorOpen ? k.surface : k.danger; g.fillRect(sx(level.door.x) - 5, y - 11, 12, 22); }
  if (snap.key && snap.key.state === "home") {
    g.save(); g.translate(sx(snap.key.x + 0.5), y); g.rotate(Math.PI / 4);
    g.fillStyle = k.roomC; g.fillRect(-6, -6, 12, 12); g.restore();
  }
  if (snap.chase && snap.chase.on) { g.fillStyle = k.danger; g.fillRect(sx(snap.chase.x) - 3, y - 18, 6, 36); }
  for (const p of snap.players) {
    if (p.entered) continue;
    g.beginPath(); g.arc(sx(p.x + BODY_W / 2), y, 7, 0, Math.PI * 2);
    g.fillStyle = p.color; g.fill(); g.lineWidth = 2.5; g.strokeStyle = k.ink; g.stroke();
  }
}

/** Draw one frame of the level. `time` is wall seconds (only for render effects); `sprite` draws the cast. */
export function drawScene(g, k, level, snap, time, { sprite } = {}) {
  const key = `${level.set}:${level.index}`;
  const target = snap.cam ?? 1;
  if (view.key !== key || Math.abs(target - view.x) > 12) { view.key = key; view.x = target; }
  else view.x += (target - view.x) * 0.2;
  const camPx = view.x * T * ZOOM;
  if (level.set === "sahur") drawNight(g, k, time, camPx);
  else drawBackdrop(g, k, time);
  g.save();
  g.translate(-camPx, CAM_Y);
  g.scale(ZOOM, ZOOM);
  const c0 = Math.floor(view.x) - 1;
  const c1 = Math.ceil(view.x + VIEW_W) + 1;
  drawTiles(g, k, level, c0, c1, level.set === "sahur");
  level.drums.forEach((d) => drawDrum(g, k, d, time));
  level.lanterns.forEach((l, i) => drawLantern(g, k, l, snap.lanterns && snap.lanterns[i], time));
  level.buttons.forEach((b, i) => {
    const gate = level.gates[b.gate];
    drawButton(g, k, b, (snap.buttons && snap.buttons[i]) || snap, !!(gate && snap.gates && snap.gates[b.gate]));
  });
  level.gates.forEach((gate, i) => drawGate(g, k, gate, !!(snap.gates && snap.gates[i]), time));
  if (level.spikes.length) drawSpikes(g, k, level.spikes);
  if (level.door) drawDoor(g, k, level.door, snap.doorOpen);
  level.bells.forEach((bell, i) => drawBell(g, k, bell, snap.bells[i], time));
  (snap.plats || []).forEach((p, i) => (p.kind === "lift" ? drawLift(g, k, level.platforms[i], p) : drawPlatform(g, k, p)));
  if (snap.key && snap.key.state !== "used") drawKey(g, k, snap.key, time);
  for (const p of snap.players) {
    if (p.entered) continue;
    const w = BODY_W * T;
    const h = BODY_H * T;
    // bigger blob, same feet position and centre line as the physics body
    drawBlob(g, k, p, { x: p.x * T - (w * (BLOB_SCALE - 1)) / 2, y: p.y * T - h * (BLOB_SCALE - 1), w: w * BLOB_SCALE, h: h * BLOB_SCALE }, time);
  }
  if (snap.chase && snap.chase.on) drawChase(g, k, level, snap.chase, time, sprite);
  g.restore();
  // HUD in screen space, under the ceiling strip: title and hint centred, counter top-right (Brainrot meter is top-left, DOM)
  const inside = snap.players.filter((p) => p.entered).length;
  label(g, k, level.title, 960, CEIL_H + 52, { size: 44, font: k.fontTitle, weight: 400 });
  label(g, k, level.hint, 960, CEIL_H + 92, { size: 30 });
  label(g, k, `${inside}/${snap.players.length} dentro`, 1880, CEIL_H + 52, { size: 30, align: "right" });
  if (level.bells.length > 1) {
    label(g, k, `Campanas ${snap.bells.filter(Boolean).length}/${level.bells.length}`, 1880, CEIL_H + 92, { size: 30, align: "right" });
  }
  if (level.scroll) drawMinimap(g, k, level, snap);
  if (snap.chase && snap.chase.on) {
    label(g, k, "¡Corred, Sahur os persigue!", 960, CEIL_H + 190, { size: 40, font: k.fontTitle, weight: 400, fill: k.roomC });
    if (snap.chase.x < view.x) label(g, k, "◀ Sahur", 40, STAGE_H / 2, { size: 34, align: "left", fill: k.danger });
  }
}
