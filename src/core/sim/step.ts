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

  const solids = collectSolids(w)

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

  const solidsAfter = collectSolids(w)
  shoot(w, input)
  stepPlayer(w, input, solidsAfter)
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
  for (const b of w.bullets) {
    if (!b.alive) continue
    b.x += b.vx
    b.life--
    if (b.life <= 0 || b.x < -32 || b.x > VIEW_W + 32) {
      b.alive = false
      continue
    }
    const box = { l: b.x - 4, r: b.x + 4, t: b.y - 4, b: b.y + 4 }
    if (boxBlocked(w.main, box, [], false, 0)) b.alive = false
  }
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

  if (box.r < 0) {
    const n = roomAt(w.level, room.x - 1, room.y)
    if (n >= 0) { loadRoom(w, n); p.x += VIEW_W }
    else p.x = -(box.l - p.x)
  } else if (box.l > VIEW_W) {
    const n = roomAt(w.level, room.x + 1, room.y)
    if (n >= 0) { loadRoom(w, n); p.x -= VIEW_W }
    else p.x = VIEW_W - (box.r - p.x)
  }

  if (box.b < 0) {
    const n = roomAt(w.level, room.x, room.y - 1)
    if (n >= 0) { loadRoom(w, n); p.y += VIEW_H }
    else p.y = -(box.t - p.y)
  } else if (box.t > VIEW_H) {
    const n = roomAt(w.level, room.x, room.y + 1)
    if (n >= 0) { loadRoom(w, n); p.y -= VIEW_H }
    else killPlayer(w)
  }
}

/** Pixel bounds of the current room. Handy for the renderer and the editor. */
export const ROOM_PIXELS = { w: VIEW_W, h: VIEW_H, tile: TILE }
