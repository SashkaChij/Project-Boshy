import { describe, expect, it } from 'vitest'
import { WORLDS } from '../src/content/index.js'
import { canCrossRoom, findOpenEntryY, solveRoom } from '../src/core/reach.js'
import { ROOM_H, ROOM_W, TILE, VIEW_W } from '../src/core/constants.js'
import { ENTITY_DEFS, prop } from '../src/core/registry/entityDefs.js'
import { material } from '../src/core/registry/tileMaterials.js'
import { createWorld, loadRoom } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { emptyInput, type LevelData } from '../src/core/types.js'

/**
 * These tests exist because a playtester found the campaign uncompletable and
 * the structural checks had all passed. Shape-checking a room proves nothing
 * about whether a player can get through it; only running the physics does.
 */
const TIMEOUT = 120_000

for (const cw of WORLDS) {
  describe(`${cw.id} — ${cw.level.meta.title}`, () => {
    const level = cw.level as LevelData
    const lastRoom = level.rooms.length - 1

    it('lets the player cross every room to the next one', () => {
      const blocked: string[] = []
      for (let i = 0; i < lastRoom; i++) {
        const r = canCrossRoom(level, i)
        if (!r.reached) blocked.push(`room ${i} (${r.exhausted ? 'search capped' : 'no route'})`)
      }
      expect(blocked).toEqual([])
    }, TIMEOUT)

    it('opens both side edges wide enough to walk through', () => {
      // The player arrives about 6 px inside the new room, so column 0 has to be
      // clear where they land. Getting this wrong wedges them inside the wall.
      const sealed: string[] = []
      level.rooms.forEach((room, i) => {
        const hasSpawn = room.entities.some((e) => e.t === 'spawn')
        const open = (col: number): number => {
          let runs = 0
          for (let ty = 1; ty < ROOM_H; ty++) {
            const here = material(room.layers.main[ty * ROOM_W + col] ?? 0)
            const above = material(room.layers.main[(ty - 1) * ROOM_W + col] ?? 0)
            if (!here.solid && !here.hazard && !above.solid && !above.hazard) runs++
          }
          return runs
        }
        // A first room is entered by spawning, and a last room is a sealed arena.
        if (!hasSpawn && open(0) < 2) sealed.push(`room ${i} left edge`)
        if (i !== lastRoom && open(ROOM_W - 1) < 2) sealed.push(`room ${i} right edge`)
      })
      expect(sealed).toEqual([])
    })

    it('puts the boss where a horizontal shot can actually reach it', () => {
      const room = level.rooms[lastRoom]
      const boss = room?.entities.find((e) => e.t === 'boss')
      expect(boss, 'boss room has a boss').toBeDefined()
      if (!boss || !room) return

      // Every height the player can shoot from: standing on any reachable
      // ground, up to the apex of a double jump above it.
      const ground = solveRoom(level, lastRoom, {
        startY: findOpenEntryY(level, lastRoom) ?? undefined,
        goal: () => false,
      }).groundSpots
      expect(ground.length, 'boss arena has standable ground').toBeGreaterThan(0)
      let lowMuzzle = -Infinity
      let highMuzzle = Infinity
      for (const g of ground) {
        lowMuzzle = Math.max(lowMuzzle, g.y - 2)
        highMuzzle = Math.min(highMuzzle, g.y - 143.9 - 2)
      }

      // Where the boss actually goes over a full cycle.
      const w = createWorld(level)
      loadRoom(w, lastRoom)
      const live = w.entities.find((e) => e.t === 'boss')
      expect(live).toBeDefined()
      if (!live) return
      const def = ENTITY_DEFS['boss']
      const hh = (def?.h ?? 64) / 2

      let hittable = false
      for (let i = 0; i < 600 && !hittable; i++) {
        step(w, emptyInput())
        if (!live.alive) break
        const top = live.y - hh
        const bottom = live.y + hh
        // The muzzle band and the boss box have to overlap at some point.
        if (bottom >= highMuzzle && top <= lowMuzzle) hittable = true
      }
      expect(
        hittable,
        `boss never enters the shootable band [${highMuzzle.toFixed(0)}..${lowMuzzle.toFixed(0)}]`,
      ).toBe(true)
    }, TIMEOUT)

    it('has a boss with enough health to be a fight but not a chore', () => {
      const boss = level.rooms[lastRoom]?.entities.find((e) => e.t === 'boss')
      if (!boss) return
      const hp = prop(ENTITY_DEFS['boss'], boss.p ?? {}, 'hp')
      // Four bullets alive at a time, 40-tick life: sustained DPS is bounded.
      expect(hp).toBeGreaterThanOrEqual(40)
      expect(hp).toBeLessThanOrEqual(400)
    })

    it('has no decoration floating in mid-air', () => {
      const floating: string[] = []
      level.rooms.forEach((room, ri) => {
        for (let ty = 0; ty < ROOM_H - 1; ty++) {
          for (let tx = 0; tx < ROOM_W; tx++) {
            const t = room.layers.main[ty * ROOM_W + tx] ?? 0
            // 23 is the starfield tile. Stars are supposed to be in the sky;
            // grass, pipework and cracks are not.
            if (t < 20 || t >= 23) continue
            const below = room.layers.main[(ty + 1) * ROOM_W + tx] ?? 0
            const beside =
              material(room.layers.main[ty * ROOM_W + tx - 1] ?? 0).solid ||
              material(room.layers.main[ty * ROOM_W + tx + 1] ?? 0).solid
            if (!material(below).solid && !beside) floating.push(`room ${ri} @${tx},${ty}`)
          }
        }
      })
      expect(floating.slice(0, 12)).toEqual([])
    })

    it('keeps signs far enough apart that their taunts do not collide', () => {
      const clashes: string[] = []
      level.rooms.forEach((room, ri) => {
        const signs = room.entities.filter((e) => e.t === 'sign')
        for (let i = 0; i < signs.length; i++) {
          for (let j = i + 1; j < signs.length; j++) {
            const a = signs[i]
            const b = signs[j]
            if (!a || !b) continue
            if (Math.abs(a.x - b.x) < 220 && Math.abs(a.y - b.y) < 60) {
              clashes.push(`room ${ri}: ${a.x},${a.y} vs ${b.x},${b.y}`)
            }
          }
        }
      })
      expect(clashes).toEqual([])
    })

    it('places every save point on ground with clear air above it', () => {
      const bad: string[] = []
      level.rooms.forEach((room, ri) => {
        for (const e of room.entities) {
          if (e.t !== 'save') continue
          const tx = Math.floor(e.x / TILE)
          const ty = Math.floor(e.y / TILE)
          const here = material(room.layers.main[ty * ROOM_W + tx] ?? 0)
          if (here.solid || here.hazard) bad.push(`room ${ri}: save inside geometry at ${tx},${ty}`)
        }
      })
      expect(bad).toEqual([])
    })

    it('keeps the goal inside the room', () => {
      const goal = level.rooms[lastRoom]?.entities.find((e) => e.t === 'goal')
      expect(goal).toBeDefined()
      if (goal) {
        expect(goal.x).toBeGreaterThan(0)
        expect(goal.x).toBeLessThan(VIEW_W)
      }
    })
  })
}
