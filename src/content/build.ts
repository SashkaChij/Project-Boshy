import { ROOM_H, ROOM_W, TILE } from '../core/constants.js'
import { emptyLevel, makeRoom, setTile } from '../core/level.js'
import {
  T_CONV_L, T_CONV_R, T_DECO1, T_DECO2, T_DECO3, T_DECO4, T_EMPTY, T_ICE, T_PLATFORM,
  T_SOLID1, T_SOLID2, T_SOLID3, T_SOLID4, T_SOLID5, T_SOLID6,
  T_SPIKE_D, T_SPIKE_L, T_SPIKE_R, T_SPIKE_U, T_VINE_L, T_VINE_R,
  T_WATER1, T_WATER2, T_WATER3,
} from '../core/registry/tileMaterials.js'
import type { EntitySpawn, LevelData, Room } from '../core/types.js'

/**
 * Rooms are authored as ASCII art: 19 strings of 25 characters each.
 *
 * Writing raw tile-id arrays by hand is unreviewable and impossible to diff.
 * ASCII art is both, so a level change reads like a level change in a pull
 * request instead of like a wall of shifted integers.
 */
export const CHARS: Readonly<Record<string, number>> = Object.freeze({
  ' ': T_EMPTY,
  '.': T_EMPTY,
  '#': T_SOLID1,
  '=': T_SOLID2,
  'B': T_SOLID3,
  'b': T_SOLID4,
  'M': T_SOLID5,
  'm': T_SOLID6,
  '-': T_PLATFORM,
  '[': T_VINE_L,
  ']': T_VINE_R,
  '~': T_WATER1,
  'W': T_WATER2,
  'w': T_WATER3,
  'i': T_ICE,
  '<': T_CONV_L,
  '>': T_CONV_R,
  '^': T_SPIKE_U,
  'v': T_SPIKE_D,
  '(': T_SPIKE_L,
  ')': T_SPIKE_R,
  ',': T_DECO1,
  "'": T_DECO2,
  '"': T_DECO3,
  '`': T_DECO4,
})

export interface RoomSpec {
  /** World-grid position, not pixels. */
  gx: number
  gy: number
  /** Exactly ROOM_H strings of ROOM_W characters. */
  main: string[]
  bg?: string[]
  fg?: string[]
  entities?: EntitySpawn[]
  color?: string
  art?: string
  music?: string
}

export class RoomShapeError extends Error {}

function paint(room: Room, layer: 'bg' | 'main' | 'fg', art: string[], label: string): void {
  if (art.length !== ROOM_H) {
    throw new RoomShapeError(`${label}: expected ${ROOM_H} rows, got ${art.length}`)
  }
  for (let ty = 0; ty < ROOM_H; ty++) {
    const row = art[ty] as string
    if (row.length !== ROOM_W) {
      throw new RoomShapeError(`${label}: row ${ty} has ${row.length} chars, expected ${ROOM_W}`)
    }
    for (let tx = 0; tx < ROOM_W; tx++) {
      const ch = row[tx] as string
      const tile = CHARS[ch]
      if (tile === undefined) {
        throw new RoomShapeError(`${label}: unknown tile char ${JSON.stringify(ch)} at ${tx},${ty}`)
      }
      setTile(room, layer, tx, ty, tile)
    }
  }
}

export function buildRoom(spec: RoomSpec, label = 'room'): Room {
  const room = makeRoom(spec.gx, spec.gy)
  paint(room, 'main', spec.main, `${label}.main`)
  if (spec.bg) paint(room, 'bg', spec.bg, `${label}.bg`)
  if (spec.fg) paint(room, 'fg', spec.fg, `${label}.fg`)
  if (spec.color) room.bg.color = spec.color
  if (spec.art) room.bg.art = spec.art
  if (spec.music) room.music = spec.music
  room.entities = spec.entities ? spec.entities.slice() : []
  return room
}

export interface LevelSpec {
  id: string
  title: string
  author?: string
  difficulty?: number
  start?: number
  rooms: RoomSpec[]
}

export function buildLevel(spec: LevelSpec): LevelData {
  const lv = emptyLevel(spec.id, spec.title)
  lv.meta.author = spec.author ?? 'Fox'
  lv.meta.difficulty = spec.difficulty ?? 3
  lv.rooms = spec.rooms.map((r, i) => buildRoom(r, `${spec.id}#${i}`))
  lv.start = { room: spec.start ?? 0 }
  return lv
}

// ------------------------------------------------------- entity shorthand ---
// Coordinates are given in TILES and converted here: a designer thinks
// "column 7, row 12", not "pixel 240, 400".

const C = (tx: number): number => tx * TILE + TILE / 2
const R = (ty: number): number => ty * TILE + TILE / 2

export function at(t: string, tx: number, ty: number, d = 0, p?: Record<string, number>): EntitySpawn {
  const e: EntitySpawn = { t, x: C(tx), y: R(ty) }
  if (d) e.d = d
  if (p) e.p = p
  return e
}

/** Half-tile precision, for hazards that need to sit between the grid lines. */
export function half(t: string, tx: number, ty: number, d = 0, p?: Record<string, number>): EntitySpawn {
  const e: EntitySpawn = { t, x: tx * TILE, y: ty * TILE }
  if (d) e.d = d
  if (p) e.p = p
  return e
}

/** Player spawn standing on top of the given tile row. */
export function spawnAt(tx: number, floorRow: number, facing = 1): EntitySpawn {
  return { t: 'spawn', x: C(tx), y: floorRow * TILE - 9, d: facing }
}

export function saveAt(tx: number, ty: number): EntitySpawn {
  return at('save', tx, ty)
}

export function goalAt(tx: number, ty: number): EntitySpawn {
  return at('goal', tx, ty)
}
