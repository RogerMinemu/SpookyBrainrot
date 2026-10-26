// Join colours: player k always gets COLORS[k % 12] (same on TV blob, phone and lists).
export const COLORS = [
  "#E5484D", "#3E8EDE", "#46B96B", "#F2B134", "#9B6BDF", "#F07F3C",
  "#2FB9B3", "#E56FB1", "#8FBF3A", "#8C6B4F", "#5F6FE0", "#C9C34A",
];

// Spanish names of those colours, with article ("Eres el rojo"). Same order as COLORS.
export const COLOR_NAMES = [
  "el rojo", "el azul", "el verde", "el amarillo", "el morado", "el naranja",
  "el turquesa", "el rosa", "el lima", "el marrón", "el añil", "el mostaza",
];

export const colorNameFor = (joinIdx) => COLOR_NAMES[((Number(joinIdx) || 0) % COLOR_NAMES.length + COLOR_NAMES.length) % COLOR_NAMES.length];

export const colorFor = (joinIdx) => COLORS[((Number(joinIdx) || 0) % COLORS.length + COLORS.length) % COLORS.length];
