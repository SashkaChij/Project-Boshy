import {
  IN_JUMP,
  IN_LEFT,
  IN_RESTART,
  IN_RIGHT,
  IN_SHOOT,
  IN_SUICIDE,
} from '../../core/types.js'
import type { InputAccumulator } from './state.js'

/**
 * Physical-key bindings: KeyboardEvent.code -> input bit.
 *
 * The keys are identified by their PHYSICAL position (`code`), never by the
 * character they produce (`key`). On a Russian layout the physical Z key
 * reports `key === 'я'` while `code` stays `'KeyZ'`; this game ships in
 * Russian, so binding on `key` would silently disable shooting for half the
 * players the moment they switch layout to type in chat.
 */
export interface KeyBindings {
  [code: string]: number
}

/**
 * DEFAULT CONTROL SCHEME
 *
 *   Move .............. Arrow Left / Right, or A / D
 *   Jump .............. Shift (either), or Space
 *   Shoot ............. Z or X
 *   Restart room ...... R
 *   Give up (suicide) . Q
 *
 * Shift-to-jump / Z-to-shoot is the muscle memory the IWBTG fangame lineage
 * has trained into this audience, so it is the primary scheme. Space (jump)
 * and X (shoot) are added for players arriving from mainstream platformers;
 * both extra keys sit on bits that are already covered, so no combination
 * conflicts. Nothing is bound to ArrowUp: a stray up-jump while lining up a
 * spike jump costs a run.
 *
 * Pause (Escape / P) is deliberately absent -- it is scene state, not
 * simulation input, and the shell owns it.
 */
export const DEFAULT_BINDINGS: KeyBindings = {
  ArrowLeft: IN_LEFT,
  KeyA: IN_LEFT,
  ArrowRight: IN_RIGHT,
  KeyD: IN_RIGHT,

  ShiftLeft: IN_JUMP,
  ShiftRight: IN_JUMP,
  Space: IN_JUMP,

  KeyZ: IN_SHOOT,
  KeyX: IN_SHOOT,

  KeyR: IN_RESTART,
  KeyQ: IN_SUICIDE,
}

/** Text entry anywhere in the page (the level editor has name fields). */
function isTextTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el.isContentEditable === true
}

/**
 * Attach keyboard handling to `target` (the window by default) and feed the
 * accumulator.
 *
 * Handlers only ever call `down()` / `up()`; nothing here polls. That is the
 * accumulator's contract: `pressed` and `released` are edge latches, so a tap
 * that begins and ends between two 20 ms ticks must still be recorded by the
 * events themselves or the release edge -- and with it the variable jump
 * height -- is lost.
 *
 * @returns a detach function that removes every listener it added.
 */
export function attachKeyboard(
  acc: InputAccumulator,
  opts?: { bindings?: KeyBindings; target?: EventTarget },
): () => void {
  const bindings = opts?.bindings ?? DEFAULT_BINDINGS
  const target = opts?.target ?? (typeof window !== 'undefined' ? window : undefined)
  if (!target) return () => {}

  const onKeyDown = (ev: Event): void => {
    const e = ev as KeyboardEvent
    // Ctrl+R / Cmd+R / Alt+Q must stay browser shortcuts, not game input.
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (isTextTarget(e.target)) return
    const bit = bindings[e.code]
    if (bit === undefined) return
    // preventDefault ONLY for keys we actually consume: Space would scroll the
    // page and / would open quick-find, but F5, F12 and Ctrl+L must survive.
    e.preventDefault()
    // Auto-repeat re-fires keydown forever while a key is held. The
    // accumulator would ignore the duplicate anyway, but bailing early keeps
    // the hot path honest.
    if (e.repeat) return
    acc.down(bit)
  }

  const onKeyUp = (ev: Event): void => {
    const e = ev as KeyboardEvent
    const bit = bindings[e.code]
    if (bit === undefined) return
    // No modifier / text-target guard here: if the key went down as game
    // input, its release must always be delivered, even if the player grabbed
    // Ctrl or clicked into a text field while still holding it. Otherwise the
    // bit stays held forever.
    e.preventDefault()
    acc.up(bit)
  }

  // Alt-tab, Cmd-tab, a notification stealing focus: the browser never sends
  // the matching keyup, so a held direction would stick and walk the player
  // into a spike on return. Same for the page being hidden.
  const onBlur = (): void => acc.clear()
  const onVisibility = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') acc.clear()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)
  const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
  doc?.addEventListener('visibilitychange', onVisibility)

  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('keyup', onKeyUp)
    target.removeEventListener('blur', onBlur)
    doc?.removeEventListener('visibilitychange', onVisibility)
    acc.clear()
  }
}
