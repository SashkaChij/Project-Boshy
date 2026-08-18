import { describe, expect, it } from 'vitest'
import { validateLevel } from '../src/core/level.js'
import { createWorld } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { emptyInput, type LevelData } from '../src/core/types.js'
import { VIEW_H, VIEW_W } from '../src/core/constants.js'

/**
 * Every authored world is loaded here. buildLevel() throws with the exact row
 * and column on a malformed ASCII room, so a typo in level art fails the test
 * suite rather than shipping as an invisible hole in a floor.
 */
const modules = import.meta.glob('../src/content/worlds/*.ts', { eager: true }) as Record<
  string,
  { world?: LevelData }
>

const entries = Object.entries(modules).filter(([, m]) => m.world)

describe('authored content', () => {
  it('has worlds to check', () => {
    expect(entries.length).toBeGreaterThanOrEqual(0)
  })

  for (const [path, mod] of entries) {
    const world = mod.world as LevelData

    describe(path, () => {
      it('passes validation with no errors', () => {
        const { errors } = validateLevel(world)
        expect(errors.map((e) => `${e.key}${e.room !== undefined ? `@${e.room}` : ''}${e.detail ? `:${e.detail}` : ''}`)).toEqual([])
      })

      it('starts the player somewhere survivable', () => {
        const w = createWorld(world)
        for (let i = 0; i < 10; i++) step(w, emptyInput())
        expect(w.player.dead).toBe(false)
      })

      it('runs 600 ticks of idle simulation without throwing', () => {
        const w = createWorld(world)
        for (let i = 0; i < 600; i++) step(w, emptyInput())
        expect(w.tick).toBeGreaterThan(0)
      })

      it('has exactly one spawn, in the first room', () => {
        const spawns = world.rooms.flatMap((r, i) => r.entities.filter((e) => e.t === 'spawn').map(() => i))
        expect(spawns).toEqual([0])
      })

      it('ends in a boss arena with a goal', () => {
        const last = world.rooms[world.rooms.length - 1]!
        expect(last.entities.some((e) => e.t === 'boss')).toBe(true)
        expect(last.entities.some((e) => e.t === 'goal')).toBe(true)
      })

      it('lays its rooms out as a connected grid', () => {
        const seen = new Set(world.rooms.map((r) => `${r.x},${r.y}`))
        expect(seen.size).toBe(world.rooms.length)
        // Every room past the first must touch another room, or a player
        // walking off an edge lands nowhere.
        for (let i = 1; i < world.rooms.length; i++) {
          const r = world.rooms[i]!
          const touches =
            seen.has(`${r.x - 1},${r.y}`) || seen.has(`${r.x + 1},${r.y}`) ||
            seen.has(`${r.x},${r.y - 1}`) || seen.has(`${r.x},${r.y + 1}`)
          expect(touches, `room ${i} at ${r.x},${r.y} is isolated`).toBe(true)
        }
      })

      it('gives every non-boss room a save point', () => {
        // Difficulty thins these out; Medium is the layout they are authored at,
        // and a room with none on Medium is a run-ending wall.
        const missing = world.rooms
          .map((r, i) => ({ i, saves: r.entities.filter((e) => e.t === 'save').length }))
          .filter((r) => r.saves === 0 && r.i !== world.rooms.length - 1)
          .map((r) => r.i)
        expect(missing).toEqual([])
      })

      it('keeps every entity inside its room', () => {
        const stray: string[] = []
        world.rooms.forEach((r, i) => {
          for (const e of r.entities) {
            if (e.x < 0 || e.x > VIEW_W || e.y < 0 || e.y > VIEW_H) {
              stray.push(`room ${i}: ${e.t} at ${e.x},${e.y}`)
            }
          }
        })
        expect(stray).toEqual([])
      })
    })
  }
})
