// /admin/demo: a whole game on one screen. The TV (real 1920x1080 viewport) and four phones (real 390x844 viewport) are
// same-origin iframes scaled down with CSS. Four seats join as Ana, Biel, Carla and Dani and bots play every room
// through each phone's real send path (window.__sb: pad masks, hold button, drum buttons, advance). The bots only
// look at the TV iframe (window.__sbtv: newest state + live sim), never at another player's private view.
import { h, fill } from "/static/js/shared/dom.js";
import { createDebugPanel } from "/static/js/admin/debug-panel.js";
import { createPlatformerCrew, createRedLightCrew, createSahurBot, createShapeCounter, createTriviaCrew } from "/static/js/admin/demo-bots.js";

const SEATS = ["Ana", "Biel", "Carla", "Dani"];
const TV_W = 1920, TV_H = 1080, PH_W = 390, PH_H = 844;
const TICK_MS = 25;
const LEVEL_LIMIT_MS = 90000;    // a platformer level that takes longer is skipped with the debug jump ("atajo")
const PUZZLE_LIMIT_MS = 150000;  // same idea for the other puzzles
const BOMB_LIMIT_MS = 8000;      // the bots cannot read the torn manual: the bomb is skipped with "complete" right away
const SAHUR_LEVEL_LIMIT_MS = 6000; // Room 7's platformer levels have no demo crew: shown for a few seconds, then skipped
const STORE = "sb_demo";
const KEYS = { ArrowLeft: 1, ArrowRight: 2, ArrowUp: 4, " ": 4, Enter: 8 };

const $ = (id) => document.getElementById(id);
const el = { main: $("demo-main"), tvSlot: $("tv-slot"), tvChip: $("tv-chip"), phones: $("phones"), log: $("log"), status: $("status"),
  under: document.querySelector(".demo-under"), bar: document.querySelector(".demo-bar"), btnSound: $("btn-sound"), btnNew: $("btn-new"), btnAuto: $("btn-auto"), btnJump: $("btn-jump"), btnDelete: $("btn-delete"), selRoom: $("sel-room"), debug: $("debug-slot") };
const artOnPhones = new URLSearchParams(location.search).get("art") === "on";
// ?auto=1: start a fresh demo with the autopilot on, no clicks needed
const autoStart = new URLSearchParams(location.search).get("auto") === "1";

const state = {
  game: null,          // { id, code }
  seats: [],           // { n, name, pid, manual, frame, card, chip, take, keys }
  tv: null,            // TV iframe
  auto: false,
  busy: false,
  startedAt: 0,
  key: "", enteredAt: 0, brain: null, advancedAt: 0, scanning: "", scannedKey: "", shortcuts: [], anchors: null,
  mountedAt: 0, tvClicked: false, endedLogged: false,
  scale: { tv: 0.5, ph: 0.5 }, panel: null, pollTimer: null,
};
const pressed = new Set();

// ---- log and status ------------------------------------------------------------------------------------------------
function say(text, kind = "") {
  const t = state.startedAt ? Math.floor((performance.now() - state.startedAt) / 1000) : 0;
  const stamp = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  el.log.prepend(h("li", { class: kind }, h("time", {}, stamp), text));
  while (el.log.children.length > 200) el.log.lastChild.remove();
}

