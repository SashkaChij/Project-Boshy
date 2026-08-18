import { FALLBACK_GLYPH, FONT_H, FONT_W, GLYPHS } from './art/font.js'

/**
 * Bitmap text.
 *
 * Drawn from our own glyph data rather than a web font for two reasons: it is
 * the only way to guarantee Cyrillic coverage without shipping a font file
 * (most retro pixel fonts have none), and canvas fillText at fractional sizes
 * turns a pixel font to mush -- worse for Cyrillic than Latin, because Д Ж Щ Ю Ы
 * are denser than any Latin letter.
 *
 * Every glyph is cached per (colour, scale) so a HUD redraw is a handful of
 * drawImage calls rather than thousands of fillRects.
 */
const cache = new Map<string, HTMLCanvasElement>()

function glyphCanvas(ch: string, color: string, scale: number): HTMLCanvasElement {
  const key = `${ch}|${color}|${scale}`
  const hit = cache.get(key)
  if (hit) return hit

  const rows = GLYPHS[ch] ?? FALLBACK_GLYPH
  const c = document.createElement('canvas')
  c.width = FONT_W * scale
  c.height = FONT_H * scale
  const ctx = c.getContext('2d')
  if (ctx) {
    ctx.fillStyle = color
    for (let y = 0; y < FONT_H; y++) {
      const bits = rows[y] ?? 0
      for (let x = 0; x < FONT_W; x++) {
        // Bit FONT_W-1 is the leftmost pixel.
        if ((bits & (1 << (FONT_W - 1 - x))) !== 0) {
          ctx.fillRect(x * scale, y * scale, scale, scale)
        }
      }
    }
  }
  cache.set(key, c)
  return c
}

export interface TextOptions {
  scale?: number
  color?: string
  /** Extra pixels between glyphs, in unscaled units. */
  tracking?: number
  align?: 'left' | 'center' | 'right'
  /** Draws a 1px offset copy underneath for readability on busy backgrounds. */
  shadow?: string
}

export function measureText(s: string, opts: TextOptions = {}): number {
  const scale = opts.scale ?? 2
  const tracking = opts.tracking ?? 1
  if (s.length === 0) return 0
  return (s.length * (FONT_W + tracking) - tracking) * scale
}

export function textHeight(opts: TextOptions = {}): number {
  return FONT_H * (opts.scale ?? 2)
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  opts: TextOptions = {},
): void {
  const scale = opts.scale ?? 2
  const color = opts.color ?? '#ffffff'
  const tracking = opts.tracking ?? 1
  const width = measureText(s, opts)
  let px = Math.round(x)
  if (opts.align === 'center') px = Math.round(x - width / 2)
  else if (opts.align === 'right') px = Math.round(x - width)
  const py = Math.round(y)

  if (opts.shadow) {
    drawRun(ctx, s, px + scale, py + scale, opts.shadow, scale, tracking)
  }
  drawRun(ctx, s, px, py, color, scale, tracking)
}

function drawRun(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale: number,
  tracking: number,
): void {
  let cx = x
  for (const ch of s) {
    if (ch !== ' ') ctx.drawImage(glyphCanvas(ch, color, scale), cx, y)
    cx += (FONT_W + tracking) * scale
  }
}

/** Greedy word wrap. Returns the lines; the caller decides line spacing. */
export function wrapText(s: string, maxWidth: number, opts: TextOptions = {}): string[] {
  const words = s.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (measureText(candidate, opts) <= maxWidth || !line) line = candidate
    else { lines.push(line); line = word }
  }
  if (line) lines.push(line)
  return lines
}

/** Characters with no glyph. Used by the font-coverage test. */
export function missingGlyphs(chars: Iterable<string>): string[] {
  const out: string[] = []
  for (const ch of chars) {
    if (ch === ' ') continue
    if (!GLYPHS[ch]) out.push(ch)
  }
  return out
}
