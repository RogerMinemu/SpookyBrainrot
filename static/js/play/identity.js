// "Which blob am I?": your blob in your join colour plus "Eres el rojo", and the pad accents tinted in that colour.
// The colour is the TV's: player k (position in game.players) always gets COLORS[k], so phone and TV agree.
import { h } from "/static/js/shared/dom.js";
import { colorFor, colorNameFor } from "/static/js/sim/colors.js";

/**
 * @param {HTMLElement} padHost element that holds the pad; receives the --me CSS variable
 * @returns {{el:HTMLElement, update(state:object, playerId:string):void}}
 */
export function createIdentity(padHost) {
  const label = h("span", { class: "me-label" }, "");
  const name = h("span", { class: "me-name" }, "");
  const blob = h("span", { class: "me-blob", "aria-hidden": "true" }, h("i", { class: "eye" }), h("i", { class: "eye" }));
  const el = h("div", { class: "me-card", role: "status" }, blob, h("span", { class: "me-text" }, label, name));
  let last = -2;
  return {
    el,
    update(state, playerId) {
      const players = (state && state.game && state.game.players) || [];
      const idx = players.findIndex((p) => p.id === playerId);
      if (idx === last) return;
      last = idx;
      if (idx < 0) return;
      const colour = colorFor(idx);
      el.style.setProperty("--me", colour);
      padHost.style.setProperty("--me", colour);
      label.textContent = `Eres ${colorNameFor(idx)}`;
      name.textContent = players[idx].name || "";
    },
  };
}
