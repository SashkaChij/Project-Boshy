import { ROOM_H, ROOM_W, TILE, VIEW_H, VIEW_W } from '../core/constants.js'
import { playerBox } from '../core/collide.js'
import { ENTITY_DEFS } from '../core/registry/entityDefs.js'
import { prop } from '../core/registry/entityDefs.js'
import { SAVE_FLASH_TICKS } from '../core/sim/entities.js'
import type { Entity, World } from '../core/types.js'
import type { Atlas } from './atlas.js'
import { drawText } from './text.js'
import type { ParticleField } from './particles.js'

/**
 * Draws a World. Never mutates it.
 *
 * A room is a STATIC single screen -- 475 tiles that do not move -- so the tile
 * layers are baked once into an offscreen canvas and the per-frame cost drops to
 * one drawImage plus a handful of sprites. That is also why this is Canvas2D and
 * not WebGL: at ~40 draw calls a frame the renderer is not the bottleneck, and
 * WebGL would add iOS context-loss handling to a game whose whole session is
 * "die, retry, get interrupted by a notification".
 */
const CACHE_LIMIT = 9

interface Baked {
  back: HTMLCanvasElement
  front: HTMLCanvasElement
}

export interface Renderer {
  drawWorld(w: World, particles: ParticleField, tauntFor: (index: number) => string): void
  /** Drop baked rooms; the editor calls this on every tile edit. */
  invalidate(roomIndex?: number): void
}

/** Entity type -> sprite key. Types absent here get a debug box. */
const ENTITY_SPRITE: Record<string, string> = {
  save: 'save', goal: 'goal', warp: 'warp', sign: 'sign',
  cherry: 'cherry', cherrySine: 'cherry', cherryHome: 'cherry', cherryBounce: 'cherry',
  minispike: 'minispike', turret: 'turret', fan: 'fan', laser: 'laserEmitter',
  fallblock: 'fallblock', riseblock: 'riseblock', fakeblock: 'fakeblock',
  invisblock: 'invisblock', breakblock: 'breakblock',
  platform: 'platformEnt', crusher: 'crusher',
  refresher: 'refresher', spring: 'spring', gravflip: 'gravflip',
}

const BOSS_SPRITE = ['boss0', 'boss1', 'boss2']

