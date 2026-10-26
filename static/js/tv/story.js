// TV cutscenes: the brainrots tell the story between the rooms (intro of each room, the riddle, the hand-off to the
// next guardian, the ending). A body-level #story layer over the screen holds:
// - a 1920x1080 cast canvas: characters through ctx.sprite (painted atlas, or the flat silhouette in the same place);
// - a DOM caption that types the line (shown + rest spans, so the text never reflows), with the speaker's name;
// - title cards, the Foundation's terminal look, Sahur calling from a phone, the brainrot line-up, alarm and shake.
// The TV is the clock. It tells the phones which beat it is on (fx "story" {key, scene, beat, done}); they print the
// same line from the same script. Host controls: Space / Enter / -> / a click = next (finish the line first),
// Esc or "Saltar" = skip the scene. A finished (or skipped) key is remembered for this game in sessionStorage.
import { h } from "/static/js/shared/dom.js";
import { tone, play } from "/static/js/shared/audio.js";
import { VOICES, SPEAKERS } from "/static/js/story/script.js";
import { storyKeyFor, playlistFor, varsFor, compile, frameAt, nextStop, mouthAt, blips } from "/static/js/story/runner.js";
import { ROSTER_IDS, byId } from "/static/js/art/roster.js"; // pure cast data; drawing goes through ctx.sprite only

const W = 1920, H = 1080, GROUND = 830; // feet just above the caption card
const SLOTS = { 1: [700], 2: [600, 1320], 3: [480, 960, 1440] };
const GUEST_X = 1500;
const PHONE = { x: 1380, y: 120, w: 400, h: 720 };
const BLIP_GAP_S = 0.045;
const HEARTBEAT_MS = 2000;
const SHAKE_MS = 650;
const doneKey = (gameId, key) => `sb_story:${gameId}:${key}`;

const heightFor = (rig) => (rig && rig.kind === "rig" ? 760 : 600);

function remembered(gameId, key) {
  try { return sessionStorage.getItem(doneKey(gameId, key)) === "done"; } catch (_) { return false; }
}
function remember(gameId, key) {
  try { sessionStorage.setItem(doneKey(gameId, key), "done"); } catch (_) { /* private mode: replays on reload */ }
}

/** One voice blip; the pitch wobbles a little per letter so a line does not sound like a beep. */
function blip(who, ch) {
  const v = VOICES[who];
  if (!v) return;
  const cp = ch.codePointAt(0) || 0;
  const jitter = (((cp * 7919) % 13) - 6) / 6;
  const vowel = /[aeiouáéíóú]/i.test(ch) ? 1.06 : 1;
  tone(v.freq * (1 + 0.06 * jitter) * vowel, v.dur, { type: v.type, vol: v.vol, slide: v.slide });
}

