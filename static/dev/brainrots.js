// Dev cast sheet: paints every brainrot atlas with the TV painter and shows each character, animated, in any pose.
// "PNG" saves the current pose on a transparent background (a graphic asset outside the game).
// Open /static/dev/brainrots.html. Nothing in the game links here (the animation lab is cast-lab.html).
import { createPainter } from "/static/js/art/painter.js";
import { CHAR_PLATE } from "/static/js/art/plates.js";
import { ROSTER } from "/static/js/art/roster.js";
import { createSprites } from "/static/js/art/sprites.js";
import { SCARES } from "/static/js/story/script.js";

const RIG_POSES = ["idle", "talk", "happy", "angry", "surprised", "scary"];
const CAMEO_POSES = ["idle", "scary"];
const POSE_NAMES = { idle: "Quieto", talk: "Hablando", happy: "Contento", angry: "Enfadado", surprised: "Sorprendido", scary: "Susto" };
const EXPORT_H = 1400; // px of the exported PNG height

const logEl = document.getElementById("log");
const castEl = document.getElementById("cast");
const allBtn = document.getElementById("all");
const atlases = new Map();
const sprites = createSprites({ atlas: (id, v) => atlases.get(`${id}:${v}`) || null, art: () => true });
window.__cast = { done: false, errors: [] };

const posesOf = (rig) => (rig.kind === "rig" ? RIG_POSES : CAMEO_POSES);

/** One still frame of `rig` in `pose` on a transparent canvas sized to the character. */
function still(rig, pose) {
  const s = EXPORT_H / (rig.box.h * 1.25);
  const c = document.createElement("canvas");
  c.width = Math.round(rig.box.w * 1.9 * s);
  c.height = EXPORT_H;
  const g = c.getContext("2d");
  // t = 0.6: eyes open (off the blink), no take; reduced = no scary shake, so the still is clean
  sprites.sprite(rig.id).draw(g, { x: c.width / 2, y: EXPORT_H * 0.94, h: rig.box.h * s, t: 0.6, emote: pose, reduced: true });
  return c;
}

function download(canvas, name) {
  return new Promise((resolve) => canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    resolve();
  }, "image/png"));
}

function card(rig) {
  let pose = "idle";
  const canvas = document.createElement("canvas");
  canvas.width = 600; canvas.height = 800;
  const g = canvas.getContext("2d");
  const sp = sprites.sprite(rig.id);
  const tick = (now) => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    const t = now / 1000;
    sp.drawAny(g, { x: 300, y: 760, h: rig.kind === "rig" ? 700 : 560, t, emote: pose, talking: pose === "talk",
      mouth: pose === "talk" ? (Math.floor(t * 9) % 3 === 0 ? "open" : "mid") : undefined });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const buttons = posesOf(rig).map((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = POSE_NAMES[p]; b.setAttribute("aria-pressed", String(p === pose));
    b.addEventListener("click", () => { pose = p; buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
    return b;
  });
  const png = document.createElement("button");
  png.type = "button"; png.className = "ghost"; png.textContent = "PNG";
  png.addEventListener("click", () => download(still(rig, pose), `${rig.id}-${pose}.png`));
  const fig = document.createElement("figure");
  fig.className = "who";
  const h2 = document.createElement("h2"); h2.textContent = rig.name;
  const quote = document.createElement("p"); quote.textContent = `«${SCARES[rig.id] || ""}»`;
  const row = document.createElement("div"); row.className = "row"; row.append(...buttons, png);
  fig.append(h2, canvas, row, quote);
  return fig;
}

async function run() {
  const painter = createPainter({ layout: "tv" });
  await painter.ready;
  for (const rig of ROSTER) {
    for (const variant of [0, 1]) {
      logEl.textContent = `Pintando a ${rig.name} (${variant + 1}/2)...`;
      const r = await painter.plate(CHAR_PLATE(rig.id), { room: "prologue", variant });
      const img = new Image();
      img.src = r.url;
      await img.decode();
      atlases.set(`${rig.id}:${variant}`, img);
    }
    castEl.append(card(rig));
  }
  logEl.textContent = `${ROSTER.length} brainrots listos.`;
  allBtn.disabled = false;
  window.__cast.done = true;
}

allBtn.addEventListener("click", async () => {
  for (const rig of ROSTER) for (const pose of posesOf(rig)) await download(still(rig, pose), `${rig.id}-${pose}.png`);
});

run().catch((e) => { window.__cast.errors.push(String(e)); logEl.textContent = `Error: ${e && e.message}`; });
