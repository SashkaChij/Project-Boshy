import { MAX_JUMPS, ROOM_H, ROOM_W, TILE, VIEW_H, VIEW_W } from './constants.js'
import { boxHitsHazard, playerBox, type SolidRect } from './collide.js'
import { ENTITY_DEFS } from './registry/entityDefs.js'
import { material } from './registry/tileMaterials.js'
import { BEHAVIOURS } from './sim/entities.js'
import { stepPlayer } from './sim/player.js'
import { createWorld, loadRoom } from './sim/world.js'
import { IN_JUMP, IN_LEFT, IN_RIGHT, type LevelData, type World } from './types.js'

/**
 * Reachability solver.
 *
 * Nodes are standing positions; edges are whole jumps, simulated with the REAL
 * stepPlayer. A tick-level breadth-first search over (position, velocity) is the
 * obvious approach and it does not work: mid-air states branch six ways every
 * tick, so the frontier passes a million states before it finds anything. A
 * human does not plan per tick either -- they pick a jump and commit -- so the
 * graph is built the same way.
 *
 * Deliberately conservative. It under-reports what a player can do:
 *   - moving platforms are frozen at spawn,
 *   - non-solid entities are ignored, so no hazard entity ever blocks a route,
 *   - jump plans are sampled, not exhaustive.
 * REACHABLE is therefore trustworthy. UNREACHABLE means "no simple route",
 * which for level-design purposes is the useful signal: if a plain jump plan
 * cannot cross a room, the room is asking for something it should not.
 */

/** Sampled jump plans. Release tick sets height; the second press sets the arc. */
const RELEASE_TICKS = [2, 5, 9, 14, 19, 22]
const DOUBLE_AT = [-1, 3, 8, 14, 21, 30, 40]
const DIRS = [0, -1, 1]
/** Jump-pumping periods, for climbing water columns. */
const PUMP_PERIODS = [4, 7, 12]
const MAX_PLAN_TICKS = 100
const MAX_NODES = 900
/**
 * Landing spots are merged on a 4 px grid. Finer than that and the search
 * spends its whole budget on positions a player could not tell apart.
 */
const NODE_GRID = 4

export interface ReachResult {
  reached: boolean
  /** Distinct standing positions found. */
  nodes: number
  groundSpots: { x: number; y: number }[]
  exhausted: boolean
}

export interface ReachOptions {
  startX?: number
  startY?: number
  goal: (x: number, y: number) => boolean
}

function staticSolids(level: LevelData, roomIndex: number): SolidRect[] {
  const room = level.rooms[roomIndex]
  if (!room) return []
  const out: SolidRect[] = []
  for (const e of room.entities) {
    const def = ENTITY_DEFS[e.t]
    if (!def || (!def.solid && !def.oneway)) continue
    out.push({
      l: Math.round(e.x - def.w / 2),
      r: Math.round(e.x + def.w / 2),
      t: Math.round(e.y - def.h / 2),
      b: Math.round(e.y + def.h / 2),
      oneway: !!def.oneway && !def.solid,
    })
  }
  return out
}

/**
 * Entities the solver simulates.
 *
 * Anything that HELPS the player has to be live, or a room built around a
 * gravity flip or a spring reads as unsolvable. Everything that kills is left
 * out on purpose: the question here is "does a route exist", not "is it safe",
 * and a solver that also had to dodge cherries would answer neither well.
 */
const HELPERS = new Set(['gravflip', 'spring', 'refresher', 'warp'])

interface Node { x: number; y: number; g: number }

interface PlanOutcome {
  /** Where the plan ended: a standing position, or null if it died or stalled. */
  landed: Node | null
  /** True if the plan left the room in a way that satisfies the goal. */
  hitGoal: boolean
}

