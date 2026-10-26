// Room 2 "Un, dos, tres... ¡Tralalero!" - phone controller. Contract: mount(root, ctx), update(view, state), unmount().
// Hold the big button to swim, let go when Tralalero turns. Once you have arrived the button becomes a distraction.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { mountPad, BIT } from "/static/js/shared/input.js";
import { createIdentity } from "/static/js/play/identity.js";
import { play, vibrate } from "/static/js/shared/audio.js";

const SWIM = [{ bit: BIT.R, label: "NADAR", aria: "Nadar hacia Tralalero", cls: "pad-swim" }];
const DISTRACT = [{ bit: BIT.A, label: "DISTRAER", aria: "Distraer a Tralalero", cls: "pad-distract" }];

let st = null;

function mountButtons(arrived) {
  if (st.pad) st.pad.destroy();
  st.arrived = arrived;
  st.pad = mountPad(st.padHost, st.ctx, { buttons: arrived ? DISTRACT : SWIM });
  if (st.paused) st.pad.pause(true);
}

export function mount(root, ctx) {
  const heading = h("p", { class: "lead" }, "");
  const hint = h("p", { class: "muted" }, "");
  const padHost = h("div", { class: "pad-host" });
  const who = createIdentity(padHost);
  fill(root, title("¡Tralalero!", { cls: "phone-title" }), who.el, panel([heading, hint], { cls: "phone-panel" }), padHost);
  st = { ctx, padHost, heading, hint, who, pad: null, arrived: null, paused: false };
  mountButtons(false);
}

export function update(view, state) {
  if (!st) return;
  st.who.update(state, st.ctx.playerId());
  const arrived = !!view.you_arrived;
  if (arrived !== st.arrived) mountButtons(arrived);
  if (arrived) {
    st.heading.textContent = "¡Has llegado!";
    st.hint.textContent = "Pulsa para distraer a Tralalero y ayudar a los demás. Nadie puede cazarte ya.";
  } else {
    st.heading.textContent = "Mantén pulsado para nadar";
    st.hint.textContent = "Suelta en cuanto Tralalero se gire, o volverás al principio.";
  }
}

// Effects the TV sends: a buzz and a sound when you are caught or arrive.
export function onFx(fx) {
  if (fx.kind === "fail" || fx.kind === "caught") { play("caught"); vibrate([160, 60, 160]); }
  else if (fx.kind === "ring" || fx.kind === "win") { play(fx.kind); vibrate(60); }
  else if (fx.kind === "warn") vibrate(40);
}

export function onTvOnline(online) {
  if (!st) return;
  st.paused = !online;
  st.pad.pause(st.paused); // never send input to a TV that is not there
}

export function resend() {
  if (st) st.pad.resend();
}

export function unmount() {
  if (!st) return;
  st.pad.destroy();
  st = null;
}
