/**
 * Tile material table.
 *
 * There is deliberately NO separate hazard layer. Spikes live in the same
 * `main` layer as ground and derive their behaviour from this table, which
 * means collision is one array lookup and painting a spike is the same brush
 * stroke as painting a floor.
 */

export const T_EMPTY = 0

// Solid variants -- six different looks, identical behaviour.
export const T_SOLID1 = 1
export const T_SOLID2 = 2
export const T_SOLID3 = 3
export const T_SOLID4 = 4
export const T_SOLID5 = 5
export const T_SOLID6 = 6

export const T_PLATFORM = 7

export const T_VINE_L = 8
export const T_VINE_R = 9

export const T_WATER1 = 10
export const T_WATER2 = 11
export const T_WATER3 = 12

export const T_ICE = 13

export const T_CONV_L = 14
export const T_CONV_R = 15

export const T_SPIKE_U = 16
export const T_SPIKE_D = 17
export const T_SPIKE_L = 18
export const T_SPIKE_R = 19

// Decoration: drawn, never collided with.
export const T_DECO1 = 20
export const T_DECO2 = 21
export const T_DECO3 = 22
export const T_DECO4 = 23

export const TILE_COUNT = 24

export interface TileMaterial {
  solid: boolean
  /** Kills on contact, tested against a per-pixel mask, not the tile box. */
  hazard: boolean
  /** Solid only when falling onto its top edge. */
  oneway: boolean
  /** -1 = clingable on its left face, 1 = right face, 0 = not climbable. */
  climb: number
  /** 0 = dry, otherwise the water variant number. */
  water: number
  slip: boolean
  /** Horizontal push per tick while standing on it. */
  conveyor: number
  /** Index into SPIKE_MASKS, or -1. */
  mask: number
}

function mat(o: Partial<TileMaterial>): TileMaterial {
  return {
    solid: false,
    hazard: false,
    oneway: false,
    climb: 0,
    water: 0,
    slip: false,
    conveyor: 0,
    mask: -1,
    ...o,
  }
}

const SOLID = mat({ solid: true })

export const TILE_MATERIALS: readonly TileMaterial[] = Object.freeze([
  /* 0  */ mat({}),
  /* 1  */ SOLID,
  /* 2  */ SOLID,
  /* 3  */ SOLID,
  /* 4  */ SOLID,
  /* 5  */ SOLID,
  /* 6  */ SOLID,
  /* 7  */ mat({ oneway: true }),
  /* 8  */ mat({ solid: true, climb: -1 }),
  /* 9  */ mat({ solid: true, climb: 1 }),
  /* 10 */ mat({ water: 1 }),
  /* 11 */ mat({ water: 2 }),
  /* 12 */ mat({ water: 3 }),
  /* 13 */ mat({ solid: true, slip: true }),
  /* 14 */ mat({ solid: true, conveyor: -1 }),
  /* 15 */ mat({ solid: true, conveyor: 1 }),
  /* 16 */ mat({ hazard: true, mask: 0 }),
  /* 17 */ mat({ hazard: true, mask: 1 }),
  /* 18 */ mat({ hazard: true, mask: 2 }),
  /* 19 */ mat({ hazard: true, mask: 3 }),
  /* 20 */ mat({}),
  /* 21 */ mat({}),
  /* 22 */ mat({}),
  /* 23 */ mat({}),
])

export function material(tile: number): TileMaterial {
  return TILE_MATERIALS[tile] ?? (TILE_MATERIALS[0] as TileMaterial)
}

/**
 * Per-pixel spike masks, one Uint32Array of 32 rows per orientation.
 * Bit x of row y is set when tile-local pixel (x, y) is lethal.
 *
 * Spikes are triangles, and a box test makes them feel wrong in both
 * directions: you die standing beside one, and you survive landing on the tip.
 * Generating the mask from the same formula the renderer draws means the
 * hitbox can never drift from the art.
 */
export const SPIKE_MASKS: readonly Uint32Array[] = (() => {
  const up = new Uint32Array(32)
  const down = new Uint32Array(32)
  const left = new Uint32Array(32)
  const right = new Uint32Array(32)
  for (let y = 0; y < 32; y++) {
    let ru = 0
    let rd = 0
    let rl = 0
    let rr = 0
    for (let x = 0; x < 32; x++) {
      // Tip at the top: half-width grows by 1/2 px per row.
      if (Math.abs(2 * x - 31) <= y + 1) ru |= 1 << x
      if (Math.abs(2 * x - 31) <= 32 - y) rd |= 1 << x
      if (Math.abs(2 * y - 31) <= x + 1) rl |= 1 << x
      if (Math.abs(2 * y - 31) <= 32 - x) rr |= 1 << x
    }
    up[y] = ru >>> 0
    down[y] = rd >>> 0
    left[y] = rl >>> 0
    right[y] = rr >>> 0
  }
  return Object.freeze([up, down, left, right])
})()

/** Bit mask covering columns a..b inclusive, 0 <= a <= b <= 31. */
export function rangeMask(a: number, b: number): number {
  if (b < a) return 0
  if (a <= 0 && b >= 31) return 0xffffffff
  const lo = a < 0 ? 0 : a
  const hi = b > 31 ? 31 : b
  const width = hi - lo + 1
  if (width >= 32) return 0xffffffff
  return (((1 << width) - 1) << lo) >>> 0
}
