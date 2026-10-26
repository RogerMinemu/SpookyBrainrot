// Admin menu on the phone of the admin player (Roger unless ADMIN_PLAYER says otherwise; the welcome says who).
// A small "Admin" button opens a full-screen sheet: TV controls (over WS) plus the host debug panel, which talks to
// /admin/api/games/<id>/debug/* with this phone's player token. The panel module is only fetched on first open.
import { h } from "/static/js/shared/dom.js";

/** Phone state -> debug info. No tv_view: the phone's own view is not the TV's (the panel fetches that itself). */
export function adminInfo(state) {
  const g = (state && state.game) || {};
  const room = g.status === "lobby" ? "lobby" : g.status === "finished" ? "ending" : g.room_no;
  return { status: g.status, room, phase: g.phase, brainrot: g.brainrot, degradation: g.degradation };
}

/**
 * @param {{ gameId: string, token: () => string|null, sendTv: (action: string) => boolean, getState: () => object|null }} o
 * @returns {{ onState(state), isOpen(): boolean, destroy() }}
 */
export function installAdmin({ gameId, token, sendTv, getState }) {
  let sheet = null;
  let panel = null;
  let opening = false;

  const toggle = h("button", { type: "button", class: "admin-toggle", id: "admin-toggle", "aria-expanded": "false",
    "aria-haspopup": "dialog", onclick: () => (sheet ? close() : open()) }, "Admin");
  document.body.append(toggle);
  document.body.classList.add("has-admin"); // room for the button above the title

  function tvButton(label, action, okMsg, note) {
    return h("button", { type: "button", class: "dbg-btn", onclick: () => {
      note.textContent = sendTv(action) ? okMsg : "Sin conexión: prueba otra vez.";
    } }, label);
  }

  async function open() {
    if (opening) return;
    opening = true;
    let mod;
    try {
      mod = await import("/static/js/admin/debug-panel.js");
    } catch (e) {
      console.error("admin panel failed", e);
      return;
    } finally {
      opening = false;
    }
    panel = mod.createDebugPanel({ gameId, token: token(), spoilers: false });
    const note = h("p", { class: "dbg-msg", role: "status" }, "");
    sheet = h("aside", { class: "dbg-drawer admin-sheet", id: "admin-sheet", role: "dialog", "aria-label": "Menú de admin" },
      h("header", { class: "dbg-head" }, h("strong", {}, "Admin"),
        h("button", { type: "button", class: "dbg-btn dbg-close", "aria-label": "Cerrar", onclick: close }, "×")),
      h("section", { class: "dbg-sec" },
        h("h3", {}, "Tele"),
        h("div", { class: "dbg-row" },
          tvButton("Saltar escena", "story_skip", "Escena saltada en la tele", note),
          tvButton("Refrescar tele", "tv_refresh", "Tele refrescada", note)),
        note),
      panel.el);
    document.body.append(sheet);
    toggle.setAttribute("aria-expanded", "true");
    await panel.load();
    const s = getState();
    if (s && panel) panel.update(adminInfo(s));
  }

  function close() {
    if (sheet) sheet.remove();
    sheet = panel = null;
    toggle.setAttribute("aria-expanded", "false");
  }

  return {
    onState(state) { if (panel) panel.update(adminInfo(state)); },
    isOpen: () => sheet !== null,
    destroy() { close(); toggle.remove(); document.body.classList.remove("has-admin"); },
  };
}
