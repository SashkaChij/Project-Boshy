import { describe, expect, it } from 'vitest'
import { ReplayRecorder, verifyReplay } from '../src/core/replay.js'
import { emptyLevel, setTile } from '../src/core/level.js'
import { ROOM_W, TILE } from '../src/core/constants.js'
import { T_SOLID1 } from '../src/core/registry/tileMaterials.js'
import { createWorld } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { IN_RIGHT, type InputFrame, type LevelData } from '../src/core/types.js'

/** A corridor with the goal a short run to the right. */
function runLevel(): LevelData {
  const lv = emptyLevel('replay-test')
  const room = lv.rooms[0]!
  for (let tx = 0; tx < ROOM_W; tx++) setTile(room, 'main', tx, 17, T_SOLID1)
  room.entities.push({ t: 'spawn', x: 2 * TILE + 16, y: 17 * TILE - 9, d: 1 })
  room.entities.push({ t: 'goal', x: 12 * TILE + 16, y: 17 * TILE - 16 })
  return lv
}

describe('replay', () => {
  it('records a clear and verifies it reproduces exactly', () => {
    const level = runLevel()
    const w = createWorld(level)
    const rec = new ReplayRecorder()
    const walk: InputFrame = { held: IN_RIGHT, pressed: 0, released: 0 }

    for (let i = 0; i < 400 && !w.won; i++) {
      rec.push(walk)
      step(w, walk)
    }
    expect(w.won).toBe(true)

    const replay = rec.finish(level, 0, false, 0x1337c0de)
    const result = verifyReplay(level, replay)
    expect(result.ok).toBe(true)
    expect(result.reason).toBe('cleared')
  })

  it('compresses a steady hold into a single run', () => {
    const rec = new ReplayRecorder()
    const walk: InputFrame = { held: IN_RIGHT, pressed: 0, released: 0 }
    for (let i = 0; i < 500; i++) rec.push(walk)
    const replay = rec.finish(runLevel(), 0, false, 0)
    expect(replay.rle).toEqual([IN_RIGHT, 500])
    expect(replay.ticks).toBe(500)
  })

  it('refuses a replay whose level has changed', () => {
    const level = runLevel()
    const w = createWorld(level)
    const rec = new ReplayRecorder()
    const walk: InputFrame = { held: IN_RIGHT, pressed: 0, released: 0 }
    for (let i = 0; i < 400 && !w.won; i++) { rec.push(walk); step(w, walk) }
    const replay = rec.finish(level, 0, false, 0x1337c0de)

    // Move the goal. The old replay must fail loudly rather than desync.
    const edited = runLevel()
    edited.rooms[0]!.entities[1]!.x = 20 * TILE
    expect(verifyReplay(edited, replay).reason).toBe('level-changed')
  })
})
