import { VIEW_H, VIEW_W } from '../../core/constants.js'
import { IN_JUMP, IN_LEFT, IN_RESTART, IN_RIGHT, IN_SHOOT } from '../../core/types.js'
import type { InputAccumulator } from './state.js'

/** A button footprint in CSS pixels, relative to the host element. */
export interface TouchRect {
  x: number
  y: number
  w: number
  h: number
}

export interface TouchLayout {
  left: TouchRect
  right: TouchRect
  jump: TouchRect
  shoot: TouchRect
  restart: TouchRect
}

/** The rectangle the shell gave the game inside the viewport, in CSS pixels. */
export interface DeckView {
  gameX: number
  gameY: number
  gameW: number
  gameH: number
  viewW: number
  viewH: number
}

export interface TouchController {
  destroy(): void
  setVisible(v: boolean): void
  layout(view: DeckView): void
  isActive(): boolean
  getLayout(): TouchLayout
}

type BtnKey = keyof TouchLayout

const KEYS = ['left', 'right', 'jump', 'shoot', 'restart'] as const

const BITS: Record<BtnKey, number> = {
  left: IN_LEFT,
  right: IN_RIGHT,
  jump: IN_JUMP,
  shoot: IN_SHOOT,
  restart: IN_RESTART,
}

const GLYPHS: Record<BtnKey, string> = {
  left: '◀', // ◀
  right: '▶', // ▶
  jump: '▲', // ▲
  shoot: '✦', // ✦
  restart: '↺', // ↺
}

const LABELS: Record<BtnKey, string> = {
  left: 'Left',
  right: 'Right',
  jump: 'Jump',
  shoot: 'Shoot',
  restart: 'Restart room',
}

/** Apple's and Google's shared floor for a reliable thumb target. */
const MIN_TOUCH = 44
const PAD = 10
const GAP = 8
/** A side margin narrower than this cannot hold a legal LEFT|RIGHT pair. */
const SIDE_MIN_LEFT = 2 * MIN_TOUCH + 2 * PAD // 108
/** ...nor a legal JUMP column. */
const SIDE_MIN_RIGHT = MIN_TOUCH + 2 * PAD + 24 // 88

const STYLE_ID = 'fox-touch-style'

const CSS = `
.fox-touch {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.fox-touch[hidden] { display: none; }
.fox-touch-probe {
  position: absolute;
  left: 0; top: 0; width: 0; height: 0;
  visibility: hidden;
  pointer-events: none;
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.fox-btn {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  touch-action: none;
  box-sizing: border-box;
  color: #e8e2d4;
  background: rgba(18, 18, 28, 0.44);
  border: 2px solid rgba(232, 226, 212, 0.26);
  border-radius: 14px;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  transition: background-color 60ms linear, transform 60ms linear;
  will-change: transform;
}
/* LEFT and RIGHT are one slab split down the middle: square inner corners and
   a shared 2px seam, so there is no dead zone to fall into mid-air. */
.fox-btn--left  { border-top-right-radius: 0; border-bottom-right-radius: 0; border-right-width: 1px; }
.fox-btn--right { border-top-left-radius: 0;  border-bottom-left-radius: 0;  border-left-width: 1px; }
.fox-btn--jump  { background: rgba(226, 114, 31, 0.34); border-color: rgba(255, 207, 74, 0.44); }
.fox-btn--shoot { background: rgba(74, 138, 226, 0.28); border-color: rgba(150, 200, 255, 0.4); }
.fox-btn--restart { opacity: 0.62; border-radius: 10px; }
.fox-btn.is-down {
  background: rgba(255, 207, 74, 0.62);
  border-color: #ffcf4a;
  color: #14101c;
  transform: scale(0.97);
}
.fox-btn--restart.is-down { background: rgba(255, 122, 122, 0.7); border-color: #ff7a7a; }
@media (prefers-reduced-motion: reduce) {
  .fox-btn { transition: none; }
  .fox-btn.is-down { transform: none; }
}
`

