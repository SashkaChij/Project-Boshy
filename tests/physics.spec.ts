import { describe, expect, it } from 'vitest'
import {
  DOUBLE_JUMP_APEX, GRAVITY, JUMP_CUT, JUMP_SPEED, MAX_VSPEED, ROOM_W, SINGLE_JUMP_APEX, TILE,
} from '../src/core/constants.js'
import { roundHalfToEven } from '../src/core/math.js'
import { createWorld } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { IN_JUMP, IN_LEFT, IN_RIGHT, type InputFrame, type LevelData } from '../src/core/types.js'
import { T_SOLID1 } from '../src/core/registry/tileMaterials.js'
import { emptyLevel, setTile } from '../src/core/level.js'

function held(bits: number): InputFrame {
  return { held: bits, pressed: 0, released: 0 }
}
function press(bits: number): InputFrame {
  return { held: bits, pressed: bits, released: 0 }
}
function release(bits: number): InputFrame {
  return { held: 0, pressed: 0, released: bits }
}

/** A flat floor across the bottom of room 0, player standing on it. */
function flatLevel(): LevelData {
  const lv = emptyLevel()
  const room = lv.rooms[0]!
  for (let tx = 0; tx < ROOM_W; tx++) setTile(room, 'main', tx, 17, T_SOLID1)
  room.entities.push({ t: 'spawn', x: 5 * TILE + 16, y: 17 * TILE - 9, d: 1 })
  return lv
}

describe('physics table', () => {
  it('runs at 50 Hz with the documented constants', () => {
    expect(GRAVITY).toBe(0.4)
    expect(JUMP_SPEED).toBe(8.5)
    expect(JUMP_CUT).toBe(0.45)
    expect(MAX_VSPEED).toBe(9)
  })

  it('single jump peaks at 86.1 px after 21 ticks', () => {
    const w = createWorld(flatLevel())
    step(w, held(0)) // settle onto the floor
    const y0 = w.player.y
    step(w, press(IN_JUMP))
    let peak = w.player.y
    let ticks = 1
    for (let i = 0; i < 60; i++) {
      step(w, held(IN_JUMP))
      if (w.player.y < peak) { peak = w.player.y; ticks = i + 2 }
      else break
    }
    expect(Number((y0 - peak).toFixed(1))).toBe(SINGLE_JUMP_APEX)
    expect(ticks).toBe(21)
  })

  it('double jump at apex reaches 143.9 px, the canonical 4.5-block jump', () => {
    const w = createWorld(flatLevel())
    step(w, held(0))
    const y0 = w.player.y
    step(w, press(IN_JUMP))
    // Ride the first jump to its apex (21 ticks of rise), then jump again.
    for (let i = 0; i < 20; i++) step(w, held(IN_JUMP))
    step(w, press(IN_JUMP))
    let peak = w.player.y
    for (let i = 0; i < 60; i++) {
      step(w, held(IN_JUMP))
      if (w.player.y < peak) peak = w.player.y
      else break
    }
    expect(Number((y0 - peak).toFixed(1))).toBe(DOUBLE_JUMP_APEX)
    expect((y0 - peak) / TILE).toBeCloseTo(4.497, 2)
  })

  it('releasing jump on the second tick caps the hop at ~22.9 px', () => {
    const w = createWorld(flatLevel())
    step(w, held(0))
    const y0 = w.player.y
    step(w, press(IN_JUMP))
    step(w, release(IN_JUMP))
    let peak = w.player.y
    for (let i = 0; i < 40; i++) {
      step(w, held(0))
      if (w.player.y < peak) peak = w.player.y
      else break
    }
    expect(y0 - peak).toBeCloseTo(22.9, 1)
  })

  it('cannot clear 3 blocks but clears 4.5 with a double jump', () => {
    expect(SINGLE_JUMP_APEX).toBeLessThan(3 * TILE)
    expect(DOUBLE_JUMP_APEX).toBeGreaterThan(4 * TILE)
    expect(DOUBLE_JUMP_APEX).toBeLessThan(5 * TILE)
  })

  it('terminal fall displacement is 9.4 px, because gravity applies after the clamp', () => {
    const w = createWorld(flatLevel())
    // Walk off into open air and fall for a long time.
    w.player.y = 40
    for (let i = 0; i < 40; i++) {
      const before = w.player.y
      step(w, held(0))
      if (w.player.dead) break
      const d = w.player.y - before
      if (i > 30) expect(d).toBeCloseTo(MAX_VSPEED + GRAVITY, 6)
    }
  })

  it('walks at exactly 3 px per tick with no acceleration ramp', () => {
    const w = createWorld(flatLevel())
    step(w, held(0))
    const x0 = w.player.x
    step(w, held(IN_RIGHT))
    expect(w.player.x - x0).toBe(3)
    step(w, held(IN_RIGHT))
    expect(w.player.x - x0).toBe(6)
    step(w, held(IN_LEFT))
    expect(w.player.x - x0).toBe(3)
  })

  it('grounded jump does not consume the air jump; walking off a ledge leaves one', () => {
    const w = createWorld(flatLevel())
    step(w, held(0))
    expect(w.player.onGround).toBe(true)
    expect(w.player.jumps).toBe(1)
    step(w, press(IN_JUMP))
    expect(w.player.jumps).toBe(1) // ground jump is free
    step(w, press(IN_JUMP))
    expect(w.player.jumps).toBe(0) // air jump consumed
  })
})

describe('roundHalfToEven', () => {
  it('rounds halves to the nearest even integer, like GML round()', () => {
    expect(roundHalfToEven(0.5)).toBe(0)
    expect(roundHalfToEven(1.5)).toBe(2)
    expect(roundHalfToEven(2.5)).toBe(2)
    expect(roundHalfToEven(3.5)).toBe(4)
    expect(roundHalfToEven(-0.5)).toBe(0)
    expect(roundHalfToEven(-1.5)).toBe(-2)
    expect(roundHalfToEven(-2.5)).toBe(-2)
    expect(roundHalfToEven(2.4)).toBe(2)
    expect(roundHalfToEven(2.6)).toBe(3)
  })
})
