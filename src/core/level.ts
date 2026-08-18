import { MAX_ENTITIES_PER_LEVEL, MAX_ENTITIES_PER_ROOM, MAX_ROOMS, ROOM_H, ROOM_W, TILE } from './constants.js'
import { fnv1a } from './math.js'
import { ENTITY_DEFS, compactProps } from './registry/entityDefs.js'
import { TILE_COUNT, material } from './registry/tileMaterials.js'
import type { EntitySpawn, LevelData, Room, RoomLayers } from './types.js'

export const LEVEL_FORMAT = 'fox-level'
export const LEVEL_VERSION = 1

export type LayerName = keyof RoomLayers

function blankLayer(): number[] {
  return new Array<number>(ROOM_W * ROOM_H).fill(0)
}

export function makeRoom(gx = 0, gy = 0): Room {
  return {
    x: gx,
    y: gy,
    bg: { color: '#0d0d14', art: 'plain', par: 0.5 },
    music: 'trial',
    layers: { bg: blankLayer(), main: blankLayer(), fg: blankLayer() },
    entities: [],
  }
}

/**
 * A fresh level. `id` is injected rather than generated because the core is
 * forbidden from calling Date or Math.random -- both would break replay
 * determinism if they ever crept into a code path the simulation touches.
 */
export function emptyLevel(id = 'draft', title = 'Untitled'): LevelData {
  return {
    format: LEVEL_FORMAT,
    v: LEVEL_VERSION,
    id,
    meta: {
      title,
      author: '',
      created: 0,
      difficulty: 3,
      tags: [],
      verifiedStrict: false,
      verifiedAssist: false,
      clearMs: 0,
    },
    tileset: 'core@1',
    tile: TILE,
    roomW: ROOM_W,
    roomH: ROOM_H,
    rooms: [makeRoom(0, 0)],
    start: { room: 0 },
  }
}

export function setTile(room: Room, layer: LayerName, tx: number, ty: number, tile: number): void {
  if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return
  room.layers[layer][ty * ROOM_W + tx] = tile
}

export function getTile(room: Room, layer: LayerName, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return 0
  return room.layers[layer][ty * ROOM_W + tx] ?? 0
}

// ------------------------------------------------------------- migrations ---

/**
 * Ordered, pure migrations. The loader runs them until the data reaches
 * LEVEL_VERSION. Hard rules that keep this survivable:
 *   - never change the MEANING of a field; add a new one with a default
 *   - never renumber a tile id or rename an entity type after release
 *   - unknown keys survive a load/save round-trip
 *   - v > CURRENT is a clean refusal, never a half-parse
 */
export const MIGRATIONS: ((d: Record<string, unknown>) => Record<string, unknown>)[] = []

export class LevelFormatError extends Error {}

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let d = raw
  let v = typeof d['v'] === 'number' ? (d['v'] as number) : 0
  if (v > LEVEL_VERSION) {
    throw new LevelFormatError(`level.err.newer:${v}`)
  }
  while (v < LEVEL_VERSION) {
    const m = MIGRATIONS[v - 1]
    if (!m) break
    d = m(d)
    v = typeof d['v'] === 'number' ? (d['v'] as number) : v + 1
  }
  return d
}

// ------------------------------------------------------------ parse/write ---

function fixLayer(arr: unknown): number[] {
  const out = blankLayer()
  if (!Array.isArray(arr)) return out
  const n = Math.min(arr.length, out.length)
  for (let i = 0; i < n; i++) {
    const v = arr[i]
    out[i] = typeof v === 'number' && v >= 0 && v < TILE_COUNT ? v : 0
  }
  return out
}

