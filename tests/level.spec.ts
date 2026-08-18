import { describe, expect, it } from 'vitest'
import {
  LEVEL_VERSION, LevelFormatError, emptyLevel, getTile, levelHash, parseLevel,
  serializeLevel, serializeLevelPretty, setTile, validateLevel,
} from '../src/core/level.js'
import { ROOM_H, ROOM_W, TILE } from '../src/core/constants.js'
import { T_SOLID1, T_SPIKE_U } from '../src/core/registry/tileMaterials.js'
import { makeRoom } from '../src/core/level.js'

function playableLevel() {
  const lv = emptyLevel('t1', 'Test')
  const room = lv.rooms[0]!
  for (let tx = 0; tx < ROOM_W; tx++) setTile(room, 'main', tx, 17, T_SOLID1)
  room.entities.push({ t: 'spawn', x: 2 * TILE + 16, y: 17 * TILE - 9, d: 1 })
  room.entities.push({ t: 'goal', x: 20 * TILE, y: 16 * TILE })
  return lv
}

describe('level format', () => {
  it('round-trips through serialize and parse without loss', () => {
    const lv = playableLevel()
    lv.rooms[0]!.entities.push({ t: 'turret', x: 100, y: 200, d: 2, p: { rate: 20 } })
    const again = parseLevel(serializeLevel(lv))
    expect(serializeLevel(again)).toBe(serializeLevel(lv))
    expect(again.rooms[0]!.entities[2]).toEqual({ t: 'turret', x: 100, y: 200, d: 2, p: { rate: 20 } })
  })

  it('strips properties that equal their default', () => {
    const lv = playableLevel()
    // rate defaults to 50, speed to 4: only the changed one should survive.
    lv.rooms[0]!.entities.push({ t: 'turret', x: 64, y: 64, p: { rate: 50, speed: 9 } })
    const json = JSON.parse(serializeLevel(lv))
    expect(json.rooms[0].entities[2].p).toEqual({ speed: 9 })
  })

  it('refuses a level from a newer format version', () => {
    const raw = JSON.parse(serializeLevel(playableLevel()))
    raw.v = LEVEL_VERSION + 5
    expect(() => parseLevel(raw)).toThrow(LevelFormatError)
  })

  it('refuses something that is not a level at all', () => {
    expect(() => parseLevel('{"hello":"world"}')).toThrow(LevelFormatError)
  })

  it('repairs a layer of the wrong length rather than crashing', () => {
    const raw = JSON.parse(serializeLevel(playableLevel()))
    raw.rooms[0].layers.main = [1, 2, 3]
    const lv = parseLevel(raw)
    expect(lv.rooms[0]!.layers.main.length).toBe(ROOM_W * ROOM_H)
    expect(getTile(lv.rooms[0]!, 'main', 1, 0)).toBe(2)
  })

  it('changes its hash when anything meaningful changes', () => {
    const a = playableLevel()
    const b = playableLevel()
    expect(levelHash(a)).toBe(levelHash(b))
    setTile(b.rooms[0]!, 'main', 5, 5, T_SOLID1)
    expect(levelHash(a)).not.toBe(levelHash(b))
  })

  it('pretty output is valid input', () => {
    const lv = playableLevel()
    expect(serializeLevel(parseLevel(serializeLevelPretty(lv)))).toBe(serializeLevel(lv))
  })
})

describe('validation', () => {
  it('accepts a playable level', () => {
    expect(validateLevel(playableLevel()).errors).toEqual([])
  })

  it('reports a missing spawn and a missing goal as errors', () => {
    const lv = emptyLevel()
    const keys = validateLevel(lv).errors.map((e) => e.key)
    expect(keys).toContain('valid.err.noSpawn')
    expect(keys).toContain('valid.err.noGoal')
  })

  it('reports two spawns as an error', () => {
    const lv = playableLevel()
    lv.rooms[0]!.entities.push({ t: 'spawn', x: 300, y: 300 })
    expect(validateLevel(lv).errors.map((e) => e.key)).toContain('valid.err.manySpawns')
  })

  it('treats a spawn inside a spike as an error, not a warning', () => {
    const lv = playableLevel()
    setTile(lv.rooms[0]!, 'main', 2, 16, T_SPIKE_U)
    lv.rooms[0]!.entities[0]!.y = 16 * TILE + 16
    expect(validateLevel(lv).errors.map((e) => e.key)).toContain('valid.err.spawnInWall')
  })

  it('warns about an unreachable room but does not block export', () => {
    const lv = playableLevel()
    lv.rooms.push(makeRoom(9, 9))
    const { errors, warnings } = validateLevel(lv)
    expect(errors).toEqual([])
    expect(warnings.map((w) => w.key)).toContain('valid.warn.orphanRoom')
  })

  it('rejects an unknown entity type', () => {
    const lv = playableLevel()
    lv.rooms[0]!.entities.push({ t: 'definitelyNotAThing', x: 10, y: 10 })
    expect(validateLevel(lv).errors.map((e) => e.key)).toContain('valid.err.unknownEntity')
  })
})
