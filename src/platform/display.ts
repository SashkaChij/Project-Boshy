import { VIEW_H, VIEW_W } from '../core/constants.js'

export interface ViewMetrics {
  /** Where the 800x608 play area landed, in CSS pixels. */
  gameX: number
  gameY: number
  gameW: number
  gameH: number
  viewW: number
  viewH: number
  scale: number
  /** True when the aspect leaves usable margins beside the game. */
  hasSideMargins: boolean
}

export interface CropRows {
  /** Pixels hidden at the top and bottom of the 800x608 buffer. */
  top: number
  bottom: number
}

export interface Display {
  /** Draw here. Always exactly 800x608 logical pixels. */
  readonly ctx: CanvasRenderingContext2D
  readonly canvas: HTMLCanvasElement
  metrics(): ViewMetrics
  resize(): void
  present(): void
  /** Reserve space at the bottom for a touch deck; the game shrinks to fit. */
  setReservedBottom(px: number): void
  /**
   * Hide rows that are structurally wall, so the playfield can be bigger.
   *
   * A 800x608 room is 1.32:1 against a phone's 2.16:1, which pins the playfield
   * to 61% of the screen width with all 19 rows showing. Cropping the top and
   * bottom rows -- only ever rows that are solid across the whole room -- buys
   * back about a fifth of the area, and it is the only lever that does not
   * either hide a hazard or break the genre's read-the-whole-screen contract.
   */
  setCrop(crop: CropRows): void
  readonly crop: CropRows
  /** Convert a client-space point into 800x608 game space. */
  toGame(clientX: number, clientY: number): { x: number; y: number }
  onResize(fn: (m: ViewMetrics) => void): () => void
  destroy(): void
}

/**
 * Two-stage rendering.
 *
 * Everything is drawn into an offscreen buffer that is EXACTLY 800x608, then
 * blitted once with smoothing off. Drawing straight to a scaled display canvas
 * would work, but no integer scale factor exists on a phone (390/608 = 0.64),
 * so sub-pixel sprite positions would make pixel sizes uneven frame to frame.
 * One nearest-neighbour blit of a fixed-size buffer keeps the art stable.
 */
export function createDisplay(display: HTMLCanvasElement): Display {
  const buffer = document.createElement('canvas')
  buffer.width = VIEW_W
  buffer.height = VIEW_H
  const bufferCtx = buffer.getContext('2d', { alpha: false })
  const displayCtx = display.getContext('2d', { alpha: false })
  if (!bufferCtx || !displayCtx) throw new Error('Canvas2D unavailable')
  // Bound to non-nullable locals: TypeScript drops the null narrowing once
  // these are captured by the resize/present closures below.
  const bctx: CanvasRenderingContext2D = bufferCtx
  const dctx: CanvasRenderingContext2D = displayCtx
  bctx.imageSmoothingEnabled = false
  dctx.imageSmoothingEnabled = false

  let reservedBottom = 0
  let crop: CropRows = { top: 0, bottom: 0 }
  let m: ViewMetrics = {
    gameX: 0, gameY: 0, gameW: VIEW_W, gameH: VIEW_H,
    viewW: VIEW_W, viewH: VIEW_H, scale: 1, hasSideMargins: false,
  }
  const listeners = new Set<(m: ViewMetrics) => void>()

  function resize(): void {
    const viewW = Math.max(1, display.clientWidth || window.innerWidth)
    const viewH = Math.max(1, display.clientHeight || window.innerHeight)
    const availH = Math.max(1, viewH - reservedBottom)

    const srcH = VIEW_H - crop.top - crop.bottom
    const scale = Math.min(viewW / VIEW_W, availH / srcH)
    const gameW = Math.floor(VIEW_W * scale)
    const gameH = Math.floor(srcH * scale)
    const gameX = Math.floor((viewW - gameW) / 2)
    const gameY = Math.floor((availH - gameH) / 2)

    // Cap DPR at 2: beyond that the extra pixels cost real battery on a phone
    // and buy nothing for nearest-neighbour pixel art.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    display.width = Math.round(viewW * dpr)
    display.height = Math.round(viewH * dpr)
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    dctx.imageSmoothingEnabled = false

    const sideMargin = (viewW - gameW) / 2
    m = {
      gameX, gameY, gameW, gameH, viewW, viewH, scale,
      // Enough room for a 56 px button column plus padding on each side.
      hasSideMargins: sideMargin >= 76,
    }
    for (const fn of listeners) fn(m)
  }

  function present(): void {
    dctx.fillStyle = '#000000'
    dctx.fillRect(0, 0, m.viewW, m.viewH)
    dctx.drawImage(
      buffer,
      0, crop.top, VIEW_W, VIEW_H - crop.top - crop.bottom,
      m.gameX, m.gameY, m.gameW, m.gameH,
    )
  }

  const onWindowResize = (): void => resize()
  window.addEventListener('resize', onWindowResize)
  window.addEventListener('orientationchange', onWindowResize)
  resize()

  return {
    ctx: bctx,
    canvas: display,
    metrics: () => m,
    resize,
    present,
    setReservedBottom(px: number) {
      if (px === reservedBottom) return
      reservedBottom = px
      resize()
    },
    setCrop(next: CropRows) {
      if (next.top === crop.top && next.bottom === crop.bottom) return
      crop = { top: next.top, bottom: next.bottom }
      resize()
    },
    get crop() {
      return crop
    },
    toGame(clientX: number, clientY: number) {
      const rect = display.getBoundingClientRect()
      const x = (clientX - rect.left - m.gameX) / m.scale
      const y = (clientY - rect.top - m.gameY) / m.scale + crop.top
      return { x, y }
    },
    onResize(fn) {
      listeners.add(fn)
      fn(m)
      return () => listeners.delete(fn)
    },
    destroy() {
      window.removeEventListener('resize', onWindowResize)
      window.removeEventListener('orientationchange', onWindowResize)
      listeners.clear()
    },
  }
}
