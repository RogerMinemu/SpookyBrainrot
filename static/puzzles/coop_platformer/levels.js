// Co-op platformer levels as ASCII maps (18 tiles high, y grows downwards), in two sets:
// "nivel0" (Room 1, Patapim: one 32-wide screen each) and "sahur" (Room 6: long levels that scroll).
// # solid, . air, S spawn, D door (2x2), B bell (every bell must ring), K key, F lantern (lights up as the group passes),
// b heavy button -> G gate (opens for good once enough weight held it), o small button -> g gate (open only while
// somebody stands on one of its buttons), P ferry (crosses to the next floor of its row), E lift with e above it
// (its top stop), T drum (a floor tile that bounces you ~5 tiles up), ^ spikes (only the bottom quarter of the cell
// hurts). A button opens the nearest gate of its kind.
// Pure data + parser: no DOM, no globals, deterministic.
export const W = 32; // Room 1's width: one screen
export const H = 18;
export const VIEW_W = 30; // tiles the TV shows across; a wider level scrolls

const WALL = "#".repeat(W);
const AIR = `#${".".repeat(W - 2)}#`;
const DOOR_ROW = `#${".".repeat(26)}DD..#`;           // door on columns 27-28
const SPAWN_ROW = `#.SSSSSS${".".repeat(19)}DD..#`;    // spawn on columns 2-7, door on 27-28
const FLOOR = [WALL, WALL];

const rows = (...parts) => parts.flat();
const air = (n) => Array.from({ length: n }, () => AIR);

const NIVEL0 = [
  {
    id: "torre",
    title: "La torre humana",
    hint: "Uno se sube a los hombros de otro para tocar la campana.",
    rows: rows(WALL, air(10), `#${".".repeat(15)}B${".".repeat(14)}#`, air(2), DOOR_ROW, SPAWN_ROW, FLOOR),
  },
  {
    id: "boton",
    title: "El botón pesado",
    hint: "Pisad el botón entre varios hasta que la verja ceda.",
    rows: rows(
      WALL,
      Array.from({ length: 13 }, () => `#${".".repeat(15)}G${".".repeat(14)}#`),
      `#${".".repeat(15)}G${".".repeat(10)}DD..#`,
      `#.SSSSSS${".".repeat(8)}G${".".repeat(10)}DD..#`,
      `#########bbb${"#".repeat(20)}`,
      WALL,
    ),
  },
  {
    id: "plataforma",
    title: "Todos a bordo",
    hint: "La plataforma sólo sale cuando todos estáis encima.",
    rows: rows(
      WALL, air(13), DOOR_ROW, SPAWN_ROW,
      `########PPPP${".".repeat(12)}########`,
      `########${".".repeat(16)}########`,
    ),
  },
  {
    id: "llave",
    title: "La llave",
    hint: "Alguien tiene que subir a por la llave y llevarla hasta la puerta.",
    rows: rows(
      WALL, air(11),
      `#${".".repeat(19)}K${".".repeat(10)}#`,
      `#${".".repeat(17)}#####${".".repeat(8)}#`,
      DOOR_ROW, SPAWN_ROW,
      `${"#".repeat(11)}...${"#".repeat(18)}`,
      `${"#".repeat(11)}...${"#".repeat(18)}`,
    ),
  },
];

// ---- Room 6: long levels glued from sections ------------------------------------------------------------------
// A section is `w` columns of air under a ceiling (row 0) and over a two-row floor (rows 16-17), painted with
// rectangles [ch, c0, r0, c1 = c0, r1 = r0] (inclusive, section columns). glue() puts the sections side by side and
// closes both ends with a wall. The floor top is y = 16: alone you jump 2 tiles up, from a shoulder 3, off a drum 4.
function sec(w, ...shapes) {
  const grid = Array.from({ length: H }, (_, r) => Array(w).fill(r === 0 || r >= H - 2 ? "#" : "."));
  for (const [ch, c0, r0, c1 = c0, r1 = r0] of shapes) {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= w || r < 0 || r >= H) throw new Error(`"${ch}" falls outside its ${w}-wide section`);
        grid[r][c] = ch;
      }
    }
  }
  return grid.map((cells) => cells.join(""));
}
const glue = (...sections) => Array.from({ length: H }, (_, r) => `#${sections.map((s) => s[r]).join("")}#`);
const START = sec(12, ["S", 1, 15, 6, 15]);
const EXIT = sec(12, ["D", 7, 14, 8, 15]);

