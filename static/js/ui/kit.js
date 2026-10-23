// UI kit: pure h() wrappers that only emit classes. All looks live in theme.css, so the
// unthemed (no art / no CSS vars) result is still plain, usable HTML. Screens never call p5.
import { h } from "/static/js/shared/dom.js";

/** Painted card. The texture is a 9-slice border-image, the content stays DOM text. */
export function panel(children, { cls = "", tag = "section", ...attrs } = {}) {
  return h(tag, { ...attrs, class: `panel ${cls}`.trim() }, children);
}

/** Chunky hand-lettered button. */
export function button(label, { onclick, cls = "", type = "button", ...attrs } = {}) {
  return h("button", { ...attrs, type, class: `btn ${cls}`.trim(), onclick }, label);
}

/** Hero title: real DOM text (Permanent Marker, ink offset) over a painted swash. */
export function title(text, { level = "h1", cls = "" } = {}) {
  return h(level, { class: `title ${cls}`.trim() }, h("span", { class: "title-text" }, text));
}

/** Player pill. `off` dims it (disconnected / let go). */
export function pill(name, { off = false } = {}) {
  return h("span", { class: "pill" + (off ? " off" : "") }, name);
}

/** Portrait frame with an empty-tolerant image slot (figure.portrait[data-cameo]). */
export function portrait({ cameo = "", src = null, caption = null } = {}) {
  return h("figure", { class: "portrait", "data-cameo": cameo },
    src ? h("img", { src, alt: cameo })
      : h("div", { class: "portrait-empty", "data-placeholder": "1" }, cameo ? h("span", { class: "portrait-name" }, cameo) : null),
    caption ? h("figcaption", {}, caption) : null);
}
