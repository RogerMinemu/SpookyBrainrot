import test from "node:test";
import assert from "node:assert/strict";
import { createSprites } from "../static/js/art/sprites.js";
import { runCharQueue } from "../static/js/art/queue.js";
import { ROSTER, ROSTER_IDS, ROOM_GUARDIAN, RIG_CELLS, CAMEO_CELLS, RIG_ATLAS, CAMEO_ATLAS, allCells, atlasOf, byId, plateQueue } from "../static/js/art/roster.js";
import { CHAR_RECIPES } from "../static/js/art/rigs.js";
import { PLATE_SPECS, RECIPES, CHAR_PLATE } from "../static/js/art/plates.js";
import { createEngine } from "../static/js/art/engine.js";

// ---- a recording 2D context ------------------------------------------------------------------------------
function fakeCtx() {
  const log = [];
  const g = {
    log, globalAlpha: 1,
    save() { log.push(["save"]); }, restore() { log.push(["restore"]); },
    translate(x, y) { log.push(["translate", x, y]); }, scale(x, y) { log.push(["scale", x, y]); },
    transform(...m) { log.push(["transform", ...m]); },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    ellipse() { log.push(["ellipse"]); }, arc() { log.push(["arc"]); }, rect() { log.push(["rect"]); },
    fill() { log.push(["fill"]); }, clearRect() { log.push(["clear"]); },
    drawImage(...a) { log.push(["drawImage", ...a.slice(1)]); },
  };
  return g;
}
const count = (g, k) => g.log.filter((e) => e[0] === k).length;

function makeSprites(opts = {}) {
  const atlases = new Map();
  let art = !!opts.art;
  const api = createSprites({ atlas: (id, v) => atlases.get(`${id}:${v}`) || null, art: () => art });
  return { api, atlases, setArt(v) { art = v; } };
}

// ---- sprite handle -----------------------------------------------------------------------------------------
test("sprite: draw() is false before the atlas is ready and paints nothing", () => {
  const { api } = makeSprites({ art: true });
  const g = fakeCtx();
  const sp = api.sprite("tralalero");
  assert.equal(sp.ready, false);
  assert.equal(sp.draw(g, { x: 100, y: 200, h: 300, t: 1 }), false);
  assert.equal(g.log.length, 0);
});

test("sprite: drawAny() falls back to the flat silhouette (fills + glowing eyes) while not ready", () => {
  const { api } = makeSprites({ art: true });
  const g = fakeCtx();
  const painted = api.sprite("sahur").drawAny(g, { x: 100, y: 200, h: 300, t: 1.3 });
  assert.equal(painted, false);
  assert.equal(count(g, "drawImage"), 0);
  assert.ok(count(g, "fill") >= byId("sahur").sil.shapes.length);
});

test("sprite: ?art=off keeps the silhouette even when an atlas exists", () => {
  const { api, atlases } = makeSprites({ art: false });
  atlases.set("patapim:0", {});
  const g = fakeCtx();
  const sp = api.sprite("patapim");
  assert.equal(sp.ready, false);
  assert.equal(sp.draw(g, {}), false);
  assert.equal(sp.drawAny(g, { t: 2 }), false);
  assert.equal(count(g, "drawImage"), 0);
});

test("sprite: with the atlas ready draw() replays every part with drawImage and returns true", () => {
  const { api, atlases, setArt } = makeSprites({ art: false });
  const img0 = { name: "v0" }, img1 = { name: "v1" };
  atlases.set("tralalero:0", img0);
  setArt(true);
  const sp = api.sprite("tralalero");
  assert.equal(sp.ready, true);
  const g = fakeCtx();
  assert.equal(sp.draw(g, { x: 500, y: 700, h: 560, t: 0.05, emote: "talk", mouth: "open" }), true);
  assert.equal(count(g, "drawImage"), byId("tralalero").parts.length);
  assert.equal(g.globalAlpha, 1, "alpha is restored");
  // variant 1 is used when present (boil), else v0 keeps being drawn
  atlases.set("tralalero:1", img1);
  const seen = new Set();
  for (let t = 0; t < 1; t += 0.02) {
    const g2 = { ...fakeCtx() };
    g2.drawImage = (img) => seen.add(img.name);
    sp.draw(g2, { t });
  }
  assert.deepEqual([...seen].sort(), ["v0", "v1"]);
});

test("sprite: a cameo draws a single scary cell; unknown ids never throw", () => {
  const { api, atlases } = makeSprites({ art: true });
  atlases.set("bombardiro:0", {});
  const g = fakeCtx();
  api.sprite("bombardiro").draw(g, { t: 1, emote: "scary", lungeT: 0.9 });
  const di = g.log.filter((e) => e[0] === "drawImage");
  assert.equal(di.length, 1);
  assert.deepEqual(di[0].slice(1, 5), CAMEO_CELLS.scary);
  const u = api.sprite("nobody");
  assert.equal(u.ready, false);
  assert.doesNotThrow(() => u.drawAny(fakeCtx(), { x: 1, y: 1, h: 100, t: 0 }));
});

