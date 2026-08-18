import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The core must stay a pure function of plain data.
 *
 * tsconfig.core.json already omits the DOM lib, so `document` cannot compile.
 * This guards the things a type system will not catch: Date, Math.random, and
 * the transcendental functions whose last bits differ between JS engines.
 * Every one of those desyncs replays silently and months later -- exactly the
 * failure mode that is impossible to debug after the fact.
 */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

/**
 * Blanks comments and string literals while preserving line numbers, so a
 * doc-comment that merely NAMES a banned call (as rng.ts does when explaining
 * why Math.random is forbidden) is not itself a violation.
 */
function stripCommentsAndStrings(src: string): string {
  const blank = (m: string): string => m.replace(/[^\n]/g, ' ')
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
    .replace(/`(?:[^`\\]|\\.)*`/g, blank)
}

const CORE = 'src/core'
const files = walk(CORE)

const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /\bMath\.random\b/, why: 'use rng.ts, seeded from World state' },
  { pattern: /\bDate\b/, why: 'the core has no clock; the tick count is the time' },
  { pattern: /\bperformance\./, why: 'only platform/shell.ts may read a wall clock' },
  { pattern: /\bdocument\b/, why: 'the core is DOM-free' },
  { pattern: /\bwindow\b/, why: 'the core is DOM-free' },
  { pattern: /\blocalStorage\b/, why: 'the core does not persist anything' },
  { pattern: /\bMath\.(sin|cos|tan|atan2|sqrt|pow|exp|log)\b/, why: 'float results differ between engines; use SIN_LUT / isqrt' },
]

// math.ts builds the sine table once at module load, before any tick can
// observe it, so the table generator is the single sanctioned exception.
const EXEMPT = new Set(['src/core/math.ts'])

describe('core purity', () => {
  it('finds core source files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const file of files) {
    if (EXEMPT.has(file.replace(/\\/g, '/'))) continue
    it(`${file} contains no nondeterministic calls`, () => {
      const src = readFileSync(file, 'utf8')
      const lines = stripCommentsAndStrings(src).split('\n')
      const raw = src.split('\n')
      const hits: string[] = []
      lines.forEach((code, i) => {
        for (const b of BANNED) {
          if (b.pattern.test(code)) {
            hits.push(`${file}:${i + 1} ${b.pattern} - ${b.why}\n    ${(raw[i] ?? '').trim()}`)
          }
        }
      })
      expect(hits).toEqual([])
    })
  }

  it('never imports outside the core', () => {
    const bad: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1] as string
        if (spec.startsWith('.')) continue
        bad.push(`${file} imports ${spec}`)
      }
      if (/from\s+'\.\.\/(platform|game|editor|i18n|content)\//.test(src)) {
        bad.push(`${file} reaches into a shell layer`)
      }
    }
    expect(bad).toEqual([])
  })
})
