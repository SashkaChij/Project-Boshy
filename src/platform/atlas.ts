import { TILE } from '../core/constants.js'
import { SPIKE_MASKS, T_SPIKE_U, material } from '../core/registry/tileMaterials.js'
import { PALETTE } from './art/palette.js'
import { SPRITES } from './art/sprites.js'
import type { SpriteData } from './art/types.js'

/**
 * Turns the in-code sprite data into drawable canvases once at boot.
 *
 * Spikes are NOT in the sprite sheet. They are painted here from the very same
 * per-pixel masks the simulation collides against, so the shape a player sees
 * and the shape that kills them cannot drift apart -- which is the failure mode
 * that makes a hard game feel dishonest.
 */
export interface Atlas {
  sprite(name: string): HTMLCanvasElement | undefined
  /** Draw a sprite so its anchor lands on (x, y). */
  draw(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, flipX?: boolean): void
  drawTile(ctx: CanvasRenderingContext2D, tileId: number, px: number, py: number): void
  has(name: string): boolean
}

function rasterise(sd: SpriteData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = sd.w
  c.height = sd.h
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const img = ctx.createImageData(sd.w, sd.h)
  const data = img.data
  for (let y = 0; y < sd.h; y++) {
    const row = sd.rows[y] ?? ''
    for (let x = 0; x < sd.w; x++) {
      const ch = row[x] ?? '.'
      const i = (y * sd.w + x) * 4
      if (ch === '.') {
        data[i + 3] = 0
        continue
      }
      const hex = PALETTE[ch]
      if (!hex) {
        // An unknown palette key is a bug in the art, not a reason to crash --
        // paint it magenta so it is impossible to miss on screen.
        data[i] = 255; data[i + 1] = 0; data[i + 2] = 255; data[i + 3] = 255
        continue
      }
      data[i] = parseInt(hex.slice(1, 3), 16)
      data[i + 1] = parseInt(hex.slice(3, 5), 16)
      data[i + 2] = parseInt(hex.slice(5, 7), 16)
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

const SPIKE_BODY = '#c9d4e0'
const SPIKE_EDGE = '#6d7b8c'
const SPIKE_TIP = '#ffffff'

function rasteriseSpike(maskIndex: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = TILE
  c.height = TILE
  const ctx = c.getContext('2d')
  const mask = SPIKE_MASKS[maskIndex]
  if (!ctx || !mask) return c
  const img = ctx.createImageData(TILE, TILE)
  const data = img.data

  const put = (x: number, y: number, hex: string): void => {
    const i = (y * TILE + x) * 4
    data[i] = parseInt(hex.slice(1, 3), 16)
    data[i + 1] = parseInt(hex.slice(3, 5), 16)
    data[i + 2] = parseInt(hex.slice(5, 7), 16)
    data[i + 3] = 255
  }

  for (let y = 0; y < TILE; y++) {
    const row = mask[y] as number
    for (let x = 0; x < TILE; x++) {
      if ((row & (1 << x)) === 0) continue
      // Edge pixels are any lit pixel with an unlit neighbour.
      const leftOn = x > 0 && (row & (1 << (x - 1))) !== 0
      const rightOn = x < 31 && (row & (1 << (x + 1))) !== 0
      const upRow = y > 0 ? (mask[y - 1] as number) : 0
      const downRow = y < 31 ? (mask[y + 1] as number) : 0
      const upOn = (upRow & (1 << x)) !== 0
      const downOn = (downRow & (1 << x)) !== 0
      const edge = !leftOn || !rightOn || !upOn || !downOn
      const tip = !upOn && !downOn ? false : !leftOn && !rightOn
      put(x, y, tip ? SPIKE_TIP : edge ? SPIKE_EDGE : SPIKE_BODY)
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** Tile id -> sprite key. Spikes are handled separately. */
const TILE_SPRITE: Record<number, string> = {
  1: 'solid1', 2: 'solid2', 3: 'solid3', 4: 'solid4', 5: 'solid5', 6: 'solid6',
  7: 'platform', 8: 'vineL', 9: 'vineR',
  10: 'water1', 11: 'water2', 12: 'water3',
  13: 'ice', 14: 'convL', 15: 'convR',
  20: 'deco1', 21: 'deco2', 22: 'deco3', 23: 'deco4',
}

export function buildAtlas(): Atlas {
  const cache = new Map<string, HTMLCanvasElement>()
  for (const [name, sd] of Object.entries(SPRITES) as [string, SpriteData][]) {
    cache.set(name, rasterise(sd))
  }
  const spikes = [0, 1, 2, 3].map(rasteriseSpike)

  return {
    has: (name) => cache.has(name),
    sprite: (name) => cache.get(name),

    draw(ctx, name, x, y, flipX = false) {
      const c = cache.get(name)
      const sd = SPRITES[name]
      if (!c || !sd) return
      const ax = sd.ax ?? sd.w / 2
      const ay = sd.ay ?? sd.h / 2
      if (flipX) {
        ctx.save()
        ctx.translate(Math.round(x), Math.round(y))
        ctx.scale(-1, 1)
        ctx.drawImage(c, -Math.round(sd.w - ax), -Math.round(ay))
        ctx.restore()
      } else {
        ctx.drawImage(c, Math.round(x - ax), Math.round(y - ay))
      }
    },

    drawTile(ctx, tileId, px, py) {
      if (tileId === 0) return
      const m = material(tileId)
      if (m.mask >= 0) {
        const c = spikes[m.mask]
        if (c) ctx.drawImage(c, px, py)
        return
      }
      const key = TILE_SPRITE[tileId]
      if (!key) return
      const c = cache.get(key)
      if (c) ctx.drawImage(c, px, py)
    },
  }
}

export { T_SPIKE_U }