test("sprite: mount() makes ONE canvas, drives it every frame and cleans up", () => {
  const frames = [];
  const canvas = { width: 0, height: 0, style: {}, setAttribute() {}, removed: false, remove() { this.removed = true; }, getContext: () => fakeCtx() };
  const host = { children: [], append(c) { this.children.push(c); } };
  let rafCb = null, rafId = 0;
  globalThis.document = { createElement: (tag) => { assert.equal(tag, "canvas"); return canvas; } };
  globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return ++rafId; };
  globalThis.cancelAnimationFrame = () => { rafCb = null; };
  try {
    const { api } = makeSprites({ art: false });
    const sp = api.sprite("lirili");
    const m = sp.mount(host, { w: 640, h: 480, driver: (g, t, dt, size) => frames.push([t, size.w, size.h]) });
    assert.equal(host.children.length, 1);
    assert.equal(canvas.width, 640);
    rafCb(1000); rafCb(1016);
    assert.equal(frames.length, 2);
    assert.deepEqual(frames[0].slice(1), [640, 480]);
    m.destroy();
    assert.equal(canvas.removed, true);
    assert.equal(rafCb, null);
  } finally {
    delete globalThis.document; delete globalThis.requestAnimationFrame; delete globalThis.cancelAnimationFrame;
  }
});

// ---- plate queue order / stale / pause -----------------------------------------------------------------------
test("queue order: the room guardian v0, v1, then the others v0, then the others v1", () => {
  const q = plateQueue("poolrooms");
  assert.deepEqual(q.slice(0, 2), [{ id: "tralalero", variant: 0 }, { id: "tralalero", variant: 1 }]);
  assert.equal(q.length, 16);
  const rest = q.slice(2);
  assert.ok(rest.slice(0, 7).every((j) => j.variant === 0 && j.id !== "tralalero"));
  assert.ok(rest.slice(7).every((j) => j.variant === 1 && j.id !== "tralalero"));
  assert.deepEqual(ROOM_GUARDIAN, { backrooms: "patapim", poolrooms: "tralalero", mall: "lirili", site19: "ballerina", hangar: "bombardiro", sahur: "sahur" });
  assert.equal(plateQueue("backrooms")[0].id, "patapim");
  assert.equal(plateQueue("sahur")[0].id, "sahur");
  for (const [room, id] of [["mall", "lirili"], ["site19", "ballerina"], ["hangar", "bombardiro"]]) {
    const r = plateQueue(room);
    assert.deepEqual(r.slice(0, 2), [{ id, variant: 0 }, { id, variant: 1 }], room);
    assert.equal(new Set(r.map((j) => `${j.id}:${j.variant}`)).size, 16, room);
  }
  // a room without a guardian: every character v0 first, then every v1; every (id, variant) exactly once
  const p = plateQueue("prologue");
  assert.equal(p.length, 16);
  assert.ok(p.slice(0, 8).every((j) => j.variant === 0) && p.slice(8).every((j) => j.variant === 1));
  assert.equal(new Set(p.map((j) => `${j.id}:${j.variant}`)).size, 16);
});

test("queue runner: paints in order, one at a time, and finishes", async () => {
  const done = [];
  let busy = 0, maxBusy = 0;
  const ok = await runCharQueue({
    order: plateQueue("sahur"), alive: () => true, paused: () => false, sleep: async () => {},
    paint: async (id, v) => { busy++; maxBusy = Math.max(maxBusy, busy); await Promise.resolve(); done.push(`${id}:${v}`); busy--; return true; },
  });
  assert.equal(ok, true);
  assert.equal(done.length, 16);
  assert.equal(maxBusy, 1);
  assert.equal(done[0], "sahur:0");
});

test("queue runner: waits while realtime is on (no paint, no hitch) and resumes after", async () => {
  let paused = true, sleeps = 0;
  const painted = [];
  const run = runCharQueue({
    order: [{ id: "sahur", variant: 0 }, { id: "patapim", variant: 0 }], alive: () => true, paused: () => paused,
    sleep: async () => { sleeps++; if (sleeps === 3) paused = false; },
    paint: async (id) => { painted.push(id); return true; },
  });
  assert.equal(await run, true);
  assert.ok(sleeps >= 3);
  assert.deepEqual(painted, ["sahur", "patapim"]);
});

