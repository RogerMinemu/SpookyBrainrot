// Host debug controls, shared by the TV drawer (Shift+D) and the standalone /admin/debug page.
// Plain DOM + fetch against /admin/api/games/<id>/debug/*; no art code, no p5. Spanish copy for the host.
import { h, fill } from "/static/js/shared/dom.js";

const PHASE_LABELS = {
  intro: "Introducción",
  puzzle: "Puzzle",
  search: "Pistas (busca el QR)",
  unlocked: "Sala desbloqueada",
};
const EVENT_LABELS = {
  splash: "Salpicón",
  round_failed: "Ronda fallida",
  anchor_unlocked: "Ancla encontrada",
};
const PRESETS = [0, 20, 40, 60, 80, 100];
const SLIDER_QUIET_MS = 900; // ignore incoming state while the host is dragging
// Sub-level names per room key (the platformer default is "Nivel N").
const LEVEL_LABELS = {
  3: (n) => `Ronda ${n + 1}`,
  4: (n) => `Con ${n} aciertos`,
  7: (n) => `Ronda ${n + 1}`,
};
const viewKey = (v) => (v && typeof v === "object" ? `${v.kind}:${v.epoch}` : "");

export function ensureStyles() {
  if (document.getElementById("debug-css")) return;
  document.head.append(h("link", { id: "debug-css", rel: "stylesheet", href: "/static/css/debug.css" }));
}

// `token`: the admin player's phone authenticates with its own player token instead of ADMIN_KEY.
async function call(gameId, path, method = "GET", body, token = null) {
  const opts = { method, headers: {} };
  if (token) opts.headers["X-Player-Token"] = token;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/admin/api/games/${gameId}/debug${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(token ? "Este móvil no tiene permiso de admin."
        : "Acceso denegado: abre /admin/debug?key=TU_CLAVE una vez en este navegador.");
    }
    const detail = data && data.detail;
    throw new Error(typeof detail === "string" ? detail : `Error ${res.status}`);
  }
  return data;
}

/** Normalizes a TV/phone `state` message ({game: {...}}) into the debug "info" shape. */
export function infoFromState(state) {
  const g = (state && state.game) || {};
  const room = g.status === "lobby" ? "lobby" : g.status === "finished" ? "ending" : g.room_no;
  // The TV state message carries the puzzle's TV view as `state.view` (kind = puzzle kind).
  return { status: g.status, room, phase: g.phase, brainrot: g.brainrot, degradation: g.degradation,
    tv_view: (state && state.view) || null };
}

/** One-line host peek at the TV view of the running puzzle (Sahur sequence with traps, platformer level). */
export function peekText(view) {
  if (!view || typeof view !== "object") return "";
  if (Array.isArray(view.seq)) {
    const steps = view.seq.map((s) => `${s.drum + 1}${s.trap ? "!" : ""}`).join(" ");
    return `Secuencia (ronda ${view.round}/${view.rounds}): ${steps} · ! = trampa`;
  }
  if (view.kind === "coop_platformer") return `Nivel ${view.level + 1}/${view.levels}`;
  return "";
}

const roomName = (rooms, key) => {
  const r = (rooms || []).find((x) => x.key === key);
  if (!r) return String(key);
  return r.room_no == null ? r.title : `Sala ${r.room_no} · ${r.title}`;
};

/**
 * Builds the controls for one game. Returns { el, update(info), load() }.
 * `info` = { status, room, phase, brainrot, degradation } (see infoFromState).
 * `token` = player token of the admin phone; `spoilers: false` hides the solution line (that phone also plays).
 */
