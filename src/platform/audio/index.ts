/**
 * The game's entire audio surface.
 *
 * Nothing is fetched: every sound effect is a stack of synth voices described
 * in the table below, and the music is pattern data. That means audio is ready
 * the instant the context exists - no loading screen, no half-silent first
 * playthrough on a slow connection.
 *
 * MOBILE
 * ------
 * Autoplay policy is the whole difficulty here, and getting it wrong is not a
 * subtle bug: the game is simply silent on half of all phones. The rules this
 * module follows:
 *
 *  1. The AudioContext is created lazily inside initAudio(), which the shell
 *     calls from the first pointerdown. Constructing one before a gesture
 *     produces a context that is born suspended and, on some WebKit versions,
 *     stays that way for the life of the page.
 *  2. Immediately after resume() we play a one-sample silent buffer. On WebKit
 *     that buffer is what actually flips the internal unlocked bit; a resolved
 *     resume() promise on its own is not always enough.
 *  3. navigator.audioSession.type is set to 'playback' where it exists, so the
 *     iPhone's physical ringer switch does not mute the game.
 *  4. ctx.state is re-checked on visibilitychange. iOS suspends the context
 *     when the tab is backgrounded and does not reliably resume it on return.
 *  5. playSfx() before unlock is a silent no-op. It is called from the
 *     simulation event drain, which must never throw for an audio reason.
 */

import { INSTRUMENTS, Synth, type InstrumentName } from './synth.js'
import { MusicPlayer, type TrackName } from './music.js'

export type { TrackName }

export type SfxName =
  | 'jump'
  | 'djump'
  | 'shoot'
  | 'death'
  | 'save'
  | 'land'
  | 'bosshit'
  | 'bossdie'
  | 'blockbreak'
  | 'win'
  | 'menu'
  | 'select'
  | 'error'

// -------------------------------------------------------------- sfx tables ---

interface Layer {
  /** Voice from the synth's instrument set. */
  i: InstrumentName
  /** MIDI note. Ignored by voices with a fixed pitch, e.g. the drum kit. */
  n: number
  /** Offset from trigger time, seconds. */
  t: number
  /** Key-held length, seconds. The release tail is added on top. */
  d: number
  /** Velocity, 0..1. */
  v?: number
  /** Random pitch jitter in semitones, +/-. Takes the edge off repetition. */
  j?: number
}

interface SfxDef {
  layers: Layer[]
  /** Minimum seconds between retriggers. Stops one tick of four bullets
   *  from stacking into a single loud transient. */
  gap: number
}

const SFX: Record<SfxName, SfxDef> = {
  // A fifth apart and unmistakable: the second jump also answers itself with a
  // quick upper tick, so you can hear which jump you just spent without
  // looking at the fox.
  jump: { gap: 0.02, layers: [{ i: 'blip', n: 74, t: 0, d: 0.05 }] },
  djump: {
    gap: 0.02,
    layers: [
      { i: 'blip', n: 81, t: 0, d: 0.04, v: 0.9 },
      { i: 'blip', n: 88, t: 0.038, d: 0.04, v: 0.7 },
    ],
  },

  shoot: {
    gap: 0.02,
    layers: [
      { i: 'zap', n: 84, t: 0, d: 0.035, v: 0.85, j: 1.5 },
      { i: 'hat', n: 60, t: 0, d: 0.015, v: 0.45 },
    ],
  },

  // Harsh, short, and over before you can be annoyed by it - you are going to
  // hear this one more than any other sound in the game.
  death: {
    gap: 0.03,
    layers: [
      { i: 'burst', n: 60, t: 0, d: 0.12 },
      { i: 'crunch', n: 45, t: 0, d: 0.14 },
      { i: 'crunch', n: 38, t: 0.012, d: 0.12, v: 0.8 },
    ],
  },

  // Warm and consonant: a major triad with an octave on top. The one sound in
  // the game that is unambiguously good news.
  save: {
    gap: 0.05,
    layers: [
      { i: 'chime', n: 72, t: 0, d: 0.12 },
      { i: 'chime', n: 76, t: 0.07, d: 0.12 },
      { i: 'chime', n: 79, t: 0.14, d: 0.34, v: 0.95 },
      { i: 'chimeAir', n: 91, t: 0.15, d: 0.34, v: 0.8 },
    ],
  },

  land: { gap: 0.04, layers: [{ i: 'thud', n: 60, t: 0, d: 0.03, v: 0.85, j: 2 }] },

  bosshit: {
    gap: 0.02,
    layers: [
      { i: 'metal', n: 60, t: 0, d: 0.06, v: 0.9, j: 2 },
      { i: 'zap', n: 88, t: 0, d: 0.04, v: 0.7 },
    ],
  },

  bossdie: {
    gap: 0.2,
    layers: [
      { i: 'roar', n: 40, t: 0, d: 0.9 },
      { i: 'sweep', n: 60, t: 0, d: 0.85, v: 0.9 },
      { i: 'burst', n: 60, t: 0, d: 0.14, v: 0.8 },
      { i: 'crunch', n: 33, t: 0.02, d: 0.3, v: 0.7 },
    ],
  },

  blockbreak: {
    gap: 0.02,
    layers: [
      { i: 'metal', n: 60, t: 0, d: 0.06, v: 0.8, j: 3 },
      { i: 'burst', n: 60, t: 0, d: 0.05, v: 0.5 },
    ],
  },

  // Short - the victory track carries the actual celebration.
  win: {
    gap: 0.4,
    layers: [
      { i: 'pulseLead', n: 74, t: 0, d: 0.09 },
      { i: 'pulseLead', n: 78, t: 0.09, d: 0.09 },
      { i: 'pulseLead', n: 81, t: 0.18, d: 0.09 },
      { i: 'pulseLead', n: 86, t: 0.27, d: 0.34 },
      { i: 'bassTri', n: 50, t: 0.27, d: 0.34, v: 0.8 },
    ],
  },

  menu: { gap: 0.02, layers: [{ i: 'pulseStab', n: 69, t: 0, d: 0.03, v: 0.8 }] },
  select: {
    gap: 0.03,
    layers: [
      { i: 'blip', n: 76, t: 0, d: 0.04, v: 0.85 },
      { i: 'blip', n: 83, t: 0.05, d: 0.07, v: 0.85 },
    ],
  },
  // A tritone. Wrong on purpose.
  error: {
    gap: 0.06,
    layers: [
      { i: 'buzz', n: 47, t: 0, d: 0.11 },
      { i: 'buzz', n: 53, t: 0, d: 0.11, v: 0.9 },
    ],
  },
}

