import { HITBOX_B, HITBOX_L, HITBOX_R, HITBOX_T, ROOM_H, ROOM_W, TILE } from './constants.js'
import { roundHalfToEven } from './math.js'
import { SPIKE_MASKS, material, rangeMask } from './registry/tileMaterials.js'

/**
 * Collision against the tile grid.
 *
 * Max displacement in one tick is 15 px (vine jump) and the smallest collider
 * is a 32 px tile, so step-then-resolve cannot tunnel. That removes the need
 * for swept collision -- and with it the biggest source of float drift and
 * nondeterminism in platformer physics.
 */

export interface Box {
  l: number
  t: number
  r: number
  b: number
}

/** Axis-aligned rectangle contributed by a solid entity (a block, a platform). */
export interface SolidRect {
  l: number
  t: number
  r: number
  b: number
  /** Only blocks downward motion, like a one-way platform. */
  oneway: boolean
}

/**
 * The player's integer bounding box.
 *
 * The position is fractional but the box is not: GameMaker derives bbox from
 * round(x), and round() in GML is half-to-even. Using Math.round here shifts
 * the box by a pixel on exact .5 coordinates.
 */
export function playerBox(x: number, y: number, gravDir: number): Box {
  const ix = roundHalfToEven(x)
  const iy = roundHalfToEven(y)
  if (gravDir >= 0) {
    return { l: ix + HITBOX_L, r: ix + HITBOX_R, t: iy + HITBOX_T, b: iy + HITBOX_B }
  }
  return { l: ix + HITBOX_L, r: ix + HITBOX_R, t: iy - HITBOX_B, b: iy - HITBOX_T }
}

export function tileAt(main: number[], tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return 0
  return main[ty * ROOM_W + tx] ?? 0
}

export function tileAtPixel(main: number[], px: number, py: number): number {
  return tileAt(main, Math.floor(px / TILE), Math.floor(py / TILE))
}

/**
 * Is the box overlapping anything that stops motion?
 *
 * `prevBottom` enables one-way platforms: a platform blocks only when the
 * mover's bottom edge was strictly above the platform's top row, so you can
 * jump up through it and you never get stuck inside one.
 */
export function boxBlocked(
  main: number[],
  box: Box,
  solids: readonly SolidRect[],
  movingDown: boolean,
  prevBottom: number,
): boolean {
  const tx0 = Math.floor(box.l / TILE)
  const tx1 = Math.floor(box.r / TILE)
  const ty0 = Math.floor(box.t / TILE)
  const ty1 = Math.floor(box.b / TILE)

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const m = material(tileAt(main, tx, ty))
      if (m.solid) return true
      if (m.oneway && movingDown && ty * TILE > prevBottom) return true
    }
  }

  for (let i = 0; i < solids.length; i++) {
    const s = solids[i] as SolidRect
    if (box.r < s.l || box.l > s.r || box.b < s.t || box.t > s.b) continue
    if (!s.oneway) return true
    if (movingDown && s.t > prevBottom) return true
  }
  return false
}

/**
 * Per-pixel hazard test.
 *
 * Spikes are triangles. A box test kills you standing beside one and lets you
 * survive landing on the tip -- both of which read as the game cheating.
 */
export function boxHitsHazard(main: number[], box: Box): boolean {
  const tx0 = Math.floor(box.l / TILE)
  const tx1 = Math.floor(box.r / TILE)
  const ty0 = Math.floor(box.t / TILE)
  const ty1 = Math.floor(box.b / TILE)

  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const m = material(tileAt(main, tx, ty))
      if (!m.hazard) continue
      const mask = SPIKE_MASKS[m.mask]
      if (!mask) continue

      const originX = tx * TILE
      const originY = ty * TILE
      const lx0 = Math.max(0, box.l - originX)
      const lx1 = Math.min(31, box.r - originX)
      const ly0 = Math.max(0, box.t - originY)
      const ly1 = Math.min(31, box.b - originY)
      if (lx1 < lx0 || ly1 < ly0) continue

      const cols = rangeMask(lx0, lx1)
      for (let ly = ly0; ly <= ly1; ly++) {
        if (((mask[ly] as number) & cols) !== 0) return true
      }
    }
  }
  return false
}

/** Sample the tile at the player's centre for water / ambient effects. */
export function sampleWater(main: number[], box: Box): number {
  const cx = (box.l + box.r) >> 1
  const cy = (box.t + box.b) >> 1
  return material(tileAtPixel(main, cx, cy)).water
}

/** True when the box is resting on ground (one pixel below is blocked). */
export function isGrounded(
  main: number[],
  box: Box,
  solids: readonly SolidRect[],
  gravDir: number,
): boolean {
  const probe: Box =
    gravDir >= 0
      ? { l: box.l, r: box.r, t: box.t + 1, b: box.b + 1 }
      : { l: box.l, r: box.r, t: box.t - 1, b: box.b - 1 }
  return boxBlocked(main, probe, solids, gravDir >= 0, gravDir >= 0 ? box.b : box.t)
}

/** Material flags of whatever the box is standing on, for ice and conveyors. */
export function groundMaterial(
  main: number[],
  box: Box,
  gravDir: number,
): { slip: boolean; conveyor: number } {
  const py = gravDir >= 0 ? box.b + 1 : box.t - 1
  let slip = false
  let conveyor = 0
  const tx0 = Math.floor(box.l / TILE)
  const tx1 = Math.floor(box.r / TILE)
  const ty = Math.floor(py / TILE)
  for (let tx = tx0; tx <= tx1; tx++) {
    const m = material(tileAt(main, tx, ty))
    if (!m.solid) continue
    if (m.slip) slip = true
    if (m.conveyor !== 0) conveyor = m.conveyor
  }
  return { slip, conveyor }
}

/** Which side, if any, has a climbable wall touching the box. */
export function vineSide(main: number[], box: Box): number {
  const ty0 = Math.floor(box.t / TILE)
  const ty1 = Math.floor(box.b / TILE)
  const txL = Math.floor((box.l - 1) / TILE)
  const txR = Math.floor((box.r + 1) / TILE)
  for (let ty = ty0; ty <= ty1; ty++) {
    if (material(tileAt(main, txL, ty)).climb === 1) return -1
    if (material(tileAt(main, txR, ty)).climb === -1) return 1
  }
  return 0
}
