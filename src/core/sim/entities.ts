import {
  BULLET_HALF, FALLBLOCK_SPEED, MAX_PROJECTILES, REFRESHER_RESPAWN, RISEBLOCK_SPEED,
  TILE, VIEW_H, VIEW_W,
} from '../constants.js'
import { boxBlocked, playerBox, type SolidRect } from '../collide.js'
import { SIN_STEPS, isqrt, lutCos, lutSin, sign } from '../math.js'
import { ENTITY_DEFS, prop, type EntityDef } from '../registry/entityDefs.js'
import type { Entity, Projectile, World } from '../types.js'
import { killPlayer } from './player.js'

/**
 * One update function per entity type. Adding a trap is one entry in
 * ENTITY_DEFS plus one entry here -- nothing else in the game or the editor
 * needs to change, which is what keeps the editor from growing UI code
 * proportional to the trap catalogue.
 */
export type Behaviour = (w: World, e: Entity, def: EntityDef) => void

const DIR_X = [1, 0, -1, 0]
const DIR_Y = [0, 1, 0, -1]

function box(e: Entity, def: EntityDef) {
  const hw = def.w / 2
  const hh = def.h / 2
  return { l: e.x - hw, r: e.x + hw, t: e.y - hh, b: e.y + hh }
}

function overlapsPlayer(w: World, e: Entity, def: EntityDef): boolean {
  const pb = playerBox(w.player.x, w.player.y, w.player.gravDir)
  const eb = box(e, def)
  return !(pb.r < eb.l || pb.l > eb.r || pb.b < eb.t || pb.t > eb.b)
}

function offRoom(e: Entity): boolean {
  return e.x < -64 || e.x > VIEW_W + 64 || e.y < -64 || e.y > VIEW_H + 64
}

function spawnProjectile(w: World, x: number, y: number, vx: number, vy: number, kind: number): void {
  let live = 0
  for (const p of w.projectiles) if (p.alive) live++
  // Authors WILL build bullet-hell rooms. Evict the oldest rather than let a
  // phone die.
  if (live >= MAX_PROJECTILES) {
    const victim = w.projectiles.find((p) => p.alive)
    if (victim) victim.alive = false
  }
  const slot = w.projectiles.find((p) => !p.alive)
  const proj: Projectile = { x, y, vx, vy, life: 300, kind, alive: true }
  if (slot) Object.assign(slot, proj)
  else w.projectiles.push(proj)
}

/** Straight-line hazard that turns around at walls. */
function moveCherry(w: World, e: Entity, def: EntityDef, bounce: boolean): void {
  const nx = e.x + e.vx
  const ny = e.y + e.vy
  if (bounce) {
    const hw = def.w / 2
    const hh = def.h / 2
    const hitX = solidPoint(w, nx + sign(e.vx) * hw, e.y)
    const hitY = solidPoint(w, e.x, ny + sign(e.vy) * hh)
    if (hitX) e.vx = -e.vx
    else e.x = nx
    if (hitY) e.vy = -e.vy
    else e.y = ny
  } else {
    e.x = nx
    e.y = ny
    if (offRoom(e)) e.alive = false
  }
}

function solidPoint(w: World, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  if (tx < 0 || ty < 0 || tx >= VIEW_W / TILE || ty >= VIEW_H / TILE) return true
  const b = { l: px, r: px, t: py, b: py }
  return boxBlocked(w.main, b, [], false, 0)
}

