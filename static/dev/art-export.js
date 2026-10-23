// Dev only: paints every layout x room x plate with the real painter and offers the WebP files + manifest.json.
// Workflow: open /static/dev/art-export.html, press "Pintar todo", save the files into static/art/fallback/,
// save manifest.json next to them ({"files": ["tv-prologue-bg-0.webp", ...]}). Nothing here ships to players.
import { createPainter, bgSize } from "/static/js/art/painter.js";
import { PLATE_ORDER } from "/static/js/art/plates.js";

const ROOMS = ["prologue", "backrooms", "poolrooms"];
const LAYOUTS = [
  { layout: "tv", sizes: { wide: [1920, 1080] }, variants: [0, 1, 2] },
  { layout: "flex", sizes: { phone: bgSize("flex", 390, 844, 2), phonel: bgSize("flex", 844, 390, 2) }, variants: [0] },
];
const logEl = document.getElementById("log"), filesEl = document.getElementById("files");
const goBtn = document.getElementById("go"), manBtn = document.getElementById("manifest");
const log = (m) => { logEl.textContent += m + "\n"; };
const names = [];
window.__export = { names, done: false, errors: [] };

const save = (name, url) => {
  names.push(name);
  const fig = document.createElement("figure");
  const img = document.createElement("img"); img.src = url; img.alt = name;
  const a = document.createElement("a"); a.href = url; a.download = name; a.textContent = name;
  fig.append(img, a); filesEl.append(fig);
};

async function run() {
  goBtn.disabled = true;
  const root = document.documentElement;
  for (const { layout, sizes, variants } of LAYOUTS) {
    const painter = createPainter({ layout });
    await painter.ready;
    for (const room of ROOMS) {
      root.dataset.room = room;
      for (const [tag, [w, h]] of Object.entries(sizes)) {
        for (const variant of variants) {
          const r = await painter.plate("bg", { room, variant, w, h });
          save(`${layout}-${tag}-${room}-bg-${variant}.webp`, r.url);
        }
      }
      for (const plate of PLATE_ORDER) {
        const r = await painter.plate(plate, { room });
        save(`${layout}-${room}-${plate}.webp`, r.url);
      }
      log(`${layout} / ${room}: listo`);
    }
  }
  manBtn.disabled = false;
  window.__export.done = true;
  log(`Total: ${names.length} ficheros.`);
}

manBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ files: names }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "manifest.json"; a.click();
});
goBtn.addEventListener("click", () => run().catch((e) => { window.__export.errors.push(String(e)); log("ERROR " + e); }));
if (new URLSearchParams(location.search).get("auto") === "1") goBtn.click();
