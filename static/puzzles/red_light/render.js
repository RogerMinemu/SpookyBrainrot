// Room 2 scene renderer: one swimming lane per player and Tralalero at the far end. Render-only, reads sim snapshots.
import { STAGE_W, drawBlob, label, roundRect } from "/static/js/sim/draw.js";

export const LANE_X0 = 240; // leaves a name column (up to LABEL_W wide) clear of the swimmers' start position
export const LANE_X1 = 1560;
export const LANE_Y0 = 220;
export const TRALALERO_X = 1700;
const LANE_LEN = 100;
const LABEL_X = LANE_X0 - 96;   // right edge of the name column; the lane box starts at LANE_X0 - 30 and the blob at LANE_X0 - ~40
const LABEL_W = 170;

/** Lane height in stage pixels: at most 110, shrinking so 12 lanes still fit in 760. */
export const laneHeight = (n) => Math.min(110, 760 / Math.max(1, n));

const CUE = {
  green: { text: "¡Nadad!", sub: "Mantened pulsado el botón" },
  warning: { text: "¡Cuidado!", sub: "Se está girando..." },
  red: { text: "¡QUIETOS!", sub: "Tralalero os está mirando" },
};

function drawLanes(g, k, snap, laneH) {
  snap.players.forEach((p, i) => {
    const y = LANE_Y0 + i * laneH;
    g.globalAlpha = 0.5;
    g.fillStyle = i % 2 ? k.roomB : k.roomA;
    g.fillRect(LANE_X0 - 30, y, LANE_X1 - LANE_X0 + 90, laneH);
    g.globalAlpha = 1;
    g.strokeStyle = k.ink;
    g.lineWidth = 3;
    g.strokeRect(LANE_X0 - 30, y, LANE_X1 - LANE_X0 + 90, laneH);
  });
  // start and finish lines
  g.fillStyle = k.surface;
  g.fillRect(LANE_X0 - 6, LANE_Y0, 8, snap.players.length * laneH);
  g.fillStyle = k.roomC;
  g.fillRect(LANE_X1 + 14, LANE_Y0, 12, snap.players.length * laneH);
}

function drawSwimmers(g, k, snap, laneH, time) {
  const size = Math.min(laneH * 0.78, 74);
  snap.players.forEach((p, i) => {
    const cy = LANE_Y0 + i * laneH + laneH / 2;
    const cx = LANE_X0 + (p.x / LANE_LEN) * (LANE_X1 - LANE_X0);
    const wobble = p.swimming ? Math.sin(time * 14 + i) * 3 : 0;
    const blob = { id: p.id, name: p.name, color: p.color, face: 1, vx: p.swimming ? 9 : 0, vy: 0, grounded: true };
    if (p.frozen) g.globalAlpha = 0.55;
    drawBlob(g, k, blob, { x: cx - size / 2, y: cy - size / 2 + wobble, w: size, h: size }, time, { showName: false });
    g.globalAlpha = 1;
    // name column: right-aligned at LABEL_X, shrunk until it fits LABEL_W, so it never reaches the swimmer circle
    const text = p.done ? `${p.name} ✓` : p.name;
    let fs = Math.max(14, Math.min(24, laneH * 0.3));
    g.font = `600 ${fs}px ${k.fontBody}`;
    while (fs > 12 && g.measureText(text).width > LABEL_W) { fs -= 1; g.font = `600 ${fs}px ${k.fontBody}`; }
    label(g, k, text, LABEL_X, cy + 6, { size: fs, align: "right" });
  });
}

// Painted guardian: standing at the far end, big enough to read from the sofa. Red = bared teeth, the warning
// = wide-eyed (he is turning), green or distracted = eyes closed, humming.
const GUARDIAN_X = 1730, GUARDIAN_GROUND = 810, GUARDIAN_H = 640;

function guardianState(snap, time) {
  if (snap.phase === "red" && !snap.distract.active) return { emote: "angry", mouth: "scary" };
  if (snap.phase === "warning") return { emote: "surprised", mouth: "open" };
  return { emote: "away", mouth: Math.floor(time * 2) % 2 ? "mid" : "closed" };
}

