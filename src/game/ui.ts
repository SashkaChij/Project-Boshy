import { VIEW_W } from '../core/constants.js'
import { drawText, measureText, textHeight } from '../platform/text.js'

/**
 * Canvas menus.
 *
 * Sizes are measured from the rendered text rather than hard-coded, because
 * Russian labels run 30-40% wider than their English equivalents -- "Undo"
 * becomes "Отменить", "Save" becomes "Сохранить" -- and any fixed button width
 * would clip the moment the language is switched.
 */
export interface MenuItem {
  label: () => string
  action: () => void
  enabled?: () => boolean
  hint?: () => string
  /** Rendered to the right of the label, for toggles and value pickers. */
  value?: () => string
  onLeft?: () => void
  onRight?: () => void
}

export interface MenuTheme {
  color: string
  dim: string
  selected: string
  hint: string
  scale: number
  gap: number
}

export const DEFAULT_THEME: MenuTheme = {
  color: '#e8e2d4',
  dim: '#6a6558',
  selected: '#ffcf4a',
  hint: '#9a9384',
  scale: 3,
  gap: 12,
}

export class Menu {
  index = 0
  private rects: { y: number; h: number }[] = []

  constructor(
    public items: MenuItem[],
    public theme: MenuTheme = DEFAULT_THEME,
  ) {}

  setItems(items: MenuItem[]): void {
    this.items = items
    if (this.index >= items.length) this.index = Math.max(0, items.length - 1)
  }

  private isEnabled(i: number): boolean {
    const it = this.items[i]
    return !!it && (it.enabled ? it.enabled() : true)
  }

  moveBy(delta: number): boolean {
    if (this.items.length === 0) return false
    let i = this.index
    for (let n = 0; n < this.items.length; n++) {
      i = (i + delta + this.items.length) % this.items.length
      if (this.isEnabled(i)) {
        const changed = i !== this.index
        this.index = i
        return changed
      }
    }
    return false
  }

  activate(): boolean {
    if (!this.isEnabled(this.index)) return false
    this.items[this.index]?.action()
    return true
  }

  nudge(dir: -1 | 1): boolean {
    const it = this.items[this.index]
    if (!it) return false
    const fn = dir < 0 ? it.onLeft : it.onRight
    if (!fn) return false
    fn()
    return true
  }

  /** Returns the index under a game-space point, or -1. */
  hitTest(gx: number, gy: number): number {
    if (gx < 40 || gx > VIEW_W - 40) return -1
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i]
      if (r && gy >= r.y && gy < r.y + r.h && this.isEnabled(i)) return i
    }
    return -1
  }

  draw(ctx: CanvasRenderingContext2D, cx: number, top: number): number {
    const th = this.theme
    const lineH = textHeight({ scale: th.scale }) + th.gap
    this.rects = []
    let y = top

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i] as MenuItem
      const on = this.isEnabled(i)
      const sel = i === this.index && on
      const label = it.label()
      const value = it.value?.()
      const color = !on ? th.dim : sel ? th.selected : th.color

      if (sel) {
        const w = measureText(label, { scale: th.scale }) + (value ? measureText(`  ${value}`, { scale: th.scale }) : 0)
        ctx.fillStyle = 'rgba(255,207,74,0.10)'
        ctx.fillRect(cx - w / 2 - 18, y - 6, w + 36, textHeight({ scale: th.scale }) + 12)
        drawText(ctx, '>', cx - w / 2 - 34, y, { scale: th.scale, color: th.selected })
      }

      if (value) {
        const labelW = measureText(label, { scale: th.scale })
        const valueW = measureText(value, { scale: th.scale })
        const total = labelW + 24 + valueW
        drawText(ctx, label, cx - total / 2, y, { scale: th.scale, color, shadow: '#000' })
        drawText(ctx, value, cx - total / 2 + labelW + 24, y, {
          scale: th.scale, color: sel ? '#ffffff' : th.hint, shadow: '#000',
        })
      } else {
        drawText(ctx, label, cx, y, { scale: th.scale, align: 'center', color, shadow: '#000' })
      }

      this.rects.push({ y: y - 6, h: textHeight({ scale: th.scale }) + 12 })
      y += lineH

      const hint = sel ? it.hint?.() : undefined
      if (hint) {
        drawText(ctx, hint, cx, y - 2, { scale: 2, align: 'center', color: th.hint })
        y += textHeight({ scale: 2 }) + 8
        const last = this.rects[this.rects.length - 1]
        if (last) last.h += textHeight({ scale: 2 }) + 8
      }
    }
    return y
  }
}

/** A slider row rendered as a bar of blocks, readable at any scale. */
export function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: number,
  width = 160,
): void {
  const cells = 10
  const filled = Math.round(value * cells)
  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = i < filled ? '#ffcf4a' : '#3a3830'
    ctx.fillRect(x + i * (width / cells), y, width / cells - 3, 12)
  }
}
