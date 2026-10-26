// Room 6 "Desactivad la bomba" - phone controller. Contract: mount(root, ctx), update(view, state), unmount().
// role "defuser": this phone alone has the bomb (and the whole manual only when nobody else is connected).
// role "expert": a share of the manual pages, never the bomb.
// The bomb is built once per bomb and then updated in place: rebuilding it on every clock second would drop the finger
// that is holding the button.
import { h, fill } from "/static/js/shared/dom.js";
import { panel, title } from "/static/js/ui/kit.js";
import { play, vibrate } from "/static/js/shared/audio.js";

const COLOR_HEX = { rojo: "#C8323A", azul: "#2F6FD6", amarillo: "#F2D23C", blanco: "#F4F1EA", negro: "#1E1A22" };
const STRIP_NAMES = { azul: "azul", amarillo: "amarilla", rojo: "roja", blanco: "blanca" }; // "la tira" is feminine
const TITLES = { wires: "Cables", button: "Botón", keypad: "Símbolos", password: "Contraseña" };
let st = null;

const send = (action) => st && st.ctx.send(action);

// The card class is bomb-mod-<module>: plain bomb-<module> would collide with the widget classes (.bomb-button, .bomb-keypad).
function card(module, ...body) {
  const led = h("span", { class: "bomb-led", "aria-hidden": "true" });
  const el = panel([h("h2", { class: "bomb-card-title" }, led, TITLES[module]), ...body], { cls: `phone-panel bomb-card bomb-mod-${module}` });
  return { el, led };
}

function buildWires(bomb, refs) {
  refs.wires = bomb.wires.map((w, i) => {
    const btn = h("button", { type: "button", class: "wire", style: `--wire:${COLOR_HEX[w.color] || "#888"}`, "aria-label": `Cable ${i + 1}, ${w.color}` },
      h("span", { class: "wire-n" }, String(i + 1)), h("span", { class: "wire-band" }), h("span", { class: "wire-name" }, w.color));
    btn.addEventListener("click", () => {
      if (btn.classList.contains("cut") || st.solved.has("wires")) return;
      play("snip");
      vibrate(20);
      send({ type: "cut", wire: i });
    });
    return btn;
  });
  return card("wires", h("div", { class: "wire-list" }, refs.wires));
}

function buildButton(bomb, refs) {
  const btn = h("button", { type: "button", class: "bomb-button", style: `--btn-color:${COLOR_HEX[bomb.button.color] || "#888"}`,
    "aria-label": `Botón ${bomb.button.color} que pone ${bomb.button.label}` }, h("span", {}, bomb.button.label));
  const strip = h("div", { class: "bomb-strip", role: "status" }, "Tira apagada");
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (st.holding || st.solved.has("button")) return;
    try { btn.setPointerCapture(e.pointerId); } catch (_) { /* synthetic event */ }
    st.holding = true;
    btn.classList.add("down");
    vibrate(25);
    send({ type: "button", down: true });
  });
  const release = () => {
    if (!st || !st.holding) return;
    st.holding = false;
    btn.classList.remove("down");
    send({ type: "button", down: false });
  };
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) btn.addEventListener(ev, release);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  refs.button = btn;
  refs.strip = strip;
  return card("button", h("div", { class: "bomb-button-row" }, btn, strip));
}

function buildKeypad(bomb, refs) {
  refs.keys = bomb.keypad.symbols.map((sym, i) => {
    const btn = h("button", { type: "button", class: "bomb-key", "aria-label": `Símbolo ${i + 1}: ${sym}` }, sym);
    btn.addEventListener("click", () => {
      if (btn.classList.contains("pressed") || st.solved.has("keypad")) return;
      play("blip");
      send({ type: "key", symbol: i });
    });
    return btn;
  });
  return card("keypad", h("div", { class: "bomb-keypad" }, refs.keys));
}

function buildPassword(bomb, refs) {
  refs.letters = bomb.password.letters.map(() => h("span", { class: "pw-letter" }, ""));
  const cols = refs.letters.map((letter, col) => {
    const arrow = (label, dir) => h("button", { type: "button", class: "pw-arrow", "aria-label": `${dir > 0 ? "Siguiente" : "Anterior"} letra ${col + 1}`,
      onclick: () => { if (!st.solved.has("password")) { play("tick"); send({ type: "letter", col, dir }); } } }, label);
    return h("div", { class: "pw-col" }, arrow("▲", -1), letter, arrow("▼", 1));
  });
  const submit = h("button", { type: "button", class: "btn pw-submit", onclick: () => { if (!st.solved.has("password")) send({ type: "submit" }); } }, "Enviar");
  return card("password", h("div", { class: "pw-cols" }, cols), submit);
}

