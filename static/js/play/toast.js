// Phone-side feedback: toasts for server events and error messages.
import { h } from "/static/js/shared/dom.js";

const ERRORS = {
  not_your_turn: "No es tu turno.",
  bad_length: "Esa palabra no tiene la longitud correcta.",
  bad_word: "Solo letras, anda.",
  bad_action: "Eso no se puede hacer ahora.",
  not_enough_players: "Faltan jugadores conectados.",
  wrong_phase: "Ahora no toca eso.",
  no_puzzle: "No hay ningun reto activo.",
};

export function toast(text, ms = 2600) {
  if (!text) return;
  const el = h("div", { class: "toast" }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function onError(err) {
  toast(ERRORS[err.code] || err.message || "Error");
}

const EVENT_TEXT = {
  splash: () => "Algo ha salpicado la pared...",
  round_failed: (d) => `La palabra se ha podrido (+${d.penalty || 0}% de brainrot).`,
  toast: (d) => d.text,
  anchor_unlocked: () => "Ancla encontrada",
  jumpscare: (d) => `${d.cameo || "Algo"} anda cerca...`,
};

export function onEvent(ev) {
  const f = EVENT_TEXT[ev.name];
  if (f) toast(f(ev.data || {}));
}
