// Scripted bots for Room 6's scrolling platformer levels (tests_js/platformer_sahur.test.mjs). A bot is made for one
// level from its geometry, `BOTS[level](sim.level)`, and then reads the snapshot like a player reads the screen,
// answering one mask per player. They prove every level can be cleared by 2 players and by 12, without a fall.
import { BIT } from "../static/js/sim/bits.js";
import { BODY_H } from "../static/puzzles/coop_platformer/sim.js";

export const { L, R, J } = BIT;
export const goTo = (p, x) => (Math.abs(p.x - x) < 0.06 ? 0 : p.x < x ? R : L);
export const pulse = (snap) => (snap.t % 6 < 3 ? J : 0);
/** Walk to x, jumping when on the ground inside one of the take-off windows [from, to] (heading right). */
export const run = (p, x, hops = []) => {
  const m = goTo(p, x);
  return m === R && p.grounded && hops.some(([from, to]) => p.x >= from && p.x <= to) ? R | J : m;
};

/**
 * A two-player tower beside a 3-high shelf: `a` stands at SH, `b` climbs its shoulders, jumps and leans onto the
 * shelf (whose top is the feet line `top`). Returns b's mask; `a` is moved by the caller.
 */
function climber(snap, a, b, SH, top) {
  if (b.grounded && b.y + BODY_H < top + 0.4) return R;                               // on the shelf: walk to the key
  if (b.support === a.id) return pulse(snap);
  if (!b.grounded && b.x > SH - 0.15 && b.y + BODY_H < top + 1.3 && a.grounded) return R; // above the shelf: lean in
  if (b.grounded && a.grounded && Math.abs(a.x - SH) < 0.15 && Math.abs(b.x - a.x) < 0.3) return pulse(snap);
  return goTo(b, SH - 0.05);
}

/** Board a ferry or a lift standing at `x` and ride it; once it has arrived, walk off forwards. */
const ride = (plat, p, x, hops) => (plat.state === "right" ? R : plat.state === "wait" ? run(p, x, hops) : 0);