test("queue runner: a stale queue stops, and a plate that lands late is NOT registered by it", async () => {
  let epoch = 1;
  const registered = [];
  const alive = () => epoch === 1;
  const ok = await runCharQueue({
    order: plateQueue("backrooms"), alive, paused: () => false, sleep: async () => {},
    paint: async (id, v) => {
      if (id === "patapim" && v === 1) epoch = 2; // the room changed while this plate was painting
      await Promise.resolve();
      if (!alive()) return false; // late: painter cache keeps it, but this old queue registers nothing
      registered.push(`${id}:${v}`);
      return true;
    },
  });
  assert.equal(ok, false);
  assert.deepEqual(registered, ["patapim:0"]);
});

// ---- the painted recipes, against a recording engine ------------------------------------------------------------
function recordingEngine(w, h) {
  globalThis.brush = {};
  const p = { random: () => 0.5, randomSeed() {}, push() {}, pop() {}, translate() {}, resetMatrix() {} };
  const E = createEngine(p, { w, h });
  const shapes = [], lines = [];
  E.paint = (pts, o) => { shapes.push({ pts, o }); };
  E.inkLine = (pts) => { lines.push({ pts }); };
  E.flushBrush = () => {};
  E.jit = () => 0;
  E.boilSeed = () => {};
  return { E, shapes, lines };
}
const bbox = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

test("recipes: every roster id has a painter recipe and a global char plate of the atlas size", () => {
  assert.deepEqual(Object.keys(CHAR_RECIPES).sort(), [...ROSTER_IDS].sort());
  for (const r of ROSTER) {
    const spec = PLATE_SPECS[CHAR_PLATE(r.id)];
    assert.ok(spec && spec.global === true, r.id);
    assert.deepEqual(spec.size({}), [atlasOf(r).w, atlasOf(r).h]);
    assert.equal(typeof RECIPES[CHAR_PLATE(r.id)], "function");
  }
  assert.ok(atlasOf(byId("sahur")) === RIG_ATLAS && atlasOf(byId("trippi")) === CAMEO_ATLAS);
});

test("recipes: every shape stays inside its cell (art never bleeds into a neighbour) and the brush-call budget holds", () => {
  const bad = [];
  for (const r of ROSTER) {
    const atlas = atlasOf(r);
    const cells = allCells(r.kind === "rig" ? RIG_CELLS : CAMEO_CELLS);
    const { E, shapes, lines } = recordingEngine(atlas.w, atlas.h);
    for (const variant of [0, 1]) {
      shapes.length = 0; lines.length = 0;
      E.setBoil(variant);
      CHAR_RECIPES[r.id](E);
      assert.ok(shapes.length + lines.length > 20, `${r.id} paints something`);
      assert.ok(shapes.length + lines.length <= 260, `${r.id} budget: ${shapes.length + lines.length} calls`);
      for (const { pts } of [...shapes, ...lines]) {
        if (!pts.length) continue;
        const b = bbox(pts);
        assert.ok(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), `${r.id} finite`);
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        const cell = cells.find(([, c]) => cx >= c[0] && cx < c[0] + c[2] && cy >= c[1] && cy < c[1] + c[3]);
        if (!cell) { bad.push(`${r.id} v${variant}: outside every cell at ${Math.round(cx)},${Math.round(cy)}`); continue; }
        const [name, c] = cell;
        const slack = 6; // the 12 px gutter minus the boil wobble
        if (!(b.x0 >= c[0] + slack && b.y0 >= c[1] + slack && b.x1 <= c[0] + c[2] - slack && b.y1 <= c[1] + c[3] - slack)) {
          bad.push(`${r.id} v${variant} ${name}: ${[b.x0 - c[0], b.y0 - c[1], b.x1 - c[0], b.y1 - c[1]].map(Math.round)} in ${c[2]}x${c[3]}`);
        }
      }
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("recipes: no translucent fills on a transparent plate and no brush texture (they leave pale ragged wedges)", () => {
  for (const r of ROSTER) {
    const atlas = atlasOf(r);
    const { E, shapes } = recordingEngine(atlas.w, atlas.h);
    CHAR_RECIPES[r.id](E);
    for (const { o } of shapes) {
      if (o.fill) {
        assert.ok(o.wash, `${r.id}: a fill needs an opaque wash under it`);
        assert.ok(!o.tex && !o.border, `${r.id}: fill texture/border`);
      }
      if (o.wash) assert.ok((o.washOp ?? 255) >= 90, `${r.id}: translucent wash ${o.washOp}`);
    }
  }
});

test("recipes: the 2 boil variants differ only by seed (same call structure)", () => {
  for (const r of ROSTER) {
    const atlas = atlasOf(r);
    const calls = [];
    for (const variant of [0, 1]) {
      const { E, shapes, lines } = recordingEngine(atlas.w, atlas.h);
      E.setBoil(variant);
      CHAR_RECIPES[r.id](E);
      calls.push(shapes.length + lines.length);
    }
    assert.equal(calls[0], calls[1], r.id);
  }
});
