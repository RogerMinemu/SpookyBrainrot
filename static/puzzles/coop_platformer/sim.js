// Co-op platformer physics (Room 1 "Nivel 0" and Room 7). Pure deterministic ES module: no DOM, no globals, fixed
// 1/60 step. Units are tiles (y grows downwards). Players are solid vertically only: they stack and the supporter
// carries its riders, but nobody pushes or blocks anybody sideways (SOLID_SIDES flips that on).
import { FIXED_DT, ms2steps } from "../../js/sim/loop.js";
import { BIT, has, axis, clean } from "../../js/sim/bits.js";
import { overlapX, intersects } from "../../js/sim/aabb.js";
import { levelsOf, parseLevel } from "./levels.js";

export const SOLID_SIDES = false;
export const GRAVITY = 60;
export const JUMP_V = 17.7;      // apex ~2.46 tiles: alone you miss the bell/shelf, on a shoulder you reach them
export const RUN = 7;
export const MAX_FALL = 24;
export const COYOTE_MS = 80;
export const BUFFER_MS = 100;
export const BODY_W = 0.8;
export const BODY_H = 0.9;
export const LAND_OVERLAP = 0.2; // landing on a player needs this much horizontal overlap
export const BUTTON_HOLD_MS = 1000;
export const PLATFORM_SPEED = 3;
export const ALL_ABOARD_MS = 500;
export const RETURN_DELAY_MS = 1500;
export const KILL_Y = 18.5;
export const MAX_NEED = 12;

const E = 1e-7;
const COYOTE_STEPS = ms2steps(COYOTE_MS);
const BUFFER_STEPS = ms2steps(BUFFER_MS);
const HOLD_STEPS = ms2steps(BUTTON_HOLD_MS);
const ABOARD_STEPS = ms2steps(ALL_ABOARD_MS);
const RETURN_STEPS = ms2steps(RETURN_DELAY_MS);
const SIDE_PX = 0.05;

/** Weight the heavy button needs for n players: half of them, at least 2, never more than n. */
export const needFor = (n) => Math.min(n, Math.max(2, Math.ceil(n / 2)));

/**
 * @param {{level?:number, set?:string, roster?:Array<{id:string,name?:string,color?:string}>, seed?:number, solidSides?:boolean}} opts
 */
