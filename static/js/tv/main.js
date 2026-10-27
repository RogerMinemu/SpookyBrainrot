import { GameSocket } from "/static/js/shared/ws.js";
import { h, clear, fill } from "/static/js/shared/dom.js";
import { screens } from "/static/js/tv/screens.js";
import { handleEvent } from "/static/js/tv/effects.js";
import { applyState } from "/static/js/ui/theme.js";
import { panel, button, title } from "/static/js/ui/kit.js";
import { startArt } from "/static/js/art/boot.js";
import { unlockAudio, isUnlocked, audioContext } from "/static/js/shared/audio.js";
import { createMusic } from "/static/js/tv/music.js";
import { createStory } from "/static/js/tv/story.js";

// composition root: the art starts once, immediately (the splash is already painted by it)
const art = startArt({ layout: "tv" });

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
const music = createMusic(audioContext);
const musicButton = button("Música: sí", { onclick: () => {
  const enabled = musicButton.getAttribute("aria-pressed") !== "true";
  musicButton.setAttribute("aria-pressed", String(enabled));
  musicButton.textContent = enabled ? "Música: no" : "Música: sí";
  music.setEnabled(!enabled);
} });
musicButton.classList.add("music-toggle");
musicButton.setAttribute("aria-pressed", "false");
document.body.append(musicButton);
document.addEventListener("pointerdown", () => {
  unlockAudio();
  const ac = audioContext();
  if (ac) ac.resume().then(() => music.unlock()).catch(() => {});
}, { capture: true });

const ctx = {
  musicRed: (value) => music.setRed(value),
  advance: () => socket && socket.send("advance"),
  // realtime lane: sim outcome reports and effects for the phones
  sendSim: (report) => socket && socket.sendSim(report),
  sendFx: (to, kind, data) => socket && socket.sendFx(to, kind, data),
  // painted cast: puzzles and screens get characters ONLY through this handle (silhouette until the art is ready)
  sprite: (id) => art.sprite(id),
};
// Cutscenes between the rooms: the brainrots tell the story (over the screen, keyed by the state)
const story = createStory({ gameId, sprite: ctx.sprite, sendFx: ctx.sendFx, onActive: (value) => music.setStory(value) });
// Last mask per phone. Relayed inputs can arrive before the puzzle module is mounted (replay on connect).
const masks = new Map();

function leavePuzzle() {
  if (active) { active.mod.unmount(); active = null; }
  music.setRed(false);
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
  art.setDegradation(live ? Number(meter.dataset.band) : 0); // the worse the brainrot, the faster the characters boil
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
  story.sync(state);
  music.sync(state);
  music.setStory(story.active());
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
    mod.mount(screen, { gameId, ...ctx });
    active = { kind, mod };
    if (mod.onInput) for (const [pid, mask] of masks) mod.onInput({ pid, mask });
  }
  active.mod.update(latest.view, latest);
}

// /tv/<id>?demo=1 (embedded by /admin/demo): the bots read the TV's newest state and its live sim from here.
// Any click on the TV unlocks sound, even when the demo page started it without a gesture.
if (new URLSearchParams(location.search).has("demo")) {
  // unlock()/sound(): the demo page calls them from ITS click handlers. A click on the parent document gives the frame
  // tree sticky user activation (same-origin iframe), so ctx.resume() succeeds without a click inside the TV itself.
  window.__sbtv = {
    state: () => latest, host: null, unlock: () => unlockAudio(), sound: () => isUnlocked(),
    story: { active: () => story.active(), key: () => story.key(), skip: () => story.skip(), reader: () => story.reader() },
  };
  document.addEventListener("pointerdown", () => unlockAudio(), { capture: true });
}

function start() {
  unlockAudio(); // the splash click is the user gesture that lets WebAudio run
  splash.classList.add("hidden");
  screen.classList.remove("hidden");
  const el = document.documentElement;
  if (el.requestFullscreen && !window.__sbtv) el.requestFullscreen().catch(() => {}); // embedded in /admin/demo: stay in the frame
  socket = new GameSocket({
    hello: () => ({ role: "tv", game_id: gameId }),
    onState: render,
    onInput: (m) => {
      masks.set(m.pid, m.mask);
      if (active && active.mod.onInput) active.mod.onInput(m);
    },
    onEvent: (ev) => {
      // per-puzzle hook first (may consume the event), then the global handler
      if (active && active.mod.onEvent && active.mod.onEvent(ev) === true) return;
      handleEvent(ev, ctx);
    },
    // the admin player's phone: skip the cutscene, or re-mount the screen from the newest state when it got stuck
    onAdmin: ({ action }) => {
      if (action === "story_skip") story.skip();
      else if (action === "tv_refresh" && latest) { leavePuzzle(); loadToken += 1; render(latest); }
    },
    // the phone picked to read the current line aloud pressed "Siguiente"
    onStory: (m) => story.readerNext(m),
    onStatus: (s) => connBadge.classList.toggle("hidden", s === "open"),
    onFatal: (code) => {
      music.stop();
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
