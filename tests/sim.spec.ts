import { describe, expect, it } from 'vitest'
import { ROOM_H, ROOM_W, TILE, VIEW_W } from '../src/core/constants.js'
import { emptyLevel, makeRoom, setTile } from '../src/core/level.js'
import { createWorld, respawn } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import {
  DIFF_IMPOSSIBLE, DIFF_MEDIUM, IN_JUMP, IN_LEFT, IN_RIGHT, IN_SHOOT,
  type InputFrame, type LevelData,
} from '../src/core/types.js'
import {
  T_ICE, T_PLATFORM, T_SOLID1, T_SPIKE_U, T_WATER1,
} from '../src/core/registry/tileMaterials.js'

const FLOOR = ROOM_H - 2

const held = (bits: number): InputFrame => ({ held: bits, pressed: 0, released: 0 })
const press = (bits: number): InputFrame => ({ held: bits, pressed: bits, released: 0 })
const idle = (): InputFrame => ({ held: 0, pressed: 0, released: 0 })

function base(withGoal = true): LevelData {
  const lv = emptyLevel('sim', 'Sim')
  const room = lv.rooms[0]!
  for (let tx = 0; tx < ROOM_W; tx++) setTile(room, 'main', tx, FLOOR, T_SOLID1)
  room.entities.push({ t: 'spawn', x: 3 * TILE + 16, y: FLOOR * TILE - 9, d: 1 })
  // Optional: a goal at the far right ends the run the moment the player
  // reaches it, which would cut short any test that walks to the room edge.
  if (withGoal) room.entities.push({ t: 'goal', x: 22 * TILE, y: (FLOOR - 1) * TILE })
  return lv
}

function run(w: ReturnType<typeof createWorld>, n: number, input: InputFrame = idle()): void {
  for (let i = 0; i < n; i++) step(w, input)
}

describe('death and respawn', () => {
  it('kills on a spike and counts the death', () => {
    const lv = base()
    setTile(lv.rooms[0]!, 'main', 6, FLOOR - 1, T_SPIKE_U)
    const w = createWorld(lv)
    run(w, 1)
    expect(w.deaths).toBe(0)
    run(w, 60, held(IN_RIGHT))
    expect(w.deaths).toBe(1)
  })

  it('returns to the last save point, not the level start', () => {
    const lv = base(false)
    lv.rooms[0]!.entities.push({ t: 'save', x: 10 * TILE, y: (FLOOR - 1) * TILE })
    setTile(lv.rooms[0]!, 'main', 16, FLOOR - 1, T_SPIKE_U)
    const w = createWorld(lv)
    run(w, 1)

    run(w, 300, held(IN_RIGHT))
    expect(w.deaths).toBeGreaterThan(0)
    expect(w.save).not.toBeNull()

    // The save records where the PLAYER was standing, not where the save point
    // sits -- that is what makes a save feel like a checkpoint rather than a
    // teleport pad -- so it lands within the save point's own footprint.
    expect(w.save!.x).toBeGreaterThan(10 * TILE - 24)
    expect(w.save!.x).toBeLessThan(10 * TILE + 24)

    // And respawning must actually put the player back there, not at spawn.
    respawn(w)
    expect(w.player.x).toBe(w.save!.x)
    expect(w.player.x).toBeGreaterThan(4 * TILE)
  })

  it('restarts instantly on the restart bit, alive or dead', () => {
    const w = createWorld(base())
    run(w, 1)
    const startX = w.player.x
    run(w, 40, held(IN_RIGHT))
    expect(w.player.x).toBeGreaterThan(startX)
    step(w, press(1 << 4)) // IN_RESTART
    expect(w.player.x).toBeCloseTo(startX, 0)
  })

  it('kills when the player falls out of the world', () => {
    const lv = emptyLevel('hole', 'Hole')
    const room = lv.rooms[0]!
    room.entities.push({ t: 'spawn', x: 5 * TILE, y: 100, d: 1 })
    room.entities.push({ t: 'goal', x: 20 * TILE, y: 100 })
    const w = createWorld(lv)
    run(w, 200)
    expect(w.deaths).toBeGreaterThan(0)
  })

  it('keeps the death counter and run timer across a respawn', () => {
    const lv = base()
    setTile(lv.rooms[0]!, 'main', 6, FLOOR - 1, T_SPIKE_U)
    const w = createWorld(lv)
    run(w, 120, held(IN_RIGHT))
    const deaths = w.deaths
    const tick = w.tick
    respawn(w)
    expect(w.deaths).toBe(deaths)
    expect(w.tick).toBe(tick)
  })
})

