import { GameSocket } from "/static/js/shared/ws.js";
import { h, clear, getCookie, fill } from "/static/js/shared/dom.js";
import { onEvent, onError } from "/static/js/play/toast.js";
import { applyState } from "/static/js/ui/theme.js";
import { panel, button, title, pill } from "/static/js/ui/kit.js";
import { startArt } from "/static/js/art/boot.js";
import { unlockAudio, setMuted, play as playSound } from "/static/js/shared/audio.js";
import { createScanner } from "/static/js/play/scanner.js";

// composition root: one static plate per page (phones never boil)
startArt({ layout: "flex" });

const COOKIE = "sb_pt";
const joinSection = document.getElementById("join");
const gameSection = document.getElementById("game");
const connBadge = document.getElementById("conn");
const errorEl = document.getElementById("error");

// Seat mode (/play?seat=N, used by /admin/demo): several phones share one browser, so each seat keeps its token
// under its own localStorage key and NEVER touches the shared player cookie (nor falls back to it on the server).
const seatParam = new URLSearchParams(location.search).get("seat");
const SEAT = seatParam && /^\d{1,2}$/.test(seatParam) ? seatParam : null;
const TOKEN_KEY = SEAT ? `sb_seat_${SEAT}` : COOKIE;
const storedToken = () => (SEAT ? localStorage.getItem(TOKEN_KEY) : getCookie(COOKIE) || localStorage.getItem(COOKIE));
const saveToken = (t) => {
  localStorage.setItem(TOKEN_KEY, t);
  if (!SEAT) document.cookie = `${COOKIE}=${encodeURIComponent(t)}; max-age=${7 * 24 * 3600}; path=/; samesite=lax`;
};
if (SEAT) setMuted(true); // seats are silent until the host takes one over

let me = null;
let socket = null;
let active = null; // { kind, mod } puzzle controller currently mounted
let scanner = null; // "Pistas" QR camera: lives across the re-renders of the search phase, dies when it ends
let latest = null;
let loadToken = 0;
let tvOnline = true; // optimistic until the first state says otherwise

// Shown while the TV is absent: the phone stops sending input (the TV would not see it anyway)
const tvOffline = h("div", { id: "tv-offline", class: "tv-offline hidden", role: "status" }, "La tele no está conectada. Esperad un momento...");
document.body.appendChild(tvOffline);
// first touch on the page unlocks WebAudio (a user gesture is mandatory on phones)
document.addEventListener("pointerdown", () => unlockAudio(), { once: true, capture: true });

const ctx = {
  sendInput: (mask) => tvOnline && socket ? socket.sendInput(mask) : false,
  tvOnline: () => tvOnline,
  playerId: () => (me ? me.player_id : null),
  send: (action) => socket && socket.send("puzzle", action),
  advance: () => socket && socket.send("advance"),
};

function leavePuzzle() {
  if (active) { active.mod.unmount(); active = null; }
}

function dropScanner() {
  if (scanner) { scanner.stop(); scanner = null; }
}

// Demo hooks (seat mode only). The bots and the keyboard act through the same send paths as a finger:
// the pad (WS input masks), the puzzle buttons (WS puzzle commands) and the advance button.
if (SEAT) {
  const sb = {
    seat: SEAT,
    ready: false,   // welcome received
    pad: null,      // set by mountPad
    hold: null,     // Room 0: hold(down), set by its controller
    hit: null,      // Room 7: hit(drum), set by its controller
    adjust: null,   // Room 3: adjust(+1 | -1), set by its controller
    vote: null,     // Room 4: vote(option), set by its controller
    setMask(mask) { if (sb.pad) sb.pad.force(mask); if (sb.hold) sb.hold(mask !== 0); },
    advance: () => ctx.advance(),
    scan: (token) => !!socket && socket.send("scan", { token }), // what the "Pistas" camera sends once it reads a QR
    setSound(on) { setMuted(!on); if (on) unlockAudio(); },
    view: () => (latest ? latest.view : null),
  };
  window.__sb = sb;
}

