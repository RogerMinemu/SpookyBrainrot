import { GameSocket } from "/static/js/shared/ws.js";
import { h, clear, getCookie, fill } from "/static/js/shared/dom.js";
import { onEvent, onError } from "/static/js/play/toast.js";
import { applyState } from "/static/js/ui/theme.js";
import { panel, button, title, pill } from "/static/js/ui/kit.js";
import { startArt } from "/static/js/art/boot.js";

// composition root: one static plate per page (phones never boil)
startArt({ layout: "flex" });

const COOKIE = "sb_pt";
const joinSection = document.getElementById("join");
const gameSection = document.getElementById("game");
const connBadge = document.getElementById("conn");
const errorEl = document.getElementById("error");

const storedToken = () => getCookie(COOKIE) || localStorage.getItem(COOKIE);
const saveToken = (t) => {
  localStorage.setItem(COOKIE, t);
  document.cookie = `${COOKIE}=${encodeURIComponent(t)}; max-age=${7 * 24 * 3600}; path=/; samesite=lax`;
};

let me = null;
let socket = null;
let active = null; // { kind, mod } puzzle controller currently mounted
let latest = null;
let loadToken = 0;

const ctx = {
  send: (action) => socket && socket.send("puzzle", action),
  advance: () => socket && socket.send("advance"),
};

function leavePuzzle() {
  if (active) { active.mod.unmount(); active = null; }
}

function renderPlain(state) {
  const players = state.game.players;
  const kind = state.view.kind;
  const advanceLabel = { lobby: "Empezar", intro: "Entrar", unlocked: "Siguiente sala" }[kind];
  fill(gameSection,
    title(state.game.name, { cls: "phone-title" }),
    panel([
      h("div", { class: "me" }, `Eres ${me ? me.name : ""}`),
      h("p", { class: "muted" }, `${players.filter((p) => p.connected).length} de ${players.length} conectados`),
      kind === "search" ? h("p", { class: "riddle" }, state.game.riddle || "") : null,
      kind === "ending" ? h("p", {}, "Fin de la partida.") : null,
      advanceLabel ? button(advanceLabel, { onclick: ctx.advance }) : null,
      h("div", { class: "players" }, players.map((p) => pill(p.name, { off: !p.connected }))),
    ], { cls: "phone-panel" }));
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
  }
  active.mod.update(latest.view, latest);
}

function connect() {
  joinSection.classList.add("hidden");
  gameSection.classList.remove("hidden");
  socket = new GameSocket({
    hello: () => ({ role: "player", player_token: storedToken() }),
    onWelcome: (w) => { me = w; },
    onState: render,
    onEvent: (ev) => {
      if (active && active.mod.onEvent && active.mod.onEvent(ev) === true) return;
      onEvent(ev);
    },
    onError: (err) => onError(err),
    onStatus: (s) => connBadge.classList.toggle("hidden", s === "open"),
    onFatal: (code) => {
      // unknown token (4004): back to the name form
      if (code === 4004) showJoin();
      else if (code === 4001) {
        // another tab/phone took over this player: stop retrying, offer to take control back
        connBadge.classList.add("hidden");
        leavePuzzle();
        fill(gameSection,
          title("Otra pantalla ha tomado el control", { cls: "phone-title" }),
          panel([
            h("p", {}, "Tu sesión se ha abierto en otro sitio."),
            button("Recuperar control", { onclick: () => socket.start() }),
          ], { cls: "phone-panel" }));
      } else if (code === 4010) { leavePuzzle(); fill(gameSection, panel(h("p", {}, "La partida ha sido borrada."), { cls: "phone-panel" })); }
    },
  });
  socket.start();
}

function showJoin() {
  localStorage.removeItem(COOKIE);
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
