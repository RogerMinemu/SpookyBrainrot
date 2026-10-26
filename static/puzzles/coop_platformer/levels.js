// Room 1 "Nivel 0": the four fixed-screen levels as ASCII maps (32 x 18 tiles, y grows downwards).
// # solid, . air, S spawn, D door (2x2), B bell, b button, G gate, P moving platform, K key.
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

export const LEVELS = [
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
    [...line].forEach((ch, c) => { if ("SDBbGPK".includes(ch)) (found[ch] ||= []).push({ c, r }); });
  });
  const solid = levelRows.map((line) => [...line].map((ch) => ch === "#" || ch === "b"));

  const spawnBox = box(found.S);
  const out = {
    w: W, h: H, rows: levelRows, solid,
    spawn: { x0: spawnBox.x, x1: spawnBox.x + spawnBox.w, y: spawnBox.y + 1 }, // y = floor line (feet)
    door: found.D ? box(found.D) : null,
    bell: null, button: null, gate: null, platform: null, key: null,
  };
  if (found.B) out.bell = { x: found.B[0].c, y: found.B[0].r + 0.2, w: 1, h: 1 };
  if (found.b) out.button = box(found.b);
  if (found.G) out.gate = box(found.G);
  if (found.K) out.key = { x: found.K[0].c, y: found.K[0].r, w: 1, h: 1 };
  if (found.P) {
    const p = box(found.P);
    const line = levelRows[p.y];
    const edge = line.indexOf("#", p.x + p.w); // first floor column after the pit
    out.platform = { x0: p.x, x1: edge - p.w, y: p.y, w: p.w, h: 1 };
  }
  return out;
}
