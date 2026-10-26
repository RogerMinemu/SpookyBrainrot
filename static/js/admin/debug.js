// /admin/debug: pick a game (live or saved) and drive it with the shared debug panel.
// Admin pages load no art: this file only talks to /admin/api/*. State is polled (no WebSocket needed).
import { h, fill } from "/static/js/shared/dom.js";
import { createDebugPanel } from "/static/js/admin/debug-panel.js";

const POLL_MS = 1500;
const gamesEl = document.getElementById("games");
const controlEl = document.getElementById("control");

let selected = new URLSearchParams(location.search).get("game");
let panel = null;
let pollTimer = null;

const ROOM_TEXT = (g) => (g.room === "lobby" ? "Lobby" : g.room === "ending" ? "Final" : `Sala ${g.room}`);

async function fetchJson(url) {
  const res = await fetch(url);
  if (res.status === 401 || res.status === 403) throw new Error("Acceso denegado: abre esta página con ?key=TU_CLAVE");
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

function renderGames(games) {
  if (!games.length) {
    fill(gamesEl, h("p", { class: "muted" }, "No hay partidas. Crea una en el inicio."));
    return;
  }
  fill(gamesEl, ...games.map((g) => h("button", {
    type: "button",
    class: "dbg-btn dbg-game",
    "data-id": g.id,
    "aria-pressed": g.id === selected ? "true" : "false",
    onclick: () => select(g.id),
  }, g.name, h("small", {}, `${g.live ? "en memoria" : "guardada"} · ${g.status} · ${ROOM_TEXT(g)} · código ${g.code}${g.tv ? " · tele conectada" : ""}`))));
}

async function refreshGames() {
  try {
    const games = await fetchJson("/admin/api/games");
    renderGames(games);
    if (selected && !games.some((g) => g.id === selected)) {
      selected = null;
      stopPolling();
      fill(controlEl, h("p", { class: "muted" }, "Esa partida ya no existe."));
    }
  } catch (e) {
    fill(gamesEl, h("p", { class: "dbg-msg bad" }, e.message));
  }
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  panel = null;
}

async function select(id) {
  selected = id;
  history.replaceState(null, "", `?game=${encodeURIComponent(id)}`);
  stopPolling();
  panel = createDebugPanel({ gameId: id });
  fill(controlEl,
    h("h2", {}, "Controles"),
    h("p", {}, h("a", { href: `/tv/${id}`, target: "_blank", rel: "noopener" }, "Abrir la tele de esta partida")),
    panel.el);
  await panel.load();
  const mine = panel;
  pollTimer = setInterval(async () => {
    if (panel !== mine) return;
    try {
      const data = await fetchJson(`/admin/api/games/${id}/debug`);
      if (panel === mine) mine.update({ ...data.game, tv_view: data.tv_view, peek: data.peek || "" });
    } catch (_) { /* transient: keep the last values */ }
  }, POLL_MS);
  refreshGames();
}

(async () => {
  await refreshGames();
  if (selected) select(selected);
  setInterval(refreshGames, 5000);
})();
