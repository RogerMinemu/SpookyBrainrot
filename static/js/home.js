import { h, clear } from "/static/js/shared/dom.js";

const list = document.getElementById("games");
const errorEl = document.getElementById("error");

async function load() {
  const res = await fetch("/api/games");
  const games = await res.json();
  clear(list);
  if (!games.length) list.append(h("p", { class: "muted" }, "No hay partidas todavia."));
  for (const g of games) {
    list.append(
      h("div", { class: "card row" },
        h("div", { style: "flex:1" },
          h("strong", {}, g.name),
          h("div", { class: "muted" }, `${g.status} - sala ${g.room_no}`)),
        h("a", { href: `/tv/${g.id}` }, h("button", {}, "Continuar")),
        h("button", { class: "danger", onclick: () => remove(g) }, "Borrar")));
  }
}

async function remove(g) {
  if (!confirm(`Borrar "${g.name}"? No se puede deshacer.`)) return;
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
  if (!res.ok) { errorEl.textContent = "Nombre no valido (1 a 40 caracteres)."; return; }
  const g = await res.json();
  location.href = `/tv/${g.id}`;
});

load();