// -------------------------------------------------------- platform typings ---

/** Safari 16.4+ / iOS. Narrow shape, feature-detected before use. */
interface AudioSessionLike {
  type: string
}
interface NavigatorWithAudioSession extends Navigator {
  audioSession?: AudioSessionLike
}
/** Older WebKit only exposes the prefixed constructor. */
interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext
}

// ------------------------------------------------------------------- state ---

let ctx: AudioContext | null = null
let musicGain: GainNode | null = null
let sfxGain: GainNode | null = null
let player: MusicPlayer | null = null
let sfxSynth: Synth | null = null

let initPromise: Promise<void> | null = null
let unlocked = false
let lifecycleBound = false
/** Set by suspendAudio() so the gesture and visibility hooks stay out of it. */
let heldSuspended = false

let musicVol = 0.55
let sfxVol = 0.75
/** Requested before unlock; started the moment the context is live. */
let pendingTrack: TrackName | null = null
let pendingNeedsStart = false

const lastPlayed = new Map<SfxName, number>()

// -------------------------------------------------------------------- init ---

/**
 * Create and unlock the audio context. Safe to call repeatedly; the work
 * happens once. Call it from a real user gesture - the shell does this on the
 * first pointerdown - or the context will exist but stay suspended.
 */
export function initAudio(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = build().catch(() => {
    // Audio is never load-bearing. Allow a later gesture to try again.
    initPromise = null
  })
  return initPromise
}

async function build(): Promise<void> {
  if (ctx) {
    await unlock()
    return
  }
  if (typeof window === 'undefined') return

  claimAudioSession()

  const win = window as WindowWithWebkitAudio
  const Ctor: typeof AudioContext | undefined = window.AudioContext ?? win.webkitAudioContext
  if (!Ctor) return

  const c = new Ctor({ latencyHint: 'interactive' })

  // A limiter on the master bus. Four voices of music plus a death sound plus
  // four bullets is a genuinely spiky signal, and clipping on phone speakers
  // sounds like a broken game rather than a loud one.
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -9
  comp.knee.value = 8
  comp.ratio.value = 12
  comp.attack.value = 0.003
  comp.release.value = 0.16

  const m = c.createGain()
  m.gain.value = 0.9
  m.connect(comp)
  comp.connect(c.destination)

  const mg = c.createGain()
  mg.gain.value = curve(musicVol)
  mg.connect(m)

  const sg = c.createGain()
  sg.gain.value = curve(sfxVol)
  sg.connect(m)

  ctx = c
  musicGain = mg
  sfxGain = sg
  player = new MusicPlayer(c, mg)
  sfxSynth = new Synth(c, sg)

  bindLifecycle()
  await unlock()
}

/**
 * Tell iOS this is playback audio, not a phone call or a notification blip.
 * Without it the game is muted by the hardware ringer switch, which players
 * reasonably read as "the game has no sound".
 */
