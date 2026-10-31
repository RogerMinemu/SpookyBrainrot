// Co-op platformer physics (Room 1 "Nivel 0" and Room 6). Pure deterministic ES module: no DOM, no globals, fixed
// 1/60 step. Units are tiles (y grows downwards). Players are solid vertically only: they stack and the supporter
// carries its riders, but nobody pushes or blocks anybody sideways (SOLID_SIDES flips that on).
// A level wider than the screen (Room 6) scrolls: the camera follows the group and a leash keeps everybody on it, a
// fall drops you back on a teammate (or at the last lantern), and Sahur may chase the group to the door.
import { FIXED_DT, ms2steps } from "../../js/sim/loop.js";
import { BIT, has, axis, clean } from "../../js/sim/bits.js";
import { overlapX, intersects } from "../../js/sim/aabb.js";
import { levelsOf, parseLevel, VIEW_W } from "./levels.js";

export const SOLID_SIDES = false;
export const GRAVITY = 60;
export const JUMP_V = 17.7;      // apex ~2.46 tiles: alone you miss the bell/shelf, on a shoulder you reach them
export const BOUNCE_V = 25;      // a drum throws you ~5.2 tiles up: over a 4-high wall
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
export const LEASH = VIEW_W - 2 - BODY_W; // widest the group may spread on a scrolling level (a tile of margin a side)
export const CHASE_MARGIN = 3;           // a caught player reappears on a teammate at least this far ahead of Sahur
export const CHASE_BEAT_MS = 600;        // Sahur's drum while he walks (TV only)