// Sahur's village at night, five screens of it. Every level is solvable by two players and by twelve
// (tests_js/platformer_sahur.test.mjs runs scripted bots through all of them). Like Piko Park, one fall, spike or
// catch sends the whole group back to the start of the level (restart).
const SAHUR = [
  {
    id: "tung",
    title: "Tung, tung, tung",
    hint: "Tambor para subir. Dos campanas con torre humana y la última, rebotando quietos.",
    rows: glue(
      sec(20, ["S", 1, 15, 6, 15], [".", 13, 16, 14, 17]),  // a 2-wide pit right after the start
      sec(14, ["T", 2, 16], ["#", 3, 12, 9, 15]),            // a drum at the foot of a 4-high wall
      sec(26, ["F", 1, 15], ["B", 8, 11], ["B", 18, 11]),    // two bells for a human tower
      sec(14, ["T", 6, 16, 7, 16], ["B", 6, 9]),             // a bell that only a bounce in place reaches
      EXIT,
    ),
  },
  {
    id: "mercado",
    title: "El mercado de noche",
    hint: "El pesado, entre varios; los pequeños abren su verja solo mientras alguien los pisa.",
    rows: glue(
      START,
      sec(22, ["b", 4, 16, 6, 16], ["^", 10, 15, 11, 15], ["G", 15, 1, 15, 15]),
      sec(24, ["F", 1, 15], ["o", 5, 16, 6, 16], ["g", 11, 1, 11, 15], ["o", 16, 16, 17, 16]), // a button each side
      sec(22, ["^", 3, 15, 4, 15], ["#", 8, 14, 10, 15], ["^", 11, 15, 12, 15], ["^", 17, 15, 18, 15]), // a stall
      EXIT,
    ),
  },
  {
    id: "tejados",
    title: "Los tejados",
    hint: "El ascensor sube con todos encima. Saltad de tejado en tejado; la llave, en el alero.",
    rows: glue(
      START,
      sec(14, ["E", 2, 16, 4, 16], ["e", 2, 9], ["#", 5, 9, 13, 15]),  // the lift up to the first roof (y = 9)
      sec(30, ["#", 0, 9, 29, 15], ["F", 1, 8], [".", 8, 9, 9, 17], ["#", 10, 8, 16, 8], [".", 17, 9, 19, 17],
        ["#", 24, 7, 25, 8]),                                          // roofs over the void, one a tile higher
      sec(22, ["#", 0, 9, 4, 15], ["P", 5, 9, 7, 9], [".", 5, 10, 17, 17], ["#", 18, 9, 21, 15]), // over the street
      sec(24, ["#", 0, 9, 23, 15], ["#", 6, 6, 8, 6], ["K", 7, 5], ["D", 18, 7, 19, 8]), // an eave 3 up: walk under it
    ),
  },
  {
    id: "tambores",
    title: "Los tambores",
    hint: "De tambor en tambor sin parar. Las campanas solo suenan rebotando quietos.",
    rows: glue(
      START,
      sec(26, ["T", 3, 16, 4, 16], ["^", 5, 15, 7, 15], ["T", 8, 16, 9, 16], ["^", 10, 15, 12, 15],
        ["T", 13, 16, 14, 16], ["^", 15, 15, 18, 15]),                 // keep running: drum, drum, drum, floor
      sec(22, ["F", 1, 15], ["T", 5, 16, 6, 16], ["B", 5, 9], ["T", 14, 16, 15, 16], ["B", 14, 9]),
      sec(24, ["b", 3, 16, 5, 16], ["G", 10, 1, 10, 15], ["^", 12, 15, 13, 15], ["T", 17, 16], ["#", 18, 12, 23, 15]),
      sec(12, ["#", 0, 12, 11, 15], ["D", 7, 10, 8, 11]),
    ),
  },
  {
    id: "huida",
    title: "¡Que viene Sahur!",
    hint: "Al coger la llave, Sahur despierta. ¡Corred a la puerta! Si cae uno, volvéis todos al principio.",
    chase: 2.5, // tiles per second Sahur walks once the key is taken (running is 7)
    rows: glue(
      START,
      sec(20, ["b", 3, 16, 5, 16], ["G", 12, 1, 12, 15], ["^", 15, 15, 16, 15]),
      sec(26, ["F", 1, 15], ["E", 4, 16, 6, 16], ["e", 4, 10], ["#", 7, 10, 25, 15], ["#", 15, 7, 17, 7], ["K", 16, 6]),
      sec(36, ["F", 2, 15], ["^", 6, 15, 7, 15], [".", 12, 16, 13, 17], ["T", 18, 16], ["#", 19, 12, 24, 15],
        ["^", 32, 15, 33, 15]),                                        // the run: spikes, pit, drum wall, spikes
      EXIT,
    ),
  },
].map((def) => ({ ...def, restart: true }));

export const LEVEL_SETS = { nivel0: NIVEL0, sahur: SAHUR };
export const DEFAULT_SET = "nivel0";
/** Room 1's levels (the default set). */
export const LEVELS = NIVEL0;

/** The levels of a set; an unknown set falls back to Room 1's. */
export const levelsOf = (set) => LEVEL_SETS[set] || LEVEL_SETS[DEFAULT_SET];

