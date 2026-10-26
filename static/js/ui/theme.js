// Theme state: maps the server state to html[data-room] / html[data-rot] / --rot.
// Pure presentation. The art layer (art/boot.js) observes data-room, so screens never import any art code.

const ROOM_THEMES = { 0: "prologue", 1: "backrooms", 2: "poolrooms", 3: "mall", 4: "site19", 6: "hangar", 7: "sahur" };
const NEUTRAL_KINDS = new Set(["lobby", "idle", "ending"]);
export const KNOWN_ROOMS = ["prologue", "backrooms", "poolrooms", "mall", "site19", "hangar", "sahur"];

/** Theme id for a server state. Unknown / future rooms inherit the default (prologue). */
export function roomFor(state) {
  const kind = state && state.view && state.view.kind;
  if (!state || !state.game || NEUTRAL_KINDS.has(kind)) return "prologue";
  return ROOM_THEMES[state.game.room_no] || "prologue";
}

export function setRoom(room) {
  const id = KNOWN_ROOMS.includes(room) ? room : "prologue";
  const el = document.documentElement;
  if (el.dataset.room !== id) el.dataset.room = id;
}

export function setRot(level) {
  const n = Number.isFinite(Number(level)) ? Number(level) : 0;
  const el = document.documentElement;
  el.style.setProperty("--rot", String(n));
  el.dataset.rot = String(n);
}

export function applyState(state) {
  if (!state || !state.game) return;
  setRoom(roomFor(state));
  setRot(state.game.degradation);
}