let styleUsers = 0

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function rect(x: number, y: number, w: number, h: number): TouchRect {
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

function emptyLayout(): TouchLayout {
  return {
    left: rect(0, 0, 0, 0),
    right: rect(0, 0, 0, 0),
    jump: rect(0, 0, 0, 0),
    shoot: rect(0, 0, 0, 0),
    restart: rect(0, 0, 0, 0),
  }
}

function hit(r: TouchRect, x: number, y: number): boolean {
  return r.w > 0 && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
}

/**
 * The on-screen control deck.
 *
 * WHERE THE BUTTONS GO
 * The play area is 800x608 (1.32:1) but a phone in landscape is around 2.16:1,
 * so fitting the game to the height leaves a wide empty margin on each side.
 * Those margins are where the buttons live: a thumb parked over the play area
 * hides exactly the spike that kills you. When the margins are too narrow to
 * hold a legal 44 px target -- portrait, tablets, squarer screens -- the deck
 * falls back to a strip below the game and asks the shell to shrink the play
 * area by that many pixels (see the `fox:deckresize` event below).
 *
 * MULTI-TOUCH IS NOT OPTIONAL
 * The core loop is "hold LEFT, double-tap JUMP, press SHOOT" -- three fingers
 * at once, routinely. Every pointer is tracked by id in a Map with a per-button
 * refcount, and pointermove re-hit-tests so a thumb sliding across the LEFT|RIGHT
 * seam releases one and presses the other in the same event. The two direction
 * rectangles are adjacent with zero gap for exactly that reason.
 */
export function attachTouch(acc: InputAccumulator, host: HTMLElement): TouchController {
  const doc = host.ownerDocument
  const win = doc.defaultView ?? window

  // ------------------------------------------------------------------ dom --

  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = CSS
    doc.head.appendChild(style)
  }
  styleUsers++

  // Absolute button positions need a positioned ancestor.
  if (win.getComputedStyle(host).position === 'static') host.style.position = 'relative'
  host.style.touchAction = 'none'

  const root = doc.createElement('div')
  root.className = 'fox-touch'
  root.hidden = true

  const probe = doc.createElement('div')
  probe.className = 'fox-touch-probe'
  root.appendChild(probe)

  const buttons = {} as Record<BtnKey, HTMLDivElement>
  for (const key of KEYS) {
    const el = doc.createElement('div')
    el.className = `fox-btn fox-btn--${key}`
    el.textContent = GLYPHS[key]
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', LABELS[key])
    el.dataset['fox'] = key
    root.appendChild(el)
    buttons[key] = el
  }
  host.appendChild(root)

  // ---------------------------------------------------------------- state --

  let current = emptyLayout()
  let lastView: DeckView | null = null
  /** What the current layout needs the shell to reserve when the deck shows. */
  let reserveWant = 0
  /** Last value actually announced, so we never dispatch a no-op. */
  let published = 0
  /** Host box cached per gesture: hit-testing must not force layout per move. */
  let hostBox = { left: 0, top: 0 }
  let shown = false
  let override: boolean | null = null
  let detected = false

  const pointers = new Map<number, BtnKey>()
  const counts: Record<BtnKey, number> = { left: 0, right: 0, jump: 0, shoot: 0, restart: 0 }

  // ---------------------------------------------------------------- press --

  function press(key: BtnKey): void {
    buttons[key].classList.add('is-down')
    acc.down(BITS[key])
    // Garnish only. Absent on iOS, disabled by default in Firefox Android, and
    // on some Androids it blocks the main thread for a frame -- never let the
    // feel of the controls depend on it.
    try {
      win.navigator.vibrate?.(key === 'restart' ? 16 : 8)
    } catch {
      /* ignore */
    }
  }

  function release(key: BtnKey): void {
    buttons[key].classList.remove('is-down')
    acc.up(BITS[key])
  }

  /** Move one pointer onto `key` (or off the deck entirely when null). */
  function assign(id: number, key: BtnKey | null): void {
    const prev = pointers.get(id) ?? null
    if (prev === key) return
    if (prev) {
      counts[prev] = Math.max(0, counts[prev] - 1)
      if (counts[prev] === 0) release(prev)
    }
    if (key) {
      counts[key]++
      if (counts[key] === 1) press(key)
      pointers.set(id, key)
    } else {
      pointers.delete(id)
    }
  }

  function releaseAll(): void {
    for (const id of [...pointers.keys()]) assign(id, null)
    for (const key of KEYS) {
      if (counts[key] !== 0) {
        counts[key] = 0
        release(key)
      }
    }
  }

  /**
   * Hit test in host-local pixels. RESTART is excluded from slides: it may only
   * be hit by a deliberate press, never by a thumb travelling across the deck
   * mid-run.
   */
  function pick(clientX: number, clientY: number, allowRestart: boolean): BtnKey | null {
    const x = clientX - hostBox.left
    const y = clientY - hostBox.top
    for (const key of KEYS) {
      if (key === 'restart' && !allowRestart) continue
      if (hit(current[key], x, y)) return key
    }
    return null
  }

  // ------------------------------------------------------------- pointers --

  function onDown(e: PointerEvent): void {
    if (!shown) return
    const el = e.currentTarget as HTMLDivElement | null
    const key = el?.dataset['fox'] as BtnKey | undefined
    if (!key) return
    e.preventDefault()
    e.stopPropagation()
    const box = host.getBoundingClientRect()
    hostBox = { left: box.left, top: box.top }
    // Capture so the subsequent moves keep arriving here even once the thumb
    // has travelled onto a neighbouring button (or off the deck).
    try {
      el?.setPointerCapture(e.pointerId)
    } catch {
      /* Safari throws on an already-released id; harmless. */
    }
    markTouch(e.pointerType)
    assign(e.pointerId, key)
  }

  function onMove(e: PointerEvent): void {
    if (!pointers.has(e.pointerId)) return
    e.preventDefault()
    assign(e.pointerId, pick(e.clientX, e.clientY, false))
  }

  function onUp(e: PointerEvent): void {
    if (!pointers.has(e.pointerId)) return
    e.preventDefault()
    assign(e.pointerId, null)
  }

  for (const key of KEYS) {
    const el = buttons[key]
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }
  // Captured moves retarget to the capturing button and bubble to the root.
  root.addEventListener('pointermove', onMove)
  // Safety net: a pointer lost outside the deck (browser UI swipe, dead touch)
  // must not leave a direction held forever.
  win.addEventListener('pointerup', onUp)
  win.addEventListener('pointercancel', onUp)

  // ------------------------------------------------------------- gestures --

  // iOS Safari ignores user-scalable=no, so double-tap zoom, pinch zoom and
  // rubber-band scroll all have to be killed in JS.
  const stop = (e: Event): void => {
    e.preventDefault()
  }
  const onTouchMove = (e: Event): void => {
    if (e.cancelable) e.preventDefault()
  }
  host.addEventListener('touchmove', onTouchMove, { passive: false })
  host.addEventListener('dblclick', stop)
  host.addEventListener('contextmenu', stop)
  host.addEventListener('selectstart', stop)
  host.addEventListener('gesturestart', stop)
  host.addEventListener('gesturechange', stop)
  host.addEventListener('gestureend', stop)

  // ------------------------------------------------------------ detection --

  const mq =
    typeof win.matchMedia === 'function' ? win.matchMedia('(pointer: coarse)') : null

  function markTouch(kind: string): void {
    if (kind !== 'touch' && kind !== 'pen') return
    if (detected) return
    detected = true
    updateVisible()
  }

  const onFirstTouch = (e: Event): void => {
    markTouch((e as PointerEvent).pointerType ?? 'touch')
  }
  const onFirstTouchStart = (): void => markTouch('touch')
  const onMqChange = (): void => {
    detected = detected || !!mq?.matches
    updateVisible()
  }

  detected = !!mq?.matches
  win.addEventListener('touchstart', onFirstTouchStart, { passive: true, capture: true })
  win.addEventListener('pointerdown', onFirstTouch, { passive: true, capture: true })
  mq?.addEventListener?.('change', onMqChange)

  function updateVisible(): void {
    const next = override ?? detected
    if (next === shown) return
    shown = next
    root.hidden = !shown
    if (!shown) releaseAll()
    else if (lastView) applyLayout()
    // A deck that just appeared or vanished changes how much room the game has.
    syncReserved()
  }

  // ---------------------------------------------------------------- layout --

  function safeInsets(): { left: number; right: number; top: number; bottom: number } {
    // env(safe-area-inset-*) is CSS-only; bounce it through a probe element to
    // read it as numbers. Notched phones in landscape lose ~44 px on one side.
    const cs = win.getComputedStyle(probe)
    const n = (v: string): number => {
      const f = parseFloat(v)
      return Number.isFinite(f) ? f : 0
    }
    return {
      left: n(cs.paddingLeft),
      right: n(cs.paddingRight),
      top: n(cs.paddingTop),
      bottom: n(cs.paddingBottom),
    }
  }

  /**
   * The shell owns the canvas, so the deck cannot resize the game itself.
   * It reports the strip it needs instead: a CSS variable for layout and a
   * `fox:deckresize` CustomEvent carrying { reservedBottom } for the shell to
   * forward to Display.setReservedBottom(). Fired only on change, so the
   * resize -> layout -> resize round trip converges after one pass.
   */
  function syncReserved(): void {
    const px = shown ? reserveWant : 0
    if (px === published) return
    published = px
    host.style.setProperty('--fox-deck-h', `${px}px`)
    host.dispatchEvent(
      new CustomEvent('fox:deckresize', { detail: { reservedBottom: px }, bubbles: true }),
    )
  }

  function computeLayout(view: DeckView): { rects: TouchLayout; reserve: number } {
    const inset = safeInsets()
    const usableH = view.viewH - inset.top - inset.bottom
    const bottom = view.viewH - inset.bottom - PAD
    /** Lowest y the fire cluster may reach, so it can never meet RESTART. */
    const fireTop = inset.top + PAD + MIN_TOUCH + 4 + GAP

    // Buttons are placed against the play rectangle we were actually handed...
    const leftMargin = view.gameX - inset.left
    const rightMargin = view.viewW - (view.gameX + view.gameW) - inset.right

    // ...but WHICH layout to use is decided on the reserve-free projection of
    // that rectangle. Choosing the bottom deck makes the shell shrink the game,
    // which widens the side margins, which would then qualify for side mode,
    // which reserves nothing, which widens the game again: an oscillation that
    // never settles. Gating on viewW/viewH alone makes the choice a pure
    // function of the screen. A reserve can only ever shrink the game, so the
    // real margins are never narrower than the ones this gate measured.
    const natScale = Math.min(view.viewW / VIEW_W, view.viewH / VIEW_H)
    const natW = Math.floor(VIEW_W * natScale)
    const natX = Math.floor((view.viewW - natW) / 2)
    const sideMode =
      natX - inset.left >= SIDE_MIN_LEFT &&
      view.viewW - (natX + natW) - inset.right >= SIDE_MIN_RIGHT &&
      usableH >= 200

    const rects = emptyLayout()

    if (sideMode) {
      // --- LEFT MARGIN: the direction slab, parked at the bottom where the
      // left thumb naturally rests.
      const dTotal = Math.min(leftMargin - 2 * PAD, 220)
      const dh = clamp(Math.round(usableH * 0.36), MIN_TOUCH * 2, Math.min(180, bottom - PAD))
      const dx = inset.left + PAD + Math.max(0, (leftMargin - 2 * PAD - dTotal) / 2)
      const dy = bottom - dh
      const half = Math.round(dTotal / 2)
      rects.left = rect(dx, dy, half, dh)
      rects.right = rect(dx + half, dy, dTotal - half, dh)

      // --- RIGHT MARGIN: JUMP is the biggest target on screen, SHOOT beside it.
      const rx = view.gameX + view.gameW + PAD
      const rw = rightMargin - 2 * PAD
      const avail = bottom - fireTop
      const jw = Math.max(MIN_TOUCH, Math.round(rw * 0.58))
      const sw = rw - jw - GAP
      if (sw >= MIN_TOUCH) {
        // Side by side: both are one thumb-roll apart, JUMP outermost and
        // taller because it is pressed the most and mis-hitting it is fatal.
        const jh = clamp(Math.round(usableH * 0.42), MIN_TOUCH, Math.min(200, avail))
        const sh = Math.max(MIN_TOUCH, Math.round(jh * 0.74))
        rects.jump = rect(rx + rw - jw, bottom - jh, jw, jh)
        rects.shoot = rect(rx, bottom - sh, sw, sh)
      } else {
        // The column cannot hold two legal targets across, so stack SHOOT on
        // top of JUMP instead of shaving either below 44 px.
        let jh = clamp(Math.round(usableH * 0.42), MIN_TOUCH, 200)
        let sh = Math.max(MIN_TOUCH, Math.round(jh * 0.6))
        if (jh + GAP + sh > avail) {
          const room = Math.max(2 * MIN_TOUCH + GAP, avail)
          jh = Math.max(MIN_TOUCH, Math.round((room - GAP) * 0.62))
          sh = Math.max(MIN_TOUCH, room - GAP - jh)
        }
        rects.jump = rect(rx, bottom - jh, rw, jh)
        rects.shoot = rect(rx, bottom - jh - GAP - sh, rw, sh)
      }

      // --- RESTART: top of the right column, a full screen height away from
      // where the thumbs live. Hitting this by accident ends a run.
      const rrw = clamp(Math.min(rw, 72), MIN_TOUCH, 96)
      rects.restart = rect(rx + rw - rrw, inset.top + PAD, rrw, MIN_TOUCH + 4)
      return { rects, reserve: 0 }
    }

    // --- FALLBACK: a deck under the game. The shell shrinks the play area by
    // `reserve` so the buttons never sit on top of it.
    const deckH = clamp(Math.round(view.viewH * 0.28), 3 * PAD + MIN_TOUCH, 190)
    const top = view.viewH - inset.bottom - deckH
    const bh = deckH - 2 * PAD
    const x0 = inset.left + PAD
    const x1 = view.viewW - inset.right - PAD
    const W = Math.max(3 * MIN_TOUCH, x1 - x0)

    // Three columns: directions | restart | fire. The middle one exists only
    // so RESTART is never adjacent to a button pressed mid-run.
    const dTotal = Math.min(Math.round(W * 0.4), 260)
    const cw = Math.min(Math.round(W * 0.16), 84)
    const rw = W - dTotal - cw

    const half = Math.round(dTotal / 2)
    rects.left = rect(x0, top + PAD, half, bh)
    rects.right = rect(x0 + half, top + PAD, dTotal - half, bh)

    const jw = Math.max(MIN_TOUCH, Math.round((rw - GAP) * 0.58))
    const sw = Math.max(MIN_TOUCH, rw - GAP - jw)
    const sh = Math.max(MIN_TOUCH, Math.round(bh * 0.8))
    rects.jump = rect(x1 - jw, top + PAD, jw, bh)
    rects.shoot = rect(x1 - jw - GAP - sw, top + PAD + (bh - sh), sw, sh)

    const rrw = clamp(cw - GAP, MIN_TOUCH, 84)
    rects.restart = rect(x0 + dTotal + (cw - rrw) / 2, top + PAD, rrw, MIN_TOUCH + 4)
    return { rects, reserve: deckH }
  }

  function applyLayout(): void {
    for (const key of KEYS) {
      const r = current[key]
      const el = buttons[key]
      el.style.left = `${r.x}px`
      el.style.top = `${r.y}px`
      el.style.width = `${r.w}px`
      el.style.height = `${r.h}px`
      el.style.fontSize = `${clamp(Math.round(Math.min(r.w, r.h) * 0.42), 14, 44)}px`
    }
  }

  function layout(view: DeckView): void {
    lastView = view
    const res = computeLayout(view)
    current = res.rects
    applyLayout()
    const box = host.getBoundingClientRect()
    hostBox = { left: box.left, top: box.top }
    reserveWant = res.reserve
    syncReserved()
  }

  host.style.setProperty('--fox-deck-h', '0px')
  updateVisible()

  return {
    destroy(): void {
      releaseAll()
      for (const key of KEYS) {
        const el = buttons[key]
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onUp)
      }
      root.removeEventListener('pointermove', onMove)
      win.removeEventListener('pointerup', onUp)
      win.removeEventListener('pointercancel', onUp)
      win.removeEventListener('pointerdown', onFirstTouch, true)
      win.removeEventListener('touchstart', onFirstTouchStart, true)
      mq?.removeEventListener?.('change', onMqChange)
      host.removeEventListener('touchmove', onTouchMove)
      host.removeEventListener('dblclick', stop)
      host.removeEventListener('contextmenu', stop)
      host.removeEventListener('selectstart', stop)
      host.removeEventListener('gesturestart', stop)
      host.removeEventListener('gesturechange', stop)
      host.removeEventListener('gestureend', stop)
      root.remove()
      styleUsers = Math.max(0, styleUsers - 1)
      if (styleUsers === 0) doc.getElementById(STYLE_ID)?.remove()
    },
    setVisible(v: boolean): void {
      override = v
      updateVisible()
    },
    layout,
    isActive: () => shown,
    getLayout: () => ({
      left: { ...current.left },
      right: { ...current.right },
      jump: { ...current.jump },
      shoot: { ...current.shoot },
      restart: { ...current.restart },
    }),
  }
}