function claimAudioSession(): void {
  if (typeof navigator === 'undefined') return
  const nav = navigator as NavigatorWithAudioSession
  const session = nav.audioSession
  if (!session) return
  try {
    session.type = 'playback'
  } catch {
    // Read-only in some builds. Not worth caring about.
  }
}

/**
 * Resume, then push a one-sample silent buffer through the graph.
 *
 * The silent buffer is not superstition: on WebKit the context is only really
 * unlocked once a buffer source has started from inside a user gesture, and a
 * context that reports 'running' without one can still produce no sound.
 */
async function unlock(): Promise<void> {
  const c = ctx
  if (!c) return
  if (c.state !== 'running') {
    try {
      await c.resume()
    } catch {
      // Gesture requirement not satisfied yet. A later one will land here.
    }
  }
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate)
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(c.destination)
    src.start(0)
  } catch {
    // Nothing to do; the next gesture retries.
  }
  if (c.state === 'running') {
    unlocked = true
    if (pendingNeedsStart && pendingTrack && player) {
      player.play(pendingTrack)
      pendingNeedsStart = false
    }
  }
}

function bindLifecycle(): void {
  if (lifecycleBound || typeof window === 'undefined') return
  lifecycleBound = true

  // Belt and braces: the shell calls initAudio() on the first pointerdown, but
  // if that gesture was consumed before the policy was satisfied, any later one
  // finishes the job.
  const onGesture = (): void => {
    if (heldSuspended) return
    if (unlocked && ctx?.state === 'running') return
    void unlock()
  }
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(type, onGesture, { passive: true, capture: true })
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      if (heldSuspended) return
      if (ctx && ctx.state !== 'running') void unlock()
    })
  }
}

export function isUnlocked(): boolean {
  return unlocked && ctx !== null && ctx.state === 'running'
}

// --------------------------------------------------------------------- sfx ---

export function playSfx(name: SfxName): void {
  const c = ctx
  const synth = sfxSynth
  // Before unlock this must be a no-op, not a throw: it is called straight out
  // of the simulation's event drain.
  if (!c || !synth || !unlocked || c.state !== 'running') return

  const def = SFX[name]
  const now = c.currentTime
  const last = lastPlayed.get(name)
  if (last !== undefined && now - last < def.gap) return
  lastPlayed.set(name, now)

  for (const layer of def.layers) {
    const inst = INSTRUMENTS[layer.i]
    const jitter = layer.j ? (Math.random() * 2 - 1) * layer.j : 0
    synth.note(inst, layer.n + jitter, now + layer.t, layer.d, layer.v ?? 1)
  }
}

// ------------------------------------------------------------------- music ---

export function playMusic(track: TrackName): void {
  pendingTrack = track
  if (!player || !isUnlocked()) {
    // Held until the context is live. A non-looping track that has already run
    // to its end must not be resurrected by a later unlock, hence the flag
    // rather than "restart whatever was last requested".
    pendingNeedsStart = true
    return
  }
  pendingNeedsStart = false
  player.play(track)
}

export function stopMusic(): void {
  pendingTrack = null
  pendingNeedsStart = false
  player?.stop()
}

// ----------------------------------------------------------------- volumes ---

/** Sliders feel linear to the ear only if the gain is not. */
function curve(v: number): number {
  const clamped = Math.max(0, Math.min(1, v))
  return Math.pow(clamped, 1.5)
}

function applyGain(node: GainNode | null, v: number): void {
  if (!node || !ctx) return
  const t = ctx.currentTime
  node.gain.cancelScheduledValues(t)
  node.gain.setValueAtTime(node.gain.value, t)
  node.gain.linearRampToValueAtTime(curve(v), t + 0.05)
}

export function setMusicVolume(v: number): void {
  musicVol = Math.max(0, Math.min(1, v))
  applyGain(musicGain, musicVol)
}

export function setSfxVolume(v: number): void {
  sfxVol = Math.max(0, Math.min(1, v))
  applyGain(sfxGain, sfxVol)
}

export function getMusicVolume(): number {
  return musicVol
}

export function getSfxVolume(): number {
  return sfxVol
}

// --------------------------------------------------------------- lifecycle ---

/**
 * Park the context, e.g. when the pause menu opens or the tab is hidden.
 * The music playhead pauses with it - the scheduler advances against the
 * audio clock, which stops while suspended - so the loop resumes in place
 * instead of jumping.
 */
export function suspendAudio(): void {
  heldSuspended = true
  const c = ctx
  if (!c || c.state !== 'running') return
  void c.suspend().catch(() => {})
}

export function resumeAudio(): Promise<void> {
  heldSuspended = false
  if (!ctx) return initAudio()
  return unlock()
}
