import { describe, expect, it } from 'vitest'
import { CHARS, RoomShapeError, at, buildLevel, buildRoom, goalAt, half, saveAt, spawnAt } from '../src/content/build.js'
import { ROOM_H, ROOM_W, TILE } from '../src/core/constants.js'
import { getTile } from '../src/core/level.js'
import { T_SOLID1, T_SPIKE_U } from '../src/core/registry/tileMaterials.js'

const blank = (): string[] => Array.from({ length: ROOM_H }, () => ' '.repeat(ROOM_W))

function withFloor(): string[] {
  const rows = blank()
  rows[ROOM_H - 2] = '#'.repeat(ROOM_W)
  return rows
}

describe('ASCII room builder', () => {
  it('paints characters into the right cells', () => {
    const rows = blank()
    rows[3] = '#'.repeat(ROOM_W)
    rows[5] = `${' '.repeat(4)}^${' '.repeat(ROOM_W - 5)}`
    const room = buildRoom({ gx: 0, gy: 0, main: rows })
    expect(getTile(room, 'main', 0, 3)).toBe(T_SOLID1)
    expect(getTile(room, 'main', 4, 5)).toBe(T_SPIKE_U)
    expect(getTile(room, 'main', 5, 5)).toBe(0)
  })

  /**
   * The shape errors exist so a miscounted row fails the test suite with the
   * exact coordinate, instead of shipping as an invisible hole in a floor.
   */
  it('rejects the wrong number of rows, naming the count', () => {
    expect(() => buildRoom({ gx: 0, gy: 0, main: blank().slice(0, 18) }, 'r'))
      .toThrow(/expected 19 rows, got 18/)
  })

  it('rejects a short row, naming the row index', () => {
    const rows = blank()
    rows[7] = ' '.repeat(ROOM_W - 1)
    expect(() => buildRoom({ gx: 0, gy: 0, main: rows }, 'r')).toThrow(/row 7 has 24 chars/)
  })

  it('rejects an unknown tile character, naming it and its position', () => {
    const rows = blank()
    rows[2] = `Z${' '.repeat(ROOM_W - 1)}`
    expect(() => buildRoom({ gx: 0, gy: 0, main: rows }, 'r')).toThrow(RoomShapeError)
    expect(() => buildRoom({ gx: 0, gy: 0, main: rows }, 'r')).toThrow(/"Z" at 0,2/)
  })

  it('maps every documented character to a real tile id', () => {
    for (const [ch, id] of Object.entries(CHARS)) {
      expect(typeof id, `char ${ch}`).toBe('number')
      expect(id).toBeGreaterThanOrEqual(0)
    }
  })

  it('places entities at tile centres', () => {
    const e = at('save', 3, 4)
    expect(e.x).toBe(3 * TILE + TILE / 2)
    expect(e.y).toBe(4 * TILE + TILE / 2)
    expect(half('cherry', 3, 4).x).toBe(3 * TILE)
  })

  it('puts a spawn on top of the given floor row, not inside it', () => {
    const s = spawnAt(5, ROOM_H - 2)
    // Feet at y+8 must land on the pixel above the floor's top edge.
    expect(s.y + 8).toBe((ROOM_H - 2) * TILE - 1)
  })

  it('builds a whole level with grid-positioned rooms', () => {
    const lv = buildLevel({
      id: 'x', title: 'X',
      rooms: [
        { gx: 0, gy: 0, main: withFloor(), entities: [spawnAt(2, ROOM_H - 2), saveAt(4, ROOM_H - 3)] },
        { gx: 1, gy: 0, main: withFloor(), entities: [goalAt(20, ROOM_H - 3)] },
      ],
    })
    expect(lv.rooms.length).toBe(2)
    expect(lv.rooms[1]!.x).toBe(1)
    expect(lv.rooms[0]!.entities[0]!.t).toBe('spawn')
  })
})
