// Co-op platformer levels as ASCII maps (32 x 18 tiles, y grows downwards), in two sets:
// "nivel0" (Room 1, Patapim) and "sahur" (Room 7, Sahur's way out).
// # solid, . air, S spawn, D door (2x2), B bell (every bell must ring), b button, G gate, P moving platform, K key,
// ^ spikes (touching the bottom quarter of the cell sends you back to the start).
// Pure data + parser: no DOM, no globals, deterministic.
export const W = 32;
export const H = 18;

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

// Room 7: the same gadgets, combined. Every level is solvable by two players (tests_js/platformer.test.mjs).
const SAHUR = [
  {
    id: "campanadas",
    title: "Tung, tung, tung",
    hint: "Tres campanas: tocadlas todas para abrir la puerta.",
    rows: rows(
      WALL, air(8),
      `#${".".repeat(15)}B${".".repeat(14)}#`,                  // bell on top of the block
      AIR,
      `#${".".repeat(8)}B${".".repeat(14)}B${".".repeat(6)}#`,  // bells over the floor (columns 9 and 24)
      air(2),
      `#${".".repeat(14)}####${".".repeat(8)}DD..#`,
      `#.SSSSSS${".".repeat(7)}####${".".repeat(8)}DD..#`,
      FLOOR,
    ),
  },
  {
    id: "pinchos",
    title: "Suelo de pinchos",
    hint: "Saltad los pinchos y pisad el botón entre varios.",
    rows: rows(
      WALL,
      Array.from({ length: 13 }, () => `#${".".repeat(19)}G${".".repeat(10)}#`),
      `#${".".repeat(19)}G${".".repeat(6)}DD..#`,
      `#.SSSSSS..^^${".".repeat(8)}G...^^.DD..#`,
      `#############bbb${"#".repeat(16)}`,
      WALL,
    ),
  },
  {
    id: "foso",
    title: "El foso",
    hint: "Bajad la llave de la repisa y cruzad todos juntos.",
    rows: rows(
      WALL, air(11),
      `#...K${".".repeat(26)}#`,
      `#..####${".".repeat(24)}#`,                               // the key shelf, floating over the spawn
      DOOR_ROW, SPAWN_ROW,
      `#########PPP${".".repeat(12)}########`,
      `#########${".".repeat(15)}########`,
    ),
  },
  {
    id: "salida",
    title: "La salida",
    hint: "Botón, llave y pinchos: llegad todos a la puerta.",
    rows: rows(
      WALL,
      Array.from({ length: 11 }, () => `#${".".repeat(12)}G${".".repeat(17)}#`),
      `#${".".repeat(12)}G${".".repeat(5)}K${".".repeat(11)}#`,
      `#${".".repeat(12)}G${".".repeat(4)}###${".".repeat(10)}#`,     // the key shelf floats: you walk under it
      `#${".".repeat(12)}G${".".repeat(14)}DD.#`,                      // door on columns 28-29
      `#.SSSSSS${".".repeat(5)}G${".".repeat(11)}^^.DD.#`,
      `#########bbb${"#".repeat(20)}`,
      WALL,
    ),
  },
];

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

/** Parse a level's rows into the geometry the sim and the renderer share. */
export function parseLevel(levelRows) {
  if (levelRows.length !== H) throw new Error(`level needs ${H} rows`);
  const found = {};
  levelRows.forEach((line, r) => {
    if (line.length !== W) throw new Error(`row ${r} needs ${W} columns`);
    [...line].forEach((ch, c) => { if ("SDBbGPK^".includes(ch)) (found[ch] ||= []).push({ c, r }); });
  });
  const solid = levelRows.map((line) => [...line].map((ch) => ch === "#" || ch === "b"));

  const spawnBox = box(found.S);
  const out = {
    w: W, h: H, rows: levelRows, solid,
    spawn: { x0: spawnBox.x, x1: spawnBox.x + spawnBox.w, y: spawnBox.y + 1 }, // y = floor line (feet)
    door: found.D ? box(found.D) : null,
    bell: null, bells: [], button: null, gate: null, platform: null, key: null, spikes: [],
  };
  if (found.B) {
    out.bells = found.B.map(({ c, r }) => ({ x: c, y: r + 0.2, w: 1, h: 1 })).sort((p, q) => p.x - q.x); // left to right
    out.bell = out.bells[0];
  }
  if (found.b) out.button = box(found.b);
  if (found.G) out.gate = box(found.G);
  if (found.K) out.key = { x: found.K[0].c, y: found.K[0].r, w: 1, h: 1 };
  // only the tips hurt: a standing jump from the very edge always clears a 2-wide strip
  if (found["^"]) out.spikes = found["^"].map(({ c, r }) => ({ x: c, y: r + 0.75, w: 1, h: 0.25 }));
  if (found.P) {
    const p = box(found.P);
    const line = levelRows[p.y];
    const edge = line.indexOf("#", p.x + p.w); // first floor column after the pit
    out.platform = { x0: p.x, x1: edge - p.w, y: p.y, w: p.w, h: 1 };
  }
  return out;
}