export function parseLevel(input: string | Record<string, unknown>): LevelData {
  const raw = typeof input === 'string' ? (JSON.parse(input) as Record<string, unknown>) : input
  if (!raw || typeof raw !== 'object') throw new LevelFormatError('level.err.notALevel')
  if (raw['format'] !== LEVEL_FORMAT) throw new LevelFormatError('level.err.notALevel')

  const d = migrate(raw)
  const base = emptyLevel(String(d['id'] ?? 'imported'))
  const meta = (d['meta'] ?? {}) as Record<string, unknown>
  const rooms = Array.isArray(d['rooms']) ? (d['rooms'] as Record<string, unknown>[]) : []

  const level: LevelData = {
    ...base,
    id: String(d['id'] ?? base.id),
    meta: {
      ...base.meta,
      title: String(meta['title'] ?? base.meta.title),
      author: String(meta['author'] ?? ''),
      created: Number(meta['created'] ?? 0),
      difficulty: Number(meta['difficulty'] ?? 3),
      tags: Array.isArray(meta['tags']) ? (meta['tags'] as string[]).map(String) : [],
      verifiedStrict: Boolean(meta['verifiedStrict']),
      verifiedAssist: Boolean(meta['verifiedAssist']),
      clearMs: Number(meta['clearMs'] ?? 0),
    },
    rooms: rooms.slice(0, MAX_ROOMS).map((r) => {
      const layers = (r['layers'] ?? {}) as Record<string, unknown>
      const bg = (r['bg'] ?? {}) as Record<string, unknown>
      const ents = Array.isArray(r['entities']) ? (r['entities'] as Record<string, unknown>[]) : []
      const room: Room = {
        x: Number(r['x'] ?? 0),
        y: Number(r['y'] ?? 0),
        bg: {
          color: String(bg['color'] ?? '#0d0d14'),
          art: String(bg['art'] ?? 'plain'),
          par: Number(bg['par'] ?? 0.5),
        },
        music: String(r['music'] ?? 'trial'),
        layers: {
          bg: fixLayer(layers['bg']),
          main: fixLayer(layers['main']),
          fg: fixLayer(layers['fg']),
        },
        entities: ents.slice(0, MAX_ENTITIES_PER_ROOM).map((e) => {
          const spawn: EntitySpawn = {
            t: String(e['t'] ?? ''),
            x: Number(e['x'] ?? 0),
            y: Number(e['y'] ?? 0),
          }
          if (e['d'] !== undefined) spawn.d = Number(e['d'])
          if (e['p'] && typeof e['p'] === 'object') {
            const p: Record<string, number> = {}
            for (const [k, v] of Object.entries(e['p'] as Record<string, unknown>)) {
              if (typeof v === 'number') p[k] = v
            }
            if (Object.keys(p).length) spawn.p = p
          }
          return spawn
        }),
      }
      return room
    }),
    start: { room: Number((d['start'] as Record<string, unknown>)?.['room'] ?? 0) },
  }
  if (level.rooms.length === 0) level.rooms.push(makeRoom(0, 0))
  return level
}

/** Compact, stable-ordered form for storage and share codes. */
export function serializeLevel(level: LevelData): string {
  const out = {
    format: LEVEL_FORMAT,
    v: LEVEL_VERSION,
    id: level.id,
    meta: level.meta,
    tileset: level.tileset,
    tile: level.tile,
    roomW: level.roomW,
    roomH: level.roomH,
    rooms: level.rooms.map((r) => ({
      x: r.x,
      y: r.y,
      bg: r.bg,
      music: r.music,
      layers: { bg: r.layers.bg, main: r.layers.main, fg: r.layers.fg },
      entities: r.entities.map((e) => {
        const p = compactProps(e.t, e.p ?? {})
        const o: EntitySpawn = { t: e.t, x: e.x, y: e.y }
        if (e.d) o.d = e.d
        if (p) o.p = p
        return o
      }),
    })),
    start: level.start,
  }
  return JSON.stringify(out)
}

/** Human-readable archival form. Pretty-printed so git diffs stay reviewable. */
export function serializeLevelPretty(level: LevelData): string {
  return JSON.stringify(JSON.parse(serializeLevel(level)), null, 2)
}

/**
 * Binds a replay to the exact level it was recorded against, so editing a
 * level invalidates old replays LOUDLY instead of desyncing them silently.
 */
export function levelHash(level: LevelData): number {
  return fnv1a(serializeLevel(level))
}

// ------------------------------------------------------------- validation ---

export interface Issue {
  /** i18n key, not a sentence -- the UI translates it. */
  key: string
  room?: number
  detail?: string
}

export interface ValidationResult {
  errors: Issue[]
  warnings: Issue[]
}

/**
 * Errors block export. Warnings never do.
 *
 * Blocking on "I could not prove this is completable" would strangle the
 * creativity the editor exists to enable -- plenty of great levels look
 * unreachable to a solver.
 */
