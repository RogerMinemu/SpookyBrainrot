// Dev only: paints the whole cast with the real art queue and animates it with the real sprite layer.
// ?art=off shows the silhouettes. ?only=<id> shows one character. window.__lab drives it from Playwright.
import { startArt } from "/static/js/art/boot.js";
import { ROSTER, EMOTES } from "/static/js/art/roster.js";

const art = startArt({ layout: "tv" });
const grid = document.getElementById("grid");
const status = document.getElementById("status");
const logEl = document.getElementById("log");
const atlasesEl = document.getElementById("atlases");
const q = new URLSearchParams(location.search);
const sel = { emote: document.getElementById("emote"), mouth: document.getElementById("mouth"), dance: document.getElementById("dance"), only: document.getElementById("only") };
for (const e of EMOTES) sel.emote.append(new Option(e, e));
for (const r of ROSTER) sel.only.append(new Option(r.id, r.id));
sel.emote.value = q.get("emote") || "idle";
sel.only.value = q.get("only") || "";
sel.mouth.value = q.get("mouth") || "";
sel.dance.checked = q.get("dance") === "1";
const T0 = performance.now() / 1000;
const frozen = q.get("t") != null ? Number(q.get("t")) : null;

const mounts = [];
function build() {
  grid.textContent = "";
  mounts.forEach((m) => m.destroy());
  mounts.length = 0;
  const only = sel.only.value;
  grid.style.gridTemplateColumns = only ? "1fr" : "repeat(4,1fr)";
  if (only && q.get("strip") === "1") { buildStrip(only); return; }
  for (const r of ROSTER) {
    if (only && r.id !== only) continue;
    const cell = document.createElement("div");
    cell.className = "cell";
    if (only) cell.style.height = "900px";
    const label = document.createElement("b"); label.textContent = r.name;
    cell.append(label); grid.append(cell);
    const sp = art.sprite(r.id);
    const W = only ? 1200 : 480, H = only ? 900 : 500;
    mounts.push(sp.mount(cell, {
      w: W, h: H,
      driver: (g, t) => {
        const tt = frozen != null ? frozen : t - T0;
        const emote = sel.emote.value;
        let mouth = sel.mouth.value || undefined;
        if (!mouth && (emote === "talk" || emote === "happy")) mouth = ["closed", "mid", "open", "mid"][Math.floor(tt * 7) % 4];
        sp.drawAny(g, { x: W / 2, y: H - 20, h: H - 70, t: tt, emote, mouth, talking: emote === "talk", dance: sel.dance.checked });
      },
    }));
  }
}
// one character in five moods side by side (idle, talk, happy, angry, scary)
function buildStrip(id) {
  grid.style.gridTemplateColumns = "repeat(5,1fr)";
  const r = ROSTER.find((x) => x.id === id), sp = art.sprite(id);
  for (const emote of ["idle", "talk", "happy", "angry", "scary"]) {
    const cell = document.createElement("div");
    cell.className = "cell"; cell.style.height = "620px";
    const label = document.createElement("b"); label.textContent = `${r.name} - ${emote}`;
    cell.append(label); grid.append(cell);
    mounts.push(sp.mount(cell, {
      w: 380, h: 620,
      driver: (g, t) => {
        const tt = frozen != null ? frozen : t - T0;
        const mouth = emote === "talk" ? ["closed", "mid", "open", "mid"][Math.floor(tt * 7) % 4] : emote === "happy" ? "open" : undefined;
        sp.drawAny(g, { x: 190, y: 600, h: r.kind === "rig" ? 560 : 370, t: tt, emote, mouth, talking: emote === "talk" });
      },
    }));
  }
}
build();
for (const k of ["emote", "mouth", "dance", "only"]) sel[k].addEventListener("change", build);

const names = ROSTER.map((r) => r.id);
async function waitArt() {
  const t0 = performance.now();
  while (performance.now() - t0 < 120000) {
    const need = (q.get("wait") || names.join(",")).split(",");
    const done = need.every((id) => art.atlas(id, 0) && art.atlas(id, 1));
    if (done || document.documentElement.dataset.art === "fallback") return done;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
const ready = waitArt().then((ok) => {
  status.textContent = ok ? "listo" : `arte: ${document.documentElement.dataset.art}`;
  const tm = art.painter ? art.painter.timings.filter((x) => x.name.startsWith("char:")) : [];
  logEl.textContent = tm.map((x) => `${x.name} v${x.variant}: ${x.ms} ms`).join("\n");
  atlasesEl.textContent = "";
  if (q.get("atlas") === "1") {
    for (const id of names) for (const v of [0, 1]) {
      const img = art.atlas(id, v); if (!img) continue;
      const f = document.createElement("figure"); const c = img.cloneNode(); f.append(c);
      const cap = document.createElement("div"); cap.textContent = `${id} v${v}`; f.append(cap); atlasesEl.append(f);
    }
  }
  return ok;
});
function showAtlas(ids = names, variants = [0, 1]) {
  atlasesEl.textContent = "";
  for (const id of ids) for (const v of variants) {
    const img = art.atlas(id, v); if (!img) continue;
    const f = document.createElement("figure"); f.append(img.cloneNode());
    const cap = document.createElement("div"); cap.textContent = `${id} v${v}`; f.append(cap); atlasesEl.append(f);
  }
  atlasesEl.style.gridTemplateColumns = ids.length === 1 && variants.length === 1 ? "1fr" : "repeat(4,1fr)";
}
window.__lab = {
  ready,
  showAtlas,
  art,
  setEmote(e) { sel.emote.value = e; build(); },
  set(o) { for (const [k, v] of Object.entries(o)) if (k === "dance") sel.dance.checked = !!v; else sel[k].value = v; build(); },
  timings: () => (art.painter ? art.painter.timings.filter((x) => x.name.startsWith("char:")) : []),
};