export function createDebugPanel({ gameId, token = null, spoilers = true }) {
  ensureStyles();
  const call_ = (path, method, body) => call(gameId, path, method, body, token);
  let meta = null;
  let info = null;
  let quietUntil = 0;
  let sliderTimer = null;

  const status = h("p", { class: "dbg-msg", role: "status" }, "");
  const now = h("p", { class: "dbg-now", id: "dbg-now" }, "Cargando...");
  const roomSel = h("select", { id: "dbg-room", "aria-label": "Sala" });
  const phaseSel = h("select", { id: "dbg-phase", "aria-label": "Fase" });
  const levelSel = h("select", { id: "dbg-level", "aria-label": "Subnivel" });
  const peek = h("p", { class: "dbg-peek", id: "dbg-peek" }, "");
  const slider = h("input", { id: "dbg-rot", type: "range", min: "0", max: "100", step: "1", value: "0", "aria-label": "Brainrot" });
  const rotOut = h("output", { id: "dbg-rot-out", class: "dbg-rot-out" }, "0%");
  const cameoSel = h("select", { id: "dbg-cameo", "aria-label": "Brainrot del jumpscare" });
  const presetRow = h("div", { class: "dbg-row dbg-presets" });
  const eventRow = h("div", { class: "dbg-row" });

  const say = (msg, bad = false) => {
    status.textContent = msg;
    status.classList.toggle("bad", bad);
  };
  async function act(path, body, okMsg) {
    try {
      const next = await call_(path, "POST", body);
      say(okMsg);
      if (next) update(next);
      refreshPeek();
    } catch (e) {
      say(e.message, true);
    }
  }
  const btn = (label, onclick, cls = "") => h("button", { type: "button", class: `dbg-btn ${cls}`.trim(), onclick }, label);

  function roomKey() {
    const raw = roomSel.value;
    return /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  function fillPhases() {
    const room = (meta.rooms || []).find((r) => String(r.key) === roomSel.value);
    const phases = room ? room.phases : [];
    fill(phaseSel, phases.length
      ? phases.map((p) => h("option", { value: p }, PHASE_LABELS[p] || p))
      : h("option", { value: "" }, "(sin fases)"));
    phaseSel.disabled = !phases.length;
    if (info && String(info.room) === roomSel.value && phases.includes(info.phase)) phaseSel.value = info.phase;
    fillLevels();
  }
  // Sub-level jumps (platformer levels, Sahur rounds) only make sense in the puzzle phase of rooms that have them.
  function fillLevels() {
    const room = (meta.rooms || []).find((r) => String(r.key) === roomSel.value);
    const levels = room && room.levels ? room.levels : [];
    const label = LEVEL_LABELS[room && room.key] || ((n) => `Nivel ${n + 1}`);
    fill(levelSel, levels.length
      ? levels.map((n) => h("option", { value: String(n) }, label(n)))
      : h("option", { value: "" }, "(sin subniveles)"));
    levelSel.disabled = !levels.length || phaseSel.value !== "puzzle";
  }
  function showPeek() {
    peek.textContent = spoilers ? [info && info.peek, peekText(info && info.tv_view)].filter(Boolean).join(" · ") : "";
    peek.hidden = !peek.textContent;
  }
  // The server spoiler line (trivia answer, bomb solution) is fetched again whenever the puzzle moves on.
  let peekKey = null;
  let peekBusy = false;
  async function refreshPeek() {
    if (peekBusy) return;
    peekBusy = true;
    try {
      const data = await call_("");
      info = { ...(info || {}), tv_view: data.tv_view, peek: data.peek || "" };
      peekKey = viewKey(data.tv_view);
      showPeek();
    } catch (_) { /* the peek is a nicety */ } finally { peekBusy = false; }
  }
  function jumpBody() {
    const body = { room: roomKey(), phase: phaseSel.value || null };
    if (!levelSel.disabled && levelSel.value !== "") body.level = Number(levelSel.value);
    return body;
  }
  function sendBrainrot(v) {
    return act("/brainrot", { value: v }, `Brainrot al ${v}%`);
  }

  slider.addEventListener("input", () => {
    quietUntil = Date.now() + SLIDER_QUIET_MS;
    rotOut.textContent = `${slider.value}%`;
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(() => sendBrainrot(Number(slider.value)), 120);
  });
  roomSel.addEventListener("change", fillPhases);
  phaseSel.addEventListener("change", fillLevels);

  // Current 0-based sub-level out of the TV view (platformer level, Sahur round), or null.
  function levelOf(view) {
    if (!view || typeof view !== "object") return null;
    if (view.kind === "coop_platformer" && Number.isInteger(view.level)) return view.level;
    if ((view.kind === "sahur_dice" || view.kind === "shape_count") && Number.isInteger(view.round)) return view.round - 1;
    if (view.kind === "backrooms_trivia" && Number.isInteger(view.right)) return Math.min(view.right, view.goal - 1);
    return null;
  }
  function syncSelects() {
    const key = String(info.room);
    if (roomSel.value !== key) roomSel.value = key;
    fillPhases();
    const lvl = levelOf(info.tv_view);
    if (lvl !== null && [...levelSel.options].some((o) => o.value === String(lvl))) levelSel.value = String(lvl);
  }

  function update(next) {
    const first = info === null;
    info = { ...(info || {}), ...next };
    if ("peek" in next) peekKey = viewKey(next.tv_view);
    else if (meta && viewKey(info.tv_view) !== peekKey) refreshPeek();
    if (!meta) return;
    now.textContent = `${roomName(meta.rooms, info.room)} · ${info.phase ? (PHASE_LABELS[info.phase] || info.phase) : "-"}`
      + ` · Brainrot ${Math.round(info.brainrot || 0)}%`;
    if (Date.now() >= quietUntil && typeof info.brainrot === "number") {
      slider.value = String(Math.round(info.brainrot));
      rotOut.textContent = `${Math.round(info.brainrot)}%`;
    }
    // Follow the game on every update (jumps made elsewhere, rooms advancing); never fight the host while a select is in use.
    const active = document.activeElement;
    if (first || (active !== roomSel && active !== phaseSel && active !== levelSel)) syncSelects();
    showPeek();
    el.dataset.room = String(info.room);
    el.dataset.phase = String(info.phase);
  }

  async function load() {
    try {
      const data = await call_("");
      meta = data;
      fill(roomSel, data.rooms.map((r) => h("option", { value: String(r.key) }, roomName(data.rooms, r.key))));
      fill(cameoSel, h("option", { value: "" }, "Por defecto (???)"),
        data.cameos.map((c) => h("option", { value: c }, c)));
      fill(presetRow, (data.presets || PRESETS).map((p) => btn(`${p}`, () => sendBrainrot(p), "dbg-preset")));
      fill(eventRow,
        btn("Jumpscare", () => act("/event", { name: "jumpscare", cameo: cameoSel.value || null }, "Jumpscare lanzado")),
        ...data.events.filter((n) => n !== "jumpscare").map((n) =>
          btn(EVENT_LABELS[n] || n, () => act("/event", { name: n }, `${EVENT_LABELS[n] || n} lanzado`))));
      info = null;
      update({ ...data.game, tv_view: data.tv_view, peek: data.peek || "" });
      say("");
    } catch (e) {
      now.textContent = "No se pudo cargar";
      say(e.message, true);
    }
  }

  const el = h("div", { class: "dbg-panel", "data-game": gameId },
    now,
    h("section", { class: "dbg-sec" },
      h("h3", {}, "Saltar a"),
      h("div", { class: "dbg-row" }, roomSel, phaseSel, levelSel),
      h("div", { class: "dbg-row" },
        btn("Saltar", () => act("/jump", jumpBody(), "Salto hecho"), "go"),
        btn("Completar puzzle", () => act("/complete", undefined, "Puzzle completado"))),
      peek),
    h("section", { class: "dbg-sec" },
      h("h3", {}, "Brainrot"),
      h("div", { class: "dbg-row dbg-slider" }, slider, rotOut),
      presetRow),
    h("section", { class: "dbg-sec" },
      h("h3", {}, "Eventos de prueba"),
      h("div", { class: "dbg-row" }, cameoSel),
      eventRow),
    h("section", { class: "dbg-sec" },
      btn("Reiniciar al lobby", () => {
        if (confirm("¿Reiniciar la partida al lobby? Se pierde el progreso (los jugadores se quedan).")) {
          act("/reset", undefined, "Partida reiniciada");
        }
      }, "danger")),
    status);

  return { el, update, load };
}

/** TV drawer: hidden until Shift+D; a "debug" badge shows while it is open. Lazy-loaded by tv/main.js. */
export function installDrawer({ gameId, getState }) {
  ensureStyles();
  let drawer = null;
  let panel = null;
  let badge = null;

  function open() {
    panel = createDebugPanel({ gameId });
    badge = h("div", { class: "dbg-badge", id: "dbg-badge" }, "debug");
    drawer = h("aside", { class: "dbg-drawer", id: "dbg-drawer", "aria-label": "Depuración" },
      h("header", { class: "dbg-head" }, h("strong", {}, "Modo debug"),
        h("button", { type: "button", class: "dbg-btn dbg-close", "aria-label": "Cerrar", onclick: close }, "×")),
      panel.el);
    document.body.append(badge, drawer);
    panel.load().then(() => { const s = getState(); if (s) panel.update(infoFromState(s)); });
  }
  function close() {
    if (drawer) drawer.remove();
    if (badge) badge.remove();
    drawer = badge = panel = null;
  }
  function toggle() { drawer ? close() : open(); }

  return {
    toggle,
    isOpen: () => drawer !== null,
    onState(state) { if (panel) panel.update(infoFromState(state)); },
  };
}
