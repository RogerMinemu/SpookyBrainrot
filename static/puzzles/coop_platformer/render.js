// Room 1 scene renderer: tiles, gadgets and blobs on the shared 1920x1080 stage. Render-only, reads sim snapshots.
import { TILE, STAGE_W, STAGE_H, drawBlob, label, roundRect } from "/static/js/sim/draw.js";

const T = TILE;
const BODY_W = 0.8;
const BODY_H = 0.9;
const BLOB_SCALE = 1.3;   // characters are drawn bigger than their physics box (render only, anchored at the feet)

// Camera: the level is 32x18 tiles = the whole 1920x1080 stage. The outer wall columns and the ceiling row carry no
// gameplay, so the camera crops them and zooms in (1920 / 30 tiles), anchored to the floor.
const ZOOM = STAGE_W / (30 * T);
const CAM_X = -T * ZOOM;
const CAM_Y = STAGE_H - STAGE_H * ZOOM;
const CEIL_H = 46;        // ceiling strip with the fluorescent panels (screen space)

/** The ink token at `a` percent opacity (hex tokens are converted, so no CSS colour-mix support is needed). */
const ink = (k, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(k.ink);
  if (!m) return k.ink;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a / 100})`;
};

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

/** Solid blocks: damp carpet on the top face, ink outline on every free edge, brick seams inside. */
function drawTiles(g, k, level) {
  const solid = level.solid;
  const isSolid = (r, c) => r >= 0 && c >= 0 && r < level.h && c < level.w && solid[r][c];
  const isButton = (r, c) => level.button && r === level.button.y && c >= level.button.x && c < level.button.x + level.button.w;
  // pit: below the floor line an empty cell is a drop into the dark
  for (let r = level.h - 2; r < level.h; r++) {
    for (let c = 1; c < level.w - 1; c++) {
      if (solid[r][c] || isButton(r, c)) continue;
      const grd = g.createLinearGradient(0, r * T, 0, (r + 1) * T);
      grd.addColorStop(0, ink(k, 80)); grd.addColorStop(1, ink(k, 96));
      g.fillStyle = grd;
      g.fillRect(c * T, r * T, T + 1, T);
    }
  }
  for (let r = 0; r < level.h; r++) {
    for (let c = 0; c < level.w; c++) {
      if (!solid[r][c] || isButton(r, c)) continue;
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
        g.fillStyle = k.roomC; g.fillRect(x, y, T, 14);   // damp carpet
        g.fillStyle = ink(k, 22); g.fillRect(x, y + 10, T, 4);
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

function drawButton(g, k, level, snap) {
  const b = level.button;
  const pressed = Math.min(1, snap.weight / Math.max(1, snap.need));
  const x = b.x * T;
  const y = b.y * T + 6 + pressed * 8;
  roundRect(g, x, y, b.w * T, T - 6 - pressed * 8, 10);
  g.fillStyle = snap.gateOpen ? k.surface : k.btn; g.fill();
  g.lineWidth = 4; g.strokeStyle = k.ink; g.stroke();
  label(g, k, `${snap.weight}/${snap.need}`, x + (b.w * T) / 2, y + 40, { size: 30, font: k.fontTitle, weight: 400 });
  if (!snap.gateOpen && snap.hold > 0) {
    const f = Math.min(1, snap.hold / 60);
    g.fillStyle = k.ink; g.fillRect(x, y - 22, b.w * T, 12);
    g.fillStyle = k.roomC; g.fillRect(x + 2, y - 20, (b.w * T - 4) * f, 8);
  }
}

function drawGate(g, k, gate, open, time) {
  const x = gate.x * T;
  const y = gate.y * T;
  const h = gate.h * T;
  g.globalAlpha = open ? 0.18 + Math.max(0, Math.sin(time * 6)) * 0.06 : 1;
  g.fillStyle = k.ink;
  g.fillRect(x + 8, y, T - 16, h);
  g.strokeStyle = k.danger;
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

function drawKey(g, k, key, time) {
  const x = (key.x + 0.5) * T;
  const y = (key.y + 0.5) * T + (key.state === "home" ? Math.sin(time * 4) * 4 : 0);
  g.lineWidth = 4; g.strokeStyle = k.ink; g.fillStyle = k.roomC;
  g.beginPath(); g.arc(x - 10, y, 12, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillRect(x, y - 4, 24, 8); g.strokeRect(x, y - 4, 24, 8);
  g.fillRect(x + 14, y + 4, 6, 10); g.strokeRect(x + 14, y + 4, 6, 10);
}

/** Draw one frame of the level. `time` is wall seconds (only for render effects). */
export function drawScene(g, k, level, snap, time) {
  drawBackdrop(g, k, time);
  g.save();
  g.translate(CAM_X, CAM_Y);
  g.scale(ZOOM, ZOOM);
  drawTiles(g, k, level);
  if (level.button) drawButton(g, k, level, snap);
  if (level.gate) drawGate(g, k, level.gate, snap.gateOpen, time);
  if (level.door) drawDoor(g, k, level.door, snap.doorOpen);
  if (level.bell) drawBell(g, k, level.bell, snap.bellRung, time);
  if (snap.plat) drawPlatform(g, k, snap.plat);
  if (snap.key && snap.key.state !== "used") drawKey(g, k, snap.key, time);
  for (const p of snap.players) {
    if (p.entered) continue;
    const w = BODY_W * T;
    const h = BODY_H * T;
    // bigger blob, same feet position and centre line as the physics body
    drawBlob(g, k, p, { x: p.x * T - (w * (BLOB_SCALE - 1)) / 2, y: p.y * T - h * (BLOB_SCALE - 1), w: w * BLOB_SCALE, h: h * BLOB_SCALE }, time);
  }
  g.restore();
  // HUD in screen space, under the ceiling strip: title and hint centred, counter top-right (Brainrot meter is top-left, DOM)
  const inside = snap.players.filter((p) => p.entered).length;
  label(g, k, level.title, 960, CEIL_H + 52, { size: 44, font: k.fontTitle, weight: 400 });
  label(g, k, level.hint, 960, CEIL_H + 92, { size: 30 });
  label(g, k, `${inside}/${snap.players.length} dentro`, 1880, CEIL_H + 52, { size: 30, align: "right" });
}