const E = 1e-7;
const COYOTE_STEPS = ms2steps(COYOTE_MS);
const BUFFER_STEPS = ms2steps(BUFFER_MS);
const HOLD_STEPS = ms2steps(BUTTON_HOLD_MS);
const ABOARD_STEPS = ms2steps(ALL_ABOARD_MS);
const RETURN_STEPS = ms2steps(RETURN_DELAY_MS);
const BEAT_STEPS = ms2steps(CHASE_BEAT_MS);
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
  const world = { doorOpen: !(map.bells.length || map.key), bellRung: false, need: 0, cleared: false };
  const rung = map.bells.map(() => false);
  const lit = map.lanterns.map(() => false);
  const gates = map.gates.map((g) => ({ ...g, open: false }));
  const buttons = map.buttons.map((b) => ({ ...b, weight: 0, need: 0, hold: 0 }));
  const firstHeavy = buttons.find((b) => b.kind === "heavy") || null;
  const keyHome = map.key ? { x: map.key.x, y: map.key.y } : null;
  const key = map.key ? { state: "home", holder: null, x: keyHome.x, y: keyHome.y } : null;
  // ferries and lifts: each waits for everybody standing on its departure side (left of the middle of a ferry's trip,
  // left of a lift's right edge) and comes back for the ones left behind. The first one keeps Room 1's id "plat".
  const platHome = (d) => ({ x: d.kind === "lift" ? d.x : d.x0, y: d.kind === "lift" ? d.y0 : d.y, state: "wait", aboard: 0, empty: 0, dx: 0, dy: 0 });
  const plats = map.platforms.map((d, i) => ({
    id: i === 0 ? "plat" : `plat${i}`, kind: d.kind, def: d, ...platHome(d), w: d.w, h: 1,
    departX: d.kind === "lift" ? d.x + d.w : (d.x0 + d.x1 + d.w) / 2,
  }));
  const platById = new Map(plats.map((p) => [p.id, p]));
  const chase = def.chase && map.key ? { on: false, x: 0, speed: def.chase, stop: map.door ? map.door.x - 4 : map.w } : null;
  let cam = 1; // left edge of the view, in tiles (Room 1 always shows columns 1..30)

  const emit = (e) => events.push(e);
  const byId = () => new Map(bodies.map((b) => [b.id, b]));

  // ---- spawning ---------------------------------------------------------------------------
  function slot(idx, n) {
    const width = map.spawn.x1 - map.spawn.x0;
    const step = n > 1 ? Math.min(0.9, (width - BODY_W) / (n - 1)) : 0;
    return { x: map.spawn.x0 + idx * step, y: map.spawn.y - BODY_H };
  }
  function putAt(b, p) {
    Object.assign(b, { x: p.x, y: p.y, vy: 0, vx: 0, grounded: false, supportId: null, coyote: 0, buffer: 0, dx: 0, dy: 0 });
  }
  const place = (b, idx, n) => putAt(b, slot(idx, n));
  function makeBody(p) {
    return {
      id: p.id, name: p.name || "", color: p.color || "#888888", x: 0, y: 0, w: BODY_W, h: BODY_H, vx: 0, vy: 0, dx: 0, dy: 0,
      grounded: false, supportId: null, coyote: 0, buffer: 0, jumpHeld: false, face: 1, entered: false, root: null,
    };
  }
  function returnKey(id) {
    if (key && key.holder === id && key.state === "held") {
      key.state = "home"; key.holder = null; key.x = keyHome.x; key.y = keyHome.y;
      if (chase) chase.on = false; // the key is back on its shelf: Sahur goes back to sleep until somebody takes it
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
    // a newcomer joins the group where it is (a scrolling level), or at the start like everybody else
    fresh.forEach((b) => { const spot = old.size ? rescueSpot(b) : null; if (spot) putAt(b, spot); else place(b, next.indexOf(b), next.length); });
  }

  // ---- tiles ---------------------------------------------------------------------------------
  function solidAt(c, r) {
    if (c < 0 || c >= map.w || r < 0) return true;
    if (r >= map.h) return false;
    if (map.solid[r][c]) return true;
    return gates.some((g) => !g.open && c === g.x && r >= g.y && r < g.y + g.h);
  }
  function boxFree(x, y) {
    for (let r = Math.floor(y + E); r <= Math.floor(y + BODY_H - E); r++) {
      for (let c = Math.floor(x + E); c <= Math.floor(x + BODY_W - E); c++) if (solidAt(c, r)) return false;
    }
    return true;
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
  /** Scrolling levels: nobody may leave the others more than LEASH behind. It only stops a move, it never pushes. */
  function leash(b, prevX) {
    if (!map.scroll) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (const o of bodies) {
      if (o === b || o.entered) continue;
      lo = Math.min(lo, o.x);
      hi = Math.max(hi, o.x);
    }
    if (lo === Infinity) return;
    b.x = Math.min(Math.max(b.x, Math.min(prevX, hi - LEASH)), Math.max(prevX, lo + LEASH));
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
    const cands = plats.length ? [...bodies, ...plats] : bodies;
    for (const o of cands) {
      if (o === b || o.entered) continue;
      if (overlapX(b, o) < LAND_OVERLAP) continue;
      if (o.y < top && prevBottom <= o.y + SIDE_PX && nearBottom >= o.y) { top = o.y; id = o.id; }
    }
    if (top === Infinity) { b.grounded = false; b.supportId = null; return; }
    b.y = top - BODY_H;
    const centre = Math.floor(b.x + BODY_W / 2);
    if (id === null && map.drum[top] && map.drum[top][centre]) {
      // a drum under your middle: off you go again, always to the same height (a jump on landing changes nothing)
      Object.assign(b, { vy: -BOUNCE_V, grounded: false, supportId: null, coyote: 0, buffer: 0 });
      emit({ type: "fx", to: b.id, kind: "jump" });
      return;
    }
    b.vy = 0; b.grounded = true; b.supportId = id;
  }

  // ---- one body ----------------------------------------------------------------------------------
  function supportOf(id) {
    if (platById.has(id)) return platById.get(id);
    const s = bodies.find((o) => o.id === id);
    return s && !s.entered ? s : null;
  }
  /**
   * Where a fallen (or caught, or new) player reappears on a scrolling level: on the head of the rearmost teammate
   * standing on a tile (a safe spot inside the view, and the retry is the obstacle that dropped you), ahead of Sahur;
   * else at the last lit lantern ahead of him. null = the start.
   */
  function rescueSpot(b) {
    if (!map.scroll) return null;
    const ahead = chase && chase.on ? chase.x + CHASE_MARGIN : -Infinity;
    const mates = bodies.filter((o) => o !== b && !o.entered && o.grounded && o.supportId === null && o.x > ahead)
      .sort((p, q) => p.x - q.x);
    for (const o of mates) {
      const spot = { x: o.x, y: o.y - BODY_H - 0.2 };
      if (boxFree(spot.x, spot.y)) return spot;
    }
    for (let i = map.lanterns.length - 1; i >= 0; i--) {
      const l = map.lanterns[i];
      if (lit[i] && l.x > ahead) return { x: l.x + (1 - BODY_W) / 2, y: l.y - BODY_H };
    }
    return null;
  }
  /** Back to the level's first frame: everybody (even who was through the door) at the start, every gadget reset. */
  function restartLevel() {
    Object.assign(world, { doorOpen: !(map.bells.length || map.key), bellRung: false, cleared: false });
    rung.fill(false);
    lit.fill(false);
    gates.forEach((g) => { g.open = false; });
    buttons.forEach((bt) => Object.assign(bt, { weight: 0, need: 0, hold: 0 }));
    if (key) Object.assign(key, { state: "home", holder: null, x: keyHome.x, y: keyHome.y });
    plats.forEach((p) => Object.assign(p, platHome(p.def)));
    if (chase) Object.assign(chase, { on: false, x: 0 });
    bodies.forEach((b, i) => { b.entered = false; b.root = null; place(b, i, bodies.length); });
    emit({ type: "fx", to: "all", kind: "fail" });
  }
  function respawn(b, why = "fall") {
    if (def.restart) restartLevel(); // one fall, spike or catch sends the whole group back to the start
    else {
      const spot = rescueSpot(b);
      if (spot) putAt(b, spot);
      else place(b, bodies.indexOf(b), bodies.length);
      if (!spot && chase && chase.on) chase.on = false; // nowhere ahead of Sahur: he gives up and the run starts over
      if (!(chase && chase.on)) returnKey(b.id); // running from Sahur, the carrier keeps the key
    }
    emit({ type: "penalty", why, id: b.id });
  }
  /** Spikes, like drums, count under your middle: an edge over them while you land on the drum beside them is safe. */
  const onSpikes = (b) => {
    const cx = b.x + BODY_W / 2;
    return map.spikes.some((s) => cx >= s.x && cx < s.x + s.w && b.y + BODY_H > s.y && b.y < s.y + s.h);
  };
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
    leash(b, px);
    b.y += cdy;
    b.vy = Math.min(b.vy + GRAVITY * FIXED_DT, MAX_FALL);
    const prevBottom = b.y + BODY_H;
    b.y += b.vy * FIXED_DT;
    resolveY(b, prevBottom);
    b.dx = b.x - px;
    b.dy = b.y - py;
    if (b.y > KILL_Y) respawn(b);
    else if (onSpikes(b)) respawn(b, "spikes");
    else if (chase && chase.on && b.x < chase.x) respawn(b, "sahur");
  }

  // ---- world -------------------------------------------------------------------------------------------
  function movePlatforms() {
    for (const p of plats) {
      const ox = p.x;
      const oy = p.y;
      const d = p.def;
      const step = PLATFORM_SPEED * FIXED_DT;
      if (p.kind === "ferry") {
        if (p.state === "out") {
          p.x = Math.min(d.x1, p.x + step);
          if (p.x >= d.x1) { p.state = "right"; p.empty = 0; }
        } else if (p.state === "back") {
          p.x = Math.max(d.x0, p.x - step);
          if (p.x <= d.x0) { p.state = "wait"; p.aboard = 0; }
        }
      } else if (p.state === "out") {
        p.y = Math.max(d.y1, p.y - step);
        if (p.y <= d.y1) { p.state = "right"; p.empty = 0; }
      } else if (p.state === "back") {
        p.y = Math.min(d.y0, p.y + step);
        if (p.y >= d.y0) { p.state = "wait"; p.aboard = 0; }
      }
      p.dx = p.x - ox;
      p.dy = p.y - oy;
    }
  }
  function rootOf(b, ids) {
    let cur = b;
    for (let i = 0; i < 24; i++) {
      if (!cur || cur.entered || !cur.grounded) return { kind: "air" };
      if (cur.supportId === null) return { kind: "tile", body: cur };
      if (platById.has(cur.supportId)) return { kind: "plat", id: cur.supportId };
      cur = ids.get(cur.supportId);
    }
    return { kind: "air" };
  }
  const bodyBox = (b) => ({ x: b.x, y: b.y, w: BODY_W, h: BODY_H });
  /** Players whose stack stands on the button: the one at the bottom has its feet on it, its middle over it. */
  const weightOn = (bt, live) => live.filter((b) => {
    const r = b.root;
    if (r.kind !== "tile") return false;
    const cx = r.body.x + BODY_W / 2;
    return Math.abs(r.body.y + BODY_H - bt.y) < 1e-6 && cx >= bt.x && cx <= bt.x + bt.w;
  }).length;

  function evaluate() {
    const ids = byId();
    const live = bodies.filter((b) => !b.entered);
    for (const b of live) b.root = rootOf(b, ids);
    world.need = needFor(bodies.length);

    for (const bt of buttons) {
      bt.need = bt.kind === "heavy" ? world.need : 1;
      const gate = gates[bt.gate];
      if (bt.kind === "heavy" && gate && gate.open) continue; // a latched gate: its button rests
      bt.weight = weightOn(bt, live);
      if (bt.kind !== "heavy" || !gate) continue;
      bt.hold = bt.weight >= bt.need && bt.need > 0 ? bt.hold + 1 : 0;
      if (bt.hold >= HOLD_STEPS) { gate.open = true; emit({ type: "fx", to: "all", kind: "gate" }); }
    }
    // a small gate is open while somebody stands on one of its buttons, and never shuts on a player inside it
    gates.forEach((g, i) => {
      if (g.kind !== "small") return;
      g.open = buttons.some((bt) => bt.gate === i && bt.weight > 0) || live.some((b) => intersects(bodyBox(b), g));
    });

    map.bells.forEach((bell, i) => {
      if (rung[i] || !live.some((b) => intersects(bodyBox(b), bell))) return;
      rung[i] = true;
      emit({ type: "fx", to: "all", kind: "ring" });
      if (rung.every(Boolean)) { world.bellRung = true; world.doorOpen = true; }
    });

    map.lanterns.forEach((l, i) => {
      if (lit[i] || !live.some((b) => b.x + BODY_W / 2 >= l.x)) return;
      lit[i] = true;
      emit({ type: "fx", to: "all", kind: "lantern" });
    });

    if (key) {
      if (key.state === "home") {
        const taker = live.find((b) => intersects(bodyBox(b), { ...keyHome, w: 1, h: 1 }));
        if (taker) {
          key.state = "held"; key.holder = taker.id;
          emit({ type: "fx", to: taker.id, kind: "blip" });
          if (chase && !chase.on) { chase.on = true; chase.x = cam; emit({ type: "fx", to: "all", kind: "alarm" }); }
        }
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

    for (const p of plats) {
      const aboard = live.filter((b) => !b.entered && b.root.kind === "plat" && b.root.id === p.id).length;
      const left = live.filter((b) => !b.entered && b.root.kind === "tile" && b.x + BODY_W / 2 < p.departX).length;
      if (p.state === "wait") {
        p.aboard = aboard > 0 && left === 0 ? p.aboard + 1 : 0;
        if (p.aboard >= ABOARD_STEPS) { p.state = "out"; emit({ type: "fx", to: "all", kind: "tick" }); }
      } else if (p.state === "right") {
        p.empty = aboard === 0 && left > 0 ? p.empty + 1 : 0;
        if (p.empty >= RETURN_STEPS) { p.state = "back"; p.empty = 0; }
      }
    }

    if (!world.cleared && bodies.length > 0 && bodies.every((b) => b.entered)) {
      world.cleared = true;
      emit({ type: "clear" });
      emit({ type: "fx", to: "all", kind: "win" });
    }
  }

  /** The view follows the middle of the group (between the rearmost and the frontmost), inside the level. */
  function moveCamera() {
    if (!map.scroll) return;
    const live = bodies.filter((b) => !b.entered);
    if (!live.length) return;
    const lo = Math.min(...live.map((b) => b.x));
    const hi = Math.max(...live.map((b) => b.x)) + BODY_W;
    cam = Math.min(Math.max((lo + hi) / 2 - VIEW_W / 2, 1), map.w - 1 - VIEW_W);
  }

  // ---- public ----------------------------------------------------------------------------------------------
  function step() {
    tick += 1;
    movePlatforms();
    if (chase && chase.on) {
      chase.x = Math.min(chase.stop, chase.x + chase.speed * FIXED_DT);
      if (tick % BEAT_STEPS === 0) emit({ type: "fx", to: "tv", kind: "drum", data: { freq: 150 } }); // tung
    }
    const order = bodies.filter((b) => !b.entered).sort((a, b) => b.y - a.y); // lowest first: supporters move before riders
    for (const b of order) updateBody(b);
    evaluate();
    moveCamera();
  }

  setRoster(roster);
  moveCamera();

  const platSnap = (p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, w: p.w, state: p.state });
  return {
    level: Object.assign({ index: level, set: set || "nivel0", id: def.id, title: def.title, hint: def.hint, chase: def.chase || 0 }, map),
    setRoster,
    setInput(id, mask) { masks.set(id, clean(mask)); },
    step,
    drain() { const out = events; events = []; return out; },
    snapshot() {
      const gate = firstHeavy && gates[firstHeavy.gate];
      return {
        t: tick,
        level,
        cleared: world.cleared,
        doorOpen: world.doorOpen,
        gateOpen: !!(gate && gate.open),
        bellRung: world.bellRung,
        bells: rung.slice(),
        hold: firstHeavy ? firstHeavy.hold : 0,
        weight: firstHeavy ? firstHeavy.weight : 0,
        need: world.need,
        plat: plats.length ? platSnap(plats[0]) : null,
        plats: plats.map(platSnap),
        gates: gates.map((g) => g.open),
        buttons: buttons.map((b) => ({ kind: b.kind, weight: b.weight, need: b.need, hold: b.hold })),
        lanterns: lit.slice(),
        chase: chase ? { on: chase.on, x: chase.x } : null,
        cam,
        key: key ? { state: key.state, holder: key.holder, x: key.x, y: key.y } : null,
        players: bodies.map((b) => ({
          id: b.id, name: b.name, color: b.color, x: b.x, y: b.y, vx: b.vx, vy: b.vy, face: b.face,
          grounded: b.grounded, support: b.supportId, entered: b.entered,
        })),
      };
    },
  };
}