export const BOTS = [
  // 1 tung: hop the pit, bounce up the wall, ring two bells from a tower and the third bouncing in place
  (lv) => {
    const hops = [[12.4, 13.0]];
    const [b1, b2, b3] = lv.bells.map((b) => b.x);
    const door = lv.door.x + 0.6;
    return (snap, i) => {
      const p = snap.players[i];
      const [a, b] = snap.players;
      if (snap.doorOpen) return run(p, door, hops);
      const k = snap.bells.indexOf(false);
      if (k === 2) return i === 0 ? goTo(p, b3 + 0.6) : run(p, b3 - 7, hops); // a lands still on the drum and bounces
      const tx = [b1, b2][k] - 0.1;
      if (i === 0) return b.support === a.id ? 0 : run(a, tx, hops);
      if (i === 1) {
        const aAt = Math.abs(a.x - tx) < 0.1 && a.grounded;
        if (b.support === a.id) return aAt ? pulse(snap) : R; // rung: step off forwards, the next bell is to the right
        if (aAt && b.grounded && Math.abs(b.x - a.x) < 0.3 && Math.abs(b.y - a.y) < 0.05) return pulse(snap);
        return run(b, a.x, hops);
      }
      return run(p, tx - 4, hops); // the crowd waits a few steps behind the tower
    };
  },
  // 2 mercado: need(N) hold the heavy button; p0 and p1 hold the small gate open for each other; the market's spikes
  (lv) => {
    const heavy = lv.buttons.find((b) => b.kind === "heavy");
    const [near, far] = lv.buttons.filter((b) => b.kind === "small");
    const farIdx = lv.buttons.indexOf(far);
    const gateX = lv.gates.find((g) => g.kind === "small").x;
    const hops = [[21.3, 22.1], [60.3, 61.1], [65.5, 66.2], [68.4, 69.1], [74.3, 75.1]]; // spikes, stall on and off, spikes
    const door = lv.door.x + 0.6;
    const past = (q) => q.x > gateX + 1.2;
    return (snap, i) => {
      const p = snap.players[i];
      const [a, b] = snap.players;
      if (!snap.gates[0]) return i < snap.need ? goTo(p, heavy.x + 0.6) : goTo(p, heavy.x - 3);
      if (past(a)) return run(p, door, hops);
      if (i === 0) {
        const ready = snap.players.slice(1).every(past) && snap.buttons[farIdx].weight > 0;
        return run(a, ready ? gateX + 2 : near.x + 0.1, hops);
      }
      return run(p, i === 1 ? far.x + 0.1 : gateX + 2.5, hops);
    };
  },
  // 3 tejados: everybody on the lift, roof to roof, everybody on the ferry, a tower for the key on the eave
  (lv) => {
    const lift = lv.platforms.find((p) => p.kind === "lift");
    const ferry = lv.platforms.find((p) => p.kind === "ferry");
    const liftIdx = lv.platforms.indexOf(lift);
    const ferryIdx = lv.platforms.indexOf(ferry);
    const hops = [[33.5, 34.1], [42.6, 43.1], [49.5, 50.2]]; // the two gaps between the roofs, then the chimney
    const SH = lv.key.x - 1.95; // the base stands just left of the eave, which starts a tile left of the key
    const top = lv.key.y + 1;
    const door = lv.door.x + 0.6;
    return (snap, i) => {
      const p = snap.players[i];
      const [a, b] = snap.players;
      if (p.x < lift.x + lift.w + 0.2) return ride(snap.plats[liftIdx], p, lift.x + 1, hops);
      if (p.x < ferry.x1 + ferry.w - 0.5) return ride(snap.plats[ferryIdx], p, ferry.x0 + 1, hops);
      if (snap.key.state !== "home") return run(p, door, hops);
      if (i === 0) return b.grounded && b.y + BODY_H < top + 0.4 ? run(a, door, hops) : goTo(a, SH);
      return i === 1 ? climber(snap, a, b, SH, top) : goTo(p, SH - 4);
    };
  },
  // 4 tambores: the drum chain one at a time, both bells bouncing in place, need(N) on the heavy button
  (lv) => {
    const WAIT = 13.2;
    const PAST = 32.5; // beyond the last spikes of the chain
    const bells = lv.bells.map((b) => b.x);
    const heavy = lv.buttons[0];
    const hops = [[71.3, 72.1]];
    const door = lv.door.x + 0.6;
    return (snap, i) => {
      const p = snap.players[i];
      if (snap.doorOpen && snap.gates[0]) return run(p, door, hops);
      if (p.x < PAST) { // once on its way, a player keeps running: stopping on a drum is fine, turning back is not
        const turn = p.x > WAIT + 0.3 || snap.players.slice(0, i).every((q) => q.x > PAST);
        return turn ? R : goTo(p, WAIT);
      }
      if (!snap.doorOpen) return i === 0 ? goTo(p, bells[snap.bells.indexOf(false)] + 0.6) : goTo(p, bells[0] - 3);
      return goTo(p, i < snap.need ? heavy.x + 0.6 : heavy.x - 2);
    };
  },
  // 5 huida: need(N) on the heavy button, everybody on the lift, a tower for the key, then outrun Sahur to the door
  (lv) => {
    const heavy = lv.buttons[0];
    const lift = lv.platforms[0];
    const SH = lv.key.x - 1.95;
    const top = lv.key.y + 1;
    const hops = [[26.3, 27.1], [63.3, 64.1], [69.3, 70.1], [89.3, 90.1]]; // spikes, spikes, pit, spikes
    const door = lv.door.x + 0.6;
    return (snap, i) => {
      const p = snap.players[i];
      const [a, b] = snap.players;
      if (!snap.gates[0]) return i < snap.need ? goTo(p, heavy.x + 0.6) : goTo(p, heavy.x - 3);
      if (p.x < lift.x + lift.w + 0.2) return ride(snap.plats[0], p, lift.x + 1, hops);
      if (snap.key.state !== "home") return run(p, door, hops);
      if (i === 0) return b.grounded && b.y + BODY_H < top + 0.4 ? run(a, door, hops) : goTo(a, SH);
      return i === 1 ? climber(snap, a, b, SH, top) : goTo(p, SH - 4);
    };
  },
];