function runPlan(
  world: World,
  solids: readonly SolidRect[],
  from: Node,
  dir: number,
  jump: boolean,
  releaseAt: number,
  doubleAt: number,
  goal: (x: number, y: number) => boolean,
  /** > 0 repeats the jump on this period, which is how you climb water. */
  pumpEvery = 0,
  maxTicks = MAX_PLAN_TICKS,
): PlanOutcome {
  const p = world.player
  p.x = from.x
  p.y = from.y
  p.hspeed = 0
  p.vspeed = 0
  p.jumps = MAX_JUMPS - 1
  p.gravDir = from.g
  p.dead = false
  p.onGround = true
  p.onVine = 0
  p.inWater = 0
  p.onIce = false
  p.carryX = 0
  p.carryY = 0
  p.saveCooldown = 0

  const dirBit = dir < 0 ? IN_LEFT : dir > 0 ? IN_RIGHT : 0
  let jumpHeld = false

  for (let t = 0; t < maxTicks; t++) {
    let wantJump = false
    if (pumpEvery > 0) {
      // Water refreshes the air jump every tick, so a column is climbed by
      // pumping the button, not by one arc. Without this the solver reports
      // every water room unreachable.
      wantJump = t % pumpEvery < 2
    } else if (jump) {
      if (t < releaseAt) wantJump = true
      else if (doubleAt >= 0 && t >= doubleAt) wantJump = true
    }
    const held = dirBit | (wantJump ? IN_JUMP : 0)
    const pressed = wantJump && !jumpHeld ? IN_JUMP : 0
    const released = !wantJump && jumpHeld ? IN_JUMP : 0
    jumpHeld = wantJump

    world.events.length = 0
    for (const e of world.entities) {
      if (!e.alive) continue
      const def = ENTITY_DEFS[e.t]
      const fn = def ? BEHAVIOURS[e.t] : undefined
      if (def && fn) fn(world, e, def)
    }
    stepPlayer(world, { held, pressed, released }, solids)

    if (p.dead) return { landed: null, hitGoal: false }
    if (goal(p.x, p.y)) return { landed: null, hitGoal: true }
    if (p.x < -24 || p.x > VIEW_W + 24 || p.y > VIEW_H + 24 || p.y < -24) {
      return { landed: null, hitGoal: false }
    }
    if (boxHitsHazard(world.main, playerBox(p.x, p.y, p.gravDir))) {
      return { landed: null, hitGoal: false }
    }

    // A plan ends when the player is resting again -- which, with gravity
    // flipped, means resting against a ceiling.
    if (p.onGround && p.vspeed * p.gravDir >= 0 && t > 0) {
      const stopped = dirBit === 0 || t > 2
      if (stopped) return { landed: { x: p.x, y: p.y, g: p.gravDir }, hitGoal: false }
    }
  }
  // Water has no floor to land on, so a swim plan that is still afloat is
  // progress, not a dead end: the air jump refreshes every tick in water, which
  // makes any point inside a column as good a launch pad as solid ground.
  const afloat = pumpEvery > 0 && p.inWater !== 0
  return {
    landed: p.onGround || afloat ? { x: p.x, y: p.y, g: p.gravDir } : null,
    hitGoal: false,
  }
}

/** Drop the player from a starting point until they land, so entry states work. */
function settle(
  world: World,
  solids: readonly SolidRect[],
  x: number,
  y: number,
  goal: (gx: number, gy: number) => boolean,
): PlanOutcome {
  const p = world.player
  p.x = x
  p.y = y
  p.hspeed = 0
  p.vspeed = 0
  p.jumps = MAX_JUMPS - 1
  p.gravDir = 1
  p.dead = false
  p.onGround = false
  p.onVine = 0
  p.inWater = 0
  p.onIce = false
  p.carryX = 0
  p.carryY = 0
  p.saveCooldown = 0

  for (let t = 0; t < MAX_PLAN_TICKS; t++) {
    world.events.length = 0
    for (const e of world.entities) {
      if (!e.alive) continue
      const def = ENTITY_DEFS[e.t]
      const fn = def ? BEHAVIOURS[e.t] : undefined
      if (def && fn) fn(world, e, def)
    }
    stepPlayer(world, { held: 0, pressed: 0, released: 0 }, solids)
    if (p.dead) return { landed: null, hitGoal: false }
    if (goal(p.x, p.y)) return { landed: null, hitGoal: true }
    if (p.y > VIEW_H + 24 || p.y < -24) return { landed: null, hitGoal: false }
    if (p.onGround && p.vspeed * p.gravDir >= 0) {
      return { landed: { x: p.x, y: p.y, g: p.gravDir }, hitGoal: false }
    }
  }
  return { landed: null, hitGoal: false }
}