export function createSim({ level = 0, set, roster = [], solidSides = SOLID_SIDES } = {}) {
  const def = levelsOf(set)[level];
  if (!def) throw new Error(`unknown level ${level}`);
  const map = parseLevel(def.rows);
  const bodies = [];
  const masks = new Map();
  let events = [];
  let tick = 0;
  const world = { doorOpen: !(map.bells.length || map.key), gateOpen: false, bellRung: false, hold: 0, weight: 0, need: 0, cleared: false };
  const rung = map.bells.map(() => false);
  // the platform waits for everybody standing on the departure side of the pit (left of the middle of its trip)
  const departX = map.platform ? (map.platform.x0 + map.platform.x1 + map.platform.w) / 2 : 0;
  const keyHome = map.key ? { x: map.key.x, y: map.key.y } : null;
  const key = map.key ? { state: "home", holder: null, x: keyHome.x, y: keyHome.y } : null;
  const plat = map.platform
    ? { id: "plat", x: map.platform.x0, y: map.platform.y, w: map.platform.w, h: 1, state: "wait", aboard: 0, empty: 0, dx: 0, dy: 0 }
    : null;

  const emit = (e) => events.push(e);
  const byId = () => new Map(bodies.map((b) => [b.id, b]));

  // ---- spawning ---------------------------------------------------------------------------
  function slot(idx, n) {
    const width = map.spawn.x1 - map.spawn.x0;
    const step = n > 1 ? Math.min(0.9, (width - BODY_W) / (n - 1)) : 0;
    return { x: map.spawn.x0 + idx * step, y: map.spawn.y - BODY_H };
  }
  function place(b, idx, n) {
    const p = slot(idx, n);
    Object.assign(b, { x: p.x, y: p.y, vy: 0, vx: 0, grounded: false, supportId: null, coyote: 0, buffer: 0, dx: 0, dy: 0 });
  }
  function makeBody(p) {
    return {
      id: p.id, name: p.name || "", color: p.color || "#888888", x: 0, y: 0, w: BODY_W, h: BODY_H, vx: 0, vy: 0, dx: 0, dy: 0,
      grounded: false, supportId: null, coyote: 0, buffer: 0, jumpHeld: false, face: 1, entered: false, root: null,
    };
  }
  function returnKey(id) {
    if (key && key.holder === id && key.state === "held") {
      key.state = "home"; key.holder = null; key.x = keyHome.x; key.y = keyHome.y;
      emit({ type: "fx", to: "all", kind: "fail" });
    }
  }

  function setRoster(list) {
    const old = byId();
    const next = list.map((p) => {
      const b = old.get(p.id);
      if (b) { b.name = p.name || b.name; b.color = p.color || b.color; return b; }
      const nb = makeBody(p);
      place(nb, 0, 1);
      return nb;
    });
    for (const [id] of old) {
      if (!list.some((p) => p.id === id)) { returnKey(id); masks.delete(id); }
    }
    const fresh = next.filter((b) => !old.has(b.id));
    bodies.length = 0;
    bodies.push(...next);
    fresh.forEach((b) => place(b, next.indexOf(b), next.length));
  }

  // ---- tiles ---------------------------------------------------------------------------------
  function solidAt(c, r) {
    if (c < 0 || c >= map.w || r < 0) return true;
    if (r >= map.h) return false;
    if (map.solid[r][c]) return true;
    return !!(map.gate && !world.gateOpen && c === map.gate.x && r >= map.gate.y && r < map.gate.y + map.gate.h);
  }
  function resolveX(b, dir) {
    if (dir === 0) return;
    const r0 = Math.floor(b.y + E);
    const r1 = Math.floor(b.y + BODY_H - E);
    const c0 = Math.floor(b.x + E);
    const c1 = Math.floor(b.x + BODY_W - E);
    let hit = null;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!solidAt(c, r)) continue;
        hit = hit === null ? c : dir > 0 ? Math.min(hit, c) : Math.max(hit, c);
      }
    }
    if (hit !== null) b.x = dir > 0 ? hit - BODY_W : hit + 1;
  }
  function blockSides(b, dir, prevX) {
    if (dir === 0) return;
    const prev = { x: prevX, y: b.y, w: BODY_W, h: BODY_H };
    for (const o of bodies) {
      if (o === b || o.entered) continue;
      if (overlapX(prev, o) > 0) continue; // already overlapping (spawn row): never trap anybody
      if (!intersects(b, o) || Math.min(b.y + BODY_H, o.y + BODY_H) - Math.max(b.y, o.y) < SIDE_PX) continue;
      b.x = dir > 0 ? o.x - BODY_W : o.x + BODY_W;
    }
  }
  function resolveY(b, prevBottom) {
    const nearBottom = b.y + BODY_H;
    const c0 = Math.floor(b.x + E);
    const c1 = Math.floor(b.x + BODY_W - E);
    const r0 = Math.floor(b.y + E);
    const r1 = Math.floor(b.y + BODY_H - E);
    let hitRow = null;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!solidAt(c, r)) continue;
        hitRow = hitRow === null ? r : b.vy > 0 ? Math.min(hitRow, r) : Math.max(hitRow, r);
      }
    }
    if (b.vy < 0) {
      if (hitRow !== null) { b.y = hitRow + 1; b.vy = 0; }
      b.grounded = false; b.supportId = null;
      return;
    }
    let top = hitRow !== null ? hitRow : Infinity;
    let id = null;
    const cands = plat ? [...bodies, plat] : bodies;
    for (const o of cands) {
      if (o === b || o.entered) continue;
      if (overlapX(b, o) < LAND_OVERLAP) continue;
      if (o.y < top && prevBottom <= o.y + SIDE_PX && nearBottom >= o.y) { top = o.y; id = o.id; }
    }
    if (top < Infinity) { b.y = top - BODY_H; b.vy = 0; b.grounded = true; b.supportId = id; }
    else { b.grounded = false; b.supportId = null; }
  }

  // ---- one body ----------------------------------------------------------------------------------
  function supportOf(id) {
    if (plat && id === plat.id) return plat;
    const s = bodies.find((o) => o.id === id);
    return s && !s.entered ? s : null;
  }
  function respawn(b, why = "fall") {
    place(b, bodies.indexOf(b), bodies.length);
    returnKey(b.id);
    emit({ type: "penalty", why, id: b.id });
  }
  const onSpikes = (b) => map.spikes.some((s) => intersects({ x: b.x, y: b.y, w: BODY_W, h: BODY_H }, s));
  function updateBody(b) {
    const px = b.x;
    const py = b.y;
    const mask = masks.get(b.id) || 0;
    const ax = axis(mask);
    const pressed = has(mask, BIT.J) && !b.jumpHeld;
    b.jumpHeld = has(mask, BIT.J);
    b.buffer = pressed ? BUFFER_STEPS : Math.max(0, b.buffer - 1);
    b.coyote = b.grounded ? COYOTE_STEPS : Math.max(0, b.coyote - 1);
    let cdx = 0;
    let cdy = 0;
    if (b.grounded && b.supportId) {
      const s = supportOf(b.supportId);
      if (s) { cdx = s.dx; cdy = s.dy; }
    }
    if (b.buffer > 0 && b.coyote > 0) {
      b.vy = -JUMP_V; b.buffer = 0; b.coyote = 0; b.grounded = false; b.supportId = null; cdy = 0;
    }
    if (ax !== 0) b.face = ax;
    b.vx = ax * RUN;
    const dx = b.vx * FIXED_DT + cdx;
    const before = b.x;
    b.x += dx;
    resolveX(b, Math.sign(dx));
    if (solidSides) blockSides(b, Math.sign(dx), before);
    b.x = Math.min(Math.max(b.x, 0), map.w - BODY_W);
    b.y += cdy;
    b.vy = Math.min(b.vy + GRAVITY * FIXED_DT, MAX_FALL);
    const prevBottom = b.y + BODY_H;
    b.y += b.vy * FIXED_DT;
    resolveY(b, prevBottom);
    b.dx = b.x - px;
    b.dy = b.y - py;
    if (b.y > KILL_Y) respawn(b);
    else if (onSpikes(b)) respawn(b, "spikes");
  }

  // ---- world -------------------------------------------------------------------------------------------
  function movePlatform() {
    if (!plat) return;
    const old = plat.x;
    if (plat.state === "out") {
      plat.x = Math.min(map.platform.x1, plat.x + PLATFORM_SPEED * FIXED_DT);
      if (plat.x >= map.platform.x1) { plat.state = "right"; plat.empty = 0; }
    } else if (plat.state === "back") {
      plat.x = Math.max(map.platform.x0, plat.x - PLATFORM_SPEED * FIXED_DT);
      if (plat.x <= map.platform.x0) { plat.state = "wait"; plat.aboard = 0; }
    }
    plat.dx = plat.x - old;
  }
  function rootOf(b, ids) {
    let cur = b;
    for (let i = 0; i < 24; i++) {
      if (!cur || cur.entered || !cur.grounded) return { kind: "air" };
      if (cur.supportId === null) return { kind: "tile", body: cur };
      if (plat && cur.supportId === plat.id) return { kind: "plat" };
      cur = ids.get(cur.supportId);
    }
    return { kind: "air" };
  }
  const bodyBox = (b) => ({ x: b.x, y: b.y, w: BODY_W, h: BODY_H });

  function evaluate() {
    const ids = byId();
    const live = bodies.filter((b) => !b.entered);
    for (const b of live) b.root = rootOf(b, ids);
    world.need = needFor(bodies.length);

    if (map.button && !world.gateOpen) {
      world.weight = live.filter((b) => {
        const r = b.root;
        if (r.kind !== "tile") return false;
        const cx = r.body.x + BODY_W / 2;
        return Math.abs(r.body.y + BODY_H - map.button.y) < 1e-6 && cx >= map.button.x && cx <= map.button.x + map.button.w;
      }).length;
      world.hold = world.weight >= world.need && world.need > 0 ? world.hold + 1 : 0;
      if (world.hold >= HOLD_STEPS) { world.gateOpen = true; emit({ type: "fx", to: "all", kind: "open" }); }
    }

    map.bells.forEach((bell, i) => {
      if (rung[i] || !live.some((b) => intersects(bodyBox(b), bell))) return;
      rung[i] = true;
      emit({ type: "fx", to: "all", kind: "ring" });
      if (rung.every(Boolean)) { world.bellRung = true; world.doorOpen = true; }
    });

    if (key) {
      if (key.state === "home") {
        const taker = live.find((b) => intersects(bodyBox(b), { ...keyHome, w: 1, h: 1 }));
        if (taker) { key.state = "held"; key.holder = taker.id; emit({ type: "fx", to: taker.id, kind: "blip" }); }
      }
      if (key.state === "held") {
        const holder = ids.get(key.holder);
        if (!holder || holder.entered) { key.state = "used"; }
        else {
          key.x = holder.x + (BODY_W - 1) / 2; key.y = holder.y - 0.7;
          if (!world.doorOpen && map.door && intersects(bodyBox(holder), map.door)) {
            world.doorOpen = true; emit({ type: "fx", to: "all", kind: "open" });
          }
        }
      }
    }

    if (world.doorOpen && map.door) {
      for (const b of live) {
        if (b.grounded && intersects(bodyBox(b), map.door)) {
          b.entered = true;
          emit({ type: "fx", to: b.id, kind: "blip" });
        }
      }
    }

    if (plat) {
      const aboard = live.filter((b) => !b.entered && b.root.kind === "plat").length;
      const left = live.filter((b) => !b.entered && b.root.kind === "tile" && b.x + BODY_W / 2 < departX).length;
      if (plat.state === "wait") {
        plat.aboard = aboard > 0 && left === 0 ? plat.aboard + 1 : 0;
        if (plat.aboard >= ABOARD_STEPS) { plat.state = "out"; emit({ type: "fx", to: "all", kind: "tick" }); }
      } else if (plat.state === "right") {
        plat.empty = aboard === 0 && left > 0 ? plat.empty + 1 : 0;
        if (plat.empty >= RETURN_STEPS) { plat.state = "back"; plat.empty = 0; }
      }
    }

    if (!world.cleared && bodies.length > 0 && bodies.every((b) => b.entered)) {
      world.cleared = true;
      emit({ type: "clear" });
      emit({ type: "fx", to: "all", kind: "win" });
    }
  }

  // ---- public ----------------------------------------------------------------------------------------------
  function step() {
    tick += 1;
    movePlatform();
    const order = bodies.filter((b) => !b.entered).sort((a, b) => b.y - a.y); // lowest first: supporters move before riders
    for (const b of order) updateBody(b);
    evaluate();
  }

  setRoster(roster);

  return {
    level: Object.assign({ index: level, set: set || "nivel0", id: def.id, title: def.title, hint: def.hint }, map),
    setRoster,
    setInput(id, mask) { masks.set(id, clean(mask)); },
    step,
    drain() { const out = events; events = []; return out; },
    snapshot() {
      return {
        t: tick,
        level,
        cleared: world.cleared,
        doorOpen: world.doorOpen,
        gateOpen: world.gateOpen,
        bellRung: world.bellRung,
        bells: rung.slice(),
        hold: world.hold,
        weight: world.weight,
        need: world.need,
        plat: plat ? { x: plat.x, y: plat.y, w: plat.w, state: plat.state } : null,
        key: key ? { state: key.state, holder: key.holder, x: key.x, y: key.y } : null,
        players: bodies.map((b) => ({
          id: b.id, name: b.name, color: b.color, x: b.x, y: b.y, vx: b.vx, vy: b.vy, face: b.face,
          grounded: b.grounded, support: b.supportId, entered: b.entered,
        })),
      };
    },
  };
}
