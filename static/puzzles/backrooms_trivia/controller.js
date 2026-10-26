// Room 4 "Trivia de las Backrooms" - phone controller. Contract: mount(root, ctx), update(view, state), unmount().
// Four big answers. A vote can change at any time; the answer only goes in when every phone votes the same one.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { play, vibrate } from "/static/js/shared/audio.js";

const LETTERS = "ABCD";
let st = null;

function optionButton(i, text) {
  const btn = h("button", { class: "btn trivia-btn", type: "button", "aria-label": `Respuesta ${LETTERS[i]}: ${text}` },
    h("span", { class: "trivia-letter" }, LETTERS[i]), h("span", { class: "trivia-text" }, text));
  btn.addEventListener("click", () => {
    if (!st || st.phase !== "vote") return;
    play("blip");
    vibrate(15);
    st.ctx.send({ type: "vote", option: i });
  });
  return btn;
}

export function mount(root, ctx) {
  const meta = h("p", { class: "muted" }, "");
  const question = h("p", { class: "trivia-q" }, "");
  const options = h("div", { class: "trivia-options" });
  const status = h("p", { class: "lead trivia-status", role: "status" }, "");
  const fact = h("p", { class: "muted" }, "");
  fill(root, title("Trivia", { cls: "phone-title" }), panel([meta, question, options, status, fact], { cls: "phone-panel trivia-phone" }));
  st = { ctx, meta, question, options, status, fact, buttons: [], epoch: null, phase: null };
  // /admin/demo seat: a bot votes through the real button (sound, haptics and the WS command)
  if (window.__sb) {
    window.__sb.vote = (i) => {
      const btn = st && st.buttons[i];
      if (!btn) return false;
      btn.click();
      return true;
    };
  }
}

function statusText(view) {
  const r = view.reveal;
  if (r) return r.ok ? "¡Correcto!" : `Incorrecto: era la ${LETTERS[r.answer]}.`;
  if (view.locking) return `¡Todos con la ${LETTERS[view.lock_choice]}! Enviando...`;
  if (view.mine == null) return "Hablad y votad: la respuesta se envía cuando todos votáis lo mismo.";
  if (view.voted < view.total) return `Has votado la ${LETTERS[view.mine]}. Votos: ${view.voted} de ${view.total}.`;
  return "No estáis de acuerdo. Convenceos y votad todos lo mismo.";
}

export function update(view) {
  if (!st) return;
  st.phase = view.phase;
  if (view.epoch !== st.epoch) {
    st.epoch = view.epoch;
    st.question.textContent = view.question;
    st.buttons = view.options.map((text, i) => optionButton(i, text));
    fill(st.options, st.buttons);
  }
  st.meta.textContent = `Pregunta ${view.number} · Aciertos: ${view.right} de ${view.goal}`;
  const r = view.reveal;
  st.buttons.forEach((btn, i) => {
    btn.classList.toggle("mine", view.mine === i);
    btn.classList.toggle("idle", view.phase !== "vote");
    btn.classList.toggle("right", !!r && r.answer === i);
    btn.classList.toggle("wrong", !!r && !r.ok && r.choice === i);
  });
  st.status.textContent = statusText(view);
  st.fact.textContent = r ? r.fact : "";
}

export function onFx(fx) {
  play(fx.kind, fx.data);
}

export function unmount() {
  if (window.__sb) window.__sb.vote = null;
  st = null;
}
