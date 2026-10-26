// Room 7 "Sahur dice" - TV view. Contract: mount(root, ctx), update(view, state), unmount().
// The TV is the only screen that knows the sequence. It plays the show locally (timing comes with the view)
// and, when it mounts in the middle of a show, asks the server to restart it (handle_tv replay + epoch).
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { play } from "/static/js/shared/audio.js";

let st = null;

const freqOf = (drum) => 110 * Math.pow(1.19, drum);
const SAYS = "¡Sahur dice";

function drumEl(d) {
  return h("div", { class: "sahur-drum", "data-drum": String(d.id) },
    h("span", { class: "sahur-drum-n" }, String(d.id + 1)),
    h("span", { class: "sahur-drum-owners" }, d.owners.join(", ")));
}

function flash(drum, ms = 560) {
  const el = st.drumEls[drum];
  if (!el) return;
  el.classList.add("hit");
  st.timers.push(setTimeout(() => el.classList.remove("hit"), ms));
}

function cancelShow() {
  st.timers.forEach(clearTimeout);
  st.timers = [];
  st.drumEls.forEach((el) => el.classList.remove("hit"));
}

/** Flash the prompts one by one. A trap is announced WITHOUT "¡Sahur dice!". */
function runShow(view) {
  const { lead, step } = view.timing;
  st.cue.textContent = "Atentos...";
  view.seq.forEach((s, i) => {
    st.timers.push(setTimeout(() => {
      st.cue.textContent = s.trap ? `Tambor ${s.drum + 1}` : `${SAYS}: tambor ${s.drum + 1}!`;
      flash(s.drum, step * 0.6);
      play("drum", { freq: freqOf(s.drum) });
    }, lead + i * step));
  });
  st.timers.push(setTimeout(() => { st.cue.textContent = "Preparaos..."; }, lead + view.seq.length * step));
}

function renderStatus(view) {
  const need = view.seq.filter((s) => !s.trap).length;
  st.round.textContent = `Ronda ${view.round} de ${view.rounds}`;
  if (view.phase === "input") {
    st.cue.textContent = "¡Vuestro turno!";
    st.hint.textContent = `Repetid solo lo que dijo Sahur: ${view.hits.length}/${need}`;
  } else if (view.phase === "pass") {
    st.cue.textContent = "¡Bien hecho!";
    st.hint.textContent = "Preparaos para la siguiente ronda.";
  } else if (view.phase === "fail") {
    st.cue.textContent = "¡Habéis fallado!";
    st.hint.textContent = "Nueva secuencia en un momento.";
  } else {
    st.hint.textContent = "Cada uno toca solo sus tambores. Solo cuenta lo que Sahur diga con «¡Sahur dice!».";
  }
}

export function mount(root, ctx) {
  const round = h("p", { class: "lead" }, "");
  const cue = h("p", { class: "sahur-cue", role: "status" }, "");
  const hint = h("p", { class: "muted" }, "");
  const drums = h("div", { class: "sahur-drums" });
  fill(root, title("Sahur dice"), panel([round, cue, drums, hint], { cls: "stack sahur-panel" }));
  st = { ctx, round, cue, hint, drums, drumEls: [], timers: [], epoch: null, hits: 0, asked: false, phase: "show", host: null, mount: null };
  // the painted Sahur keeps watch from the corner (flat silhouette until his plate is ready, same canvas)
  const sprite = ctx && ctx.sprite ? ctx.sprite("sahur") : null;
  if (sprite) {
    const me = st;
    me.host = h("div", { class: "sahur-stage", "aria-hidden": "true" });
    root.append(me.host);
    me.mount = sprite.mount(me.host, {
      w: 640, h: 900,
      driver: (g, t) => {
        const talking = me.phase === "show";
        const emote = me.phase === "pass" ? "happy" : me.phase === "fail" ? "angry" : talking ? "talk" : "idle";
        const mouth = talking ? ["closed", "mid", "open", "mid"][Math.floor(t * 7) % 4] : undefined;
        sprite.drawAny(g, { x: 320, y: 880, h: 840, t, emote, mouth, talking });
      },
    });
  }
}

export function update(view) {
  if (!st) return;
  if (!st.asked) {
    st.asked = true;
    // mounted mid-show (reload, late TV): the server restarts the show clock so what we play now is what it times
    if (view.phase === "show") st.ctx.sendSim({ action: "replay", epoch: view.epoch });
  }
  const sig = view.drums.map((d) => `${d.id}:${d.owners.join("|")}`).join(";");
  if (sig !== st.sig) {
    st.sig = sig;
    st.drumEls = view.drums.map(drumEl);
    fill(st.drums, st.drumEls);
  }
  if (view.epoch !== st.epoch) {
    st.epoch = view.epoch;
    st.hits = 0;
    cancelShow();
    if (view.phase === "show") runShow(view);
  }
  if (view.hits.length > st.hits) {
    const drum = view.hits[view.hits.length - 1];
    flash(drum);
    play("drum", { freq: freqOf(drum) });
  }
  st.hits = view.hits.length;
  st.phase = view.phase;
  renderStatus(view);
}

export function unmount() {
  if (!st) return;
  cancelShow();
  if (st.mount) st.mount.destroy();
  if (st.host) st.host.remove();
  st = null;
}
