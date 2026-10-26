import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ROSTER, ROSTER_IDS, RIG_CELLS, CAMEO_CELLS, RIG_ATLAS, CAMEO_ATLAS, RIG_GUTTER, EMOTES,
  allCells, inner, byId, byName,
} from "../static/js/art/roster.js";
import {
  poseOps, silhouetteOps, boilVariant, isBlinking, hash,
  BOIL_MS, BLINK_PERIOD, BLINK_LEN, LUNGE_FROM, LUNGE_TO, SQUASH_AMP,
} from "../static/js/art/puppet.js";

/** CAMEOS list straight from the server module, so the two can never drift. */
function serverCameos() {
  const src = readFileSync(new URL("../app/content.py", import.meta.url), "utf8");
  const body = src.match(/CAMEOS:[^=]*=\s*\[([\s\S]*?)\]/)[1];
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

// ---- roster -------------------------------------------------------------------------------------------
test("roster: 8 unique ids whose names are exactly the server CAMEOS", () => {
  assert.equal(ROSTER.length, 8);
  assert.equal(new Set(ROSTER_IDS).size, 8);
  assert.deepEqual(ROSTER.map((r) => r.name), serverCameos());
  for (const r of ROSTER) assert.equal(byName(r.name), r);
  assert.equal(byId("nope"), null);
});

test("roster: 3 talking rigs, 5 cameos with idle + scary poses", () => {
  const rigs = ROSTER.filter((r) => r.kind === "rig").map((r) => r.id).sort();
  assert.deepEqual(rigs, ["patapim", "sahur", "tralalero"]);
  const cameos = ROSTER.filter((r) => r.kind === "cameo");
  assert.equal(cameos.length, 5);
  for (const c of cameos) {
    assert.ok(c.poses.includes("idle") && c.poses.includes("scary"), c.id);
    assert.ok(CAMEO_CELLS.idle && CAMEO_CELLS.scary);
  }
  for (const r of ROSTER) {
    assert.ok(r.sil.shapes.length > 0 && r.sil.eyes.length > 0, r.id);
    assert.ok(r.voice && r.palette && r.box.w > 0 && r.box.h > 0, r.id);
  }
});

test("roster: the talking rigs carry the full part set and every emote", () => {
  for (const r of ROSTER.filter((x) => x.kind === "rig")) {
    const names = r.parts.map((p) => p.part);
    for (const need of ["body", "head", "armL", "armR", "legL", "legR", "eyes", "mouth", "prop"]) assert.ok(names.includes(need), `${r.id} ${need}`);
    assert.deepEqual(r.emotes, EMOTES);
    for (const p of r.parts) {
      if (p.parent) assert.ok(names.includes(p.parent) && names.indexOf(p.parent) >= 0, `${r.id} ${p.part} parent`);
      assert.ok(RIG_CELLS[p.part], `${r.id} cell ${p.part}`);
    }
    assert.equal(r.parts.filter((p) => p.parent === null).length, 1);
  }
});

// ---- atlas layout -------------------------------------------------------------------------------------
function checkLayout(layout, atlas, label) {
  const cells = allCells(layout);
  for (const [name, c] of cells) {
    assert.ok(c[0] >= 0 && c[1] >= 0 && c[0] + c[2] <= atlas.w && c[1] + c[3] <= atlas.h, `${label} ${name} out of bounds`);
    const [, , iw, ih] = inner(c);
    assert.ok(iw > 0 && ih > 0, `${label} ${name} gutter eats the cell`);
  }
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      assert.ok(!overlaps(cells[i][1], cells[j][1]), `${label} ${cells[i][0]} overlaps ${cells[j][0]}`);
    }
  }
  return cells.length;
}

