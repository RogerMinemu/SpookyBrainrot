import { GameSocket } from "/static/js/shared/ws.js";
import { h, clear, getCookie, fill } from "/static/js/shared/dom.js";
import { onEvent, onError } from "/static/js/play/toast.js";
import { applyState } from "/static/js/ui/theme.js";
import { panel, button, title, pill } from "/static/js/ui/kit.js";
import { startArt } from "/static/js/art/boot.js";
import { unlockAudio, setMuted, play as playSound, preloadSamples } from "/static/js/shared/audio.js";
import { createScanner } from "/static/js/play/scanner.js";
import { storyKeyFor, lineFor, varsFor } from "/static/js/story/runner.js";
import { PHONE } from "/static/js/story/script.js";

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
const NAME_KEY = "sb_name"; // last name typed here: the join form offers it again
// /play?code=XXXX (the lobby QR): the game this phone was invited to. A stored token of another game is not resumed.
const inviteCode = (new URLSearchParams(location.search).get("code") || "").trim().toUpperCase();
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
// The TV's cutscene beat (fx "story", every beat + a 2 s heartbeat). While it is fresh and matches our state,
// the phone shows the same line and holds back "Entrar" / "Siguiente sala"; a silent TV releases them.
// The TV picks a reader per line: that phone gets "Siguiente" (WS "story"), the others see who is reading.
const STORY_STALE_MS = 6000;
const STORY_KINDS = new Set(["intro", "search", "unlocked", "ending"]);
let storyFx = null;
let storyTimer = 0;
let storyShown = null; // { sig, panel }: a heartbeat repeating the same line must not rebuild it (a tap would be lost)
let readerLine = null; // the line this phone has to read aloud, while it is ours
const READER_RETRY_MS = 1500;
let loadToken = 0;
let tvOnline = true; // optimistic until the first state says otherwise
let admin = null; // admin menu: only on the admin player's phone (the welcome says so)

// Shown while the TV is absent: the phone stops sending input (the TV would not see it anyway)
const tvOffline = h("div", { id: "tv-offline", class: "tv-offline hidden", role: "status" }, "La tele no está conectada. Esperad un momento...");
document.body.appendChild(tvOffline);
// Every touch retries the WebAudio unlock (a user gesture is mandatory on phones). Not just the first pointerdown:
// on a touchscreen pointerdown is no user gesture (pointerup / touchend / click are), so a context made there stays
// suspended, and iOS suspends it again after a call or a locked screen. A phone loads only the recorded effects that
// are personal (your scan, your fall, your splash); shared cues like the bells stay synth on the phones, or a dozen
// of them would ring with the TV.
const PHONE_SAMPLES = ["scare", "scream", "anchor", "fall", "splash"];
const unlockPhoneAudio = () => { if (unlockAudio()) preloadSamples(PHONE_SAMPLES); };
for (const ev of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
  document.addEventListener(ev, unlockPhoneAudio, { capture: true, passive: true });
}

/** The scanning phone reacts too: a decoy screams in your hand, the right QR chimes. */
function scanSound(reply) {
  const result = reply && reply.result;
  if (result === "jumpscare") playSound("scare");
  else if (result === "unlocked" || result === "finished") playSound("anchor");
}

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

async function syncAdmin(welcome) {
  if (!welcome.admin) { if (admin) { admin.destroy(); admin = null; } return; }
  if (admin) return;
  const mod = await import("/static/js/play/admin.js");
  if (admin || !me || !me.admin) return; // another welcome won the race
  admin = mod.installAdmin({
    gameId: welcome.game_id,
    token: storedToken,
    sendTv: (action) => !!socket && socket.send("admin", { action }),
    getState: () => latest,
  });
}

