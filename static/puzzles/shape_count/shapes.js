// Room 3 shapes as inline SVG, shared by the TV field and the phone badge. Pure geometry: no art code, no clock.
const NS = "http://www.w3.org/2000/svg";
const INK = "#2B2233";

// Shape colours (the server sends an index). They are a distractor: only the kind counts.
export const PALETTE = ["#E8AA38", "#D9643A", "#3A9C98", "#5B7AA3", "#E27A92", "#6E9F58", "#9A6AC0", "#F2D23C"];

function starPoints(points = 5, outer = 0.5, inner = 0.21) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`);
  }
  return out.join(" ");
}

// Unit shapes centred on (0, 0), about 1 unit across.
const GEOMETRY = {
  circle: ["circle", { r: 0.45 }],
  square: ["rect", { x: -0.4, y: -0.4, width: 0.8, height: 0.8, rx: 0.05 }],
  diamond: ["polygon", { points: "0,-0.5 0.32,0 0,0.5 -0.32,0" }],
  triangle: ["polygon", { points: "0,-0.47 0.48,0.38 -0.48,0.38" }],
  star: ["polygon", { points: starPoints() }],
  heart: ["path", { d: "M0,0.42 C-0.55,0.06 -0.44,-0.42 -0.2,-0.42 C-0.08,-0.42 0,-0.33 0,-0.22 C0,-0.33 0.08,-0.42 0.2,-0.42 C0.44,-0.42 0.55,0.06 0,0.42 Z" }],
  cross: ["polygon", { points: "-0.14,-0.46 0.14,-0.46 0.14,-0.14 0.46,-0.14 0.46,0.14 0.14,0.14 0.14,0.46 -0.14,0.46 -0.14,0.14 -0.46,0.14 -0.46,-0.14 -0.14,-0.14" }],
  moon: ["path", { d: "M0.23,-0.45 A0.45,0.45 0 0,0 0.23,0.45 A0.6,0.6 0 0,1 0.23,-0.45 Z" }],
};

export function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

/** One shape as an SVG <g> at (x, y) in the parent's units, `scale` units across. */
export function shapeNode(kind, { x = 0, y = 0, scale = 1, rot = 0, color = PALETTE[0], stroke = 0.06 } = {}) {
  const [tag, attrs] = GEOMETRY[kind] || GEOMETRY.circle;
  const g = svgEl("g", { transform: `translate(${x} ${y}) rotate(${rot}) scale(${scale})`, class: `shape shape-${kind}` });
  g.append(svgEl(tag, { ...attrs, fill: color, stroke: INK, "stroke-width": stroke, "stroke-linejoin": "round" }));
  return g;
}

/** A standalone <svg> icon of a kind (phone badge, TV name tags). */
export function shapeIcon(kind, { color = PALETTE[0], cls = "shape-icon" } = {}) {
  const svg = svgEl("svg", { viewBox: "-0.6 -0.6 1.2 1.2", class: cls, "aria-hidden": "true", focusable: "false" });
  svg.append(shapeNode(kind, { color, stroke: 0.07 }));
  return svg;
}
