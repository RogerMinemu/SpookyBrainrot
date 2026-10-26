// Room 7 "Sahur dice" - phone controller. Contract: mount(root, ctx), update(view, state), unmount().
// A phone only ever knows its own drums (view.drums = ids) and the phase: the sequence is on the TV alone.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { play, vibrate } from "/static/js/shared/audio.js";

let st = null;

const TEXT = {
  show: ["Mirad la tele", "Sahur está tocando. Memorizad la secuencia."],
  input: ["¡Vuestro turno!", "Tocad vuestros tambores solo cuando toque, y solo lo que Sahur dijo."],
  pass: ["¡Bien hecho!", "Preparaos para la siguiente ronda."],
  fail: ["¡Habéis fallado!", "Mirad la tele: empieza otra secuencia."],
};

function drumButton(id, ctx) {
  const btn = h("button", { class: "btn drum-btn", type: "button", "aria-label": `Tambor ${id + 1}` },
    h("span", { class: "drum-n" }, String(id + 1)));
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.classList.add("down");
    play("drum", { freq: 110 * Math.pow(1.19, id) });
    vibrate(30);
    ctx.send({ type: "hit", drum: id });
  });
  const up = () => btn.classList.remove("down");
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) btn.addEventListener(ev, up);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  return btn;
}

export function mount(root, ctx) {
  const heading = h("p", { class: "lead" }, "");
  const hint = h("p", { class: "muted" }, "");
  const drums = h("div", { class: "drum-row" });
  fill(root, title("Sahur dice", { cls: "phone-title" }), panel([heading, hint], { cls: "phone-panel" }), drums);
  st = { ctx, heading, hint, drums, sig: null };
  // /admin/demo seat: a bot taps a drum through the real button handler (sound, haptics and the WS command)
  if (window.__sb) {
    window.__sb.hit = (id) => {
      const btn = st && st.drums.querySelector(`[aria-label="Tambor ${id + 1}"]`);
      if (!btn) return false;
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
      return true;
    };
  }
}

export function update(view) {
  if (!st) return;
  const [head, hint] = TEXT[view.phase] || TEXT.show;
  st.heading.textContent = `${head} (ronda ${view.round} de ${view.rounds})`;
  st.hint.textContent = view.drums.length ? hint : "Ahora mismo no tienes ningún tambor.";
  const sig = view.drums.join(",");
  if (sig !== st.sig) {
    st.sig = sig;
    fill(st.drums, view.drums.map((id) => drumButton(id, st.ctx)));
  }
  st.drums.classList.toggle("idle", view.phase !== "input");
}

export function onFx(fx) {
  play(fx.kind, fx.data);
}

export function unmount() {
  if (window.__sb) window.__sb.hit = null;
  st = null;
}