async function api(url, method = "GET", body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("Acceso denegado: abre /admin/demo?key=TU_CLAVE una vez en este navegador.");
    const detail = data && data.detail;
    throw new Error(typeof detail === "string" ? detail : `Error ${res.status}`);
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tvWin = () => (state.tv && state.tv.contentWindow) || null;
const tvApi = () => { try { return (tvWin() && tvWin().__sbtv) || null; } catch (_) { return null; } };
const tvState = () => { const t = tvApi(); return t ? t.state() : null; };
const seatApi = (seat) => { try { return (seat.frame && seat.frame.contentWindow && seat.frame.contentWindow.__sb) || null; } catch (_) { return null; } };
const seatByPid = (pid) => state.seats.find((s) => s.pid === pid);
const seatByName = (name) => state.seats.find((s) => s.name === name);

function refreshButtons() {
  const has = !!state.game;
  el.btnNew.disabled = state.busy;
  el.btnDelete.disabled = !has || state.busy;
  el.btnJump.disabled = !has || state.busy || !el.selRoom.options.length;
  el.selRoom.disabled = !has || !el.selRoom.options.length;
  el.btnAuto.setAttribute("aria-pressed", String(state.auto));
  el.btnAuto.textContent = `Piloto automático: ${state.auto ? "sí" : "no"}`;
}

function roomText(g) {
  if (g.status === "lobby") return "Lobby";
  if (g.status === "finished") return "Final";
  const phase = { intro: "introducción", puzzle: "puzzle", search: "pistas (busca el QR)", unlocked: "puerta abierta" }[g.phase] || g.phase;
  return `Sala ${g.room_no} · ${phase}`;
}

function renderStatus() {
  const st = tvState();
  if (!state.game) { el.status.textContent = "Sin partida. Pulsa «Nueva demo»."; el.tvChip.textContent = "sin partida"; return; }
  if (!st) { el.status.textContent = "Esperando a la tele..."; el.tvChip.textContent = "conectando"; return; }
  const g = st.game;
  const extra = state.shortcuts.length ? ` · atajos: ${state.shortcuts.length}` : "";
  el.status.textContent = `Partida «${g.name}» (código ${g.code || state.game.code}) · ${roomText(g)} · Brainrot ${Math.round(g.brainrot || 0)}%${extra}`;
  el.tvChip.textContent = g.tv_online ? "conectada" : "sin conexión";
  for (const s of state.seats) {
    const sb = seatApi(s);
    const connected = sb && sb.ready;
    s.chip.textContent = s.manual ? "Tú" : state.auto ? "Bot" : "Quieto";
    s.chip.className = `demo-chip ${s.manual ? "you" : connected ? "bot" : "off"}`;
  }
}

// ---- layout: pick the arrangement with the biggest screens --------------------------------------------------------
function fit() {
  const rect = el.main.getBoundingClientRect();
  const availW = Math.max(300, Math.min(rect.width, document.documentElement.clientWidth - 24));
  const availH = Math.max(300, window.innerHeight - rect.top - 16); // 12 px body padding + 4 px of slack: no page scroll
  // PHEAD: one line with name, chip and take-over button, plus the slot border. UNDER: the log box as it is now (measured).
  const GAP = 14, HEAD = 36, PHEAD = 46, UNDER = (el.under ? el.under.offsetHeight : 190) + GAP;
  const sideP = Math.min(0.95, (availH - 2 * PHEAD - GAP) / 2 / PH_H);
  const side = { mode: "side", ph: sideP, tv: Math.min((availW - (2 * PH_W * sideP + GAP) - GAP) / TV_W, (availH - HEAD - UNDER) / TV_H) };
  const stackT = Math.min(availW / TV_W, (availH - HEAD) * 0.5 / TV_H);
  const stack = { mode: "stack", tv: stackT, ph: Math.min((availW - 3 * GAP) / (4 * PH_W), (availH - HEAD - PHEAD - TV_H * stackT - UNDER) / PH_H) };
  const score = (c) => Math.max(0.12, c.tv) + Math.max(0.12, c.ph);
  const pick = score(side) >= score(stack) ? side : stack;
  const next = { tv: Math.max(0.15, pick.tv), ph: Math.max(0.15, pick.ph) };
  if (el.main.dataset.mode === pick.mode && Math.abs(next.tv - state.scale.tv) < 0.003 && Math.abs(next.ph - state.scale.ph) < 0.003) return;
  state.scale = next;
  el.main.dataset.mode = pick.mode;
  applyScale();
}

// header and log box change height on their own (status text wraps, the debug drawer opens): re-fit without a resize event
let fitQueued = false;
function requestFit() {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => { fitQueued = false; fit(); });
}

function sizeSlot(slot, frame, w, hgt, s) {
  slot.style.width = `${Math.round(w * s)}px`;
  slot.style.height = `${Math.round(hgt * s)}px`;
  if (frame) frame.style.transform = `scale(${s})`;
}