const box = (cells) => {
  const x0 = Math.min(...cells.map((c) => c.c));
  const x1 = Math.max(...cells.map((c) => c.c)) + 1;
  const y0 = Math.min(...cells.map((c) => c.r));
  const y1 = Math.max(...cells.map((c) => c.r)) + 1;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

/** Cells grouped into runs, left to right: horizontal (same row, next column) or vertical (same column, next row). */
function runs(cells = [], vertical = false) {
  const major = (p) => (vertical ? p.c : p.r);
  const minor = (p) => (vertical ? p.r : p.c);
  const sorted = [...cells].sort((p, q) => major(p) - major(q) || minor(p) - minor(q));
  const out = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    const prev = last && last[last.length - 1];
    if (prev && major(prev) === major(p) && minor(prev) === minor(p) - 1) last.push(p);
    else out.push([p]);
  }
  return out.map(box).sort((p, q) => p.x - q.x || p.y - q.y);
}

const SOLID = new Set(["#", "b", "o", "T"]);

/** Parse a level's rows into the geometry the sim and the renderer share. */
export function parseLevel(levelRows) {
  if (levelRows.length !== H) throw new Error(`level needs ${H} rows`);
  const w = levelRows[0].length;
  const found = {};
  levelRows.forEach((line, r) => {
    if (line.length !== w) throw new Error(`row ${r} needs ${w} columns`);
    [...line].forEach((ch, c) => { if ("SDBbGgoPEeKT^F".includes(ch)) (found[ch] ||= []).push({ c, r }); });
  });
  const solid = levelRows.map((line) => [...line].map((ch) => SOLID.has(ch)));
  const drum = levelRows.map((line) => [...line].map((ch) => ch === "T"));

  const spawnBox = box(found.S);
  const out = {
    w, h: H, rows: levelRows, solid, drum, scroll: w > VIEW_W + 2,
    spawn: { x0: spawnBox.x, x1: spawnBox.x + spawnBox.w, y: spawnBox.y + 1 }, // y = floor line (feet)
    door: found.D ? box(found.D) : null,
    bell: null, bells: [], button: null, gate: null, platform: null, key: null, spikes: [],
    buttons: [], gates: [], platforms: [], lanterns: [], drums: [],
  };
  if (found.B) {
    out.bells = found.B.map(({ c, r }) => ({ x: c, y: r + 0.2, w: 1, h: 1 })).sort((p, q) => p.x - q.x); // left to right
    out.bell = out.bells[0];
  }
  out.gates = [...runs(found.G, true).map((g) => ({ ...g, kind: "heavy" })), ...runs(found.g, true).map((g) => ({ ...g, kind: "small" }))];
  const gap = (g, bt) => Math.abs(g.x + g.w / 2 - (bt.x + bt.w / 2));
  const nearestGate = (bt) => out.gates.reduce((best, g, i) =>
    (g.kind === bt.kind && (best < 0 || gap(g, bt) < gap(out.gates[best], bt)) ? i : best), -1);
  out.buttons = [...runs(found.b).map((b) => ({ ...b, kind: "heavy" })), ...runs(found.o).map((b) => ({ ...b, kind: "small" }))]
    .map((bt) => ({ ...bt, gate: nearestGate(bt) }));
  out.button = out.buttons.find((b) => b.kind === "heavy") || null; // Room 1's single button and gate
  out.gate = out.gates.find((g) => g.kind === "heavy") || null;
  if (found.K) out.key = { x: found.K[0].c, y: found.K[0].r, w: 1, h: 1 };
  // only the tips hurt: a standing jump from the very edge always clears a 2-wide strip
  if (found["^"]) out.spikes = found["^"].map(({ c, r }) => ({ x: c, y: r + 0.75, w: 1, h: 0.25 }));
  for (const p of runs(found.P)) {
    const edge = levelRows[p.y].indexOf("#", p.x + p.w); // first floor column after the pit
    if (edge < 0) throw new Error(`the ferry at column ${p.x} has no floor to reach`);
    out.platforms.push({ kind: "ferry", x0: p.x, x1: edge - p.w, y: p.y, w: p.w, h: 1 });
  }
  for (const p of runs(found.E)) {
    const tops = (found.e || []).filter((m) => m.r < p.y && m.c >= p.x && m.c < p.x + p.w).map((m) => m.r);
    if (!tops.length) throw new Error(`the lift at column ${p.x} has no top stop (e)`);
    out.platforms.push({ kind: "lift", x: p.x, y0: p.y, y1: Math.max(...tops), w: p.w, h: 1 });
  }
  out.platforms.sort((p, q) => (p.x0 ?? p.x) - (q.x0 ?? q.x));
  out.platform = out.platforms.find((p) => p.kind === "ferry") || null;
  out.lanterns = (found.F || []).map(({ c, r }) => ({ x: c, y: r + 1 })).sort((p, q) => p.x - q.x); // y = its floor line
  out.drums = (found.T || []).map(({ c, r }) => ({ x: c, y: r }));
  return out;
}
