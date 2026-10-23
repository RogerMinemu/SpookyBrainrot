import { h, clear, fill } from "/static/js/shared/dom.js";

function playersList(players) {
  return h("div", { class: "players" },
    players.map((p) => h("span", { class: "pill" + (p.connected ? "" : " off") }, p.name)));
}

function advanceButton(ctx, label) {
  return h("button", { class: "btn", onclick: () => ctx && ctx.advance && ctx.advance() }, label);
}

export function renderLobby(root, state, gameId, ctx) {
  fill(root, 
    h("h1", {}, "Esperando a los supervivientes"),
    h("img", { class: "qr", src: `/api/games/${gameId}/join-qr.svg`, alt: "QR para unirse" }),
    h("div", { class: "code" }, state.game.code || ""),
    h("p", { class: "muted" }, `${state.game.players.filter((p) => p.connected).length} conectados`),
    playersList(state.game.players),
    advanceButton(ctx, "Empezar"));
}

export function renderIntro(root, state, gameId, ctx) {
  fill(root, 
    h("h1", {}, `Sala ${state.view.room_no}`),
    h("p", {}, state.view.title),
    playersList(state.game.players),
    advanceButton(ctx, "Entrar"));
}

export function renderSearch(root, state) {
  fill(root, 
    h("h1", {}, "Buscad el ancla"),
    h("p", {}, state.game.riddle || ""),
    playersList(state.game.players));
}

export function renderUnlocked(root, state, gameId, ctx) {
  fill(root, 
    h("h1", {}, "La puerta se abre..."),
    playersList(state.game.players),
    advanceButton(ctx, "Siguiente sala"));
}

export function renderEnding(root, state) {
  const texts = {
    escape: "Habeis escapado.",
    escape_with_passenger: "Habeis escapado... pero algo os ha seguido.",
    brainrots: "Ahora sois brainrots.",
  };
  const band = state.view.band;
  const mins = Math.floor((state.view.clock_ms || 0) / 60000);
  fill(root, 
    h("div", { class: `ending ${band}` },
      h("div", { class: "big" }, texts[band] || "Fin"),
      h("p", {}, `Brainrot final: ${Math.round(state.view.brainrot || 0)}%`),
      h("p", { class: "muted" }, `Tiempo de juego: ${mins} min`)),
    playersList(state.game.players));
}

export function renderIdle(root, state) {
  fill(root, 
    h("h1", {}, state.game.name),
    h("p", { class: "muted" }, "Esto esta a punto de ponerse feo..."),
    playersList(state.game.players));
}

export const screens = {
  lobby: renderLobby,
  idle: renderIdle,
  intro: renderIntro,
  search: renderSearch,
  unlocked: renderUnlocked,
  ending: renderEnding,
};
