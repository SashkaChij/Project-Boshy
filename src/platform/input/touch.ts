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
  /**
   * `left` and `right` are the two halves of the steer pad. They are REPORTED,
   * not hit-tested: a thumb that lands anywhere on the pad latches it and
   * steers by displacement (see `updateSteer`). They exist so debug overlays
   * and the existing caller keep working unchanged.
   */
  left: TouchRect
  right: TouchRect
  jump: TouchRect
  shoot: TouchRect
  restart: TouchRect
  /** The whole steer pad, i.e. `left` and `right` welded together. */
  steer?: TouchRect
  /** Dispatches a synthetic Escape; the app already turns that into a pause. */
  pause?: TouchRect
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

/** Everything a pointer can land on. Ordered by hit-test priority. */
const SLOTS = ['jump', 'shoot', 'steer', 'restart', 'pause'] as const
type Slot = (typeof SLOTS)[number]

const LABELS: Record<Slot, string> = {
  steer: 'Steer left and right',
  jump: 'Jump',
  shoot: 'Shoot',
  restart: 'Restart room (hold or double-tap)',
  pause: 'Pause',
}

// ---------------------------------------------------------------- metrics --
//
// CSS pixels are already a physical unit on a phone: 0.166-0.19 mm each across
// every shipping device, a 7% spread. So every number below is an ABSOLUTE CSS
// pixel count with clamps, never a fraction of the viewport. A percentage of
// the viewport is how you end up with a 49 px direction button -- narrower than
// the 58-80 px contact patch of the thumb pressing it.

/** Floor for any target. 44 is the accessibility minimum; a game needs more. */
const MIN_TOUCH = 56
/** Breathing room against the safe-area edge. */
const PAD = 12
/** RESTART must never live within a thumb-roll of the screen edge. */
const EDGE = 24
/** SHOOT above JUMP, far enough apart that a rolling thumb cannot straddle. */
const STACK_GAP = 24
/**
 * Steer pad to fire column. Never below 2 x PRESS_SLOP, or the padded hit
 * zones of the two would overlap and a press in the seam would be decided by
 * test order rather than by where the thumb actually landed.
 */
const COL_GAP = 24

const STEER_MIN_W = 150
const STEER_MAX_W = 260
const STEER_MIN_H = 120
const STEER_MAX_H = 190

const JUMP_MIN_H = 140
const JUMP_MAX_H = 180
const SHOOT_MIN_H = 64
const SHOOT_MAX_H = 110
const COL_MIN_W = 96
const COL_MAX_W = 190

/** Utility row (PAUSE, RESTART) button size. */
const UTIL_W = 96
const UTIL_H = MIN_TOUCH

/** Slop added around every rect when deciding what a pointerdown landed on. */
const PRESS_SLOP = 12
/**
 * How far past its rect a thumb may drift before JUMP counts as released.
 * The engine multiplies rising velocity by 0.45 the instant IN_JUMP goes up,
 * so a millimetre of drift used to silently halve the jump. This is the single
 * most damaging input bug in a game whose skill ceiling is jump height.
 */
const JUMP_SLOP = 24
const SHOOT_SLOP = 20
/** Sideways travel from the press origin before the steer pad changes sign. */
const DEAD_BAND = 14
/** RESTART needs a deliberate gesture: hold this long... */
const HOLD_MS = 450
/** ...or two taps inside this window. */
const DTAP_MS = 320
/** Long enough for the 20 ms tick to see exactly one pressed edge. */
const PULSE_MS = 90

/**
 * Ceiling on the portrait deck, as a fraction of viewport height.
 * A 390x844 phone needs 65% of the screen reserved to sit the game flush
 * against the top -- the play area is only 296 px tall at that width, and the
 * rest is deck and rotate hint. This exists purely so a freak viewport cannot
 * reserve the whole screen; it is not a layout mode.
 */
const DECK_CAP = 0.68

const STYLE_ID = 'fox-touch-style'

