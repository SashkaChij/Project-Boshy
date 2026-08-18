/**
 * Seeded RNG. Math.random is banned in core/ -- every random draw a replay
 * depends on must come from state that lives on the World and is restored
 * with it.
 *
 * Note: gameplay randomness is deliberately rare in this genre (the whole
 * point is memorisation). This exists for death particles, boss pattern
 * variation, and taunt selection.
 */

export interface RngState {
  s: number
}

export function createRng(seed: number): RngState {
  // Avoid the degenerate all-zero state.
  return { s: (seed >>> 0) || 0x9e3779b9 }
}

/** mulberry32. Returns 0..1. */
export function nextFloat(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0
  let t = r.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Integer in [0, n). */
export function nextInt(r: RngState, n: number): number {
  return Math.floor(nextFloat(r) * n)
}

/** Float in [0, n). Mirrors GML's random(n). */
export function nextRange(r: RngState, n: number): number {
  return nextFloat(r) * n
}
