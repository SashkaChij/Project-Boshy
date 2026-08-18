import { describe, expect, it } from 'vitest'
import { EN } from '../src/i18n/en.js'
import { RU } from '../src/i18n/ru.js'
import { formatTicks, setLocale, t, tp } from '../src/i18n/index.js'

/**
 * Plural variants and taunts are exempt from strict key parity.
 *
 * Russian has three plural categories where English has two, so
 * keys(en) === keys(ru) fails by construction on every pluralised string.
 * Taunt pools are written independently per language and deliberately differ.
 */
const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other)$/
const isExempt = (k: string): boolean => k.startsWith('taunt.') || PLURAL_SUFFIX.test(k)

describe('i18n key parity', () => {
  const en = Object.keys(EN).filter((k) => !isExempt(k))
  const ru = Object.keys(RU).filter((k) => !isExempt(k))

  it('has no keys missing from Russian', () => {
    expect(en.filter((k) => !(k in RU))).toEqual([])
  })

  it('has no keys missing from English', () => {
    expect(ru.filter((k) => !(k in EN))).toEqual([])
  })

  it('has a non-empty taunt pool in both languages', () => {
    expect(Object.keys(EN).filter((k) => k.startsWith('taunt.')).length).toBeGreaterThan(0)
    expect(Object.keys(RU).filter((k) => k.startsWith('taunt.')).length).toBeGreaterThan(0)
  })

  it('has every pluralised base present with an .other fallback in both', () => {
    const bases = new Set<string>()
    for (const k of [...Object.keys(EN), ...Object.keys(RU)]) {
      if (PLURAL_SUFFIX.test(k)) bases.add(k.replace(PLURAL_SUFFIX, ''))
    }
    for (const b of bases) {
      expect(`${b}.other`, `${b} needs .other in en`).toSatisfy(() => `${b}.other` in EN)
      expect(`${b}.other`, `${b} needs .other in ru`).toSatisfy(() => `${b}.other` in RU)
    }
  })

  it('leaves no placeholder unmatched between languages', () => {
    for (const k of en) {
      const a = (EN[k] ?? '').match(/\{[a-z]+\}/g)?.sort() ?? []
      const b = (RU[k] ?? '').match(/\{[a-z]+\}/g)?.sort() ?? []
      expect(b, `placeholders differ for ${k}`).toEqual(a)
    }
  })
})

describe('russian plurals', () => {
  it('picks all three categories correctly for the death counter', () => {
    setLocale('ru', false)
    expect(tp('hud.deaths', 1)).toBe('1 смерть')
    expect(tp('hud.deaths', 2)).toBe('2 смерти')
    expect(tp('hud.deaths', 5)).toBe('5 смертей')
    expect(tp('hud.deaths', 21)).toBe('21 смерть')
    expect(tp('hud.deaths', 22)).toBe('22 смерти')
    expect(tp('hud.deaths', 25)).toBe('25 смертей')
    expect(tp('hud.deaths', 0)).toBe('0 смертей')
    expect(tp('hud.deaths', 111)).toBe('111 смертей')
  })

  it('still works in English', () => {
    setLocale('en', false)
    expect(tp('hud.deaths', 1)).toBe('1 death')
    expect(tp('hud.deaths', 2)).toBe('2 deaths')
    expect(tp('hud.deaths', 0)).toBe('0 deaths')
  })
})

describe('t()', () => {
  it('interpolates and marks missing keys visibly', () => {
    setLocale('en', false)
    expect(t('editor.roomCount', { n: 3, max: 64 })).toBe('3 / 64 rooms')
    expect(t('does.not.exist')).toBe('[does.not.exist]')
  })
})

describe('formatTicks', () => {
  it('renders 50 Hz ticks as mm:ss.cc', () => {
    expect(formatTicks(0)).toBe('00:00.00')
    expect(formatTicks(50)).toBe('00:01.00')
    expect(formatTicks(75)).toBe('00:01.50')
    expect(formatTicks(3000)).toBe('01:00.00')
  })
})
