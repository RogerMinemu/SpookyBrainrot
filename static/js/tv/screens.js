import { h, fill } from "/static/js/shared/dom.js";
import { panel, button, title, pill } from "/static/js/ui/kit.js";

function playersList(players) {
  return h("div", { class: "players" },
    players.map((p) => pill(p.name, { off: !p.connected })));
}

function advanceButton(ctx, label) {
  return button(label, { onclick: () => ctx && ctx.advance && ctx.advance() });
}

export function renderLobby(root, state, gameId, ctx) {
  const link = h("a", { class: "join-url" }, "Cargando enlace…");
  getJoinUrl(gameId).then((url) => {
    link.href = url;
    link.textContent = url;
  }).catch(() => { link.textContent = "No se ha podido cargar el enlace. Recarga la pantalla."; });
  fill(root,
    title("Esperando a los supervivientes"),
    panel([
      h("img", { class: "qr", src: `/api/games/${gameId}/join-qr.svg`, alt: "QR para unirse" }),
      h("div", { class: "lobby-side" },
        h("p", {}, "Si el QR no funciona, abre esta URL en el móvil:"),
        link,
        h("p", { class: "muted" }, "Conecta el móvil a la misma red Wi-Fi que el servidor."),
        h("div", { class: "code" }, state.game.code || ""),
        h("p", { class: "muted" }, `${state.game.players.filter((p) => p.connected).length} conectados`),
        playersList(state.game.players),
        advanceButton(ctx, "Empezar")),
    ], { cls: "lobby-panel" }));
}

const joinUrls = new Map();
function getJoinUrl(gameId) {
  if (!joinUrls.has(gameId)) {
    joinUrls.set(gameId, fetch(`/api/games/${gameId}/join-url`)
      .then((response) => {
        if (!response.ok) throw new Error("join URL unavailable");
        return response.json();
      })
      .then((data) => data.url)
      .catch((error) => { joinUrls.delete(gameId); throw error; }));
  }
  return joinUrls.get(gameId);
}

export function renderIntro(root, state, gameId, ctx) {
  fill(root,
    title(`Sala ${state.view.room_no}`),
    panel([
      h("p", { class: "lead" }, state.view.title),
      playersList(state.game.players),
      advanceButton(ctx, "Entrar"),
    ], { cls: "stack" }));
}

export function renderSearch(root, state) {
  fill(root,
    title("Pistas (busca el QR)"),
    panel([
      h("p", { class: "lead riddle" }, state.game.riddle || ""),
      h("p", { class: "muted" }, "Cuando lo encontréis, escanead el QR con el botón de la cámara de vuestro móvil."),
      playersList(state.game.players),
    ], { cls: "stack" }));
}

export function renderUnlocked(root, state, gameId, ctx) {
  fill(root,
    title("La puerta se abre..."),
    panel([
      playersList(state.game.players),
      advanceButton(ctx, "Siguiente sala"),
    ], { cls: "stack" }));
}

export function renderEnding(root, state) {
  const texts = {
    escape: "Habéis escapado.",
    escape_with_passenger: "Habéis escapado... pero algo os ha seguido.",
    brainrots: "Ahora sois brainrots.",
  };
  const band = state.view.band;
  const mins = Math.floor((state.view.clock_ms || 0) / 60000);
  fill(root,
    panel([
      h("div", { class: `ending ${band}` },
        h("div", { class: "big" }, texts[band] || "Fin"),
        h("p", {}, `Brainrot final: ${Math.round(state.view.brainrot || 0)}%`),
        h("p", { class: "muted" }, `Tiempo de juego: ${mins} min`)),
      playersList(state.game.players),
      // CC BY attribution of the extra music (static/audio/CREDITS.md)
      h("p", { class: "muted credits" }, "Música adicional: Kevin MacLeod (incompetech.com), CC BY 4.0. Efectos: Mixkit."),
    ], { cls: "stack ending-panel" }));
}

export function renderIdle(root, state) {
  fill(root,
    title(state.game.name),
    panel([
      h("p", { class: "muted lead" }, "Esto está a punto de ponerse feo..."),
      playersList(state.game.players),
    ], { cls: "stack" }));
}

export const screens = {
  lobby: renderLobby,
  idle: renderIdle,
  intro: renderIntro,
  search: renderSearch,
  unlocked: renderUnlocked,
  ending: renderEnding,
};