function applyScale() {
  sizeSlot(el.tvSlot, state.tv, TV_W, TV_H, state.scale.tv);
  for (const s of state.seats) sizeSlot(s.slot, s.frame, PH_W, PH_H, state.scale.ph);
  for (const slot of el.phones.querySelectorAll(".demo-ph-empty")) sizeSlot(slot, null, PH_W, PH_H, state.scale.ph);
}

// ---- frames -----------------------------------------------------------------------------------------------------------
function frame(src, w, hgt, title) {
  return h("iframe", { src, title, width: String(w), height: String(hgt), allow: "autoplay" });
}

function emptySlots() {
  el.tvSlot.className = "demo-slot demo-slot-tv demo-slot-empty";
  fill(el.tvSlot, "La tele aparecerá aquí cuando crees la demo.");
  fill(el.phones, ...SEATS.map((name, i) => h("div", { class: "demo-phone", tabindex: "-1" },
    h("div", { class: "demo-head" }, h("strong", {}, name), h("span", { class: "demo-chip off" }, "sin partida")),
    h("div", { class: "demo-slot demo-slot-empty demo-ph-empty" }, `Móvil ${i + 1}`))));
}

function mountFrames() {
  const g = state.game;
  state.tv = frame(`/tv/${g.id}?demo=1`, TV_W, TV_H, "Tele");
  el.tvSlot.className = "demo-slot demo-slot-tv";
  fill(el.tvSlot, state.tv);
  state.tv.addEventListener("load", () => attachKeys(state.tv.contentWindow));
  state.mountedAt = performance.now();
  state.tvClicked = false;
  for (const s of state.seats) {
    s.slot = h("div", { class: "demo-slot" });
    s.frame = frame(`/play?seat=${s.n}${artOnPhones ? "" : "&art=off"}`, PH_W, PH_H, `Móvil de ${s.name}`);
    s.frame.addEventListener("load", () => attachKeys(s.frame.contentWindow));
    s.keys = h("p", { class: "demo-keys" }, "");
    s.slot.append(s.frame, s.keys);
    s.chip = h("span", { class: "demo-chip off" }, "conectando");
    s.take = h("button", { type: "button", class: "dbg-btn demo-take", "aria-pressed": "false", onclick: () => toggleManual(s) }, "Tomar control");
    s.card = h("div", { class: "demo-phone", tabindex: "-1", "data-seat": String(s.n) },
      h("div", { class: "demo-head" }, h("strong", {}, s.name), s.chip, s.take), s.slot);
  }
  fill(el.phones, state.seats.map((s) => s.card));
  fit();
}

function clearFrames() {
  for (const s of state.seats) { if (s.frame) { s.frame.src = "about:blank"; } }
  if (state.tv) state.tv.src = "about:blank";
  state.tv = null;
  state.seats = [];
  emptySlots();
  fit();
}

// ---- manual control (keyboard; the mouse just works on the real pad inside the iframe) --------------------------------
function toggleManual(seat) {
  const next = !seat.manual;
  for (const s of state.seats) if (s.manual) releaseManual(s);
  if (next) takeManual(seat);
}

function takeManual(seat) {
  seat.manual = true;
  const sb = seatApi(seat);
  if (sb) { sb.setMask(0); sb.setSound(true); }
  seat.card.classList.add("manual");
  seat.take.setAttribute("aria-pressed", "true");
  seat.take.textContent = "Soltar control";
  seat.keys.textContent = "Flechas: mover. Espacio o flecha arriba: saltar, nadar o mantener. Enter: distraer. Teclas 1 a 6: tambores.";
  seat.card.focus();
  say(`Tomas el control de ${seat.name}: su bot se para.`, "good");
}

function releaseManual(seat) {
  seat.manual = false;
  pressed.clear();
  const sb = seatApi(seat);
  if (sb) { sb.setMask(0); sb.setSound(false); }
  seat.card.classList.remove("manual");
  seat.take.setAttribute("aria-pressed", "false");
  seat.take.textContent = "Tomar control";
  seat.keys.textContent = "";
  say(`Sueltas a ${seat.name}: vuelve el bot.`);
}

function manualMask() {
  let m = 0;
  for (const k of pressed) m |= KEYS[k] || 0;
  return m;
}