// Demo hooks (seat mode only). The bots and the keyboard act through the same send paths as a finger:
// the pad (WS input masks), the puzzle buttons (WS puzzle commands) and the advance button.
if (SEAT) {
  const sb = {
    seat: SEAT,
    ready: false,   // welcome received
    pad: null,      // set by mountPad
    hold: null,     // Room 0: hold(down), set by its controller
    hit: null,      // Room 6: hit(drum), set by its controller
    adjust: null,   // Room 3: adjust(+1 | -1), set by its controller
    vote: null,     // Room 4: vote(option), set by its controller
    setMask(mask) { if (sb.pad) sb.pad.force(mask); if (sb.hold) sb.hold(mask !== 0); },
    advance: () => ctx.advance(),
    reading: () => !!readerLine,                               // this seat was picked to read the cutscene line
    storyNext: () => !!readerLine && readerLine.typed && storyNext(readerLine), // ...and presses "Siguiente" (once typed)
    scan: (token) => !!socket && socket.send("scan", { token }), // what the "Pistas" camera sends once it reads a QR
    setSound(on) { setMuted(!on); if (on) unlockAudio(); },
    view: () => (latest ? latest.view : null),
  };
  window.__sb = sb;
}

/** The line the TV is telling right now, or null when no cutscene is running for this state. */
function storyLine(state) {
  if (!storyFx || storyFx.data.done || Date.now() - storyFx.at > STORY_STALE_MS) return null;
  const d = storyFx.data;
  if (d.key !== storyKeyFor(state)) return null;
  const line = lineFor(d.scene, d.beat, varsFor(state)) || { name: "", text: PHONE.waiting };
  return { ...line, key: d.key, scene: d.scene, beat: d.beat, typed: !!d.typed, reader: d.reader || null,
    readerName: d.reader_name || "" };
}

/** The reader's "Siguiente": the TV goes on to the next line (it ignores a press for a line it no longer shows). */
function storyNext(line) {
  return !!socket && socket.send("story", { key: line.key, scene: line.scene, beat: line.beat });
}

function onStoryFx(data) {
  storyFx = { data: data || {}, at: Date.now() };
  clearTimeout(storyTimer);
  storyTimer = setTimeout(() => latest && PLAIN.has(latest.view.kind) && renderPlain(latest), STORY_STALE_MS + 100);
  if (latest && STORY_KINDS.has(latest.view.kind)) renderPlain(latest);
}

function renderStory(state, line) {
  const mine = !!line.reader && !!me && line.reader === me.player_id;
  readerLine = mine ? line : null;
  const sig = JSON.stringify([line.key, line.scene, line.beat, line.typed, line.reader, line.readerName, me ? me.name : ""]);
  if (storyShown && storyShown.sig === sig && storyShown.panel.isConnected) return;
  let next = null;
  if (mine) {
    // off while the TV is still typing the line: a tap that early would skip it before anybody has read it
    next = button(line.typed ? PHONE.next : PHONE.typing, { cls: "story-next", onclick: () => {
      if (!line.typed) return;
      if (!storyNext(line)) return;
      next.disabled = true; // until the TV announces the next line (a double tap would skip two)
      next.textContent = PHONE.sent;
      // the TV drops a press that comes too soon after the line appeared: let the reader try again
      setTimeout(() => { if (next.isConnected) { next.disabled = false; next.textContent = PHONE.next; } }, READER_RETRY_MS);
    } });
    next.disabled = !line.typed;
  }
  const box = panel([
    h("div", { class: "me" }, `Eres ${me ? me.name : ""}`),
    line.name ? h("p", { class: "story-who" }, line.name) : null,
    h("p", { class: line.card ? "story-line story-card" : "story-line" }, line.text),
    mine ? h("p", { class: "story-reader mine" }, PHONE.readAloud)
      : line.reader ? h("p", { class: "story-reader" }, `🎤 Lee ${line.readerName}`) : null,
    next,
  ], { cls: "phone-panel story-panel" });
  fill(gameSection, title(mine ? PHONE.yourTurn : PHONE.title, { cls: "phone-title" }), box);
  storyShown = { sig, panel: box };
}