export const BEHAVIOURS: Record<string, Behaviour> = {
  save(w, e, def) {
    if (e.state === 1) return
    if (overlapsPlayer(w, e, def) && w.player.saveCooldown === 0) {
      doSave(w, e)
    }
  },

  goal(w, e, def) {
    if (overlapsPlayer(w, e, def) && !w.won) {
      w.won = true
      w.events.push({ k: 'win' })
    }
  },

  warp(w, e, def) {
    if (!overlapsPlayer(w, e, def)) return
    e.state = 1
  },

  sign() {
    // Purely presentational: the shell draws its taunt when the player is near.
  },

  cherry(w, e, def) {
    const sp = prop(def, e.p, 'speed')
    e.vx = (DIR_X[e.d] ?? 1) * sp
    e.vy = (DIR_Y[e.d] ?? 0) * sp
    moveCherry(w, e, def, false)
    if (overlapsPlayer(w, e, def)) killPlayer(w)
  },

  cherrySine(w, e, def) {
    const sp = prop(def, e.p, 'speed')
    const amp = prop(def, e.p, 'amp')
    const freq = Math.max(1, prop(def, e.p, 'freq'))
    e.phase = (e.phase + SIN_STEPS / freq) % SIN_STEPS
    const along = lutSin(e.phase) * amp
    const dx = DIR_X[e.d] ?? 1
    const dy = DIR_Y[e.d] ?? 0
    // Travel along the facing axis, oscillate on the perpendicular one.
    e.x = e.ox + dx * sp * e.timer + -dy * along
    e.y = e.oy + dy * sp * e.timer + dx * along
    e.timer++
    if (offRoom(e)) e.alive = false
    if (overlapsPlayer(w, e, def)) killPlayer(w)
  },

  cherryHome(w, e, def) {
    const sp = prop(def, e.p, 'speed')
    const delay = prop(def, e.p, 'delay')
    e.timer++
    if (e.timer > delay) {
      const dx = w.player.x - e.x
      const dy = w.player.y - e.y
      const d = Math.max(1, isqrt(dx * dx + dy * dy))
      e.vx = (dx / d) * sp
      e.vy = (dy / d) * sp
      e.x += e.vx
      e.y += e.vy
    }
    if (overlapsPlayer(w, e, def)) killPlayer(w)
  },

  cherryBounce(w, e, def) {
    if (e.state === 0) {
      const sp = prop(def, e.p, 'speed')
      e.vx = (DIR_X[e.d] ?? 1) * sp
      e.vy = (DIR_Y[e.d] ?? 0) * sp
      e.state = 1
    }
    moveCherry(w, e, def, true)
    if (overlapsPlayer(w, e, def)) killPlayer(w)
  },

  minispike(w, e, def) {
    if (overlapsPlayer(w, e, def)) killPlayer(w)
  },

  turret(w, e, def) {
    const rate = Math.max(1, prop(def, e.p, 'rate'))
    const sp = prop(def, e.p, 'speed')
    e.timer++
    if (e.timer >= rate) {
      e.timer = 0
      spawnProjectile(w, e.x, e.y, (DIR_X[e.d] ?? 1) * sp, (DIR_Y[e.d] ?? 0) * sp, 0)
    }
  },

  fan(w, e, def) {
    const rate = Math.max(1, prop(def, e.p, 'rate'))
    const count = Math.max(2, prop(def, e.p, 'count'))
    const sp = prop(def, e.p, 'speed')
    const spin = prop(def, e.p, 'spin')
    e.timer++
    if (e.timer >= rate) {
      e.timer = 0
      for (let i = 0; i < count; i++) {
        const ph = (i * SIN_STEPS) / count + e.phase
        spawnProjectile(w, e.x, e.y, lutCos(ph) * sp, lutSin(ph) * sp, 1)
      }
      e.phase = (e.phase + spin) % SIN_STEPS
    }
  },

  laser(w, e, def) {
    const period = Math.max(10, prop(def, e.p, 'period'))
    const warn = prop(def, e.p, 'warn')
    const active = prop(def, e.p, 'active')
    const len = prop(def, e.p, 'len')
    e.timer = (e.timer + 1) % period
    // 0 = idle, 1 = telegraphing, 2 = lethal. Telegraph first, always:
    // an unannounced instant-kill beam is the one trap type that reads as
    // unfair rather than hard.
    e.state = e.timer < warn ? 1 : e.timer < warn + active ? 2 : 0
    if (e.state !== 2) return
    const dx = DIR_X[e.d] ?? 1
    const dy = DIR_Y[e.d] ?? 0
    const beam = {
      l: Math.min(e.x, e.x + dx * len * TILE) - (dy !== 0 ? 8 : 0),
      r: Math.max(e.x, e.x + dx * len * TILE) + (dy !== 0 ? 8 : 0),
      t: Math.min(e.y, e.y + dy * len * TILE) - (dx !== 0 ? 8 : 0),
      b: Math.max(e.y, e.y + dy * len * TILE) + (dx !== 0 ? 8 : 0),
    }
    const pb = playerBox(w.player.x, w.player.y, w.player.gravDir)
    if (!(pb.r < beam.l || pb.l > beam.r || pb.b < beam.t || pb.t > beam.b)) killPlayer(w)
  },

  fallblock(w, e, def) {
    const delay = prop(def, e.p, 'delay')
    if (e.state === 0) {
      // Arms when the player passes underneath -- the classic "the floor was
      // never the problem" trap.
      const pb = playerBox(w.player.x, w.player.y, w.player.gravDir)
      const eb = box(e, def)
      if (pb.r >= eb.l && pb.l <= eb.r && pb.t >= eb.b) {
        e.state = 1
        e.timer = 0
      }
    } else if (e.state === 1) {
      e.timer++
      if (e.timer >= delay) {
        e.state = 2
        e.vy = FALLBLOCK_SPEED
      }
    } else {
      e.y += e.vy
      if (offRoom(e)) e.alive = false
    }
  },

  riseblock(w, e, def) {
    const delay = prop(def, e.p, 'delay')
    if (e.state === 0) {
      const pb = playerBox(w.player.x, w.player.y, w.player.gravDir)
      const eb = box(e, def)
      if (pb.r >= eb.l && pb.l <= eb.r && pb.b <= eb.t) {
        e.state = 1
        e.timer = 0
      }
    } else if (e.state === 1) {
      e.timer++
      if (e.timer >= delay) {
        e.state = 2
        e.vy = RISEBLOCK_SPEED
      }
    } else {
      e.y += e.vy
      if (offRoom(e)) e.alive = false
    }
  },

  fakeblock() {
    // Does nothing at all. That is the entire joke.
  },

  invisblock(w, e, def) {
    // Solid from tick one; only its visibility is conditional.
    if (e.state === 0 && overlapsPlayerNear(w, e, def)) e.state = 1
  },

  breakblock() {
    // Solid until a bullet removes it; handled in the bullet pass.
  },

  platform(w, e, def) {
    const dist = prop(def, e.p, 'dist')
    const sp = prop(def, e.p, 'speed')
    const dx = prop(def, e.p, 'dx')
    const dy = prop(def, e.p, 'dy')
    if (dist <= 0 || sp <= 0) return
    if (e.state === 0) e.state = 1
    e.phase += sp * e.state
    if (e.phase >= dist) { e.phase = dist; e.state = -1 }
    if (e.phase <= 0) { e.phase = 0; e.state = 1 }
    const nx = e.ox + dx * e.phase
    const ny = e.oy + dy * e.phase
    e.vx = nx - e.x
    e.vy = ny - e.y
    e.x = nx
    e.y = ny
    // Carry the player standing on it. Without this, moving platforms feel
    // like ice and every platforming puzzle built on one becomes luck.
    if (ridingPlatform(w, e, def)) {
      w.player.carryX += e.vx
      w.player.carryY += e.vy
    }
  },

  crusher(w, e, def) {
    const dist = prop(def, e.p, 'dist')
    const sp = prop(def, e.p, 'speed')
    const wait = prop(def, e.p, 'wait')
    e.timer++
    if (e.state === 0) {
      if (e.timer >= wait) { e.state = 1; e.timer = 0 }
    } else if (e.state === 1) {
      e.phase += sp
      if (e.phase >= dist) { e.phase = dist; e.state = 2; e.timer = 0 }
    } else if (e.state === 2) {
      if (e.timer >= wait) { e.state = 3; e.timer = 0 }
    } else {
      e.phase -= sp / 2
      if (e.phase <= 0) { e.phase = 0; e.state = 0; e.timer = 0 }
    }
    e.y = e.oy + e.phase
  },

  refresher(w, e, def) {
    if (e.state > 0) {
      e.state--
      return
    }
    if (overlapsPlayer(w, e, def)) {
      w.player.jumps = 1
      e.state = REFRESHER_RESPAWN
    }
  },

  spring(w, e, def) {
    if (!overlapsPlayer(w, e, def)) return
    const power = prop(def, e.p, 'power')
    const p = w.player
    if (e.d === 0) p.vspeed = -power * p.gravDir
    else if (e.d === 2) p.vspeed = power * p.gravDir
    else p.hspeed = (e.d === 1 ? 1 : -1) * power
    p.jumps = 1
  },

  gravflip(w, e, def) {
    if (e.state > 0) { e.state--; return }
    if (!overlapsPlayer(w, e, def)) return
    w.player.gravDir = -w.player.gravDir
    w.player.vspeed = 0
    e.state = 20
  },

  boss(w, e, def) {
    if (e.hp <= 0) {
      e.alive = false
      w.events.push({ k: 'bossdie', x: e.x, y: e.y })
      w.won = true
      w.events.push({ k: 'win' })
      return
    }
    const pattern = prop(def, e.p, 'pattern')
    e.timer++
    e.phase = (e.phase + 12) % SIN_STEPS
    const maxHp = Math.max(1, prop(def, e.p, 'hp'))
    const rage = e.hp < maxHp / 3 ? 2 : e.hp < (maxHp * 2) / 3 ? 1 : 0

    if (pattern === 0) {
      // Sweep and spray. Phase-gated so the fight escalates as it wears down.
      e.x = e.ox + lutSin(e.phase) * 220
      e.y = e.oy + lutSin(e.phase * 2) * 60
      if (e.timer % Math.max(14, 40 - rage * 12) === 0) {
        const dx = w.player.x - e.x
        const dy = w.player.y - e.y
        const d = Math.max(1, isqrt(dx * dx + dy * dy))
        spawnProjectile(w, e.x, e.y, (dx / d) * 5, (dy / d) * 5, 2)
      }
    } else if (pattern === 1) {
      // Slam pattern: rise, hover, drop.
      const cycle = e.timer % 150
      if (cycle < 60) e.y = e.oy - 120
      else if (cycle < 90) e.y = e.oy - 120 + (cycle - 60) * 6
      else e.y = e.oy
      e.x = e.ox + lutSin(e.phase / 2) * 160
      if (cycle === 90) {
        for (let i = -3; i <= 3; i++) spawnProjectile(w, e.x, e.y + 24, i * 2.5, -3, 1)
      }
    } else {
      // Mirror: follows the player's own recorded positions.
      const rec = w.bossMirror
      rec.push({ x: w.player.x, y: w.player.y })
      if (rec.length > 90) rec.shift()
      const t = rec[0]
      if (t) { e.x = t.x; e.y = t.y - 40 }
      if (e.timer % Math.max(20, 45 - rage * 10) === 0) {
        spawnProjectile(w, e.x, e.y, 0, 4, 2)
      }
    }
    if (overlapsPlayer(w, e, def)) killPlayer(w)
  },
}