function renderPlain(state) {
  const players = state.game.players;
  const kind = state.view.kind;
  const search = kind === "search";
  const advanceLabel = { lobby: "Empezar", intro: "Entrar", unlocked: "Siguiente sala" }[kind];
  if (search && !scanner) scanner = createScanner({ onToken: (token) => !!socket && socket.send("scan", { token }) });
  if (!search) dropScanner();
  fill(gameSection,
    title(search ? "Pistas (busca el QR)" : state.game.name, { cls: "phone-title" }),
    panel([
      h("div", { class: "me" }, `Eres ${me ? me.name : ""}`),
      h("p", { class: "muted" }, `${players.filter((p) => p.connected).length} de ${players.length} conectados`),
      search ? h("p", { class: "riddle" }, state.game.riddle || "") : null,
      kind === "ending" ? h("p", {}, "Fin de la partida.") : null,
      advanceLabel ? button(advanceLabel, { onclick: ctx.advance }) : null,
      h("div", { class: "players" }, players.map((p) => pill(p.name, { off: !p.connected }))),
    ], { cls: "phone-panel" }),
    search ? scanner.el : null);
  if (scanner) scanner.resume();
}

const PLAIN = new Set(["lobby", "idle", "intro", "search", "unlocked", "ending"]);

async function render(state) {
  latest = state;
  applyState(state);
  const kind = state.view.kind;
  if (PLAIN.has(kind)) {
    leavePuzzle();
    loadToken += 1;
    renderPlain(state);
    return;
  }
  dropScanner();
  // Puzzle kinds: /static/puzzles/<kind>/controller.js, loaded when view.kind changes
  if (!active || active.kind !== kind) {
    if (!/^[a-z_]+$/.test(kind)) return;
    const token = ++loadToken;
    let mod;
    try {
      mod = await import(`/static/puzzles/${kind}/controller.js`);
    } catch (e) {
      console.error("puzzle module failed", kind, e);
      return;
    }
    if (token !== loadToken) return;
    leavePuzzle();
    mod.mount(gameSection, ctx);
    active = { kind, mod };
    if (!tvOnline && mod.onTvOnline) mod.onTvOnline(false);
  }
  active.mod.update(latest.view, latest);
}

function connect() {
  joinSection.classList.add("hidden");
  gameSection.classList.remove("hidden");
  socket = new GameSocket({
    hello: () => (SEAT ? { role: "player", player_token: storedToken(), seat: true } : { role: "player", player_token: storedToken() }),
    onWelcome: (w) => {
      me = w;
      if (window.__sb) window.__sb.ready = true;
      if (active && active.mod.resend) active.mod.resend(); // fresh socket: the TV may have lost our mask
    },
    onState: render,
    onTvOnline: (online) => {
      tvOnline = online;
      tvOffline.classList.toggle("hidden", online);
      if (active && active.mod.onTvOnline) active.mod.onTvOnline(online);
    },
    onFx: (fx) => {
      if (active && active.mod.onFx) active.mod.onFx(fx);
      else playSound(fx.kind);
    },
    onEvent: (ev) => {
      if (active && active.mod.onEvent && active.mod.onEvent(ev) === true) return;
      onEvent(ev);
    },
    // a right QR changes the phase first (the scanner is gone by then): the anchor_unlocked event says it instead
    onScan: (reply) => scanner && scanner.showResult(reply),
    onError: (err) => onError(err),
    onStatus: (s) => {
      connBadge.classList.toggle("hidden", s === "open");
      if (s !== "open" && window.__sb) window.__sb.ready = false;
    },
    onFatal: (code) => {
      // unknown token (4004): back to the name form
      if (code === 4004) showJoin();
      else if (code === 4001) {
        // another tab/phone took over this player: stop retrying, offer to take control back
        connBadge.classList.add("hidden");
        leavePuzzle();
        dropScanner();
        fill(gameSection,
          title("Otra pantalla ha tomado el control", { cls: "phone-title" }),
          panel([
            h("p", {}, "Tu sesión se ha abierto en otro sitio."),
            button("Recuperar control", { onclick: () => socket.start() }),
          ], { cls: "phone-panel" }));
      } else if (code === 4010) { leavePuzzle(); dropScanner(); fill(gameSection, panel(h("p", {}, "La partida ha sido borrada."), { cls: "phone-panel" })); }
    },
  });
  socket.start();
}

function showJoin() {
  dropScanner();
  localStorage.removeItem(TOKEN_KEY);
  gameSection.classList.add("hidden");
  joinSection.classList.remove("hidden");
  const code = new URLSearchParams(location.search).get("code");
  if (code) document.getElementById("code").value = code.toUpperCase();
}

document.getElementById("join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: document.getElementById("code").value.trim().toUpperCase(),
      name: document.getElementById("name").value,
      ...(SEAT ? { seat: true } : {}),
    }),
  });
  if (res.status === 404) { errorEl.textContent = "Código no válido."; return; }
  if (!res.ok) { errorEl.textContent = "Nombre no válido."; return; }
  const data = await res.json();
  saveToken(data.token);
  connect();
});

if (storedToken()) connect();
else showJoin();