function onKey(e, down) {
  const seat = state.seats.find((s) => s.manual);
  if (!seat) return;
  const t = e.target;
  if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
  const sb = seatApi(seat);
  if (!sb) return;
  if (e.key in KEYS) {
    e.preventDefault();
    if (down) pressed.add(e.key); else pressed.delete(e.key);
    sb.setMask(manualMask());
    const plain = !sb.pad && !sb.hold && !sb.hit && !sb.adjust && !sb.vote; // lobby / intro / door: Space or Enter presses the big button
    if (down && !e.repeat && plain && (e.key === " " || e.key === "Enter")) sb.advance();
  } else if (down && !e.repeat && /^[1-6]$/.test(e.key) && sb.hit) {
    e.preventDefault();
    sb.hit(Number(e.key) - 1);
  }
}

const keyListeners = new WeakSet();
function attachKeys(win) {
  try {
    if (!win || keyListeners.has(win)) return;
    keyListeners.add(win);
    win.addEventListener("keydown", (e) => onKey(e, true), true);
    win.addEventListener("keyup", (e) => onKey(e, false), true);
  } catch (_) { /* a navigating frame: the next load attaches again */ }
}
attachKeys(window);
window.addEventListener("blur", () => {
  pressed.clear();
  const seat = state.seats.find((s) => s.manual);
  const sb = seat && seatApi(seat);
  if (sb) sb.setMask(0);
});

// ---- create / delete ---------------------------------------------------------------------------------------------------
function saveStore() {
  try {
    if (!state.game) localStorage.removeItem(STORE);
    else localStorage.setItem(STORE, JSON.stringify({ game: state.game, seats: state.seats.map((s) => ({ n: s.n, name: s.name, pid: s.pid })) }));
  } catch (_) { /* private mode: the demo just will not survive a reload */ }
}

async function startPanel() {
  const gameId = state.game.id;
  state.panel = createDebugPanel({ gameId });
  fill(el.debug, state.panel.el);
  await state.panel.load();
  const data = await api(`/admin/api/games/${gameId}/debug`);
  fill(el.selRoom, data.rooms.map((r) => h("option", { value: String(r.key) }, r.room_no == null ? r.title : `Sala ${r.room_no} · ${r.title}`)));
  const mine = state.panel;
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    if (state.panel !== mine || !state.game) return;
    try {
      const d = await api(`/admin/api/games/${gameId}/debug`);
      if (state.panel === mine) mine.update({ ...d.game, tv_view: d.tv_view, peek: d.peek || "" });
    } catch (_) { /* transient */ }
  }, 1500);
  refreshButtons();
}

async function teardown() {
  const g = state.game;
  if (!g) return;
  clearInterval(state.pollTimer);
  state.panel = null;
  fill(el.debug, "");
  el.selRoom.replaceChildren();
  pressed.clear();
  clearFrames();
  state.game = null;
  state.key = "";
  state.brain = null;
  state.shortcuts = [];
  for (let n = 1; n <= SEATS.length; n++) { try { localStorage.removeItem(`sb_seat_${n}`); } catch (_) { /* ignore */ } }
  saveStore();
  try { await api(`/api/games/${g.id}`, "DELETE"); } catch (e) { say(`No se pudo borrar la partida: ${e.message}`, "bad"); }
}

async function newDemo() {
  if (state.busy) return;
  state.busy = true;
  refreshButtons();
  try {
    if (state.game) await teardown();
    state.startedAt = performance.now();
    el.log.replaceChildren();
    say("Creando la partida «Demo» con la misma API que la página de inicio...");
    const g = await api("/api/games", "POST", { name: "Demo" });
    state.game = { id: g.id, code: g.code };
    state.seats = [];
    for (let i = 0; i < SEATS.length; i++) {
      const j = await api("/api/join", "POST", { code: g.code, name: SEATS[i], seat: true });
      localStorage.setItem(`sb_seat_${i + 1}`, j.token);
      state.seats.push({ n: i + 1, name: SEATS[i], pid: j.player_id, manual: false });
    }
    state.endedLogged = false;
    state.shortcuts = [];
    saveStore();
    say(`Se unen ${SEATS.join(", ")} (código ${g.code}).`);
    mountFrames();
    await startPanel();
    await waitForSeats();
  } catch (e) {
    say(e.message, "bad");
  } finally {
    state.busy = false;
    refreshButtons();
  }
}

