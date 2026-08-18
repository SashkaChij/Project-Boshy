import { TILE, VIEW_H, VIEW_W } from '../constants.js'
import { boxBlocked, playerBox } from '../collide.js'
import { ENTITY_DEFS } from '../registry/entityDefs.js'
import { IN_RESTART, IN_SUICIDE, type InputFrame, type World } from '../types.js'
import { BEHAVIOURS, bulletPass, collectSolids } from './entities.js'
import { killPlayer, shoot, stepPlayer } from './player.js'
import { loadRoom, respawn, roomAt } from './world.js'

/** Ticks the corpse lies there before the room resets on its own. */
export const RESPAWN_TICKS = 30

/**
 * THE tick. Pure: takes a World and an InputFrame, mutates the World, and
 * touches nothing else. No Date, no Math.random, no DOM. Everything the host
 * needs to know afterwards is in `world.events`.
 */
export function step(w: World, input: InputFrame): void {
  w.tick++

  // Restart is accepted at any time, alive or dead. Waiting for a death
  // animation to finish before you may retry is the fastest way to make a
  // hard game feel disrespectful.
  if ((input.pressed & IN_RESTART) !== 0) {
    respawn(w)
    return
  }

  if (w.player.dead) {
    w.player.deathTimer++
    if (w.player.deathTimer >= RESPAWN_TICKS) respawn(w)
    return
  }

  if ((input.pressed & IN_SUICIDE) !== 0) {
    killPlayer(w)
    return
  }

  if (w.won) return

  // Entities move before the player so that a platform's displacement is
  // already applied when the player resolves against it in the same tick.
  for (const e of w.entities) {
    if (!e.alive) continue
    const def = ENTITY_DEFS[e.t]
    if (!def) continue
    const fn = BEHAVIOURS[e.t]
    if (fn) fn(w, e, def)
  }
  if (w.player.dead) return

  // Solids are collected AFTER the entity pass so a moving platform's new
  // position is what the player resolves against in the same tick.
  const solids = collectSolids(w)
  shoot(w, input)
  stepPlayer(w, input, solids)
  if (w.player.dead) return

  stepBullets(w)
  bulletPass(w)
  stepProjectiles(w)
  if (w.player.dead) return

  handleWarp(w)
  if (w.player.dead || w.won) return

  handleRoomEdges(w)

  if (w.shake > 0) w.shake = Math.max(0, w.shake - 1)
}

function stepBullets(w: World): void {
  // Solid entities stop bullets too -- but NOT the shootable ones, which are
  // resolved a moment later in bulletPass. Without this a shot sailed straight
  // through a falling block or a crusher as if it were scenery.
  const opaque = collectSolids(w).filter((_, i) => !solidIsShootable(w, i))
  for (const b of w.bullets) {
    if (!b.alive) continue
    b.x += b.vx
    b.life--
    if (b.life <= 0 || b.x < -32 || b.x > VIEW_W + 32) {
      b.alive = false
      continue
    }
    const box = { l: b.x - 4, r: b.x + 4, t: b.y - 4, b: b.y + 4 }
    if (boxBlocked(w.main, box, opaque, false, 0)) b.alive = false
  }
}

/** collectSolids preserves entity order, so the index maps straight back. */
function solidIsShootable(w: World, index: number): boolean {
  let seen = 0
  for (const e of w.entities) {
    if (!e.alive) continue
    const def = ENTITY_DEFS[e.t]
    if (!def || (!def.solid && !def.oneway)) continue
    if (seen === index) return !!def.shootable
    seen++
  }
  return false
}

function stepProjectiles(w: World): void {
  const pb = playerBox(w.player.x, w.player.y, w.player.gravDir)
  for (const p of w.projectiles) {
    if (!p.alive) continue
    p.x += p.vx
    p.y += p.vy
    p.life--
    if (p.life <= 0 || p.x < -48 || p.x > VIEW_W + 48 || p.y < -48 || p.y > VIEW_H + 48) {
      p.alive = false
      continue
    }
    // Enemy fire is stopped by terrain, exactly like the player's. Previously it
    // was not, which made every pillar and ledge in the game cover that worked
    // only AGAINST you: it blocked your shots and let theirs through.
    if (boxBlocked(w.main, { l: p.x - 3, r: p.x + 3, t: p.y - 3, b: p.y + 3 }, [], false, 0)) {
      p.alive = false
      continue
    }
    if (pb.r >= p.x - 5 && pb.l <= p.x + 5 && pb.b >= p.y - 5 && pb.t <= p.y + 5) {
      killPlayer(w)
      return
    }
  }
}