test("atlas: every cell is in bounds, none overlap, the 12 px gutter fits", () => {
  assert.equal(RIG_GUTTER, 12);
  assert.equal(checkLayout(RIG_CELLS, RIG_ATLAS, "rig"), 8 + 4 + 4); // 8 flat cells + 4 eyes + 4 mouths
  assert.equal(checkLayout(CAMEO_CELLS, CAMEO_ATLAS, "cameo"), 2);
  assert.deepEqual([RIG_ATLAS.w, RIG_ATLAS.h, CAMEO_ATLAS.w, CAMEO_ATLAS.h], [1024, 1024, 1024, 512]);
});

test("atlas: every rig pivot lies inside the paintable area of its cell", () => {
  for (const r of ROSTER.filter((x) => x.kind === "rig")) {
    for (const p of r.parts) {
      const cell = p.part === "eyes" ? RIG_CELLS.eyes.open : p.part === "mouth" ? RIG_CELLS.mouth.closed : RIG_CELLS[p.part];
      const [, , iw, ih] = inner([0, 0, cell[2], cell[3]]);
      assert.ok(p.pivot[0] >= RIG_GUTTER && p.pivot[0] <= RIG_GUTTER + iw, `${r.id} ${p.part} px`);
      assert.ok(p.pivot[1] >= RIG_GUTTER && p.pivot[1] <= RIG_GUTTER + ih, `${r.id} ${p.part} py`);
    }
  }
});

// ---- poseOps ------------------------------------------------------------------------------------------
const mouthCell = (res) => res.ops.find((o) => o.part === "mouth").cell;
const eyesCell = (res) => res.ops.find((o) => o.part === "eyes").cell;
const sahur = byId("sahur"), patapim = byId("patapim"), tralalero = byId("tralalero"), bombardiro = byId("bombardiro");

test("poseOps: deterministic and a pure function of (rig, state, t)", () => {
  for (const r of ROSTER) {
    const st = { emote: "talk", talking: true, mouth: "open", degradation: 1 };
    assert.deepEqual(poseOps(r, st, 3.37), poseOps(r, { ...st }, 3.37));
    assert.deepEqual(silhouetteOps(r, st, 3.37), silhouetteOps(r, { ...st }, 3.37));
  }
});

test("poseOps: a rig draws every part in order with finite matrices", () => {
  for (const r of ROSTER.filter((x) => x.kind === "rig")) {
    const res = poseOps(r, { emote: "idle" }, 1.2);
    assert.deepEqual(res.ops.map((o) => o.part), r.parts.map((p) => p.part));
    for (const o of res.ops) assert.ok(o.m.length === 6 && o.m.every(Number.isFinite), `${r.id} ${o.part}`);
    assert.equal(res.alpha, 1);
  }
});

test("poseOps: blink closes the eyes for 120 ms every 3.9 s (seeded per character)", () => {
  assert.equal(BLINK_PERIOD, 3.9);
  const seed = patapim.seed;
  const t0 = BLINK_PERIOD - 1.7 * seed; // (t + 1.7 seed) mod 3.9 == 0
  assert.ok(isBlinking(t0 + 0.05, seed));
  assert.ok(!isBlinking(t0 + BLINK_LEN + 0.01, seed));
  assert.ok(!isBlinking(t0 - 0.01, seed));
  assert.deepEqual(eyesCell(poseOps(patapim, {}, t0 + 0.05)), RIG_CELLS.eyes.closed);
  assert.deepEqual(eyesCell(poseOps(patapim, {}, t0 + 0.5)), RIG_CELLS.eyes.open);
});

