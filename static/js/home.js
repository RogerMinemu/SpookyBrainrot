import { h, clear } from "/static/js/shared/dom.js";
import { panel, button } from "/static/js/ui/kit.js";
import { setRoom } from "/static/js/ui/theme.js";
import { startArt } from "/static/js/art/boot.js";

const list = document.getElementById("games");
const errorEl = document.getElementById("error");

// composition root: the home page lives in the prologue theme; the art starts in parallel and
// never blocks the form or the links.
setRoom("prologue");
startArt({ layout: "flex" });

async function load() {
  const res = await fetch("/api/games");
  const games = await res.json();
  clear(list);
  if (!games.length) list.append(panel(h("p", { class: "muted empty-games" }, "No hay partidas todavía."), { cls: "empty-games-panel" }));
  for (const g of games) {
    list.append(
      panel([
        h("div", { class: "info" },
          h("strong", {}, g.name),
          h("div", { class: "muted" }, `${g.status} - sala ${g.room_no}`)),
        h("a", { href: `/tv/${g.id}` }, button("Continuar")),
        button("Borrar", { cls: "danger", onclick: () => remove(g) }),
      ], { cls: "game-card card row", tag: "div" }));
  }
}

async function remove(g) {
  if (!confirm(`¿Borrar "${g.name}"? No se puede deshacer.`)) return;
  await fetch(`/api/games/${g.id}`, { method: "DELETE" });
  load();
}

document.getElementById("create").addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const name = document.getElementById("name").value;
  const res = await fetch("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) { errorEl.textContent = "Nombre no válido (1 a 40 caracteres)."; return; }
  const g = await res.json();
  location.href = `/tv/${g.id}`;
});

load();