const CSS = `
.fox-touch {
  position: absolute;
  inset: 0;
  z-index: 10;
  /* Nothing in here is an event target. Pointers are hit-tested against padded
     rectangles on the host instead, so every button has slop around it and the
     seams between buttons are decided by us, not by the DOM. */
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
  pointer-events: none;
  touch-action: none;
  box-sizing: border-box;
  color: #e8e2d4;
  background: rgba(18, 18, 28, 0.44);
  border: 2px solid rgba(232, 226, 212, 0.26);
  border-radius: 18px;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  /* Asymmetric on purpose: the pressed rule below kills the duration, so a
     press paints on the same frame as the touch and only the RELEASE fades.
     Nothing here moves the button -- a transform under a resting thumb drags
     the target out from under it mid-press. */
  transition: background-color 90ms linear, border-color 90ms linear, opacity 90ms linear;
}
.fox-btn.is-down { transition-duration: 0ms; }
.fox-btn--jump  { background: rgba(226, 114, 31, 0.34); border-color: rgba(255, 207, 74, 0.44); }
.fox-btn--shoot { background: rgba(74, 138, 226, 0.28); border-color: rgba(150, 200, 255, 0.4); }
.fox-btn--restart, .fox-btn--pause { opacity: 0.55; border-radius: 12px; }
.fox-btn.is-down {
  background: rgba(255, 207, 74, 0.62);
  border-color: #ffcf4a;
  color: #14101c;
}
.fox-btn--restart.is-down { background: rgba(255, 122, 122, 0.28); }
.fox-btn--restart.is-fire { background: rgba(255, 122, 122, 0.8); border-color: #ff7a7a; color: #14101c; }
/* A big translucent control beats a small opaque one, so when the margin is
   too narrow the button spills over the playfield instead of shrinking below
   the size of a thumb. Kept faint enough that a spike underneath still reads. */
.fox-btn.is-overlay { opacity: 0.35; }
.fox-btn.is-overlay.is-down { opacity: 0.6; }
.fox-btn--restart.is-overlay, .fox-btn--pause.is-overlay { opacity: 0.3; }

/* --- steer pad ---------------------------------------------------------- */
.fox-btn--steer { justify-content: space-between; padding: 0 8%; gap: 6%; }
.fox-steer-arrow { opacity: 0.42; transition: opacity 90ms linear, color 90ms linear; }
.fox-btn--steer.is-left  .fox-steer-arrow--l,
.fox-btn--steer.is-right .fox-steer-arrow--r { opacity: 1; color: #ffcf4a; transition-duration: 0ms; }
.fox-btn--steer.is-down { background: rgba(255, 207, 74, 0.24); border-color: #ffcf4a; color: #e8e2d4; }

/* --- portrait rotate hint ----------------------------------------------- */
.fox-rotate {
  position: absolute;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  pointer-events: none;
  color: rgba(232, 226, 212, 0.5);
  font-size: 13px;
  letter-spacing: 0.12em;
}
.fox-rotate.is-on { display: flex; }
.fox-rotate-phone {
  width: 30px; height: 48px;
  border: 2px solid currentColor;
  border-radius: 6px;
  animation: fox-rotate-tip 2.6s ease-in-out infinite;
}
.fox-rotate-glyph { font-size: 18px; }
@keyframes fox-rotate-tip {
  0%, 40% { transform: rotate(0deg); }
  60%, 100% { transform: rotate(-90deg); }
}
@media (prefers-reduced-motion: reduce) {
  .fox-btn, .fox-steer-arrow { transition: none; }
  .fox-rotate-phone { animation: none; transform: rotate(-90deg); }
}
`