export function solveRoom(level: LevelData, roomIndex: number, opts: ReachOptions): ReachResult {
  const world = createWorld(level, { difficulty: 0 })
  loadRoom(world, roomIndex)
  world.entities = world.entities.filter((e) => HELPERS.has(e.t))
  const helpers = world.entities.map((e) => ({ ...e, p: { ...e.p } }))
  const solids = staticSolids(level, roomIndex)

  const resetHelpers = (): void => {
    world.entities.length = 0
    for (const h of helpers) world.entities.push({ ...h, p: { ...h.p } })
  }

  const room = level.rooms[roomIndex]
  const spawn = room?.entities.find((e) => e.t === 'spawn')
  const startX = opts.startX ?? spawn?.x ?? 8
  const startY = opts.startY ?? spawn?.y ?? (findOpenEntryY(level, roomIndex) ?? 500)

  const groundSpots: Node[] = []
  const seen = new Set<number>()
  const key = (n: Node): number =>
    (Math.round(n.x / NODE_GRID) * 4096 + Math.round(n.y / NODE_GRID)) * 2 + (n.g < 0 ? 1 : 0)

  if (opts.goal(startX, startY)) {
    return { reached: true, nodes: 0, groundSpots, exhausted: false }
  }

  resetHelpers()
  const first = settle(world, solids, startX, startY, opts.goal)
  if (first.hitGoal) return { reached: true, nodes: 0, groundSpots, exhausted: false }
  if (!first.landed) return { reached: false, nodes: 0, groundSpots, exhausted: false }

  const queue: Node[] = [first.landed]
  seen.add(key(first.landed))
  groundSpots.push(first.landed)

  while (queue.length > 0) {
    if (groundSpots.length > MAX_NODES) {
      return { reached: false, nodes: groundSpots.length, groundSpots, exhausted: true }
    }
    const node = queue.shift() as Node

    for (const dir of DIRS) {
      // Walking is its own plan: no jump, just hold a direction.
      resetHelpers()
      const walk = runPlan(world, solids, node, dir, false, 0, -1, opts.goal)
      if (walk.hitGoal) return { reached: true, nodes: groundSpots.length, groundSpots, exhausted: false }
      if (walk.landed) {
        const k = key(walk.landed)
        if (!seen.has(k)) { seen.add(k); groundSpots.push(walk.landed); queue.push(walk.landed) }
      }

      for (const pumpEvery of PUMP_PERIODS) {
        resetHelpers()
        // Short bursts, so each one becomes a waypoint further up the column.
        const swim = runPlan(world, solids, node, dir, true, 0, -1, opts.goal, pumpEvery, 45)
        if (swim.hitGoal) return { reached: true, nodes: groundSpots.length, groundSpots, exhausted: false }
        if (swim.landed) {
          const k = key(swim.landed)
          if (!seen.has(k)) { seen.add(k); groundSpots.push(swim.landed); queue.push(swim.landed) }
        }
      }

      for (const releaseAt of RELEASE_TICKS) {
        for (const doubleAt of DOUBLE_AT) {
          if (doubleAt >= 0 && doubleAt < releaseAt) continue
          resetHelpers()
          const r = runPlan(world, solids, node, dir, true, releaseAt, doubleAt, opts.goal)
          if (r.hitGoal) return { reached: true, nodes: groundSpots.length, groundSpots, exhausted: false }
          if (!r.landed) continue
          const k = key(r.landed)
          if (seen.has(k)) continue
          seen.add(k)
          groundSpots.push(r.landed)
          queue.push(r.landed)
        }
      }
    }
  }
  return { reached: false, nodes: groundSpots.length, groundSpots, exhausted: false }
}

export function canCrossRoom(level: LevelData, roomIndex: number, entryY?: number): ReachResult {
  const startY = entryY ?? undefined
  return solveRoom(level, roomIndex, {
    startY,
    goal: (x) => x > VIEW_W - 6,
  })
}

export function canReachGoal(level: LevelData, roomIndex: number, entryY?: number): ReachResult | null {
  const room = level.rooms[roomIndex]
  const goal = room?.entities.find((e) => e.t === 'goal')
  if (!goal) return null
  const def = ENTITY_DEFS['goal']
  const hw = (def?.w ?? 32) / 2
  const hh = (def?.h ?? 32) / 2
  return solveRoom(level, roomIndex, {
    startY: entryY ?? undefined,
    goal: (x, y) => {
      const b = playerBox(x, y, 1)
      return b.r >= goal.x - hw && b.l <= goal.x + hw && b.b >= goal.y - hh && b.t <= goal.y + hh
    },
  })
}

/**
 * Where a player crossing in from the left actually arrives: the lowest column-0
 * cell with two tiles of clearance. Returns null when the edge is walled, which
 * is itself the bug worth reporting.
 */
export function findOpenEntryY(level: LevelData, roomIndex: number): number | null {
  const room = level.rooms[roomIndex]
  if (!room) return null
  for (let ty = ROOM_H - 1; ty >= 1; ty--) {
    const here = material(room.layers.main[ty * ROOM_W] ?? 0)
    const above = material(room.layers.main[(ty - 1) * ROOM_W] ?? 0)
    if (!here.solid && !here.hazard && !above.solid && !above.hazard) return ty * TILE + TILE - 9
  }
  return null
}

/** Highest point a player can shoot from in a room: the muzzle at a double-jump apex. */
export function highestMuzzle(groundSpots: readonly { y: number }[]): number {
  let best = Infinity
  for (const g of groundSpots) best = Math.min(best, g.y - 143.9 - 2)
  return best
}