async function waitForSeats() {
  const t0 = performance.now();
  for (;;) {
    const st = tvState();
    if (!st && !state.tvClicked && performance.now() - state.mountedAt > 4000) startTv();
    const everyoneIn = state.seats.every((s) => { const sb = seatApi(s); return sb && sb.ready; });
    if (st && st.game.tv_online && everyoneIn) break;
    if (performance.now() - t0 > 25000) throw new Error("Los móviles o la tele no se han conectado a tiempo.");
    await sleep(120);
  }
  if (!state.game) return;
  const seat = state.seats[0];
  const st = tvState();
  if (st.game.status === "lobby") {
    say("Todos conectados: la partida empieza.", "good");
    state.advancedAt = performance.now();
    const sb = seatApi(seat);
    if (sb) sb.advance();
  }
}

function startTv() {
  state.tvClicked = true;
  try {
    const splash = tvWin().document.getElementById("splash");
    if (splash) { splash.click(); say("La tele arranca sin sonido: un clic en cualquier sitio de esta página activa el sonido."); }
  } catch (_) { /* not loaded yet */ }
}

async function deleteDemo() {
  if (!state.game || state.busy) return;
  state.busy = true;
  refreshButtons();
  await teardown();
  say("Demo borrada.");
  state.busy = false;
  refreshButtons();
  renderStatus();
}

async function jumpTo() {
  if (!state.game) return;
  const raw = el.selRoom.value;
  const room = /^\d+$/.test(raw) ? Number(raw) : raw;
  try {
    await api(`/admin/api/games/${state.game.id}/debug/jump`, "POST", { room, phase: typeof room === "number" ? "intro" : null });
    say(`Salto a ${el.selRoom.selectedOptions[0].textContent}.`);
  } catch (e) { say(e.message, "bad"); }
}

// ---- autopilot -----------------------------------------------------------------------------------------------------------
function releaseBots() {
  for (const s of state.seats) {
    if (s.manual) continue;
    const sb = seatApi(s);
    if (sb) sb.setMask(0);
  }
}

function applyMasks(masks) {
  for (const [pid, mask] of masks) {
    const seat = seatByPid(pid);
    if (!seat || seat.manual) continue;
    const sb = seatApi(seat);
    if (sb) sb.setMask(mask);
  }
}

const PLATFORMER_TEXT = [
  (n) => `${n[0]} se planta bajo la campana y ${n[1]} se sube a sus hombros para tocarla.`,
  () => "Dos bots se quedan sobre el botón pesado hasta que la verja cede; los demás esperan.",
  () => "Todos suben a la plataforma y esperan a que salga.",
  (n) => `${n[0]} hace de escalón, ${n[1]} sube a por la llave y la lleva hasta la puerta.`,
];

function seatNames(snap) {
  return snap.players.map((p) => (seatByPid(p.id) || { name: "?" }).name);
}

function onEnter(st, view) {
  const g = st.game;
  switch (view.kind) {
    case "lobby": say("Lobby: esperando para empezar."); break;
    case "intro": say(`Sala ${view.room_no}: «${view.title}». Los bots entran.`); break;
    case "hold_together": say("Sala 0: los cuatro bots mantienen pulsado el botón a la vez."); break;
    case "coop_platformer": say(`Sala 1, nivel ${view.level + 1} de ${view.levels}.`); break;
    case "red_light": say("Sala 2: los bots nadan en verde, paran al ver el aviso y los que llegan distraen a Tralalero."); break;
    case "shape_count": say(`Sala 3, ronda ${view.round} de ${view.rounds}: cada bot cuenta su forma en la tele y la marca con + y −.`); break;
    case "backrooms_trivia": say("Sala 4: trivia. Los bots no se saben las respuestas: uno propone y los demás le siguen."); break;
    case "bomb_defusal": say(`Sala 6: ${view.defuser} tiene la bomba y los demás el manual. Los bots no saben leerlo: atajo en unos segundos.`); break;
    case "sahur_dice": say(`Sahur dice, ronda ${view.round} de ${view.rounds}: los bots esperan a que acabe la secuencia.`); break;
    case "sahur_platformer": say(`Sala 7, nivel ${view.level + 1} de ${view.levels}. Los bots no se saben estos niveles: atajo en unos segundos.`); break;
    case "search": say("Pistas (busca el QR): los bots mirarán por la casa (unos 3 s)."); break;
    case "unlocked": say("La puerta se abre.", "good"); break;
    case "ending": say(`Final de la partida (Brainrot ${Math.round(g.brainrot || 0)}%).`, "good"); break;
    default: break;
  }
}