function renderPlain(state) {
  const players = state.game.players;
  const kind = state.view.kind;
  const line = STORY_KINDS.has(kind) ? storyLine(state) : null;
  if (line) { dropScanner(); renderStory(state, line); return; }
  readerLine = null;
  const search = kind === "search";
  const advanceLabel = { lobby: "Empezar", intro: "Entrar", unlocked: "Siguiente sala" }[kind];
  if (search && !scanner) {
    scanner = createScanner({
      onToken: (token) => !!socket && socket.send("scan", { token }),
      onCode: (code) => !!socket && socket.send("scan", { code }), // the 4 letters under the QR, typed in
    });
  }
  if (!search) dropScanner();
  const head = [
    title(search ? "Pistas (busca el QR)" : state.game.name, { cls: "phone-title" }),
    panel([
      h("div", { class: "me" }, `Eres ${me ? me.name : ""}`),
      h("p", { class: "muted" }, `${players.filter((p) => p.connected).length} de ${players.length} conectados`),
      search ? h("p", { class: "riddle" }, state.game.riddle || "") : null,
      kind === "ending" ? h("p", {}, "Fin de la partida.") : null,
      advanceLabel ? button(advanceLabel, { onclick: ctx.advance }) : null,
      h("div", { class: "players" }, players.map((p) => pill(p.name, { off: !p.connected }))),
    ], { cls: "phone-panel" }),
  ];
  if (search && scanner.el.parentNode === gameSection) {
    // keep the scanner where it is: re-parenting it would blur the code being typed (and pause the viewfinder)
    for (const n of [...gameSection.childNodes]) if (n !== scanner.el) n.remove();
    gameSection.prepend(...head);
  } else {
    fill(gameSection, ...head, search ? scanner.el : null);
  }
  if (scanner) scanner.resume();
}

const PLAIN = new Set(["lobby", "idle", "intro", "search", "unlocked", "ending"]);

async function render(state) {
  latest = state;
  if (admin) admin.onState(state);
  applyState(state);
  const kind = state.view.kind;
  if (PLAIN.has(kind)) {
    leavePuzzle();
    loadToken += 1;
    renderPlain(state);
    return;
  }
  dropScanner();
  readerLine = null;
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
    hello: () => ({
      role: "player", player_token: storedToken(), ...(SEAT ? { seat: true } : {}), ...(inviteCode ? { code: inviteCode } : {}),
    }),
    onWelcome: (w) => {
      me = w;
      syncAdmin(w).catch((e) => console.error("admin menu failed", e));
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
      if (fx.kind === "story") { onStoryFx(fx.data); return; }
      if (active && active.mod.onFx) active.mod.onFx(fx);
      else playSound(fx.kind);
    },
    onEvent: (ev) => {
      if (active && active.mod.onEvent && active.mod.onEvent(ev) === true) return;
      onEvent(ev);
    },
    // a right QR changes the phase first (the scanner is gone by then): the anchor_unlocked event says it instead
    onScan: (reply) => {
      scanSound(reply);
      if (scanner) scanner.showResult(reply);
    },
    onError: (err) => onError(err),
    onStatus: (s) => {
      connBadge.classList.toggle("hidden", s === "open");
      if (s !== "open" && window.__sb) window.__sb.ready = false;
    },
    onFatal: (code) => {
      // unknown token, or a token of another game than ?code= (4004): back to the name form
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
  if (admin) { admin.destroy(); admin = null; }
  localStorage.removeItem(TOKEN_KEY);
  gameSection.classList.add("hidden");
  joinSection.classList.remove("hidden");
  if (inviteCode) document.getElementById("code").value = inviteCode;
  const nameEl = document.getElementById("name");
  if (!SEAT && !nameEl.value) { try { nameEl.value = localStorage.getItem(NAME_KEY) || ""; } catch (_) { /* private mode */ } }
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
  if (!SEAT) { try { localStorage.setItem(NAME_KEY, data.name); } catch (_) { /* private mode */ } }
  connect();
});

if (storedToken()) connect();
else showJoin();
