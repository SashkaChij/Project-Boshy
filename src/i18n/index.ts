import { EN } from './en.js'
import { RU } from './ru.js'

export type Locale = 'en' | 'ru'
export const LOCALES: readonly Locale[] = ['en', 'ru']

export type Dict = Readonly<Record<string, string>>

const DICTS: Record<Locale, Dict> = { en: EN, ru: RU }

const STORAGE_KEY = 'fox.lang'

let current: Locale = 'en'
let pluralRules = new Intl.PluralRules('en')
let numberFormat = new Intl.NumberFormat('en')
const listeners = new Set<() => void>()

/**
 * Detection order: explicit query param, then a stored choice, then the
 * browser's preference list, then English.
 */
export function detectLocale(): Locale {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('lang')
    if (q && isLocale(q)) return q
  } catch {
    /* no location, e.g. tests */
  }
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (stored && isLocale(stored)) return stored
  } catch {
    /* storage blocked */
  }
  const langs = globalThis.navigator?.languages ?? []
  for (const l of langs) {
    // Match on the primary subtag so ru-RU and ru-BY both resolve to ru.
    const primary = l.split('-')[0]?.toLowerCase()
    if (primary && isLocale(primary)) return primary
  }
  return 'en'
}

function isLocale(v: string): v is Locale {
  return v === 'en' || v === 'ru'
}

export function getLocale(): Locale {
  return current
}

export function setLocale(l: Locale, persist = true): void {
  current = l
  pluralRules = new Intl.PluralRules(l)
  numberFormat = new Intl.NumberFormat(l)
  if (persist) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, l)
    } catch {
      /* storage blocked; the choice just will not survive a reload */
    }
  }
  const doc = globalThis.document
  if (doc) doc.documentElement.lang = l
  for (const fn of listeners) fn()
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Look up a string. Missing keys fall back to English and then to the key
 * itself, rendered as a visible marker so a gap shows up on screen during
 * development rather than as a blank label in production.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[current]
  let s = dict[key] ?? EN[key]
  if (s === undefined) return `⟪${key}⟫`
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(typeof v === 'number' ? numberFormat.format(v) : String(v))
    }
  }
  return s
}

/**
 * Plural-aware lookup.
 *
 * Russian has three categories where English has two, and the rule is not
 * intuitive: 1 and 21 take "смерть", 2-4 and 22-24 take "смерти", 5-20 and 0
 * take "смертей". A death counter is the first thing on screen in this genre,
 * so this is load-bearing from day one -- hence Intl.PluralRules rather than
 * a hand-rolled n === 1 check.
 */
export function tp(baseKey: string, n: number, params?: Record<string, string | number>): string {
  const cat = pluralRules.select(n)
  const dict = DICTS[current]
  const key = `${baseKey}.${cat}`
  const s = dict[key] ?? dict[`${baseKey}.other`] ?? EN[key] ?? EN[`${baseKey}.other`]
  if (s === undefined) return `⟪${baseKey}⟫`
  let out = s
  const all = { n, ...params }
  for (const [k, v] of Object.entries(all)) {
    out = out.split(`{${k}}`).join(typeof v === 'number' ? numberFormat.format(v) : String(v))
  }
  return out
}

export function formatNumber(n: number): string {
  return numberFormat.format(n)
}

/** mm:ss.cc from a tick count at 50 Hz. */
export function formatTicks(ticks: number): string {
  const totalCs = Math.floor((ticks * 100) / 50)
  const cs = totalCs % 100
  const totalS = Math.floor(totalCs / 100)
  const s = totalS % 60
  const m = Math.floor(totalS / 60)
  const pad = (v: number): string => (v < 10 ? `0${v}` : String(v))
  return `${pad(m)}:${pad(s)}.${pad(cs)}`
}

/** Every distinct character used by either locale -- the font coverage gate. */
export function allLocaleChars(): Set<string> {
  const set = new Set<string>()
  for (const dict of Object.values(DICTS)) {
    for (const v of Object.values(dict)) {
      for (const ch of v) set.add(ch)
    }
  }
  return set
}

export function dictFor(l: Locale): Dict {
  return DICTS[l]
}

export function initI18n(): void {
  setLocale(detectLocale(), false)
}