async function shortcut(label, path, body) {
  try {
    await api(`/admin/api/games/${state.game.id}/debug/${path}`, "POST", body);
    state.shortcuts.push(label);
    say(`${label} (atajo)`, "shortcut");
  } catch (e) { say(`El atajo ha fallado: ${e.message}`, "bad"); }
}

async function ensureAnchors() {
  if (!state.anchors) state.anchors = (await api("/admin/api/anchors")).anchors;
  return state.anchors;
}

async function scanAnchor(view, key) {
  if (state.scanning === key) return;
  state.scanning = key;
  try {
    const tokens = await ensureAnchors();
    const token = tokens[String(view.anchor)];
    const finder = state.seats[(view.anchor || 0) % state.seats.length];
    const sb = seatApi(finder);
    // the phone's own camera path (WS "scan"); the /k/ page (phone camera app) when the seat is not ready
    if (sb && sb.ready && sb.scan(token)) {
      say(`${finder.name} escanea el QR del ancla ${view.anchor} con la cámara de su móvil.`);
      state.scannedKey = key;
      return;
    }
    say(`${finder.name} escanea el QR del ancla ${view.anchor} (ruta real /k/...).`);
    const res = await fetch(`/k/${token}?g=${state.game.id}`);
    if (res.ok) { state.scannedKey = key; say(`Ancla ${view.anchor} encontrada.`, "good"); }
    else { say(`El escaneo ha fallado (${res.status}).`, "bad"); state.scanning = ""; }
  } catch (e) {
    say(`El escaneo ha fallado: ${e.message}`, "bad");
    state.scanning = "";
  }
}

// The bots' OWN phone views (shape and counter, own vote): a bot never reads another player's private view.
function botSeats() {
  return state.seats.filter((s) => !s.manual).map((s) => {
    const sb = seatApi(s);
    return { name: s.name, view: sb ? sb.view() : null };
  });
}

function pressAdvance(now, label) {
  if (now - state.advancedAt < 2500) return;
  state.advancedAt = now;
  const seat = state.seats.find((s) => !s.manual) || state.seats[0];
  const sb = seatApi(seat);
  if (sb) { sb.advance(); say(`${seat.name} pulsa «${label}» en su móvil.`); }
}

// The TV's cutscene (window.__sbtv.story): the bots watch it before they press anything. ?story=skip skips them.
const skipStories = new URLSearchParams(location.search).get("story") === "skip";
const storyPlaying = () => { const s = tvApi() && tvApi().story; return !!(s && s.active()); };
const READ_ALOUD_MS = 2600; // the bot picked to read a line "reads" it this long, then presses Siguiente on its phone

function readAloud(now) {
  const r = tvApi().story.reader && tvApi().story.reader();
  if (!r) return;
  if (state.readSig !== r.sig) { state.readSig = r.sig; state.readAt = now; return; }
  if (now - state.readAt < READ_ALOUD_MS || state.readDone === r.sig) return;
  const seat = seatByPid(r.pid);
  if (!seat || seat.manual) return; // a seat the host took over reads for real
  const sb = seatApi(seat);
  if (sb && sb.reading && sb.reading() && sb.storyNext()) state.readDone = r.sig;
}

