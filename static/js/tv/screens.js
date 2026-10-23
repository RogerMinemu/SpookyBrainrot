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
  fill(root,
    title("Esperando a los supervivientes"),
    panel([
      h("img", { class: "qr", src: `/api/games/${gameId}/join-qr.svg`, alt: "QR para unirse" }),
      h("div", { class: "lobby-side" },
        h("div", { class: "code" }, state.game.code || ""),
        h("p", { class: "muted" }, `${state.game.players.filter((p) => p.connected).length} conectados`),
        playersList(state.game.players),
        advanceButton(ctx, "Empezar")),
    ], { cls: "lobby-panel" }));
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
    title("Buscad el ancla"),
    panel([
      h("p", { class: "lead riddle" }, state.game.riddle || ""),
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
