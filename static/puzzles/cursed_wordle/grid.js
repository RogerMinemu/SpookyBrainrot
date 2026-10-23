// Shared by the TV and phone modules: renders the guess board (covered cells stay covered).
import { h, clear, fill } from "/static/js/shared/dom.js";

export function renderGrid(el, view) {
  const rows = [];
  for (let r = 0; r < view.max_attempts; r++) {
    const row = view.rows[r];
    const cells = [];
    for (let c = 0; c < view.length; c++) {
      const cell = row ? row.cells[c] : null;
      const cls = "wcell" + (cell ? ` ${cell.s}` : "");
      cells.push(h("span", { class: cls }, cell && cell.l ? cell.l : cell ? "?" : ""));
    }
    rows.push(h("div", { class: "wrow" }, cells));
  }
  fill(el, ...rows);
}