function autopilot(st, now) {
  const g = st.game;
  const view = st.view;
  const sub = view.level ?? view.round ?? "";
  const key = `${g.status}|${g.room_no}|${g.phase}|${view.kind}|${sub}`;
  if (storyPlaying()) {
    if (skipStories) tvApi().story.skip();
    else {
      if (state.storyKey !== key) { state.storyKey = key; say("La tele cuenta la historia: cada frase la lee un bot y pulsa «Siguiente». En la tele, Espacio sigue y Esc salta."); }
      readAloud(now);
      state.enteredAt = now; // the dwell starts when the story ends
      return;
    }
  }
  if (key !== state.key) {
    state.key = key;
    state.enteredAt = now;
    state.brain = null;
    state.scanning = "";
    releaseBots();
    onEnter(st, view);
    if (view.kind === "coop_platformer") {
      const sim = tvApi() && tvApi().host && tvApi().host.sim;
      const names = sim ? seatNames(sim.snapshot()) : SEATS;
      say(PLATFORMER_TEXT[view.level] ? PLATFORMER_TEXT[view.level](names) : "");
    }
  }
  const dwell = now - state.enteredAt;
  switch (view.kind) {
    case "lobby": if (dwell > 1500) pressAdvance(now, "Empezar"); break;
    case "intro": if (dwell > 1800) pressAdvance(now, "Entrar"); break;
    case "unlocked": if (dwell > 1800) pressAdvance(now, "Siguiente sala"); break;
    case "search": if (dwell > 3000) scanAnchor(view, key); break;
    case "ending":
      if (!state.endedLogged) {
        state.endedLogged = true;
        state.auto = false;
        say("Fin de la demo: la tele muestra el final.", "good");
        refreshButtons();
      }
      break;
    case "hold_together":
      for (const s of state.seats) { const sb = seatApi(s); if (!s.manual && sb && sb.hold) sb.hold(true); }
      if (dwell > PUZZLE_LIMIT_MS && !state.stuck) { state.stuck = true; shortcut("Sala 0 completada", "complete"); }
      break;
    case "coop_platformer": {
      const host = tvApi() && tvApi().host;
      if (host && host.sim) {
        if (!state.brain) state.brain = createPlatformerCrew(view.level);
        applyMasks(state.brain.think(host.sim.snapshot(), now));
      }
      if (dwell > LEVEL_LIMIT_MS && !state.stuck) {
        state.stuck = true;
        if (view.level >= view.levels - 1) shortcut(`Nivel ${view.level + 1}`, "complete");
        else shortcut(`Nivel ${view.level + 1}`, "jump", { room: g.room_no, phase: "puzzle", level: view.level + 1 });
      }
      break;
    }
    case "red_light": {
      const host = tvApi() && tvApi().host;
      if (host && host.sim) {
        if (!state.brain) state.brain = createRedLightCrew();
        applyMasks(state.brain.think(host.sim.snapshot(), now));
      }
      if (dwell > PUZZLE_LIMIT_MS && !state.stuck) { state.stuck = true; shortcut("Sala 2", "complete"); }
      break;
    }
    case "shape_count": {
      if (!state.brain) state.brain = createShapeCounter();
      for (const tap of state.brain.think(view, botSeats(), now)) {
        const sb = seatApi(seatByName(tap.name));
        if (sb && sb.adjust) sb.adjust(tap.delta);
      }
      if (dwell > PUZZLE_LIMIT_MS && !state.stuck) { state.stuck = true; shortcut("Sala 3", "complete"); }
      break;
    }
    case "backrooms_trivia": {
      if (!state.brain) state.brain = createTriviaCrew();
      for (const v of state.brain.think(view, botSeats(), now)) {
        const sb = seatApi(seatByName(v.name));
        if (sb && sb.vote && sb.vote(v.option)) say(`${v.name} vota la ${"ABCD"[v.option]}.`);
      }
      if (dwell > PUZZLE_LIMIT_MS && !state.stuck) { state.stuck = true; shortcut("Sala 4", "complete"); }
      break;
    }
    case "bomb_defusal":
      if (dwell > BOMB_LIMIT_MS && !state.stuck) { state.stuck = true; shortcut("Sala 6", "complete"); }
      break;
    case "sahur_platformer": // Room 7's levels have no demo crew: each one is skipped with the debug jump
      if (dwell > SAHUR_LEVEL_LIMIT_MS && !state.stuck) {
        state.stuck = true;
        if (view.level >= view.levels - 1) shortcut(`Sala 7, nivel ${view.level + 1}`, "complete");
        else shortcut(`Sala 7, nivel ${view.level + 1}`, "jump", { room: g.room_no, phase: "puzzle", level: view.level + 1 });
      }
      break;
    case "sahur_dice": {
      if (!state.brain) state.brain = createSahurBot();
      const tap = state.brain.think(view, now);
      if (tap) {
        const seat = seatByName(tap.name);
        const sb = seat && !seat.manual && seatApi(seat);
        if (sb && sb.hit && sb.hit(tap.drum)) say(`${tap.name} toca el tambor ${tap.drum + 1}.`);
      }
      if (dwell > PUZZLE_LIMIT_MS && !state.stuck) { state.stuck = true; shortcut("Sala 7", "complete"); }
      break;
    }
    default: break;
  }
  if (key !== state.stuckKey) { state.stuckKey = key; state.stuck = false; }
}