let styleUsers = 0

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function rect(x: number, y: number, w: number, h: number): TouchRect {
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

function copy(r: TouchRect): TouchRect {
  return { x: r.x, y: r.y, w: r.w, h: r.h }
}

function empty(): TouchRect {
  return { x: 0, y: 0, w: 0, h: 0 }
}

/** Point-in-rect, with `pad` CSS pixels of slop on every side. */
function hit(r: TouchRect, x: number, y: number, pad: number): boolean {
  return (
    r.w > 0 &&
    x >= r.x - pad &&
    x < r.x + r.w + pad &&
    y >= r.y - pad &&
    y < r.y + r.h + pad
  )
}

function overlaps(a: TouchRect, b: TouchRect): boolean {
  return (
    a.w > 0 && b.w > 0 &&
    a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y
  )
}

type Rects = Record<Slot, TouchRect>

function emptyRects(): Rects {
  return { steer: empty(), jump: empty(), shoot: empty(), restart: empty(), pause: empty() }
}

/**
 * The on-screen control deck.
 *
 * ONE STEER PAD, NOT TWO BUTTONS
 * The old deck put LEFT and RIGHT side by side, 49 px each on a 390 px-tall
 * phone -- narrower than the 58-80 px contact patch of the thumb pressing
 * them, with the seam running under the middle of that patch. Worse, direction
 * was re-hit-tested on every move, so a thumb drifting off the slab mid-air
 * stopped the fox dead. Now a pointerdown anywhere on one wide pad LATCHES
 * that pointer; direction is sign(dx) from the press origin past a dead band,
 * and NOTHING but pointerup/pointercancel (or a blur) lets go.
 *
 * NO LAYOUT CLIFF
 * Width is allocated continuously, so the layout is a smooth function of the
 * viewport. It used to flip between "side rails" and "bottom deck" at a
 * threshold that the safe-area inset could push either way -- meaning an
 * iPhone 14 got a 513x390 playfield or a 370x281 one depending on WHICH WAY
 * you rotated it. The reserve is now computed from viewW/viewH alone, so the
 * playfield can never depend on which edge the notch landed on; only the
 * buttons shift, and when a margin is too narrow they overlay the playfield
 * translucently rather than shrinking below thumb size.
 *
 * MULTI-TOUCH IS NOT OPTIONAL
 * The core loop is "hold steer, double-tap JUMP, press SHOOT" -- three fingers
 * at once, routinely. Every pointer is tracked by id.
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

  // The safe-area probe lives OUTSIDE the deck: `root` is display:none while
  // the deck is hidden, and computed styles inside a hidden subtree are not
  // worth trusting across engines.
  const probe = doc.createElement('div')
  probe.className = 'fox-touch-probe'
  host.appendChild(probe)

  const els = {} as Record<Slot, HTMLDivElement>
  for (const slot of SLOTS) {
    const el = doc.createElement('div')
    el.className = `fox-btn fox-btn--${slot}`
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', LABELS[slot])
    root.appendChild(el)
    els[slot] = el
  }
  els.jump.textContent = '▲'
  els.shoot.textContent = '✦'
  els.restart.textContent = '↺'
  els.pause.textContent = '⏸'

  const arrowL = doc.createElement('span')
  arrowL.className = 'fox-steer-arrow fox-steer-arrow--l'
  arrowL.textContent = '◀'
  const arrowR = doc.createElement('span')
  arrowR.className = 'fox-steer-arrow fox-steer-arrow--r'
  arrowR.textContent = '▶'
  els.steer.append(arrowL, arrowR)

  // Wordless on purpose: a rotate hint that needs translating would need a new
  // i18n key, and a tipping phone outline reads in every language.
  const rotate = doc.createElement('div')
  rotate.className = 'fox-rotate'
  const phone = doc.createElement('div')
  phone.className = 'fox-rotate-phone'
  const glyph = doc.createElement('div')
  glyph.className = 'fox-rotate-glyph'
  glyph.textContent = '⟳'
  rotate.append(phone, glyph)
  root.appendChild(rotate)

  host.appendChild(root)

  // ---------------------------------------------------------------- state --

  let rects = emptyRects()
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
  let portrait = false

  interface Track {
    slot: Slot
    /** Steer only: the x the latch started at, re-anchored on every flip. */
    originX: number
    /** Press timestamp, for the RESTART hold and double-tap gestures. */
    t0: number
  }

  const tracks = new Map<number, Track>()
  /** JUMP and SHOOT are refcounted: two thumbs on JUMP is one held bit. */
  const counts: Record<'jump' | 'shoot', number> = { jump: 0, shoot: 0 }
  let steerId: number | null = null
  let steerDir = 0
  let holdTimer = 0
  let pulseTimer = 0
  /** -Infinity, not 0: performance.now() is small right after boot, and a zero
   *  here makes the very first tap on RESTART look like the second half of a
   *  double-tap that never happened. */
  let lastTapEnd = -Infinity

  const now = (): number =>
    typeof win.performance?.now === 'function' ? win.performance.now() : Date.now()

  // ---------------------------------------------------------------- press --

  function setFire(slot: 'jump' | 'shoot', on: boolean): void {
    const bit = slot === 'jump' ? IN_JUMP : IN_SHOOT
    counts[slot] = Math.max(0, counts[slot] + (on ? 1 : -1))
    const held = counts[slot] > 0
    els[slot].classList.toggle('is-down', held)
    if (on && counts[slot] === 1) acc.down(bit)
    else if (!on && counts[slot] === 0) acc.up(bit)
  }

  /** -1 left, 0 neutral, +1 right. Only ever called from the latched pointer. */
  function setSteer(dir: number): void {
    if (dir === steerDir) return
    if (steerDir === -1) acc.up(IN_LEFT)
    else if (steerDir === 1) acc.up(IN_RIGHT)
    steerDir = dir
    if (dir === -1) acc.down(IN_LEFT)
    else if (dir === 1) acc.down(IN_RIGHT)
    els.steer.classList.toggle('is-left', dir === -1)
    els.steer.classList.toggle('is-right', dir === 1)
  }

  /**
   * Direction is displacement from the press origin, never absolute position:
   * the thumb may wander anywhere -- including clean off the pad and over the
   * playfield -- and the fox keeps running. The origin is re-anchored on each
   * flip so reversing costs one dead band, not two.
   */
  function updateSteer(tr: Track, x: number): void {
    const dx = x - tr.originX
    let dir = steerDir
    if (dx > DEAD_BAND) dir = 1
    else if (dx < -DEAD_BAND) dir = -1
    if (dir !== steerDir) {
      tr.originX = x
      setSteer(dir)
    }
  }

  /** End the RESTART pulse now, wherever it is. */
  function endPulse(): void {
    if (!pulseTimer) return
    win.clearTimeout(pulseTimer)
    pulseTimer = 0
    acc.up(IN_RESTART)
    els.restart.classList.remove('is-fire')
  }

  function fireRestart(): void {
    els.restart.classList.add('is-fire')
    endPulse()
    acc.down(IN_RESTART)
    pulseTimer = win.setTimeout(endPulse, PULSE_MS)
    // The one surviving vibrate: RESTART is a deliberate, non-timed action, so
    // a main-thread stall here costs nothing. JUMP never touches this API.
    try {
      win.navigator.vibrate?.(18)
    } catch {
      /* ignore */
    }
  }

  function firePause(): void {
    // The app already turns Escape into the pause scene; a synthetic key keeps
    // the deck from needing to know anything about scenes.
    win.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }),
    )
  }

  function cancelHold(): void {
    if (holdTimer) {
      win.clearTimeout(holdTimer)
      holdTimer = 0
    }
  }

  /** Let go of whatever this pointer was holding and forget it. */
  function drop(id: number): void {
    const tr = tracks.get(id)
    if (!tr) return
    tracks.delete(id)
    if (tr.slot === 'jump' || tr.slot === 'shoot') setFire(tr.slot, false)
    if (tr.slot === 'steer' && steerId === id) {
      steerId = null
      setSteer(0)
      els.steer.classList.remove('is-down')
    }
    if (tr.slot === 'restart') {
      cancelHold()
      els.restart.classList.remove('is-down')
    }
    if (tr.slot === 'pause') els.pause.classList.remove('is-down')
  }

  /**
   * Everything up, now. Called on pointerup/cancel, and also on blur,
   * visibilitychange and pagehide: a phone that rings mid-jump, an app switch,
   * or a swipe into the browser UI all steal the pointer without ever sending
   * pointerup, and a direction stuck on walks the fox into a spike on return.
   */
  function releaseAll(): void {
    for (const id of [...tracks.keys()]) drop(id)
    for (const slot of ['jump', 'shoot'] as const) {
      if (counts[slot] !== 0) {
        counts[slot] = 0
        els[slot].classList.remove('is-down')
        acc.up(slot === 'jump' ? IN_JUMP : IN_SHOOT)
      }
    }
    steerId = null
    setSteer(0)
    els.steer.classList.remove('is-down')
    cancelHold()
    // A tab hidden inside the 90 ms restart pulse would otherwise come back
    // with the bit still down.
    endPulse()
  }

  /**
   * What a pointerdown at (x, y) landed on, in host-local pixels. Padded rects,
   * tested in priority order -- the DOM is never consulted, so the slop around
   * a button is ours to choose and can spill over the playfield.
   */
  function pick(x: number, y: number): Slot | null {
    for (const slot of SLOTS) {
      if (hit(rects[slot], x, y, PRESS_SLOP)) return slot
    }
    return null
  }

  /** How far past its own rect a latched pointer may drift before letting go. */
  function slopOf(slot: Slot): number {
    if (slot === 'jump') return JUMP_SLOP
    if (slot === 'shoot') return SHOOT_SLOP
    return PRESS_SLOP
  }

  // ------------------------------------------------------------- pointers --

  function localX(e: PointerEvent): number {
    return e.clientX - hostBox.left
  }
  function localY(e: PointerEvent): number {
    return e.clientY - hostBox.top
  }

  function onDown(e: PointerEvent): void {
    if (!shown || tracks.has(e.pointerId)) return
    // One box read per gesture, not per event: getBoundingClientRect is a
    // forced layout and pointermove fires at up to 240 Hz.
    if (tracks.size === 0) {
      const box = host.getBoundingClientRect()
      hostBox = { left: box.left, top: box.top }
    }
    const x = localX(e)
    const y = localY(e)
    const slot = pick(x, y)
    if (!slot) return
    // A second finger on the pad is ignored rather than fighting the first --
    // and it is dropped here, before capture, so its eventual lostpointercapture
    // cannot disturb the pointer that owns the latch.
    if (slot === 'steer' && steerId !== null) return
    e.preventDefault()
    // The canvas below listens for menu taps; a press that belongs to the deck
    // must never reach it.
    e.stopPropagation()
    markTouch(e.pointerType)

    // Capture on the host, so every move and the final up keep arriving even
    // once the thumb has slid onto the playfield or off the screen edge.
    try {
      host.setPointerCapture(e.pointerId)
    } catch {
      /* Safari throws on an already-released id; harmless. */
    }

    const tr: Track = { slot, originX: x, t0: now() }

    if (slot === 'steer') {
      steerId = e.pointerId
      els.steer.classList.add('is-down')
      // Seed from which half was pressed, so a tap on the left edge moves left
      // immediately; after that it is displacement only.
      const mid = rects.steer.x + rects.steer.w / 2
      const off = x - mid
      setSteer(Math.abs(off) > DEAD_BAND ? Math.sign(off) : 0)
    } else if (slot === 'jump' || slot === 'shoot') {
      setFire(slot, true)
    } else if (slot === 'restart') {
      els.restart.classList.add('is-down')
      cancelHold()
      holdTimer = win.setTimeout(() => {
        holdTimer = 0
        if (tracks.has(e.pointerId)) fireRestart()
      }, HOLD_MS)
    } else {
      els.pause.classList.add('is-down')
    }

    tracks.set(e.pointerId, tr)
  }

  function onMove(e: PointerEvent): void {
    const tr = tracks.get(e.pointerId)
    if (!tr) return
    if (e.cancelable) e.preventDefault()
    const x = localX(e)
    const y = localY(e)

    if (tr.slot === 'steer') {
      updateSteer(tr, x)
      return
    }
    // Everything else is positional, but with real hysteresis: JUMP keeps its
    // bit for 24 px past its own edge. Once a pointer does leave, it is dropped
    // outright rather than re-arming, so a thumb wandering back cannot fire a
    // second jump the player never asked for.
    if (!hit(rects[tr.slot], x, y, slopOf(tr.slot))) drop(e.pointerId)
  }

  function onUp(e: PointerEvent): void {
    const tr = tracks.get(e.pointerId)
    if (!tr) return
    if (e.cancelable) e.preventDefault()
    const t = now()

    if (tr.slot === 'restart' && holdTimer !== 0) {
      // Hold has not fired yet: this was a tap. Two of them in a row count.
      const tap = t - tr.t0 < HOLD_MS
      if (tap && t - lastTapEnd < DTAP_MS) {
        lastTapEnd = 0
        fireRestart()
      } else if (tap) {
        lastTapEnd = t
      }
    }
    if (tr.slot === 'pause' && hit(rects.pause, localX(e), localY(e), PRESS_SLOP)) {
      firePause()
    }
    drop(e.pointerId)
  }

  function onLost(e: PointerEvent): void {
    // Capture lost to the browser (a system gesture, an alert, a dead touch):
    // treat that one pointer as released. It also fires after every ordinary
    // pointerup, where onUp has already dropped the id and this is a no-op --
    // which is why it must never touch the OTHER fingers still holding.
    drop(e.pointerId)
  }

  // Capture phase on the host, ahead of the canvas's own pointerdown handler.
  host.addEventListener('pointerdown', onDown, true)
  win.addEventListener('pointermove', onMove)
  win.addEventListener('pointerup', onUp)
  win.addEventListener('pointercancel', onUp)
  host.addEventListener('lostpointercapture', onLost)

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

  // ------------------------------------------------------------- lifecycle --

  const onBlur = (): void => releaseAll()
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') releaseAll()
  }
  win.addEventListener('blur', onBlur)
  win.addEventListener('pagehide', onBlur)
  doc.addEventListener('visibilitychange', onVisibility)

  // ------------------------------------------------------------ detection --

  const mq = typeof win.matchMedia === 'function' ? win.matchMedia('(pointer: coarse)') : null

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
   * forward to Display.setReservedBottom(). Fired only on change.
   *
   * The value is a function of viewW/viewH ALONE -- never of the rectangle we
   * were handed. Feeding the game rect back in is what made the old deck
   * oscillate, and gating on it is what made the playfield depend on which way
   * the phone had been rotated.
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

  /** The play rectangle the shell would produce with nothing reserved. */
  function natural(viewW: number, viewH: number, reserved: number): TouchRect {
    const availH = Math.max(1, viewH - reserved)
    const scale = Math.min(viewW / VIEW_W, availH / VIEW_H)
    const w = Math.floor(VIEW_W * scale)
    const h = Math.floor(VIEW_H * scale)
    return rect(Math.floor((viewW - w) / 2), Math.floor((availH - h) / 2), w, h)
  }

  /**
   * Steer pad width: as much of `margin` as the ideal band allows, but never
   * growing into the fire column (`room`). On a squarish screen the game fills
   * the width and there are no margins at all, so both rails end up over the
   * playfield and the pad has to yield -- continuously, by pixels, with no
   * second layout hiding behind a threshold.
   */
  function steerWidth(margin: number, room: number): number {
    const ideal = clamp(margin, STEER_MIN_W, STEER_MAX_W)
    return clamp(Math.min(ideal, Math.max(MIN_TOUCH, room)), MIN_TOUCH, STEER_MAX_W)
  }

  function computeLayout(view: DeckView): { rects: Rects; reserve: number; portrait: boolean } {
    const inset = safeInsets()
    const viewW = Math.max(1, view.viewW)
    const viewH = Math.max(1, view.viewH)
    const x0 = inset.left + PAD
    const x1 = viewW - inset.right - PAD
    const top = inset.top + PAD
    const bottom = viewH - inset.bottom - PAD
    const usableH = Math.max(1, viewH - inset.top - inset.bottom)
    const out = emptyRects()

    // Utility row: PAUSE and RESTART, both a screen away from the thumbs and
    // both at least EDGE px in from the frame. RESTART is never a plain tap
    // (hold 450 ms or double-tap), because hitting it by accident ends a run.
    const utilW = clamp(Math.min(UTIL_W, Math.floor((x1 - x0 - 2 * EDGE) / 2)), MIN_TOUCH, UTIL_W)

    const isPortrait = viewH > viewW

    if (!isPortrait) {
      // --- LANDSCAPE: side rails, no reserve, game keeps its full height.
      const game = natural(viewW, viewH, 0)

      // Width is whatever the margin offers, clamped -- a continuous function,
      // with no threshold anywhere for an inset to tip one way or the other.
      const colW = clamp(x1 - (game.x + game.w), COL_MIN_W, COL_MAX_W)
      const colX = x1 - colW
      const steerW = steerWidth(game.x - x0, colX - COL_GAP - x0)
      const steerH = Math.min(
        clamp(Math.round(usableH * 0.44), STEER_MIN_H, STEER_MAX_H),
        Math.max(MIN_TOUCH, bottom - top),
      )
      out.steer = rect(x0, bottom - steerH, steerW, steerH)

      // Ceiling for the fire column: the utility row plus a full gap, so a
      // thumb reaching for SHOOT can never brush RESTART.
      const ceil = inset.top + EDGE + UTIL_H + STACK_GAP
      const avail = Math.max(2 * MIN_TOUCH + STACK_GAP, bottom - ceil)
      let jumpH = clamp(Math.round(usableH * 0.45), JUMP_MIN_H, JUMP_MAX_H)
      let shootH = clamp(Math.round(jumpH * 0.55), SHOOT_MIN_H, SHOOT_MAX_H)
      if (jumpH + STACK_GAP + shootH > avail) {
        // SHOOT gives ground first: JUMP is the button that must never be
        // missed, and its height is the whole point of the layout.
        shootH = Math.max(MIN_TOUCH, avail - STACK_GAP - jumpH)
        if (jumpH + STACK_GAP + shootH > avail) jumpH = Math.max(MIN_TOUCH, avail - STACK_GAP - shootH)
      }
      out.jump = rect(colX, bottom - jumpH, colW, jumpH)
      out.shoot = rect(colX, bottom - jumpH - STACK_GAP - shootH, colW, shootH)

      out.pause = rect(inset.left + EDGE, inset.top + EDGE, utilW, UTIL_H)
      out.restart = rect(viewW - inset.right - EDGE - utilW, inset.top + EDGE, utilW, UTIL_H)
      return { rects: out, reserve: 0, portrait: false }
    }

    // --- PORTRAIT: game flush to the top, controls in a deck beneath it.
    const colW = clamp(Math.round(viewW * 0.32), COL_MIN_W, 150)
    const colX = x1 - colW
    let jumpH = clamp(Math.round(viewH * 0.19), JUMP_MIN_H, JUMP_MAX_H)
    let shootH = clamp(Math.round(jumpH * 0.55), SHOOT_MIN_H, SHOOT_MAX_H)
    const steerW = steerWidth(colX - COL_GAP - x0, colX - COL_GAP - x0)
    let steerH = clamp(Math.round((jumpH + STACK_GAP + shootH) * 0.62), STEER_MIN_H, STEER_MAX_H)

    // Never let the deck eat more than DECK_CAP of the screen: past that the
    // game is a postage stamp. Beyond that point the controls overlay it.
    // The second term keeps the fire column clear of the utility row on a
    // short screen, so a thumb reaching for SHOOT can never brush RESTART.
    const capBand = Math.max(
      2 * MIN_TOUCH + STACK_GAP,
      Math.min(
        Math.round(viewH * DECK_CAP) - UTIL_H - STACK_GAP,
        bottom - top - UTIL_H - STACK_GAP,
      ),
    )
    if (jumpH + STACK_GAP + shootH > capBand) {
      shootH = Math.max(MIN_TOUCH, capBand - STACK_GAP - jumpH)
      if (jumpH + STACK_GAP + shootH > capBand) jumpH = Math.max(MIN_TOUCH, capBand - STACK_GAP - shootH)
    }
    steerH = Math.min(steerH, jumpH + STACK_GAP + shootH)

    out.jump = rect(colX, bottom - jumpH, colW, jumpH)
    out.shoot = rect(colX, bottom - jumpH - STACK_GAP - shootH, colW, shootH)
    out.steer = rect(x0, bottom - steerH, steerW, steerH)

    const bandTop = Math.min(out.shoot.y, out.steer.y)
    const utilY = Math.max(top, bandTop - STACK_GAP - UTIL_H)
    out.pause = rect(inset.left + EDGE, utilY, utilW, UTIL_H)
    out.restart = rect(viewW - inset.right - EDGE - utilW, utilY, utilW, UTIL_H)

    // Flush to the top means reserving everything below the play rectangle;
    // the shell centres the game in what is left, so handing it exactly the
    // game's own height puts it at y = 0. Clamped to the deck we actually need
    // and to the 62% cap, and derived from the viewport only.
    const flush = viewH - natural(viewW, viewH, 0).h
    const need = viewH - utilY + PAD
    const reserve = clamp(Math.max(flush, need), 0, Math.round(viewH * DECK_CAP))
    return { rects: out, reserve, portrait: true }
  }

  function applyLayout(): void {
    const view = lastView
    for (const slot of SLOTS) {
      const r = rects[slot]
      const el = els[slot]
      el.style.left = `${r.x}px`
      el.style.top = `${r.y}px`
      el.style.width = `${r.w}px`
      el.style.height = `${r.h}px`
      el.style.fontSize = `${clamp(Math.round(Math.min(r.w, r.h) * 0.4), 14, 40)}px`
      // A control that has to sit over the playfield goes translucent rather
      // than shrinking: a big faint button beats a small solid one, and a spike
      // underneath still reads through 35% ink.
      const over =
        !!view && overlaps(r, { x: view.gameX, y: view.gameY, w: view.gameW, h: view.gameH })
      el.classList.toggle('is-overlay', over)
    }
    rotate.classList.toggle('is-on', portrait)
    if (view && portrait) {
      const gameBottom = view.gameY + view.gameH
      const hintTop = Math.max(gameBottom, 0)
      const hintH = Math.max(0, rects.pause.y - hintTop)
      rotate.style.left = '0px'
      rotate.style.width = `${view.viewW}px`
      rotate.style.top = `${hintTop + Math.max(0, (hintH - 90) / 2)}px`
    }
  }

  function layout(view: DeckView): void {
    lastView = view
    const res = computeLayout(view)
    rects = res.rects
    portrait = res.portrait
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
      cancelHold()
      endPulse()
      host.removeEventListener('pointerdown', onDown, true)
      win.removeEventListener('pointermove', onMove)
      win.removeEventListener('pointerup', onUp)
      win.removeEventListener('pointercancel', onUp)
      host.removeEventListener('lostpointercapture', onLost)
      win.removeEventListener('blur', onBlur)
      win.removeEventListener('pagehide', onBlur)
      doc.removeEventListener('visibilitychange', onVisibility)
      win.removeEventListener('pointerdown', onFirstTouch, true)
      win.removeEventListener('touchstart', onFirstTouchStart, true)
      mq?.removeEventListener?.('change', onMqChange)
      host.removeEventListener('touchmove', onTouchMove)
      host.removeEventListener('dblclick', stop)
      host.removeEventListener('contextmenu', stop)
      host.removeEventListener('selectstart', stop)
      host.removeEventListener('gesturestart', stop)
      host.removeEventListener('gestureend', stop)
      host.removeEventListener('gesturechange', stop)
      root.remove()
      probe.remove()
      styleUsers = Math.max(0, styleUsers - 1)
      if (styleUsers === 0) doc.getElementById(STYLE_ID)?.remove()
    },
    setVisible(v: boolean): void {
      override = v
      updateVisible()
    },
    layout,
    isActive: () => shown,
    getLayout(): TouchLayout {
      const s = rects.steer
      const half = Math.round(s.w / 2)
      return {
        left: rect(s.x, s.y, half, s.h),
        right: rect(s.x + half, s.y, s.w - half, s.h),
        jump: copy(rects.jump),
        shoot: copy(rects.shoot),
        restart: copy(rects.restart),
        steer: copy(s),
        pause: copy(rects.pause),
      }
    },
  }
}
