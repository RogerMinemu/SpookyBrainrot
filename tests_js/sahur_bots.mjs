// Scripted bots for Room 7's platformer levels (tests_js/platformer_sahur.test.mjs). They read the snapshot, like a
// player reads the screen, and answer one mask per player.
import { BIT } from "../static/js/sim/bits.js";
import { BODY_H } from "../static/puzzles/coop_platformer/sim.js";

export const { L, R, J } = BIT;
export const goTo = (p, x) => (Math.abs(p.x - x) < 0.06 ? 0 : p.x < x ? R : L);
export const pulse = (snap) => (snap.t % 6 < 3 ? J : 0);
const onFloor = (p) => p.grounded && p.y + BODY_H > 15.9;
// heading right: jump a 2-wide spike strip that starts at column sx (take-off window ~[sx - 1.85, sx - 0.85])
const hops = (p, strips) => onFloor(p) && strips.some((sx) => p.x > sx - 1.85 && p.x < sx - 0.85);
const go = (p, x, strips = []) => { const m = goTo(p, x); return m === R && hops(p, strips) ? R | J : m; };
// level 1: hop onto the 2-high block (columns 15-18) on the way right
export const goBlock = (p, x) => { const m = goTo(p, x); return m === R && onFloor(p) && p.x > 13.5 && p.x < 14.25 ? R | J : m; };

export const BOTS = [
  // 1 campanadas: p0 stands under each bell in turn and p1 rings it from its shoulders; then everybody to the door
  (snap, i) => {
    const [a, b] = snap.players;
    const p = snap.players[i];
    if (snap.doorOpen) return goBlock(p, 27.6);
    if (i >= 2) return 0;
    const tx = [8.9, 15.9, 23.9][snap.bells.indexOf(false)];
    const aAt = Math.abs(a.x - tx) < 0.1 && a.grounded;
    if (i === 0) return b.support === a.id ? 0 : goBlock(a, tx);
    if (b.support === a.id) return aAt ? pulse(snap) : R; // rung: step off forwards, the next bell is to the right
    if (aAt && b.grounded && Math.abs(b.x - a.x) < 0.3 && Math.abs(b.y - a.y) < 0.05) return pulse(snap);
    return goBlock(b, a.x);
  },
  // 2 pinchos: need(N) jump the first spikes and hold the button; once the gate is open everybody jumps to the door
  (snap, i) => {
    const p = snap.players[i];
    if (snap.gateOpen) return go(p, 27.6, [10, 24]);
    return i < snap.need ? go(p, 13.9, [10]) : 0;
  },
  // 3 foso: the crowd boards first; p0 is the step beside the floating shelf, p1 climbs, takes the key, everybody boards
  (snap, i) => {
    const [a, b] = snap.players;
    const p = snap.players[i];
    const board = (q) => (q.x < 9.3 ? R : 0);
    if (snap.plat.state === "right") return goTo(p, 27.6); // the key carrier opens the door, the rest walk in
    if (i >= 2 || snap.key.state !== "home") return board(p);
    const SH = 7.15;
    if (i === 0) return b.y < 12.3 && b.grounded ? board(a) : goTo(a, SH);
    const ready = Math.abs(a.x - SH) < 0.1 && a.grounded && snap.players.slice(2).every((q) => q.x > 8.5);
    if (b.y < 12.5 && b.grounded) return L;                                          // on the shelf: walk to the key
    if (b.support === a.id) return pulse(snap);
    if (!b.grounded && b.x < SH + 0.2 && b.y + BODY_H < 14.3 && a.grounded) return L; // in the air beside the shelf: lean in
    if (ready && b.grounded && Math.abs(b.x - a.x) < 0.3) return pulse(snap);
    return goTo(b, a.x);
  },
  // 4 salida: need(N) hold the button; p0 + p1 fetch the key from the floating shelf; everybody jumps the spikes
  (snap, i) => {
    const [a, b] = snap.players;
    const p = snap.players[i];
    if (!snap.gateOpen) return i < snap.need ? goTo(p, 10.1) : 0;
    if (snap.key.state !== "home" || snap.doorOpen) return go(p, 28.6, [25]);
    if (i >= 2) return 0;
    const SH = 17.05;
    if (i === 0) return b.y < 12.3 && b.grounded ? go(a, 28.6, [25]) : goTo(a, SH);
    if (b.y < 12.5 && b.grounded) return R;                                           // on the shelf: take the key
    if (b.support === a.id) return pulse(snap);
    if (!b.grounded && b.x > SH - 0.15 && b.y + BODY_H < 14.3 && a.grounded) return R; // in the air beside the shelf: lean in
    if (b.grounded && a.grounded && Math.abs(a.x - SH) < 0.15 && Math.abs(b.x - a.x) < 0.3) return pulse(snap);
    return goTo(b, SH - 0.05);
  },
];
