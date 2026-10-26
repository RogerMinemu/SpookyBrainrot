// Input mask bits shared by phones and sims: L=1 R=2 J=4 A=8 (state-based, see GAME_DESIGN).
export const BIT = { L: 1, R: 2, J: 4, A: 8 };
export const MASK_ALL = 0x0f;

export const clean = (m) => (Number.isInteger(m) ? m & MASK_ALL : 0);
export const has = (mask, bit) => (mask & bit) !== 0;
/** -1 left, +1 right, 0 none (both cancel out). */
export const axis = (mask) => (has(mask, BIT.R) ? 1 : 0) - (has(mask, BIT.L) ? 1 : 0);
