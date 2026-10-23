// Room 2 "La palabra maldita" - TV view. Contract: mount(root, ctx), update(view, state), unmount().
// The TV never receives the answer nor any private letter.
import { h, clear, fill } from "/static/js/shared/dom.js";
import { renderGrid } from "/static/puzzles/cursed_wordle/grid.js";

let els = null;

export function mount(root) {
  els = {
    title: h("h1", {}, "La palabra maldita"),
    turn: h("p", { class: "muted" }),
    grid: h("div", { class: "wgrid" }),
    hint: h("p", { class: "muted" }, "Cada intento lo escribe un superviviente distinto. Algunas letras se emborronaran..."),
  };
  fill(root, els.title, els.turn, els.grid, els.hint);
}

export function update(view) {
  if (!els) return;
  els.turn.textContent = view.turn_name
    ? `Turno de ${view.turn_name} - intento ${Math.min(view.rows.length + 1, view.max_attempts)} de ${view.max_attempts}`
    : "Esperando a que alguien se conecte...";
  renderGrid(els.grid, view);
}

export function unmount() {
  els = null;
}