describe('tile behaviours', () => {
  it('lets the player jump up through a one-way platform but stand on it', () => {
    const lv = base()
    for (let tx = 2; tx <= 8; tx++) setTile(lv.rooms[0]!, 'main', tx, FLOOR - 4, T_PLATFORM)
    const w = createWorld(lv)
    run(w, 1)
    const floorY = w.player.y

    // A double jump clears 4.5 tiles, so four tiles up is reachable.
    step(w, press(IN_JUMP))
    run(w, 12, held(IN_JUMP))
    step(w, press(IN_JUMP))
    run(w, 60, held(0))
    expect(w.player.y).toBeLessThan(floorY - TILE)
    expect(w.player.onGround).toBe(true)
  })

  it('accelerates instead of snapping on ice', () => {
    const lv = base()
    for (let tx = 0; tx < ROOM_W; tx++) setTile(lv.rooms[0]!, 'main', tx, FLOOR, T_ICE)
    const w = createWorld(lv)
    run(w, 2)
    step(w, held(IN_RIGHT))
    // Instant-on would already be at 3; ice ramps at 0.2 per tick.
    expect(w.player.hspeed).toBeCloseTo(0.2, 5)
    run(w, 20, held(IN_RIGHT))
    expect(w.player.hspeed).toBeCloseTo(3, 5)
  })

  it('caps the sink speed in water and refills the air jump', () => {
    const lv = base()
    for (let ty = 2; ty < FLOOR; ty++) {
      for (let tx = 2; tx < 8; tx++) setTile(lv.rooms[0]!, 'main', tx, ty, T_WATER1)
    }
    const w = createWorld(lv)
    w.player.x = 5 * TILE
    w.player.y = 5 * TILE
    run(w, 30)
    expect(w.player.vspeed).toBeLessThanOrEqual(2.4)
    expect(w.player.jumps).toBe(1)
  })

  it('collides with spikes per pixel, not per tile', () => {
    const lv = base()
    // A spike pointing up: standing beside its base kills, standing level with
    // its tip does not, because the triangle is narrow at the top.
    setTile(lv.rooms[0]!, 'main', 10, FLOOR - 1, T_SPIKE_U)
    const w = createWorld(lv)
    w.player.x = 10 * TILE + 2 // hard left edge of the spike tile
    w.player.y = (FLOOR - 1) * TILE + 4 // high up, where the triangle is thin
    step(w, idle())
    expect(w.player.dead).toBe(false)
  })
})

describe('rooms', () => {
  it('walks into the neighbouring room and keeps going', () => {
    const lv = base(false)
    const second = makeRoom(1, 0)
    for (let tx = 0; tx < ROOM_W; tx++) setTile(second, 'main', tx, FLOOR, T_SOLID1)
    lv.rooms.push(second)
    const w = createWorld(lv)
    run(w, 1)
    expect(w.room).toBe(0)
    run(w, 400, held(IN_RIGHT))
    expect(w.room).toBe(1)
    // Crossed, still inside the new room, and still alive. Where exactly they
    // ended up depends on when the seam was reached, which is not the point.
    expect(w.player.x).toBeGreaterThan(0)
    expect(w.player.x).toBeLessThan(VIEW_W)
    expect(w.player.dead).toBe(false)
  })

  it('treats a missing neighbour as a wall, not a hole', () => {
    const w = createWorld(base(false))
    run(w, 400, held(IN_RIGHT))
    expect(w.room).toBe(0)
    expect(w.player.dead).toBe(false)
    expect(w.player.x).toBeLessThan(VIEW_W)
  })
})

describe('shooting', () => {
  it('caps live bullets at four', () => {
    const w = createWorld(base())
    run(w, 1)
    for (let i = 0; i < 10; i++) step(w, press(IN_SHOOT))
    expect(w.bullets.filter((b) => b.alive).length).toBeLessThanOrEqual(4)
  })

  it('activates a save point when shot from a distance', () => {
    const lv = base(false)
    // Level with the player's own muzzle height so the shot actually connects.
    lv.rooms[0]!.entities.push({ t: 'save', x: 12 * TILE, y: FLOOR * TILE - 24 })
    const w = createWorld(lv)
    run(w, 1)
    expect(w.save).toBeNull()
    step(w, press(IN_SHOOT))
    run(w, 40)
    expect(w.save).not.toBeNull()
  })
})

describe('difficulty', () => {
  it('thins save points without touching the physics', () => {
    const lv = base()
    for (let i = 0; i < 4; i++) {
      lv.rooms[0]!.entities.push({ t: 'save', x: (5 + i * 4) * TILE, y: (FLOOR - 1) * TILE })
    }
    const easy = createWorld(lv, { difficulty: DIFF_MEDIUM })
    const brutal = createWorld(lv, { difficulty: DIFF_IMPOSSIBLE })
    expect(easy.entities.filter((e) => e.t === 'save').length).toBe(4)
    expect(brutal.entities.filter((e) => e.t === 'save').length).toBe(0)

    // Same input, same trajectory: difficulty must never change the feel.
    const a = createWorld(lv, { difficulty: DIFF_MEDIUM })
    const b = createWorld(lv, { difficulty: DIFF_IMPOSSIBLE })
    for (let i = 0; i < 40; i++) {
      const input = i === 5 ? press(IN_JUMP) : held(IN_RIGHT)
      step(a, input)
      step(b, input)
    }
    expect(a.player.x).toBe(b.player.x)
    expect(a.player.y).toBe(b.player.y)
  })

  it('assist mode buffers a jump but leaves the jump itself identical', () => {
    const lv = base()
    const strict = createWorld(lv, { assist: false })
    const assist = createWorld(lv, { assist: true })
    run(strict, 2)
    run(assist, 2)
    step(strict, press(IN_JUMP))
    step(assist, press(IN_JUMP))
    expect(strict.player.vspeed).toBe(assist.player.vspeed)
  })
})

describe('gravity flip', () => {
  it('inverts the player and lands them on the ceiling', () => {
    const lv = base(false)
    for (let tx = 0; tx < ROOM_W; tx++) setTile(lv.rooms[0]!, 'main', tx, 2, T_SOLID1)
    lv.rooms[0]!.entities.push({ t: 'gravflip', x: 3 * TILE + 16, y: FLOOR * TILE - 20 })
    const w = createWorld(lv)
    run(w, 3)
    expect(w.player.gravDir).toBe(-1)
    run(w, 120, held(IN_LEFT))
    expect(w.player.onGround).toBe(true)
    expect(w.player.y).toBeLessThan(6 * TILE)
  })
})
