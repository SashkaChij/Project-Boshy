import { describe, expect, it } from 'vitest'
import { SPRITES } from '../src/platform/art/sprites.js'
import { PALETTE } from '../src/platform/art/palette.js'
import { FALLBACK_GLYPH, FONT_H, FONT_W, GLYPHS } from '../src/platform/art/font.js'
import { allLocaleChars } from '../src/i18n/index.js'
import type { SpriteData } from '../src/platform/art/types.js'

/** Every sprite the renderer and the editor look up by name. */
const REQUIRED = [
  'solid1', 'solid2', 'solid3', 'solid4', 'solid5', 'solid6',
  'platform', 'vineL', 'vineR', 'water1', 'water2', 'water3', 'ice',
  'convL', 'convR', 'deco1', 'deco2', 'deco3', 'deco4',
  'foxIdle0', 'foxIdle1', 'foxRun0', 'foxRun1', 'foxRun2', 'foxRun3',
  'foxJump', 'foxFall', 'foxVine',
  'save', 'goal', 'warp', 'sign', 'cherry', 'minispike', 'turret', 'fan',
  'laserEmitter', 'fallblock', 'riseblock', 'fakeblock', 'invisblock',
  'breakblock', 'platformEnt', 'crusher', 'refresher', 'spring', 'gravflip',
  'boss0', 'boss1', 'boss2', 'bullet', 'proj0', 'proj1', 'proj2',
]

describe('sprite data', () => {
  it('provides every sprite the renderer asks for', () => {
    expect(REQUIRED.filter((n) => !SPRITES[n])).toEqual([])
  })

  it('has rows matching its declared dimensions', () => {
    const bad: string[] = []
    for (const [name, sd] of Object.entries(SPRITES) as [string, SpriteData][]) {
      if (sd.rows.length !== sd.h) bad.push(`${name}: ${sd.rows.length} rows, declared h=${sd.h}`)
      sd.rows.forEach((row, i) => {
        if (row.length !== sd.w) bad.push(`${name} row ${i}: ${row.length} chars, declared w=${sd.w}`)
      })
    }
    expect(bad).toEqual([])
  })

  it('uses only characters that exist in the palette', () => {
    const bad = new Set<string>()
    for (const sd of Object.values(SPRITES) as SpriteData[]) {
      for (const row of sd.rows) {
        for (const ch of row) {
          if (ch !== '.' && !PALETTE[ch]) bad.add(ch)
        }
      }
    }
    expect([...bad]).toEqual([])
  })

  it('uses well-formed hex colours throughout the palette', () => {
    const bad = Object.entries(PALETTE).filter(([, v]) => !/^#[0-9a-fA-F]{6}$/.test(v))
    expect(bad).toEqual([])
  })

  it('anchors every player frame consistently so the fox does not jitter', () => {
    const frames = REQUIRED.filter((n) => n.startsWith('fox'))
    for (const n of frames) {
      const sd = SPRITES[n] as SpriteData
      expect(sd.ax, `${n}.ax`).toBe(11)
      expect(sd.ay, `${n}.ay`).toBe(12)
    }
  })

  it('makes the fake block indistinguishable from a real one', () => {
    // If they differ by even a pixel the joke stops working and the trap
    // becomes unfair in the other direction.
    expect(SPRITES['fakeblock']?.rows).toEqual(SPRITES['solid1']?.rows)
  })
})

describe('bitmap font', () => {
  it('has a glyph for every character used by either locale', () => {
    const missing: string[] = []
    for (const ch of allLocaleChars()) {
      if (ch === ' ') continue
      if (!GLYPHS[ch]) missing.push(ch)
    }
    // A fixed smoke string would catch Ё and « », but not the character a
    // translator introduces five months from now. Checking the dictionaries
    // themselves is strictly more general for the same ten lines.
    expect(missing).toEqual([])
  })

  it('covers the full Russian alphabet in both cases', () => {
    const ru = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'
    expect([...ru].filter((c) => !GLYPHS[c])).toEqual([])
  })

  it('has a glyph for every symbol the UI draws from code', () => {
    // Locale strings are covered by the dictionary sweep above, but symbols
    // written directly into a draw call (a verified tick, an arrow) have no
    // dictionary entry to sweep, and would silently render as empty boxes.
    const drawn = ['✓', '✗', '←', '→', '↑', '↓', '·', '№', '«', '»', '—', '[', ']', '%', '/']
    expect(drawn.filter((c) => !GLYPHS[c])).toEqual([])
  })

  it('covers printable ASCII', () => {
    const missing: string[] = []
    for (let i = 0x21; i <= 0x7e; i++) {
      const ch = String.fromCharCode(i)
      if (!GLYPHS[ch]) missing.push(ch)
    }
    expect(missing).toEqual([])
  })

  it('has exactly FONT_H rows per glyph, all within FONT_W bits', () => {
    const bad: string[] = []
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      if (rows.length !== FONT_H) bad.push(`${ch}: ${rows.length} rows`)
      for (const r of rows) {
        if (r < 0 || r >= 1 << FONT_W) bad.push(`${ch}: row value ${r} out of ${FONT_W}-bit range`)
      }
    }
    expect(bad).toEqual([])
    expect(FALLBACK_GLYPH.length).toBe(FONT_H)
  })
})
