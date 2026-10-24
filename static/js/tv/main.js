import { GameSocket } from "/static/js/shared/ws.js";
import { h, clear, fill } from "/static/js/shared/dom.js";
import { screens } from "/static/js/tv/screens.js";
import { handleEvent } from "/static/js/tv/effects.js";
import { applyState } from "/static/js/ui/theme.js";
import { panel, button, title } from "/static/js/ui/kit.js";
import { startArt } from "/static/js/art/boot.js";

// composition root: the art starts once, immediately (the splash is already painted by it)
startArt({ layout: "tv" });

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
    meter.dataset.band = String(r >= 75 ? 3 : r >= 50 ? 2 : r >= 25 ? 1 : 0);
  }
}

// 4001 takeover look (html[data-takeover] + .takeover on the screen); cleared by any new state.
function clearTakeover() {
  document.documentElement.removeAttribute("data-takeover");
  screen.classList.remove("takeover");
}

// Host debug drawer: hidden by default, Shift+D toggles it. The module is only fetched on first use,
// so a normal game never loads it.
let debugDrawer = null;
let debugLoading = false;
async function toggleDebug() {
  if (!debugDrawer) {
    if (debugLoading) return;
    debugLoading = true;
    try {
      const mod = await import("/static/js/admin/debug-panel.js");
      debugDrawer = mod.installDrawer({ gameId, getState: () => latest });
    } catch (e) {
      console.error("debug drawer failed", e);
      return;
    } finally {
      debugLoading = false;
    }
  }
  debugDrawer.toggle();
}
document.addEventListener("keydown", (e) => {
  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== "d") return;
  const t = e.target;
  if (t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.type !== "range"))) return;
  e.preventDefault();
  toggleDebug();
});

async function render(state) {
  latest = state;
  if (debugDrawer) debugDrawer.onState(state);
  clearTakeover();
  applyState(state);
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
        document.documentElement.dataset.takeover = "1";
        screen.classList.add("takeover");
        fill(screen,
          title("Otra pantalla ha tomado el control"),
          button("Recuperar control", { onclick: () => socket.start() }));
      } else {
        fill(screen, panel(h("p", {}, code === 4010 ? "Esta partida ha sido borrada." : "Partida no encontrada.")));
      }
    },
  });
  socket.start();
}

splash.addEventListener("click", start, { once: true });
