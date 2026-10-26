// Procedural 2D stage for the realtime rooms: a 1920x1080 canvas drawn over the painted #art background.
// Colours come from the CSS palette tokens (getComputedStyle), so every room theme and ?art=off keep working.
// Characters are blobs: join colour + eyes + name. Squash, lean and blink are render-only (never feed the sim).
export const STAGE_W = 1920;
export const STAGE_H = 1080;
export const TILE = 60;

const TOKENS = {
  ink: "--ink", surface: "--surface", paper: "--paper", roomA: "--room-a", roomB: "--room-b", roomC: "--room-c",
  btn: "--btn", danger: "--danger", fontTitle: "--font-title", fontBody: "--font-body",
};
const FALLBACK = {
  ink: "#2B2233", surface: "#FFF5E2", paper: "#F3EBDC", roomA: "#1F2550", roomB: "#2F3C7A", roomC: "#E8AA38",
  btn: "#E8AA38", danger: "#B8323A", fontTitle: "cursive", fontBody: "system-ui, sans-serif",
};

/** Read the palette tokens of the current room theme. */
export function readTokens(el = document.documentElement) {
  const cs = getComputedStyle(el);
  const out = {};
  for (const [key, name] of Object.entries(TOKENS)) out[key] = cs.getPropertyValue(name).trim() || FALLBACK[key];
  return out;
}

/** Create the stage canvas inside `root`. Returns { canvas, g, tokens, refresh(), destroy() }. */
export function createStage(root) {
  const canvas = document.createElement("canvas");
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  canvas.className = "sim-stage";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Escenario del juego");
  root.appendChild(canvas);
  const stage = {
    canvas,
    g: canvas.getContext("2d"),
    tokens: readTokens(),
    refresh() { stage.tokens = readTokens(); },
    clear() { stage.g.clearRect(0, 0, STAGE_W, STAGE_H); },
    destroy() { canvas.remove(); },
  };
  return stage;
}

const hash01 = (str) => {
  let n = 2166136261;
  for (let i = 0; i < str.length; i++) n = Math.imul(n ^ str.charCodeAt(i), 16777619);
  return ((n >>> 0) % 1000) / 1000;
};

/** Rounded rectangle path. */
export function roundRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** Outlined text (ink stroke under a light fill) so it reads over any painted background. */
export function label(g, tokens, text, x, y, { size = 22, font = tokens.fontBody, align = "center", fill = tokens.surface, weight = 600 } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.lineJoin = "round";
  g.lineWidth = Math.max(4, size / 4);
  g.strokeStyle = tokens.ink;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/**
 * One character. `box` is the physics body in stage pixels (x, y, w, h); the blob is drawn to fit it.
 * @param {{id:string,name:string,color:string,face:number,vx:number,vy:number,grounded:boolean}} p
 */
export function drawBlob(g, tokens, p, box, time, { showName = true } = {}) {
  const bob = p.grounded && Math.abs(p.vx) > 0.1 ? Math.sin(time * 18 + hash01(p.id) * 6) * 0.05 : 0;
  const stretch = p.grounded ? 1 + bob : 1 + Math.max(-0.18, Math.min(0.22, -p.vy * 0.012));
  const sx = 1 / Math.sqrt(stretch);
  const w = box.w * 1.12 * sx;
  const h = box.h * 1.08 * stretch;
  const cx = box.x + box.w / 2;
  const bottom = box.y + box.h + 2;
  g.save();
  g.translate(cx, bottom);
  g.rotate((p.grounded ? p.vx * 0.006 : p.vx * 0.012) * (p.face || 1) * (p.face || 1));
  // body
  g.beginPath();
  g.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.fillStyle = p.color;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = tokens.ink;
  g.stroke();
  // belly shine
  g.beginPath();
  g.ellipse(-w * 0.14, -h * 0.68, w * 0.12, h * 0.1, -0.5, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,.35)";
  g.fill();
  // eyes (blink every ~3 s, offset per player)
  const blink = ((time * 1000 + hash01(p.id) * 3000) % 3000) < 110;
  const dir = p.face >= 0 ? 1 : -1;
  for (const ex of [-0.2, 0.2]) {
    const ox = ex * w + dir * w * 0.05;
    const oy = -h * 0.58;
    if (blink) {
      g.beginPath(); g.moveTo(ox - 5, oy); g.lineTo(ox + 5, oy);
      g.lineWidth = 3; g.strokeStyle = tokens.ink; g.stroke();
    } else {
      g.beginPath(); g.arc(ox, oy, 7.5, 0, Math.PI * 2);
      g.fillStyle = "#fff"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = tokens.ink; g.stroke();
      g.beginPath(); g.arc(ox + dir * 2.5, oy + 0.5, 3.4, 0, Math.PI * 2);
      g.fillStyle = tokens.ink; g.fill();
    }
  }
  g.restore();
  if (showName && p.name) label(g, tokens, p.name, cx, box.y - 8, { size: 20 });
}
