// Room 4 "Trivia de las Backrooms" - TV view. Contract: mount(root, ctx), update(view, state), unmount().
// The TV shows the question, who voted what and who is still missing. The answer only goes in when everybody agrees;
// the right option never reaches the TV before the reveal. Ballerina Cappuccina hosts from the corner.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title, pill } from "/static/js/ui/kit.js";
import { play } from "/static/js/shared/audio.js";

const LETTERS = "ABCD";
let st = null;

function optionCard(i, text) {
  const voters = h("div", { class: "players trivia-voters" });
  const el = h("div", { class: "trivia-option", "data-slot": String(i) },
    h("span", { class: "trivia-letter" }, LETTERS[i]),
    h("span", { class: "trivia-text" }, text),
    voters);
  return { el, voters };
}

function statusText(view) {
  const r = view.reveal;
  if (r) return r.ok ? "¡Correcto!" : `Incorrecto: era la ${LETTERS[r.answer]}.${r.penalty ? ` +${r.penalty}% de brainrot.` : ""}`;
  if (view.locking) return `¡Todos con la ${LETTERS[view.lock_choice]}! Enviando...`;
  if (view.waiting.length) return `Falta por votar: ${view.waiting.join(", ")}.`;
  return "No estáis de acuerdo: la respuesta solo se envía cuando todos votáis lo mismo.";
}

export function mount(root, ctx) {
  const meta = h("p", { class: "lead" }, "");
  const dots = h("div", { class: "trivia-dots", "aria-hidden": "true" });
  const question = h("p", { class: "trivia-q" }, "");
  const grid = h("div", { class: "trivia-grid" });
  const status = h("p", { class: "trivia-status", role: "status" }, "");
  const lock = h("div", { class: "trivia-lock", "aria-hidden": "true" });
  const fact = h("p", { class: "trivia-fact" }, "");
  fill(root, title("Trivia de las Backrooms"),
    panel([h("div", { class: "trivia-top" }, meta, dots), question, grid, status, lock, fact], { cls: "stack trivia-panel" }));
  st = { ctx, meta, dots, question, grid, status, lock, fact, cards: [], epoch: null, locking: false, revealed: false, host: null, mount: null, phase: null };
  const sprite = ctx && ctx.sprite ? ctx.sprite("ballerina") : null;
  if (sprite) {
    const me = st;
    me.host = h("div", { class: "guardian-stage", "aria-hidden": "true" });
    root.append(me.host);
    me.mount = sprite.mount(me.host, {
      w: 700, h: 700,
      driver: (g, t) => sprite.drawAny(g, { x: 350, y: 690, h: 640, t, emote: me.wrong ? "scary" : "idle" }),
    });
  }
}

export function update(view) {
  if (!st) return;
  if (view.epoch !== st.epoch) {
    st.epoch = view.epoch;
    st.question.textContent = view.question;
    st.cards = view.options.map((text, i) => optionCard(i, text));
    fill(st.grid, st.cards.map((c) => c.el));
    st.locking = false;
    st.revealed = false;
  }
  st.meta.textContent = `Pregunta ${view.number} · Aciertos: ${view.right} de ${view.goal}`;
  fill(st.dots, Array.from({ length: view.goal }, (_, i) => h("span", { class: i < view.right ? "on" : "" })));
  const r = view.reveal;
  st.cards.forEach((c, i) => {
    fill(c.voters, view.votes[i].map((name) => pill(name)));
    c.el.classList.toggle("locked", !r && view.locking && view.lock_choice === i);
    c.el.classList.toggle("right", !!r && r.answer === i);
    c.el.classList.toggle("wrong", !!r && !r.ok && r.choice === i);
  });
  st.status.textContent = statusText(view);
  if (view.locking && !st.locking) {
    // restart the countdown bar: a fresh element replays its CSS animation
    const bar = h("div", { class: "trivia-lock on", style: `--lock-ms:${view.lock_ms}ms`, "aria-hidden": "true" });
    st.lock.replaceWith(bar);
    st.lock = bar;
    play("tick");
  } else if (!view.locking && st.lock.classList.contains("on")) {
    const bar = h("div", { class: "trivia-lock", "aria-hidden": "true" });
    st.lock.replaceWith(bar);
    st.lock = bar;
  }
  st.locking = view.locking;
  st.fact.textContent = r ? r.fact : "";
  if (r && !st.revealed) play(r.ok ? "correct" : "wrong"); // quiz-show ding / buzzer
  st.revealed = !!r;
  st.wrong = !!r && !r.ok;
}

// A wrong answer is shown in place (the reveal says it): no full-screen overlay over the right option.
export function onEvent(ev) {
  return !!st && ev.name === "round_failed";
}

export function unmount() {
  if (!st) return;
  if (st.mount) st.mount.destroy();
  if (st.host) st.host.remove();
  st = null;
}
