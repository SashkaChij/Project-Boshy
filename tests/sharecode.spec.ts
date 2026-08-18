import { describe, expect, it } from 'vitest'
import { CODE_PREFIX_DEFLATE, URL_CODE_LIMIT, decodeLevelCode, encodeLevelCode, extractCode } from '../src/platform/share.js'
import { emptyLevel, makeRoom, serializeLevel, setTile } from '../src/core/level.js'
import { ROOM_H, ROOM_W, TILE } from '../src/core/constants.js'
import { T_SOLID1, T_SPIKE_U } from '../src/core/registry/tileMaterials.js'
import type { LevelData } from '../src/core/types.js'

function levelWithRooms(n: number): LevelData {
  const lv = emptyLevel('share-test', 'Share test')
  lv.rooms = []
  for (let i = 0; i < n; i++) {
    const room = makeRoom(i, 0)
    for (let tx = 0; tx < ROOM_W; tx++) {
      setTile(room, 'main', tx, ROOM_H - 2, T_SOLID1)
      if (tx % 5 === 0) setTile(room, 'main', tx, ROOM_H - 3, T_SPIKE_U)
    }
    room.entities.push({ t: 'save', x: 5 * TILE, y: (ROOM_H - 3) * TILE })
    lv.rooms.push(room)
  }
  lv.rooms[0]!.entities.push({ t: 'spawn', x: TILE * 2, y: (ROOM_H - 2) * TILE - 9, d: 1 })
  lv.rooms[n - 1]!.entities.push({ t: 'goal', x: TILE * 20, y: (ROOM_H - 3) * TILE })
  return lv
}

describe('share codes', () => {
  it('round-trips a level exactly', async () => {
    const lv = levelWithRooms(3)
    const code = await encodeLevelCode(lv)
    expect(code.startsWith(CODE_PREFIX_DEFLATE)).toBe(true)
    const back = await decodeLevelCode(code)
    expect(serializeLevel(back)).toBe(serializeLevel(lv))
  })

  it('uses only URL-safe base64 characters', async () => {
    const code = await encodeLevelCode(levelWithRooms(2))
    const payload = code.slice(CODE_PREFIX_DEFLATE.length)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('compresses hard enough for a realistic level to fit in a URL', async () => {
    // Ten rooms of mostly-empty tilemap is the shape the budget was sized for.
    const code = await encodeLevelCode(levelWithRooms(10))
    expect(code.length).toBeLessThan(URL_CODE_LIMIT)
  })

  it('extracts a code from a full share URL', () => {
    expect(extractCode('https://example.com/Project-Boshy/#l=FOX1D.abc')).toBe('FOX1D.abc')
    expect(extractCode('  FOX1D.abc  ')).toBe('FOX1D.abc')
    expect(extractCode('FOX1D.a bc\n')).toBe('FOX1D.abc')
  })

  it('rejects a string that is not a level code', async () => {
    await expect(decodeLevelCode('hello world')).rejects.toThrow()
  })

  it('survives a level containing Cyrillic metadata', async () => {
    const lv = levelWithRooms(1)
    lv.meta.title = 'Лес обмана — проверка «кавычек» №1'
    lv.meta.author = 'Лиса'
    const back = await decodeLevelCode(await encodeLevelCode(lv))
    expect(back.meta.title).toBe(lv.meta.title)
    expect(back.meta.author).toBe('Лиса')
  })
})
