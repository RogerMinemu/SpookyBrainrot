// Axis-aligned boxes {x, y, w, h}, y grows downwards. Pure helpers.
export const overlapX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
export const overlapY = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
/** Strict overlap: boxes that merely touch do not intersect. */
export const intersects = (a, b) => overlapX(a, b) > 0 && overlapY(a, b) > 0;
export const containsPoint = (a, px, py) => px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h;