function manualPage(p) {
  return h("article", { class: `manual-page manual-${p.module}` },
    h("h3", {}, p.title),
    p.lines.map((line) => h("p", {}, line)),
    p.symbols ? h("div", { class: "manual-symbols" }, p.symbols.map((s, i) => h("span", {}, h("small", {}, String(i + 1)), s))) : null,
    p.words ? h("div", { class: "manual-words" }, p.words.map((w) => h("span", {}, w))) : null);
}

function build(view) {
  const refs = { cards: {} };
  refs.clock = h("div", { class: "bomb-clock", role: "timer" }, "");
  refs.strikes = h("div", { class: "bomb-strikes", "aria-label": "Errores" });
  refs.role = h("p", { class: "lead" }, "");
  const parts = [title("Desactivad la bomba", { cls: "phone-title" }),
    panel([h("div", { class: "bomb-head" }, refs.clock, refs.strikes), refs.role], { cls: "phone-panel" })];
  const b = view.bomb;
  if (b) {
    parts.push(panel([h("p", {}, "Número de serie: ", h("strong", { class: "bomb-serial" }, b.serial)),
      h("p", {}, `Pilas: ${b.batteries} `, h("span", { "aria-hidden": "true" }, "🔋".repeat(b.batteries)))], { cls: "phone-panel bomb-edge" }));
    for (const [module, make] of [["wires", buildWires], ["button", buildButton], ["keypad", buildKeypad], ["password", buildPassword]]) {
      const c = make(b, refs);
      refs.cards[module] = c;
      parts.push(c.el);
    }
  }
  if (view.manual.length) {
    parts.push(panel([h("h2", {}, view.bomb ? "El manual entero" : "Tu parte del manual"), ...view.manual.map(manualPage)], { cls: "phone-panel manual" }));
  }
  fill(st.root, parts);
  st.refs = refs;
  st.holding = false;
}

function roleText(view) {
  if (view.phase === "boom") return "¡BUM! Bombardiro ya trae otra bomba...";
  if (view.role === "defuser" && view.experts) return "Eres el ARTIFICIERO: solo tú ves la bomba. Descríbela; los demás tienen el manual.";
  if (view.role === "defuser") return "Estás solo: tienes la bomba y el manual entero.";
  return `${view.defuser} tiene la bomba. Tú tienes ${view.manual.length} páginas del manual: escucha y busca la regla que encaje.`;
}

function refresh(view) {
  const r = st.refs;
  r.clock.textContent = view.phase === "boom" ? "¡BUM!" : view.clock;
  r.clock.classList.toggle("hurry", view.phase !== "boom" && view.left <= 30);
  fill(r.strikes, Array.from({ length: view.max_strikes }, (_, i) => h("span", { class: i < view.strikes ? "on" : "" }, "✘")));
  r.role.textContent = roleText(view);
  st.solved = new Set(view.modules.filter((m) => m.solved).map((m) => m.id));
  for (const [module, c] of Object.entries(r.cards)) {
    const done = st.solved.has(module);
    c.el.classList.toggle("solved", done);
    c.led.textContent = done ? "✔" : "";
  }
  const b = view.bomb;
  if (!b) return;
  b.wires.forEach((w, i) => r.wires[i] && r.wires[i].classList.toggle("cut", w.cut));
  r.button.classList.toggle("held", b.button.held);
  r.strip.textContent = b.button.strip ? `Tira ${STRIP_NAMES[b.button.strip] || b.button.strip}` : b.button.held ? "Mantenlo..." : "Tira apagada";
  r.strip.style.setProperty("--strip", b.button.strip ? COLOR_HEX[b.button.strip] : "transparent");
  r.strip.classList.toggle("lit", !!b.button.strip);
  r.keys.forEach((k, i) => k.classList.toggle("pressed", b.keypad.pressed.includes(i)));
  b.password.letters.forEach((ch, i) => { if (r.letters[i]) r.letters[i].textContent = ch; });
}

export function mount(root, ctx) {
  st = { ctx, root, sig: null, refs: null, holding: false, solved: new Set() };
}

export function update(view) {
  if (!st) return;
  const sig = `${view.epoch}|${view.role}|${view.bomb ? 1 : 0}|${view.manual.map((p) => p.id).join(",")}`;
  if (sig !== st.sig) {
    st.sig = sig;
    build(view);
  }
  refresh(view);
}

export function onFx(fx) {
  play(fx.kind, fx.data);
}

export function unmount() {
  if (st && st.holding) send({ type: "button", down: false });
  st = null;
}
