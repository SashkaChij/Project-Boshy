import { MAX_JUMPS, ROOM_H, ROOM_W, TILE, VIEW_H, VIEW_W } from '../constants.js'
import { createRng } from '../rng.js'
import { ENTITY_DEFS } from '../registry/entityDefs.js'
import {
  DIFF_MEDIUM, type Entity, type EntitySpawn, type LevelData, type Player, type Room, type World,
} from '../types.js'

export interface WorldOptions {
  difficulty?: number
  assist?: boolean
  seed?: number
}

function makePlayer(x: number, y: number, facing: number): Player {
  return {
    x, y,
    hspeed: 0,
    vspeed: 0,
    jumps: MAX_JUMPS - 1,
    facing,
    onGround: false,
    dead: false,
    deathTimer: 0,
    gravDir: 1,
    inWater: 0,
    onVine: 0,
    saveCooldown: 0,
    onIce: false,
    carryX: 0,
    carryY: 0,
  }
}

function instantiate(s: EntitySpawn): Entity {
  const def = ENTITY_DEFS[s.t]
  const p: Record<string, number> = { ...(s.p ?? {}) }
  const e: Entity = {
    t: s.t,
    x: s.x, y: s.y,
    ox: s.x, oy: s.y,
    vx: 0, vy: 0,
    d: s.d ?? 0,
    p,
    state: 0,
    timer: 0,
    phase: 0,
    hp: def?.hp ?? 1,
    alive: true,
  }
  if (e.t === 'boss') e.hp = p['hp'] ?? def?.hp ?? 150
  // Entities with an `offset` field start mid-cycle, so a wall of turrets can
  // be phase-staggered instead of firing as one wall of death.
  const off = p['offset']
  if (off !== undefined) e.timer = off
  return e
}

export function roomAt(level: LevelData, gx: number, gy: number): number {
  for (let i = 0; i < level.rooms.length; i++) {
    const r = level.rooms[i] as Room
    if (r.x === gx && r.y === gy) return i
  }
  return -1
}

export function findSpawn(room: Room): { x: number; y: number; d: number } {
  for (const e of room.entities) {
    if (e.t === 'spawn') return { x: e.x, y: e.y, d: e.d ?? 1 }
  }
  return { x: VIEW_W / 2, y: VIEW_H / 2, d: 1 }
}

/**
 * Difficulty changes the SAVE POINT COUNT, never the physics -- that is how
 * the genre does it, and it keeps one set of constants and one test matrix.
 * Entities carry no difficulty field; instead save points are thinned here.
 */
function applyDifficulty(entities: Entity[], difficulty: number): Entity[] {
  if (difficulty <= DIFF_MEDIUM) return entities
  const saves = entities.filter((e) => e.t === 'save')
  if (saves.length === 0) return entities
  let keep: Entity[]
  if (difficulty === 1) keep = saves.filter((_, i) => i % 2 === 0)
  else if (difficulty === 2) keep = saves.slice(0, 1)
  else keep = []
  const kept = new Set(keep)
  return entities.filter((e) => e.t !== 'save' || kept.has(e))
}

export function loadRoom(w: World, index: number): void {
  const room = w.level.rooms[index]
  if (!room) return
  w.room = index
  w.main = room.layers.main.slice()
  const spawned = room.entities.filter((e) => e.t !== 'spawn').map(instantiate)
  w.entities = applyDifficulty(spawned, w.difficulty)
  w.bullets = []
  w.projectiles = []
  w.bossMirror = []
  w.gravityScale = 0
  w.events.push({ k: 'room', index })
}

export function createWorld(level: LevelData, opts: WorldOptions = {}): World {
  const startIndex = Math.min(Math.max(0, level.start.room), Math.max(0, level.rooms.length - 1))
  const room = level.rooms[startIndex]
  const sp = room ? findSpawn(room) : { x: VIEW_W / 2, y: VIEW_H / 2, d: 1 }

  const w: World = {
    level,
    room: startIndex,
    player: makePlayer(sp.x, sp.y, sp.d),
    entities: [],
    bullets: [],
    projectiles: [],
    tick: 0,
    deaths: 0,
    rng: createRng(opts.seed ?? 0x1337c0de),
    save: null,
    events: [],
    won: false,
    difficulty: opts.difficulty ?? DIFF_MEDIUM,
    assist: opts.assist ?? false,
    main: [],
    jumpBuffer: 0,
    coyote: 0,
    gravityScale: 0,
    scrollSpeed: 0,
    scrollY: 0,
    shake: 0,
    bossMirror: [],
  }
  loadRoom(w, startIndex)
  return w
}

/**
 * Return to the last save point, or to the level start if there is none.
 * Sub-second and total: the whole loop of this genre is die-instantly,
 * retry-instantly, so anything that stalls here ruins the game.
 */
export function respawn(w: World): void {
  const s = w.save
  const targetRoom = s ? s.room : w.level.start.room
  loadRoom(w, targetRoom)
  const room = w.level.rooms[targetRoom]
  if (s) {
    w.player = makePlayer(s.x, s.y, 1)
    w.player.gravDir = s.gravDir
  } else {
    const sp = room ? findSpawn(room) : { x: VIEW_W / 2, y: VIEW_H / 2, d: 1 }
    w.player = makePlayer(sp.x, sp.y, sp.d)
  }
  w.won = false
  w.jumpBuffer = 0
  w.coyote = 0
}

/** Full restart: the run timer and the death count survive, as they should. */
export function restart(w: World): void {
  respawn(w)
}

export function tileIndexAt(px: number, py: number): number {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return -1
  return ty * ROOM_W + tx
}