function tick() {
  if (!state.game) return;
  const st = tvState();
  if (!st) {
    // nobody clicked the splash (or the page was reloaded): start the TV without sound after a few seconds
    if (state.tv && !state.tvClicked && performance.now() - state.mountedAt > 4000) startTv();
    return;
  }
  if (state.auto && !state.busy) {
    try { autopilot(st, performance.now()); } catch (e) { console.error("autopilot", e); }
  }
}

function setAuto(on) {
  state.auto = on;
  if (!on) releaseBots();
  else { state.endedLogged = false; state.key = ""; }
  say(on ? "Piloto automático activado." : "Piloto automático desactivado.");
  refreshButtons();
}

// ---- boot -------------------------------------------------------------------------------------------------------------------
el.btnNew.addEventListener("click", newDemo);
el.btnAuto.addEventListener("click", () => setAuto(!state.auto));
el.btnJump.addEventListener("click", jumpTo);
el.btnDelete.addEventListener("click", deleteDemo);
window.addEventListener("resize", fit);
if (window.ResizeObserver) { const ro = new ResizeObserver(requestFit); ro.observe(el.bar); ro.observe(el.under); }

// ---- sound: ONE click anywhere on this page unlocks the TV ------------------------------------------------------------
// A click here gives the frame tree sticky user activation, and a same-origin iframe may resume its AudioContext on the
// strength of an activated ancestor. The TV only needs somebody to call resume() inside the gesture: we do it ourselves,
// synchronously, through window.__sbtv.unlock (capture phase, so it runs before any button handler).
function tvSoundOn() { try { const t = tvApi(); return !!(t && t.sound && t.sound()); } catch (_) { return false; } }
function unlockTvSound() {
  try { const t = tvApi(); if (t && t.unlock) t.unlock(); } catch (_) { /* TV still loading: the next click does it */ }
  renderSound();
}
function renderSound() {
  const on = tvSoundOn();
  el.btnSound.setAttribute("aria-pressed", String(on));
  el.btnSound.textContent = on ? "Sonido activado" : "Activar sonido";
}
document.addEventListener("pointerdown", unlockTvSound, true);
document.addEventListener("keydown", unlockTvSound, true);
setInterval(() => {
  // the TV frame is created AFTER the click on "Nueva demo": once it exists, a page that has already been clicked unlocks it too
  const ua = navigator.userActivation;
  if (ua && ua.hasBeenActive && !tvSoundOn()) { try { const t = tvApi(); if (t && t.unlock) t.unlock(); } catch (_) { /* loading */ } }
  renderSound();
}, 500);
setInterval(tick, TICK_MS);
setInterval(renderStatus, 500);

async function resume() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (_) { saved = null; }
  if (!saved || !saved.game) return;
  try {
    const games = await api("/api/games");
    if (!games.some((g) => g.id === saved.game.id)) { localStorage.removeItem(STORE); return; }
    state.game = saved.game;
    state.seats = saved.seats.map((s) => ({ ...s, manual: false }));
    state.startedAt = performance.now();
    mountFrames();
    await startPanel();
    say("Demo recuperada tras recargar la página.");
  } catch (e) { say(e.message, "bad"); }
}

emptySlots();
fit();
refreshButtons();
renderStatus();
resume().then(async () => {
  refreshButtons();
  if (!autoStart) return;
  await newDemo();
  if (state.game) setAuto(true);
});
