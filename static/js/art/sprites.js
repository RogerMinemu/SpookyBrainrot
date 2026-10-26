// Sprites: the compositor between the pure puppet (ops) and a 2D canvas. `sprite(id)` returns a handle that
// replays the puppet ops with drawImage from the decoded atlas, or, until the atlas is ready (or with ?art=off,
// a failed plate, a lost context), the flat-ink silhouette in the SAME canvas, so nothing shifts when art lands.
//
// Handle:  { id, ready, draw(g, opts) -> bool, drawAny(g, opts) -> bool(art?), mount(el, { w, h, driver }) }
// opts:    { x, y, h, t, emote, mouth, talking, dance, flip, degradation, reduced, enterT, exitT, takeT, lungeT, pose }
//          (x, y) = ground point under the character, h = height in canvas px (default: the rig's box height).
// Decoded budget: 3 rigs x 2 variants x 4 MiB + 5 cameos x 2 x 2 MiB = 44 MiB (kept by boot.js, never copied).
import { byId } from "./roster.js";
import { poseOps, silhouetteOps } from "./puppet.js";

/** Nameless character used for unknown ids: a plain ink blob with eyes, never an error. */
const GENERIC = {
  id: "?", name: "?", kind: "cameo", seed: 0.5, box: { w: 400, h: 600 }, foot: 0,
  sil: { shapes: [["ell", 0, -200, 300, 400], ["ell", 0, -480, 240, 220]], eyes: [[-36, -490], [36, -490]], eyeR: 12 },
};

const TRI = (g, w, h) => { g.moveTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); };

function drawSilhouette(g, res) {
  for (const op of res.ops) {
    g.save();
    g.transform(op.m[0], op.m[1], op.m[2], op.m[3], op.m[4], op.m[5]);
    g.fillStyle = op.fill;
    g.beginPath();
    if (op.op === "eye") {
      g.shadowColor = op.fill; g.shadowBlur = op.glow || 0;
      g.arc(0, 0, op.r, 0, Math.PI * 2);
    } else if (op.kind === "ell") g.ellipse(0, 0, op.w / 2, op.h / 2, 0, 0, Math.PI * 2);
    else if (op.kind === "tri") TRI(g, op.w, op.h);
    else g.rect(-op.w / 2, -op.h / 2, op.w, op.h);
    g.fill();
    g.restore();
  }
}

function drawAtlas(g, img, res) {
  for (const op of res.ops) {
    const c = op.cell;
    g.save();
    g.transform(op.m[0], op.m[1], op.m[2], op.m[3], op.m[4], op.m[5]);
    g.drawImage(img, c[0], c[1], c[2], c[3], -op.px, -op.py, c[2], c[3]);
    g.restore();
  }
}

/**
 * deps: { atlas(id, variant) -> image | null, art() -> bool (painted art usable right now) }
 */
export function createSprites({ atlas, art }) {
  const handles = new Map();
  let degradation = 0;
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const nowSec = () => (typeof performance !== "undefined" ? performance.now() / 1000 : 0);

  function render(g, id, rig, o, silhouette) {
    const t = o.t != null ? o.t : nowSec();
    const state = { ...o, reduced: o.reduced != null ? o.reduced : !!(mq && mq.matches), degradation: o.degradation != null ? o.degradation : degradation };
    const res = silhouette ? silhouetteOps(rig, state, t) : poseOps(rig, state, t);
    const s = (o.h != null ? o.h : rig.box.h) / rig.box.h;
    g.save();
    g.globalAlpha *= res.alpha;
    g.translate(o.x || 0, (o.y || 0) - (rig.foot || 0) * s);
    g.scale(s, s);
    if (silhouette) drawSilhouette(g, res);
    else {
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      drawAtlas(g, atlas(id, res.variant) || atlas(id, 0), res);
    }
    g.restore();
  }

  function make(id) {
    const rig = byId(id) || GENERIC;
    const h = {
      id, rig,
      get ready() { return !!art() && !!atlas(id, 0); },
      /** Painted draw. Returns false (and draws nothing) when the atlas is not ready. */
      draw(g, o = {}) {
        if (!h.ready) return false;
        render(g, id, rig, o, false);
        return true;
      },
      /** Painted draw, or the silhouette in the same place. Returns true when it was the painted art. */
      drawAny(g, o = {}) {
        const ok = h.ready;
        render(g, id, rig, o, !ok);
        return ok;
      },
      /**
       * One 2D canvas inside `el`. driver(g, t, dt, { w, h }) is called every frame on a cleared canvas and
       * draws with any number of handles. Returns { canvas, destroy() }.
       */
      mount(el, { w = 1920, h: ch = 1080, driver, className = "cast-canvas" } = {}) {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = ch; canvas.className = className;
        canvas.setAttribute("aria-hidden", "true");
        el.append(canvas);
        const g = canvas.getContext("2d");
        let raf = 0, alive = true, last = 0;
        const tick = (now) => {
          if (!alive) return;
          const t = now / 1000;
          g.clearRect(0, 0, w, ch);
          if (driver) driver(g, t, last ? t - last : 0, { w, h: ch });
          last = t;
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return {
          canvas,
          destroy() { alive = false; cancelAnimationFrame(raf); canvas.remove(); },
        };
      },
    };
    return h;
  }

  return {
    sprite(id) {
      let hnd = handles.get(id);
      if (!hnd) { hnd = make(id); handles.set(id, hnd); }
      return hnd;
    },
    /** Brainrot band -> boil speed (0..2). */
    setDegradation(n) { degradation = Math.max(0, Math.min(2, n | 0)); },
  };
}