function handleWarp(w: World): void {
  for (const e of w.entities) {
    if (e.t !== 'warp' || e.state !== 1) continue
    const target = e.p['room'] ?? 0
    if (target >= 0 && target < w.level.rooms.length) {
      loadRoom(w, target)
      const p = w.player
      p.vspeed = 0
      p.hspeed = 0
    }
    return
  }
}

/**
 * Room-grid traversal. Walking off an edge snaps to the neighbouring room in
 * the world grid; if there is no neighbour, the edge is a wall -- except
 * downward, where falling out of the world kills, as it must.
 */
function handleRoomEdges(w: World): void {
  const room = w.level.rooms[w.room]
  if (!room) return
  const p = w.player
  const box = playerBox(p.x, p.y, p.gravDir)

  // Whether a neighbour exists has to be decided BEFORE clamping, otherwise
  // the two rules fight: the player walks past the edge, gets clamped back,
  // walks out again, and jitters at the boundary forever.
  const left = roomAt(w.level, room.x - 1, room.y)
  const right = roomAt(w.level, room.x + 1, room.y)
  const up = roomAt(w.level, room.x, room.y - 1)
  const down = roomAt(w.level, room.x, room.y + 1)

  if (box.r < 0 && left >= 0) {
    loadRoom(w, left)
    p.x += VIEW_W
    unstick(w)
    return
  }
  if (box.l > VIEW_W && right >= 0) {
    loadRoom(w, right)
    p.x -= VIEW_W
    unstick(w)
    return
  }
  if (box.t < 0 && up >= 0) {
    loadRoom(w, up)
    p.y += VIEW_H
    unstick(w)
    return
  }
  if (box.t > VIEW_H) {
    // Falling out of the world kills. Every other edge without a neighbour is
    // a wall, but a bottomless pit has to be lethal or the genre stops working.
    if (down >= 0) {
      loadRoom(w, down)
      p.y -= VIEW_H
      unstick(w)
      return
    }
    killPlayer(w)
    return
  }

  // Edges with no room behind them are solid walls, and the clamp keeps the
  // whole hitbox inside so the player never renders half off-screen.
  if (left < 0 && box.l < 0) {
    p.x += -box.l
    if (p.hspeed < 0) p.hspeed = 0
  }
  if (right < 0 && box.r > VIEW_W - 1) {
    p.x -= box.r - (VIEW_W - 1)
    if (p.hspeed > 0) p.hspeed = 0
  }
  if (up < 0 && box.t < 0) {
    p.y += -box.t
    if (p.vspeed < 0) p.vspeed = 0
  }
}

/**
 * Push the player out of geometry after a room change.
 *
 * The player crosses an edge at whatever height they happened to be at, and the
 * neighbouring room has its own walls there. Landing inside one leaves them
 * wedged with no way out, which reads as the game breaking rather than as a
 * hard game. The search spirals outwards so the nudge is always the shortest
 * one, and prefers moving further into the room over back out of it.
 */
function unstick(w: World): void {
  const p = w.player
  const solids = collectSolids(w)
  const free = (x: number, y: number): boolean =>
    !boxBlocked(w.main, playerBox(x, y, p.gravDir), solids, false, 0)

  if (free(p.x, p.y)) return

  const ox = p.x
  const oy = p.y
  for (let r = 1; r <= 96; r++) {
    // Horizontal first: the player is usually embedded in an edge wall.
    if (free(ox + r, oy)) { p.x = ox + r; return }
    if (free(ox - r, oy)) { p.x = ox - r; return }
    if (free(ox, oy - r)) { p.y = oy - r; return }
    if (free(ox, oy + r)) { p.y = oy + r; return }
    if (free(ox + r, oy - r)) { p.x = ox + r; p.y = oy - r; return }
    if (free(ox - r, oy - r)) { p.x = ox - r; p.y = oy - r; return }
  }
  // Nothing within reach is free: the room is solid where they arrived. Dying
  // is still better than standing frozen inside a wall forever.
  killPlayer(w)
}

/** Pixel bounds of the current room. Handy for the renderer and the editor. */
export const ROOM_PIXELS = { w: VIEW_W, h: VIEW_H, tile: TILE }
