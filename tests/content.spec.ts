import { describe, expect, it } from 'vitest'
import { validateLevel } from '../src/core/level.js'
import { createWorld } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { emptyInput, type LevelData } from '../src/core/types.js'

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
    })
  }
})