export function validateLevel(level: LevelData): ValidationResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []

  let spawns = 0
  let goals = 0
  let totalEntities = 0

  level.rooms.forEach((room, i) => {
    totalEntities += room.entities.length
    if (room.entities.length > MAX_ENTITIES_PER_ROOM) {
      errors.push({ key: 'valid.err.tooManyEntities', room: i })
    }
    for (const layerName of ['bg', 'main', 'fg'] as LayerName[]) {
      if (room.layers[layerName].length !== ROOM_W * ROOM_H) {
        errors.push({ key: 'valid.err.badLayer', room: i, detail: layerName })
      }
    }
    for (const e of room.entities) {
      if (e.t === 'spawn') spawns++
      else if (e.t === 'goal') goals++
      if (!ENTITY_DEFS[e.t]) errors.push({ key: 'valid.err.unknownEntity', room: i, detail: e.t })
    }
    for (const t of room.layers.main) {
      if (t >= TILE_COUNT) {
        errors.push({ key: 'valid.err.unknownTile', room: i, detail: String(t) })
        break
      }
    }
    if (!room.entities.some((e) => e.t === 'goal') && !hasOpenEdge(room)) {
      warnings.push({ key: 'valid.warn.sealedRoom', room: i })
    }
  })

  if (spawns === 0) errors.push({ key: 'valid.err.noSpawn' })
  if (spawns > 1) errors.push({ key: 'valid.err.manySpawns' })
  if (goals === 0) errors.push({ key: 'valid.err.noGoal' })
  if (level.rooms.length > MAX_ROOMS) errors.push({ key: 'valid.err.tooManyRooms' })
  if (totalEntities > MAX_ENTITIES_PER_LEVEL) errors.push({ key: 'valid.err.tooManyEntitiesLevel' })

  // Spawn must not be inside a wall or a spike -- that one IS an error,
  // because it makes the level unplayable rather than merely hard.
  for (let i = 0; i < level.rooms.length; i++) {
    const room = level.rooms[i] as Room
    for (const e of room.entities) {
      if (e.t !== 'spawn' && e.t !== 'save') continue
      if (pointIsLethal(room, e.x, e.y)) {
        errors.push({ key: e.t === 'spawn' ? 'valid.err.spawnInWall' : 'valid.warn.deadlySave', room: i })
      }
    }
  }

  // Room connectivity: BFS the room grid from the start room.
  const reachable = reachableRooms(level)
  level.rooms.forEach((_, i) => {
    if (!reachable.has(i)) warnings.push({ key: 'valid.warn.orphanRoom', room: i })
  })

  return { errors, warnings }
}

function hasOpenEdge(room: Room): boolean {
  for (let tx = 0; tx < ROOM_W; tx++) {
    if (!material(getTile(room, 'main', tx, 0)).solid) return true
    if (!material(getTile(room, 'main', tx, ROOM_H - 1)).solid) return true
  }
  for (let ty = 0; ty < ROOM_H; ty++) {
    if (!material(getTile(room, 'main', 0, ty)).solid) return true
    if (!material(getTile(room, 'main', ROOM_W - 1, ty)).solid) return true
  }
  return false
}

function pointIsLethal(room: Room, px: number, py: number): boolean {
  const m = material(getTile(room, 'main', Math.floor(px / TILE), Math.floor(py / TILE)))
  return m.solid || m.hazard
}

export function reachableRooms(level: LevelData): Set<number> {
  const byPos = new Map<string, number>()
  level.rooms.forEach((r, i) => byPos.set(`${r.x},${r.y}`, i))
  const seen = new Set<number>()
  const start = Math.min(Math.max(0, level.start.room), level.rooms.length - 1)
  const queue = [start]
  seen.add(start)
  while (queue.length) {
    const i = queue.shift() as number
    const r = level.rooms[i]
    if (!r) continue
    const neighbours = [
      [r.x + 1, r.y], [r.x - 1, r.y], [r.x, r.y + 1], [r.x, r.y - 1],
    ]
    for (const [nx, ny] of neighbours) {
      const j = byPos.get(`${nx},${ny}`)
      if (j !== undefined && !seen.has(j)) { seen.add(j); queue.push(j) }
    }
    // Warps also connect rooms.
    for (const e of r.entities) {
      if (e.t !== 'warp') continue
      const target = e.p?.['room'] ?? 0
      if (target >= 0 && target < level.rooms.length && !seen.has(target)) {
        seen.add(target)
        queue.push(target)
      }
    }
  }
  return seen
}