test("poseOps: eyes and mouth follow the emote", () => {
  const at = (st) => poseOps(sahur, st, 0.5); // t=0.5 is not a blink for sahur
  assert.ok(!isBlinking(0.5, sahur.seed));
  assert.deepEqual(eyesCell(at({ emote: "angry" })), RIG_CELLS.eyes.angry);
  assert.deepEqual(eyesCell(at({ emote: "surprised" })), RIG_CELLS.eyes.wide);
  assert.deepEqual(eyesCell(at({ emote: "away" })), RIG_CELLS.eyes.closed);
  assert.deepEqual(eyesCell(at({ emote: "scary" })), RIG_CELLS.eyes.wide);
  assert.deepEqual(mouthCell(at({ emote: "scary" })), RIG_CELLS.mouth.scary);
  assert.deepEqual(mouthCell(at({ emote: "idle" })), RIG_CELLS.mouth.closed);
  assert.deepEqual(mouthCell(at({ emote: "talk", mouth: "open" })), RIG_CELLS.mouth.open);
  assert.deepEqual(mouthCell(at({ emote: "scary", mouth: "open" })), RIG_CELLS.mouth.open);
});

test("poseOps: boil alternates the atlas variant by degradation (140 / 110 / 80 ms)", () => {
  assert.deepEqual(BOIL_MS, [140, 110, 80]);
  for (let d = 0; d < 3; d++) {
    const ms = BOIL_MS[d];
    assert.equal(boilVariant(0, d), 0);
    assert.equal(boilVariant((ms - 1) / 1000, d), 0);
    assert.equal(boilVariant((ms + 1) / 1000, d), 1);
    assert.equal(boilVariant((2 * ms + 1) / 1000, d), 0);
    assert.equal(poseOps(patapim, { degradation: d }, (ms + 1) / 1000).variant, 1);
  }
  assert.equal(boilVariant(1, 99), boilVariant(1, 0)); // unknown level falls back to level 0
});

test("poseOps: reduced motion pins variant 0 and removes shake / bob", () => {
  for (let i = 0; i < 40; i++) {
    const t = i * 0.037;
    const res = poseOps(sahur, { emote: "scary", reduced: true, degradation: 2, dance: true }, t);
    assert.equal(res.variant, 0);
  }
  const a = poseOps(sahur, { emote: "scary", reduced: true }, 0.1), b = poseOps(sahur, { emote: "scary", reduced: true }, 0.2);
  // no shake and no bob: only the (tiny) squash changes, and the body stays on the same x
  assert.equal(a.ops[0].m[4], b.ops[0].m[4]);
  assert.equal(a.ops[0].m[5], b.ops[0].m[5]);
  const live = poseOps(sahur, { emote: "scary" }, 0.1), live2 = poseOps(sahur, { emote: "scary" }, 0.2);
  assert.notEqual(live.ops[0].m[5], live2.ops[0].m[5]);
});

test("poseOps: scary leans, grows and shakes from a hash of floor(24 t)", () => {
  const calm = poseOps(sahur, { emote: "idle" }, 0.7).ops[0].m;
  const scary = poseOps(sahur, { emote: "scary" }, 0.7).ops[0].m;
  assert.ok(Math.hypot(scary[0], scary[1]) > Math.hypot(calm[0], calm[1]) * 1.05);
  assert.notEqual(scary[1], 0);
  // same 1/24 s slice -> same shake; hash is stable and in [0, 1)
  assert.equal(poseOps(sahur, { emote: "scary" }, 0.7001).ops[0].m[4], scary[4]);
  for (let n = 0; n < 50; n++) assert.ok(hash(n) >= 0 && hash(n) < 1);
  assert.equal(hash(5), hash(5));
});

test("poseOps: squash pairs sx = 1/sqrt(sy); take emote squashes then recovers", () => {
  const m = poseOps(sahur, {}, 0.3).ops[0].m;
  const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
  assert.ok(Math.abs(sx - 1 / Math.sqrt(sy)) < 1e-9);
  assert.ok(Math.abs(sy - 1) <= SQUASH_AMP + 1e-9);
  const squashAt = (e) => Math.hypot(...poseOps(sahur, { takeT: 5 }, 5 + e).ops[0].m.slice(2, 4));
  assert.ok(squashAt(0.08) < 0.96);
  assert.ok(Math.abs(squashAt(0.3) - 1) <= SQUASH_AMP + 1e-9);
  assert.deepEqual(eyesCell(poseOps(sahur, { takeT: 5 }, 5.03)), RIG_CELLS.eyes.closed); // squint
});

