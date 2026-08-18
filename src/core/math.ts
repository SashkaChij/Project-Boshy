/**
 * Deterministic math for the pure core.
 *
 * Math.sin/cos/sqrt are banned inside core/: their last-bit results differ
 * between JS engines, which silently desyncs replays across browsers. Anything
 * periodic uses SIN_LUT instead.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function sign(v: number): number {
  return v > 0 ? 1 : v < 0 ? -1 : 0
}

/**
 * Round half to even ("banker's rounding").
 *
 * This is what GameMaker's round() does, and the fangame engines rely on it
 * when deriving an integer bounding box from a fractional position. Using
 * Math.round() instead shifts the hitbox by one pixel on exact .5 coordinates,
 * which is a class of "why did I die there" bug.
 */
export function roundHalfToEven(v: number): number {
  const floor = Math.floor(v)
  const diff = v - floor
  if (diff > 0.5) return floor + 1
  if (diff < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

/** Table size must be a power of two so the index mask is exact. */
export const SIN_STEPS = 4096
const SIN_MASK = SIN_STEPS - 1
const SIN_SCALE = 65536

/**
 * Fixed-point sine table, Q16.16. Built once at module load from Math.sin --
 * that single call happens outside any simulation tick, so its result is
 * baked into the table identically on every engine before a replay can
 * observe it.
 */
const SIN_LUT: Int32Array = (() => {
  const t = new Int32Array(SIN_STEPS)
  for (let i = 0; i < SIN_STEPS; i++) {
    t[i] = Math.round(Math.sin((i / SIN_STEPS) * Math.PI * 2) * SIN_SCALE)
  }
  return t
})()

/** sin(phase) where phase is in table steps, not radians. Returns -1..1. */
export function lutSin(phaseSteps: number): number {
  const i = ((phaseSteps | 0) & SIN_MASK) >>> 0
  return (SIN_LUT[i] as number) / SIN_SCALE
}

/** cos(phase) where phase is in table steps. */
export function lutCos(phaseSteps: number): number {
  return lutSin(phaseSteps + SIN_STEPS / 4)
}

/** Integer square root, for distance comparisons that must be exact. */
export function isqrt(n: number): number {
  if (n <= 0) return 0
  let x = n
  let y = (x + 1) >> 1
  while (y < x) {
    x = y
    y = ((n / x) + x) >> 1
  }
  return x
}

/** Move `v` toward `target` by at most `step`. */
export function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(v + step, target)
  if (v > target) return Math.max(v - step, target)
  return target
}

/** FNV-1a over a string. Binds a replay to the exact level it was recorded on. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