function drawTralalero(g, k, snap, time, sprite) {
  const cx = TRALALERO_X;
  const cy = LANE_Y0 + 380;
  if (sprite && sprite.draw(g, { x: GUARDIAN_X, y: GUARDIAN_GROUND, h: GUARDIAN_H, t: time, ...guardianState(snap, time) })) {
    label(g, k, "Tralalero Tralala", GUARDIAN_X, GUARDIAN_GROUND + 40, { size: 28, font: k.fontTitle, weight: 400 });
    return;
  }
  // procedural fallback (art off, plate not ready yet)
  const looking = snap.phase === "red" && !snap.distract.active;
  const turning = snap.phase === "warning";
  const bob = Math.sin(time * 3) * 6;
  g.save();
  g.translate(cx, cy + bob);
  // body: a blue shark in sneakers
  g.beginPath();
  g.ellipse(0, 0, 105, 150, 0, 0, Math.PI * 2);
  g.fillStyle = looking ? "#6E8FB8" : "#5B7AA3";
  g.fill();
  g.lineWidth = 6; g.strokeStyle = k.ink; g.stroke();
  g.beginPath();
  g.ellipse(0, 52, 62, 82, 0, 0, Math.PI * 2);
  g.fillStyle = "#E7EDF5"; g.fill(); g.lineWidth = 4; g.stroke();
  // dorsal fin
  g.beginPath(); g.moveTo(-20, -140); g.lineTo(10, -215); g.lineTo(40, -130); g.closePath();
  g.fillStyle = "#5B7AA3"; g.fill(); g.lineWidth = 5; g.stroke();
  // sneakers
  for (const sx of [-52, 52]) {
    roundRect(g, sx - 38, 138, 76, 34, 14);
    g.fillStyle = k.danger; g.fill(); g.lineWidth = 5; g.stroke();
  }
  // face: eyes open and angry when looking, half turned while warning, closed when looking away
  const eyeY = -62;
  for (const ex of [-42, 42]) {
    if (looking || turning) {
      g.beginPath(); g.arc(ex + (turning ? 18 : 0), eyeY, looking ? 21 : 15, 0, Math.PI * 2);
      g.fillStyle = "#fff"; g.fill(); g.lineWidth = 4; g.stroke();
      g.beginPath(); g.arc(ex + (turning ? 24 : 0), eyeY, looking ? 10 : 7, 0, Math.PI * 2);
      g.fillStyle = looking ? k.danger : k.ink; g.fill();
    } else {
      g.beginPath(); g.moveTo(ex - 16, eyeY); g.quadraticCurveTo(ex, eyeY + 14, ex + 16, eyeY);
      g.lineWidth = 5; g.stroke();
    }
  }
  if (looking) {
    g.beginPath(); g.moveTo(-50, -8); g.lineTo(50, -8); g.lineWidth = 6; g.stroke();
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 14 - 6, -8); g.lineTo(i * 14 + 6, -8); g.lineTo(i * 14, 10); g.closePath(); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 2.5; g.stroke(); }
  }
  g.restore();
  label(g, k, "Tralalero Tralala", cx, cy + 215, { size: 28, font: k.fontTitle, weight: 400 });
}

/** Draw one frame. `time` is wall seconds (render effects only). */
/** `sprite` = the roster Tralalero handle from ctx.sprite (optional: the scene falls back to procedural drawing). */
export function drawScene(g, k, snap, time, sprite = null) {
  g.clearRect(0, 0, 1920, 1080);
  const laneH = laneHeight(snap.players.length);
  drawLanes(g, k, snap, laneH);
  drawSwimmers(g, k, snap, laneH, time);
  drawTralalero(g, k, snap, time, sprite);
  const cue = snap.distract.active ? { text: "¡Distraído!", sub: "Tralalero mira a otro lado" } : CUE[snap.phase];
  g.globalAlpha = snap.phase === "red" ? 1 : 0.92;
  label(g, k, cue.text, STAGE_W / 2, 100, { size: 74, font: k.fontTitle, weight: 400, fill: snap.phase === "red" && !snap.distract.active ? k.danger : k.surface });
  g.globalAlpha = 1;
  label(g, k, cue.sub, STAGE_W / 2, 150, { size: 28 });
  const arrived = snap.players.filter((p) => p.done).length;
  label(g, k, `${arrived}/${snap.players.length} han llegado`, 1880, 52, { size: 30, align: "right" });
  if (arrived > 0 && snap.distract.cooldownMs > 0) {
    label(g, k, `Distracción lista en ${Math.ceil(snap.distract.cooldownMs / 1000)} s`, STAGE_W / 2, 190, { size: 24 });
  } else if (arrived > 0) {
    label(g, k, "Los que han llegado pueden distraer a Tralalero", STAGE_W / 2, 190, { size: 24 });
  }
}