function overlapsPlayerNear(w: World, e: Entity, def: EntityDef): boolean {
  const pb = playerBox(w.player.x, w.player.y, w.player.gravDir)
  const eb = box(e, def)
  return pb.r >= eb.l - 4 && pb.l <= eb.r + 4 && pb.b >= eb.t - 4 && pb.t <= eb.b + 4
}

function ridingPlatform(w: World, e: Entity, def: EntityDef): boolean {
  const pb = playerBox(w.player.x, w.player.y, w.player.gravDir)
  const eb = box(e, def)
  return pb.r >= eb.l && pb.l <= eb.r && Math.abs(pb.b - eb.t) <= 2
}

export function doSave(w: World, e: Entity): void {
  const p = w.player
  w.save = { room: w.room, x: p.x, y: p.y, gravDir: p.gravDir, tick: w.tick }
  p.saveCooldown = 30
  e.timer = 0
  w.events.push({ k: 'save', x: e.x, y: e.y })
}

/** Solid rects contributed by entities, rebuilt each tick. */
export function collectSolids(w: World): SolidRect[] {
  const out: SolidRect[] = []
  for (const e of w.entities) {
    if (!e.alive) continue
    const def = ENTITY_DEFS[e.t]
    if (!def || (!def.solid && !def.oneway)) continue
    const hw = def.w / 2
    const hh = def.h / 2
    out.push({
      l: Math.round(e.x - hw),
      r: Math.round(e.x + hw),
      t: Math.round(e.y - hh),
      b: Math.round(e.y + hh),
      oneway: !!def.oneway && !def.solid,
    })
  }
  return out
}

/** Player bullets hitting shootable entities. */
export function bulletPass(w: World): void {
  for (const b of w.bullets) {
    if (!b.alive) continue
    for (const e of w.entities) {
      if (!e.alive) continue
      const def = ENTITY_DEFS[e.t]
      if (!def?.shootable) continue
      const eb = box(e, def)
      if (b.x + BULLET_HALF < eb.l || b.x - BULLET_HALF > eb.r) continue
      if (b.y + BULLET_HALF < eb.t || b.y - BULLET_HALF > eb.b) continue

      if (e.t === 'save') {
        if (w.player.saveCooldown === 0) doSave(w, e)
        b.alive = false
      } else if (e.t === 'boss') {
        e.hp--
        b.alive = false
        w.events.push({ k: 'bosshit', x: b.x, y: b.y })
      } else {
        e.hp--
        b.alive = false
        if (e.hp <= 0) {
          e.alive = false
          w.events.push({ k: 'blockbreak', x: e.x, y: e.y })
        }
      }
      break
    }
  }
}