test("poseOps: enter / exit slide 450 ms in and out with alpha", () => {
  const x = (st, t) => poseOps(tralalero, st, t).ops[0].m[4];
  assert.equal(poseOps(tralalero, { enterT: 2 }, 1).alpha, 0);
  assert.ok(poseOps(tralalero, { enterT: 2 }, 2.1).alpha < 1);
  assert.equal(poseOps(tralalero, { enterT: 2 }, 2.45).alpha, 1);
  assert.ok(Math.abs(x({ enterT: 2, reduced: true }, 2.0)) > 400);
  assert.ok(Math.abs(x({ enterT: 2, reduced: true }, 2.5)) < 1e-9);
  assert.ok(poseOps(tralalero, { exitT: 4 }, 4.45).alpha <= 1e-9);
});

test("poseOps: cameo lunge scales .55 -> 1.25 in 180 ms and the scary pose swaps the cell", () => {
  const scale = (t) => Math.hypot(...poseOps(bombardiro, { lungeT: 1, reduced: true }, t).ops[0].m.slice(0, 2));
  assert.ok(Math.abs(scale(1) - LUNGE_FROM) < 0.02);
  assert.ok(scale(1.09) > LUNGE_FROM && scale(1.09) < LUNGE_TO);
  assert.ok(Math.abs(scale(1.2) - LUNGE_TO) < 0.02);
  assert.deepEqual(poseOps(bombardiro, {}, 0.4).ops[0].cell, CAMEO_CELLS.idle);
  assert.deepEqual(poseOps(bombardiro, { emote: "scary" }, 0.4).ops[0].cell, CAMEO_CELLS.scary);
  for (const c of ROSTER.filter((r) => r.kind === "cameo")) {
    assert.deepEqual(poseOps(c, { emote: "scary" }, 1).ops[0].cell, CAMEO_CELLS.scary, c.id); // the jumpscare cameo
  }
});

test("poseOps: talking nods the head and swings the arms (and dance swings more)", () => {
  const rot = (res, part) => { const m = res.ops.find((o) => o.part === part).m; return Math.atan2(m[1], m[0]); };
  const idle = poseOps(patapim, {}, 0.1), talk = poseOps(patapim, { talking: true }, 0.1);
  assert.notEqual(rot(idle, "head"), rot(talk, "head"));
  assert.notEqual(rot(idle, "armR"), rot(talk, "armR"));
  const dance = poseOps(patapim, { dance: true }, 0.12);
  assert.ok(Math.abs(rot(dance, "armL") - rot(idle, "armL")) > Math.abs(rot(talk, "armL") - rot(idle, "armL")));
});

// ---- silhouettes --------------------------------------------------------------------------------------
test("silhouetteOps: ink shapes + glowing eyes for every id, eyes blink", () => {
  for (const r of ROSTER) {
    const res = silhouetteOps(r, { emote: "idle" }, 0.5);
    assert.ok(res.ops.some((o) => o.op === "shape"), r.id);
    assert.ok(res.ops.some((o) => o.op === "eye"), r.id);
    assert.ok(res.ops.every((o) => o.m.every(Number.isFinite)), r.id);
    const t0 = BLINK_PERIOD - 1.7 * r.seed;
    assert.ok(!silhouetteOps(r, {}, t0 + 0.05).ops.some((o) => o.op === "eye"), `${r.id} blink`);
  }
});

test("silhouetteOps: scary eyes are bigger", () => {
  const eye = (st) => silhouetteOps(sahur, st, 0.5).ops.find((o) => o.op === "eye");
  assert.ok(eye({ emote: "scary" }).r > eye({ emote: "idle" }).r);
});