function roundRect(g, x, y, w, hh, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * @param {object} o
 * @param {string} o.gameId
 * @param {(id: string) => object} o.sprite     ctx.sprite
 * @param {(to: string, kind: string, data: object) => void} o.sendFx
 * @returns {{ sync(state), active(): boolean, next(), skip(), key(): string|null }}
 */
export function createStory({ gameId, sprite, sendFx }) {
  const stage = h("div", { class: "story-stage", "aria-hidden": "true" });
  const alarm = h("div", { class: "story-alarm", "aria-hidden": "true" });
  const cardText = h("span", {}, "");
  const card = h("div", { class: "story-card hidden" }, h("div", { class: "torn big" }, cardText));
  const name = h("div", { class: "story-name" }, "");
  const shown = h("span", { class: "story-shown" }, "");
  const rest = h("span", { class: "story-rest", "aria-hidden": "true" }, "");
  const caption = h("div", { class: "story-caption hidden" }, name, h("p", { class: "story-text" }, shown, rest));
  const skipBtn = h("button", { type: "button", class: "btn story-skip" }, "Saltar »");
  const hint = h("div", { class: "story-hint" }, "Espacio: seguir · Esc: saltar");
  const root = h("div", { id: "story", class: "story hidden", "aria-live": "polite" }, stage, alarm, card, caption, skipBtn, hint);
  document.body.append(root);

  let cur = null; // { key, c, base, index, lastShown, lastBlip, sceneStart: Map, mount, beat timers }

  const nowMs = () => performance.now();
  const clock = () => (cur ? nowMs() - cur.base : 0);

  function fx(done) {
    if (!cur || !sendFx) return;
    const b = cur.c.beats[cur.index];
    sendFx("all", "story", done || !b ? { key: cur.key, done: true } : { key: cur.key, scene: b.scene, beat: b.i, done: false });
  }

  function setBeat(f) {
    const b = f.beat;
    cur.index = f.index;
    cur.lastShown = 0;
    root.dataset.who = b.who || "";
    root.classList.toggle("is-riddle", !!b.riddle); // not "riddle": tv.css styles .riddle (max-width) globally
    root.classList.toggle("alarm-on", b.show === "alarm");
    document.documentElement.classList.toggle("story-show-meter", b.show === "meter");
    if (b.card) {
      cardText.textContent = b.card;
      card.classList.remove("hidden");
      caption.classList.add("hidden");
    } else {
      card.classList.add("hidden");
      caption.classList.remove("hidden");
      caption.classList.toggle("terminal", b.who === "fundacion");
      caption.classList.toggle("via-phone", b.via === "phone");
      name.textContent = (b.via === "phone" ? "📞 " : "") + (SPEAKERS[b.who] || "");
    }
    if (b.shake) {
      root.classList.remove("shake");
      void root.offsetWidth; // restart the animation
      root.classList.add("shake");
      clearTimeout(cur.shakeTimer);
      cur.shakeTimer = setTimeout(() => root.classList.remove("shake"), SHAKE_MS);
    }
    if (b.sfx) play(b.sfx);
    fx(false);
  }

  function caption_(f) {
    const b = f.beat;
    if (b.card) return;
    shown.textContent = b.text.slice(0, f.shown);
    rest.textContent = b.text.slice(f.shown);
  }

  function voice(f, t) {
    const b = f.beat;
    if (b.card || f.shown <= cur.lastShown) return;
    for (let k = cur.lastShown; k < f.shown; k++) {
      const ch = b.text[k];
      if (blips(ch) && t - cur.lastBlip >= BLIP_GAP_S) {
        blip(b.who, ch);
        cur.lastBlip = t;
      }
    }
    cur.lastShown = f.shown;
  }

  function drawLineup(g, t) {
    const n = ROSTER_IDS.length, x0 = 230, step = (W - 2 * x0) / (n - 1);
    ROSTER_IDS.forEach((id, k) => {
      const rig = byId(id);
      sprite(id).drawAny(g, { x: x0 + k * step, y: 760, h: rig.kind === "rig" ? 330 : 250, t: t + k * 0.37 });
    });
  }

  function drawPhone(g, t, b, f, ms) {
    const { x, y, w, h: ph } = PHONE;
    const ring = ms - b.start < 600 ? Math.sin((ms - b.start) / 30) * 2.5 : 0;
    g.save();
    g.translate(x + w / 2, y + ph / 2);
    g.rotate((ring - 4) * Math.PI / 180);
    g.translate(-(x + w / 2), -(y + ph / 2));
    g.fillStyle = "#1E1A22";
    roundRect(g, x, y, w, ph, 56); g.fill();
    g.lineWidth = 6; g.strokeStyle = "#2B2233"; g.stroke();
    g.fillStyle = "#3B2F4A";
    roundRect(g, x + 22, y + 70, w - 44, ph - 140, 26); g.fill();
    g.save();
    roundRect(g, x + 22, y + 70, w - 44, ph - 140, 26); g.clip();
    const rig = byId(b.who);
    sprite(b.who).drawAny(g, { x: x + w / 2, y: y + ph - 90, h: rig && rig.kind === "rig" ? 470 : 380, t,
      emote: b.emote || "talk", talking: !f.revealed, mouth: mouthAt(b, f.shown, ms) });
    g.restore();
    g.fillStyle = "#5A4D66";
    roundRect(g, x + w / 2 - 50, y + 28, 100, 14, 7); g.fill();
    g.restore();
  }

  function draw(g, t) {
    if (!cur) return;
    const ms = clock();
    const f = frameAt(cur.c, ms);
    if (f.ended) { finish(); return; }
    if (f.index !== cur.index) setBeat(f);
    caption_(f);
    voice(f, t);
    const b = f.beat;
    if (b.show === "lineup") drawLineup(g, t);
    const enterT = t - (ms - cur.sceneStart.get(b.scene)) / 1000; // wall time (s) the scene started
    const slots = SLOTS[b.cast.length] || [];
    b.cast.forEach((id, k) => {
      const speaking = b.who === id && b.via !== "phone";
      sprite(id).drawAny(g, {
        x: slots[k], y: GROUND, h: heightFor(byId(id)), t, enterT, slideDir: slots[k] > W / 2 ? 1 : -1,
        emote: speaking ? b.emote || "talk" : "idle",
        talking: speaking && !f.revealed,
        mouth: speaking ? mouthAt(b, f.shown, ms) : undefined,
      });
    });
    if (b.via === "phone") drawPhone(g, t, b, f, ms);
    else if (b.who && b.who !== "fundacion" && !b.cast.includes(b.who)) {
      sprite(b.who).drawAny(g, { x: GUEST_X, y: GROUND, h: heightFor(byId(b.who)), t, emote: b.emote || "talk",
        talking: !f.revealed, mouth: mouthAt(b, f.shown, ms), enterT: t - (ms - b.start) / 1000, slideDir: 1 });
    }
  }

  function stop() {
    if (!cur) return;
    clearInterval(cur.heartbeat);
    clearTimeout(cur.shakeTimer);
    if (cur.mount) cur.mount.destroy();
    cur = null;
    root.classList.add("hidden");
    root.classList.remove("shake", "alarm-on", "is-riddle");
    document.documentElement.classList.remove("story-on", "story-show-meter");
  }

  function finish() {
    if (!cur) return;
    remember(gameId, cur.key);
    fx(true);
    stop();
  }

  function start(key, state) {
    const ids = playlistFor(key, state);
    if (!ids.length) return;
    const c = compile(ids, varsFor(state));
    const sceneStart = new Map();
    for (const b of c.beats) if (!sceneStart.has(b.scene)) sceneStart.set(b.scene, b.start);
    cur = { key, c, base: nowMs(), index: -1, lastShown: 0, lastBlip: 0, sceneStart, mount: null, heartbeat: 0, shakeTimer: 0 };
    root.classList.remove("hidden");
    document.documentElement.classList.add("story-on");
    card.classList.add("hidden");
    caption.classList.add("hidden");
    cur.mount = sprite(ROSTER_IDS[0]).mount(stage, { w: W, h: H, className: "story-canvas", driver: (g, t) => draw(g, t) });
    cur.heartbeat = setInterval(() => fx(false), HEARTBEAT_MS);
  }

  function next() {
    if (!cur) return;
    const target = nextStop(cur.c, clock());
    cur.base = nowMs() - target;
    if (target >= cur.c.total) finish();
  }

  root.addEventListener("click", (e) => { if (e.target !== skipBtn) next(); });
  skipBtn.addEventListener("click", (e) => { e.stopPropagation(); finish(); });
  document.addEventListener("keydown", (e) => {
    if (!cur || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); next(); }
    else if (e.key === "Escape") { e.preventDefault(); finish(); }
  });

  return {
    /** Plays the story of the state's key once per game; a new key stops the old one. */
    sync(state) {
      const key = storyKeyFor(state);
      if (cur && cur.key === key) return;
      stop();
      if (key && !remembered(gameId, key)) start(key, state);
    },
    active: () => !!cur,
    key: () => (cur ? cur.key : null),
    next,
    skip: finish,
  };
}
