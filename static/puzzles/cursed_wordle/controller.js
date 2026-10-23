// Room 2 "La palabra maldita" - phone controller. Contract: mount(root, ctx), update(view, state), unmount().
// ctx.send(action) sends {type: "guess", word}. Own private letter is shown only here.
import { h, clear, fill } from "/static/js/shared/dom.js";
import { renderGrid } from "/static/puzzles/cursed_wordle/grid.js";

let st = null;

export function mount(root, ctx) {
  const input = h("input", {
    type: "text", class: "wordle-input", autocomplete: "off", autocapitalize: "characters",
    autocorrect: "off", spellcheck: "false", placeholder: "Tu intento",
  });
  const send = h("button", { type: "button" }, "Enviar");
  const letter = h("p", { class: "muted" });
  const status = h("p", { class: "muted" });
  const error = h("p", { class: "error" });
  const grid = h("div", { class: "wgrid small" });
  const form = h("form", { class: "wordle-form" }, input, send);
  fill(root, h("h1", {}, "La palabra maldita"), status, letter, grid, form, error);

  st = { ctx, input, send, letter, status, error, grid, form, length: 0 };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const word = input.value.trim();
    if (!word) return;
    if (st.length && word.length !== st.length) {
      error.textContent = `La palabra tiene ${st.length} letras.`;
      return;
    }
    error.textContent = "";
    ctx.send({ type: "guess", word });
    input.value = "";
  });
}

export function update(view) {
  if (!st) return;
  st.length = view.length;
  st.input.maxLength = view.length + 4;
  st.input.disabled = !view.your_turn;
  st.send.disabled = !view.your_turn;
  st.status.textContent = view.your_turn ? "Es tu turno: escribe un intento." : `Turno de ${view.turn_name || "..."}`;
  st.letter.textContent = view.letter
    ? `Tu letra maldita: ${view.letter} (esta letra NO esta en la palabra)`
    : "";
  renderGrid(st.grid, view);
}

export function unmount() {
  st = null;
}