export function createRenderer(ctx: CanvasRenderingContext2D, atlas: Atlas): Renderer {
  const cache = new Map<string, Baked>()
  const order: string[] = []
  let generation = 0

  function bake(w: World, index: number): Baked {
    const key = `${index}:${generation}`
    const hit = cache.get(key)
    if (hit) return hit

    const room = w.level.rooms[index]
    const back = document.createElement('canvas')
    const front = document.createElement('canvas')
    back.width = front.width = VIEW_W
    back.height = front.height = VIEW_H
    const bc = back.getContext('2d')
    const fc = front.getContext('2d')
    if (bc && fc && room) {
      bc.imageSmoothingEnabled = false
      fc.imageSmoothingEnabled = false
      bc.fillStyle = room.bg.color
      bc.fillRect(0, 0, VIEW_W, VIEW_H)
      for (let ty = 0; ty < ROOM_H; ty++) {
        for (let tx = 0; tx < ROOM_W; tx++) {
          const i = ty * ROOM_W + tx
          atlas.drawTile(bc, room.layers.bg[i] ?? 0, tx * TILE, ty * TILE)
        }
      }
      for (let ty = 0; ty < ROOM_H; ty++) {
        for (let tx = 0; tx < ROOM_W; tx++) {
          const i = ty * ROOM_W + tx
          // The live `main` array is used, not the room's, so an editor
          // playtest and a mid-run block break both show up correctly.
          atlas.drawTile(bc, w.main[i] ?? room.layers.main[i] ?? 0, tx * TILE, ty * TILE)
        }
      }
      for (let ty = 0; ty < ROOM_H; ty++) {
        for (let tx = 0; tx < ROOM_W; tx++) {
          const i = ty * ROOM_W + tx
          atlas.drawTile(fc, room.layers.fg[i] ?? 0, tx * TILE, ty * TILE)
        }
      }
    }

    const baked: Baked = { back, front }
    cache.set(key, baked)
    order.push(key)
    while (order.length > CACHE_LIMIT) {
      const dead = order.shift()
      if (dead) cache.delete(dead)
    }
    return baked
  }

  function drawEntity(e: Entity, w: World): void {
    const def = ENTITY_DEFS[e.t]
    if (!def) return

    if (e.t === 'boss') {
      const pattern = prop(def, e.p, 'pattern')
      atlas.draw(ctx, BOSS_SPRITE[pattern] ?? 'boss0', e.x, e.y)
      return
    }

    if (e.t === 'invisblock' && e.state === 0) return

    // Fake and revealed-invisible blocks are drawn through the TILE renderer,
    // not as sprites, so they are pixel-identical to the real block they are
    // imitating. Anything less and the trap gives itself away.
    if (e.t === 'fakeblock' || e.t === 'invisblock') {
      const look = Math.max(1, Math.min(6, prop(def, e.p, 'look')))
      if (e.t === 'invisblock') ctx.globalAlpha = 0.75
      atlas.drawTile(ctx, look, Math.round(e.x - 16), Math.round(e.y - 16))
      ctx.globalAlpha = 1
      return
    }

    if (e.t === 'refresher' && e.state > 0) {
      // Spent: show a faint ghost so the player knows it will come back.
      ctx.globalAlpha = 0.25
      atlas.draw(ctx, 'refresher', e.x, e.y)
      ctx.globalAlpha = 1
      return
    }

    if (e.t === 'laser') {
      drawLaser(e, def.fields ? prop(def, e.p, 'len') : 8)
      atlas.draw(ctx, 'laserEmitter', e.x, e.y, e.d === 2)
      return
    }

    const sprite = ENTITY_SPRITE[e.t]
    if (!sprite) return

    // Directional entities are authored facing right and rotated here, so the
    // art stays a single frame per type.
    if ((e.t === 'turret' || e.t === 'spring' || e.t === 'minispike') && e.d !== 0) {
      ctx.save()
      ctx.translate(Math.round(e.x), Math.round(e.y))
      ctx.rotate((e.d * Math.PI) / 2)
      ctx.translate(-Math.round(e.x), -Math.round(e.y))
      atlas.draw(ctx, sprite, e.x, e.y)
      ctx.restore()
      return
    }
    atlas.draw(ctx, sprite, e.x, e.y)

    if (e.t === 'save' && e.phase > 0) {
      // Save flash: brief, bright, and sized to the sprite so it reads as the
      // lantern igniting rather than as a white box dropped on the room.
      ctx.globalAlpha = (e.phase / SAVE_FLASH_TICKS) * 0.85
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(e.x - def.w / 2, e.y - def.h / 2, def.w, def.h)
      ctx.globalAlpha = 1
    }
    void w
  }

  function drawLaser(e: Entity, len: number): void {
    if (e.state === 0) return
    const dx = [1, 0, -1, 0][e.d] ?? 1
    const dy = [0, 1, 0, -1][e.d] ?? 0
    const x2 = e.x + dx * len * TILE
    const y2 = e.y + dy * len * TILE
    const thin = e.state === 1
    // The telegraph is a thin line; the lethal beam is fat and bright. An
    // unannounced instant-kill beam is the one trap that reads as unfair.
    ctx.strokeStyle = thin ? 'rgba(255,80,80,0.45)' : '#ff3b3b'
    ctx.lineWidth = thin ? 2 : 14
    ctx.beginPath()
    ctx.moveTo(e.x, e.y)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    if (!thin) {
      ctx.strokeStyle = '#ffe8e8'
      ctx.lineWidth = 5
      ctx.stroke()
    }
    ctx.lineWidth = 1
  }

  function drawPlayer(w: World): void {
    const p = w.player
    if (p.dead) return
    let sprite = 'foxIdle0'
    if (p.onVine !== 0) sprite = 'foxVine'
    else if (!p.onGround) sprite = p.vspeed * p.gravDir < 0 ? 'foxJump' : 'foxFall'
    else if (p.hspeed !== 0) sprite = `foxRun${Math.floor(w.tick / 5) % 4}`
    else sprite = `foxIdle${Math.floor(w.tick / 25) % 2}`

    if (p.gravDir < 0) {
      ctx.save()
      ctx.translate(Math.round(p.x), Math.round(p.y))
      ctx.scale(1, -1)
      ctx.translate(-Math.round(p.x), -Math.round(p.y))
      atlas.draw(ctx, sprite, p.x, p.y, p.facing < 0)
      ctx.restore()
      return
    }
    atlas.draw(ctx, sprite, p.x, p.y, p.facing < 0)
  }

  return {
    invalidate() {
      generation++
      cache.clear()
      order.length = 0
    },

    drawWorld(w, particles, tauntFor) {
      const baked = bake(w, w.room)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(baked.back, 0, 0)

      for (const e of w.entities) {
        if (e.alive) drawEntity(e, w)
      }

      for (const b of w.bullets) {
        if (b.alive) atlas.draw(ctx, 'bullet', b.x, b.y)
      }
      for (const p of w.projectiles) {
        if (p.alive) atlas.draw(ctx, `proj${Math.min(2, p.kind)}`, p.x, p.y)
      }

      drawPlayer(w)
      particles.draw(ctx)
      ctx.drawImage(baked.front, 0, 0)

      // Signs speak only when you are next to them, so a room full of taunts
      // does not become a wall of text.
      const pb = playerBox(w.player.x, w.player.y, w.player.gravDir)
      for (const e of w.entities) {
        if (e.t !== 'sign' || !e.alive) continue
        if (Math.abs(e.x - w.player.x) > 90 || Math.abs(e.y - w.player.y) > 70) continue
        const msg = tauntFor(e.p['text'] ?? 0)
        drawText(ctx, msg, e.x, e.y - 40, {
          scale: 2, align: 'center', color: '#f5e6c8', shadow: '#000000',
        })
      }
      void pb
    },
  }
}
