import { h, clear, fill } from "/static/js/shared/dom.js";

const root = document.getElementById("anchors");

function card(a) {
  const riddle = h("textarea", { rows: "3", maxlength: "600", style: "width:100%", placeholder: a.placeholder }, a.riddle);
  const place = h("input", { maxlength: "80", placeholder: "Escondite (opcional)", value: a.place, style: "width:100%" });
  const status = h("span", { class: "muted" }, a.configured ? "Guardada" : "Falta la pista");
  const save = h("button", {
    onclick: async () => {
      const res = await fetch(`/api/house/${a.idx}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riddle: riddle.value, place: place.value }),
      });
      status.textContent = res.ok ? "Guardada" : "La pista no puede estar vacía";
    },
  }, "Guardar");
  if (a.in_use === false) {
    return h("div", { class: "card" },
      h("strong", {}, `Ancla ${a.idx} (sin uso)`),
      h("p", { class: "muted" }, "Ninguna sala usa esta ancla: no se imprime ni hace falta escribirle pista."));
  }
  return h("div", { class: "card" },
    h("strong", {}, `Ancla ${a.idx} · ${a.room}${a.exit ? " (salida)" : ""}`), riddle, place,
    h("div", { class: "row" }, save, status));
}

async function load() {
  const res = await fetch("/api/house");
  if (!res.ok) { fill(root, h("p", {}, "Acceso denegado: abre esta página con ?key=TU_CLAVE")); return; }
  const data = await res.json();
  fill(root, ...data.anchors.map(card));
}

load();
