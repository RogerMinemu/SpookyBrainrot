import { GameSocket } from "/static/js/shared/ws.js";
import { h, clear, fill } from "/static/js/shared/dom.js";
import { screens } from "/static/js/tv/screens.js";
import { handleEvent } from "/static/js/tv/effects.js";

const gameId = location.pathname.split("/").filter(Boolean).pop();
const splash = document.getElementById("splash");
const screen = document.getElementById("screen");
const meter = document.getElementById("meter");
const meterFill = document.getElementById("meter-fill");
const meterText = document.getElementById("meter-text");
const connBadge = document.getElementById("conn");

let socket = null;
let active = null; // { kind, mod } puzzle module currently mounted
let latest = null; // newest state (the module import is async)
let loadToken = 0;

const ctx = { advance: () => socket && socket.send("advance") };

function leavePuzzle() {
  if (active) { active.mod.unmount(); active = null; }
}

function updateMeter(state) {
  const v = state.view || {};
  const pct = typeof v.brainrot === "number" ? v.brainrot
    : typeof state.game.brainrot === "number" ? state.game.brainrot : null;
  const live = pct != null && !["lobby", "idle", "ending"].includes(v.kind);
  meter.classList.toggle("hidden", !live);
  if (live) {
    const r = Math.max(0, Math.min(100, Math.round(pct)));
    meterFill.style.width = `${r}%`;
    meterText.textContent = `Brainrot ${r}%`;
  }
}

async function render(state) {
  latest = state;
  document.documentElement.style.setProperty("--rot", state.game.degradation);
  document.documentElement.dataset.rot = String(state.game.degradation);
  updateMeter(state);
  const kind = state.view.kind;
  if (screens[kind]) {
    leavePuzzle();
    loadToken += 1;
    screens[kind](screen, state, gameId, ctx);
    return;
  }
  // Puzzle kinds are loaded on demand: /static/puzzles/<kind>/tv.js
  if (!active || active.kind !== kind) {
    if (!/^[a-z_]+$/.test(kind)) return;
    const token = ++loadToken;
    let mod;
    try {
      mod = await import(`/static/puzzles/${kind}/tv.js`);
    } catch (e) {
      console.error("puzzle module failed", kind, e);
      return;
    }
    if (token !== loadToken) return; // a newer view superseded this one
    leavePuzzle();
    clear(screen);
    mod.mount(screen, { gameId });
    active = { kind, mod };
  }
  active.mod.update(latest.view, latest);
}

function start() {
  splash.classList.add("hidden");
  screen.classList.remove("hidden");
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  socket = new GameSocket({
    hello: () => ({ role: "tv", game_id: gameId }),
    onState: render,
    onEvent: (ev) => {
      // per-puzzle hook first (may consume the event), then the global handler
      if (active && active.mod.onEvent && active.mod.onEvent(ev) === true) return;
      handleEvent(ev);
    },
    onStatus: (s) => connBadge.classList.toggle("hidden", s === "open"),
    onFatal: (code) => {
      connBadge.classList.add("hidden");
      leavePuzzle();
      loadToken += 1;
      if (code === 4001) {
        fill(screen,
          h("h1", {}, "Otra pantalla ha tomado el control"),
          h("button", { class: "btn", onclick: () => socket.start() }, "Recuperar control"));
      } else {
        screen.textContent = code === 4010 ? "Esta partida ha sido borrada." : "Partida no encontrada.";
      }
    },
  });
  socket.start();
}

splash.addEventListener("click", start, { once: true });
