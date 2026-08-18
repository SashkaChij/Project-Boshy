/**
 * A four-voice chiptune synthesiser built entirely out of WebAudio primitives.
 *
 * There are no asset files anywhere in this engine. Every waveform is either a
 * PeriodicWave assembled from an explicit Fourier series or an AudioBuffer of
 * LFSR noise generated at runtime, so the whole soundtrack costs zero bytes of
 * download and cannot drift out of sync with a missing fetch on a bad mobile
 * connection.
 *
 * The voice set mirrors the classic four-channel tracker layout because that is
 * what the pattern data in music.ts is written for:
 *
 *   1. pulse lead     variable duty square, the melody
 *   2. pulse harmony  a second square (or saw) for counter-lines and stabs
 *   3. triangle bass  the low end, plus toms and chip kicks
 *   4. noise          percussion and metallic texture
 *
 * Everything is scheduled ahead of time on the AudioContext clock. The one hard
 * rule: never fire a note from a setTimeout at the moment it should sound. The
 * timer thread is throttled by the browser (brutally so on a backgrounded tab
 * or a low-power phone) and the result is audible swing where none was
 * written. Instead a 25 ms interval walks a 100 ms lookahead window and hands
 * every note an exact `when` on the audio clock.
 */

/** How often the scheduler wakes up. Cheap; it usually finds nothing to do. */
export const SCHEDULER_INTERVAL_MS = 25
/** How far past `currentTime` notes are committed to the audio clock. */
export const SCHEDULE_AHEAD_S = 0.1
/**
 * If the playhead falls further behind than this the scheduler gives up on the
 * missed steps and resyncs. Without it, a tab that was backgrounded for two
 * minutes wakes up and dumps six thousand notes into the graph at once.
 */
export const RESYNC_SLIP_S = 0.25

// ------------------------------------------------------------------ voices ---

export type WaveKind = 'square' | 'saw' | 'triangle' | 'noise'
export type NoiseKind = 'white' | 'metal'

/** Pitch wobble. `depth` is in cents, `delay` in seconds after note-on. */
export interface Vibrato {
  rate: number
  depth: number
  delay: number
}

/** Pitch slide into the note: starts `from` semitones off, arrives in `time`. */
export interface PitchEnv {
  from: number
  time: number
}

export interface FilterSpec {
  type: BiquadFilterType
  freq: number
  q: number
  /** Cutoff starts at freq * sweep and glides to freq over `time` seconds. */
  sweep?: number
  time?: number
}

export interface Instrument {
  wave: WaveKind
  /** Pulse width, 0..1. Only meaningful for 'square'. 0.5 is a plain square. */
  duty?: number
  noise?: NoiseKind
  /** Peak linear gain of a single voice at velocity 1. */
  gain: number
  /** ADSR. a/d/r in seconds, s is a 0..1 fraction of the peak. */
  a: number
  d: number
  s: number
  r: number
  /** Hard cap on sounding length in seconds. Makes an instrument staccato. */
  hold?: number
  /** Ignore the pattern's pitch and always sound this MIDI note. Drum kit. */
  fixed?: number
  detune?: number
  vibrato?: Vibrato
  pitchEnv?: PitchEnv
  filter?: FilterSpec
}

export type InstrumentName = keyof typeof INSTRUMENTS

/** Equal temperament, A4 = 440 Hz = MIDI 69. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// ------------------------------------------------------------- instruments ---

/**
 * The palette. These are tuned by ear against each other so that a channel
 * gain of 1.0 in a pattern never clips the master bus on its own.
 */
export const INSTRUMENTS = {
  // ---- channel 1 / 2: pulse ----
  /** Bright 50% square. Carries a melody over noise percussion. */
  pulseLead: { wave: 'square', duty: 0.5, gain: 0.22, a: 0.005, d: 0.06, s: 0.6, r: 0.05, hold: 0.5 },
  /** 25% duty. Nasal, sits above the bass without fighting the lead. */
  pulseAlt: { wave: 'square', duty: 0.25, gain: 0.2, a: 0.004, d: 0.05, s: 0.55, r: 0.05, hold: 0.45 },
  /** 12.5% duty. Thin and reedy - the smug voice. */
  pulseThin: { wave: 'square', duty: 0.125, gain: 0.19, a: 0.01, d: 0.12, s: 0.5, r: 0.09, hold: 0.9,
    vibrato: { rate: 5.5, depth: 22, delay: 0.16 } },
  /** Soft pad-ish square for held chords and arpeggios. */
  pulseSoft: { wave: 'square', duty: 0.25, gain: 0.15, a: 0.045, d: 0.16, s: 0.45, r: 0.16, hold: 1.2 },
  /** Very short off-beat stab. */
  pulseStab: { wave: 'square', duty: 0.125, gain: 0.17, a: 0.002, d: 0.05, s: 0, r: 0.03, hold: 0.07 },
  /** Machine stutter: 16th-note repeats in the factory. */
  pulseStut: { wave: 'square', duty: 0.34, gain: 0.14, a: 0.001, d: 0.035, s: 0.15, r: 0.02, hold: 0.06,
    filter: { type: 'highpass', freq: 900, q: 0.7 } },
  /** Hollow, detuned and slow: the void's blips. */
  pulseGhost: { wave: 'square', duty: 0.5, gain: 0.13, a: 0.12, d: 0.4, s: 0.3, r: 0.5, hold: 2,
    detune: -14, vibrato: { rate: 3.1, depth: 45, delay: 0.3 },
    filter: { type: 'lowpass', freq: 1600, q: 1.2 } },

  // ---- saw ----
  /** Buzzy industrial lead. */
  sawLead: { wave: 'saw', duty: 0.5, gain: 0.16, a: 0.006, d: 0.09, s: 0.55, r: 0.06, hold: 0.6,
    filter: { type: 'lowpass', freq: 2600, q: 2.4, sweep: 2.2, time: 0.09 } },
  /** Slow dissonant swell. */
  droneSaw: { wave: 'saw', duty: 0.5, gain: 0.1, a: 0.5, d: 0.6, s: 0.6, r: 0.9, hold: 6,
    detune: 9, vibrato: { rate: 0.9, depth: 30, delay: 0.5 },
    filter: { type: 'lowpass', freq: 700, q: 0.9 } },

  // ---- channel 3: triangle bass ----
  /** Round triangle bass. */
  bassTri: { wave: 'triangle', duty: 0.5, gain: 0.5, a: 0.004, d: 0.1, s: 0.7, r: 0.07, hold: 1.1 },
  /** Plucked, tight: dies fast so 16th-note basslines stay readable. */
  bassPluck: { wave: 'triangle', duty: 0.5, gain: 0.52, a: 0.002, d: 0.07, s: 0.25, r: 0.05, hold: 0.16 },
  /** Sawed bass for the factory - more upper harmonics to cut through noise. */
  bassSaw: { wave: 'saw', duty: 0.5, gain: 0.3, a: 0.002, d: 0.06, s: 0.3, r: 0.04, hold: 0.14,
    filter: { type: 'lowpass', freq: 1100, q: 3 } },
  /** Sustained low drone. */
  droneTri: { wave: 'triangle', duty: 0.5, gain: 0.42, a: 0.35, d: 0.5, s: 0.8, r: 1.1, hold: 8,
    vibrato: { rate: 0.7, depth: 14, delay: 0.9 } },
  /** Glassy bell, long tail. */
  bellGlass: { wave: 'triangle', duty: 0.5, gain: 0.26, a: 0.003, d: 0.9, s: 0.05, r: 1.4, hold: 2.4,
    detune: 6, filter: { type: 'highpass', freq: 500, q: 0.7 } },

  // ---- channel 4: noise + percussion ----
  /** Chip kick: a triangle whose pitch collapses in 45 ms. */
  kick: { wave: 'triangle', duty: 0.5, gain: 0.85, a: 0.001, d: 0.11, s: 0, r: 0.02, hold: 0.09,
    fixed: 33, pitchEnv: { from: 22, time: 0.045 } },
  /** Deeper, longer kick for the boss. */
  kickHard: { wave: 'triangle', duty: 0.5, gain: 0.95, a: 0.001, d: 0.14, s: 0, r: 0.02, hold: 0.11,
    fixed: 31, pitchEnv: { from: 26, time: 0.035 } },
  snare: { wave: 'noise', noise: 'white', gain: 0.3, a: 0.001, d: 0.11, s: 0, r: 0.03, hold: 0.09,
    fixed: 70, filter: { type: 'bandpass', freq: 1900, q: 0.8 } },
  clap: { wave: 'noise', noise: 'white', gain: 0.26, a: 0.002, d: 0.07, s: 0, r: 0.03, hold: 0.06,
    fixed: 74, filter: { type: 'bandpass', freq: 1300, q: 2.6 } },
  hat: { wave: 'noise', noise: 'white', gain: 0.13, a: 0.001, d: 0.026, s: 0, r: 0.012, hold: 0.02,
    fixed: 86, filter: { type: 'highpass', freq: 7000, q: 0.7 } },
  hatOpen: { wave: 'noise', noise: 'white', gain: 0.12, a: 0.001, d: 0.19, s: 0, r: 0.06, hold: 0.16,
    fixed: 86, filter: { type: 'highpass', freq: 6000, q: 0.7 } },
  tom: { wave: 'triangle', duty: 0.5, gain: 0.55, a: 0.001, d: 0.13, s: 0, r: 0.03, hold: 0.11,
    fixed: 48, pitchEnv: { from: 8, time: 0.07 } },
  /** Short-period LFSR: the buzzy metallic hit that gives the factory its bite. */
  metal: { wave: 'noise', noise: 'metal', gain: 0.22, a: 0.001, d: 0.1, s: 0, r: 0.04, hold: 0.08,
    fixed: 72, filter: { type: 'bandpass', freq: 2600, q: 1.4 } },
  /** A distant, wrong-sounding clank. Used sparingly in the void. */
  clank: { wave: 'noise', noise: 'metal', gain: 0.17, a: 0.004, d: 0.7, s: 0.05, r: 0.8, hold: 0.9,
    fixed: 55, filter: { type: 'bandpass', freq: 900, q: 5 } },

  // ---- sfx-only voices ----
  /** Rising blip. Jump and double jump differ only in the note they are given. */
  blip: { wave: 'square', duty: 0.5, gain: 0.24, a: 0.001, d: 0.05, s: 0.4, r: 0.03, hold: 0.06,
    pitchEnv: { from: -9, time: 0.045 } },
  /** Falling zap for the pea shooter. */
  zap: { wave: 'square', duty: 0.125, gain: 0.16, a: 0.001, d: 0.05, s: 0.2, r: 0.02, hold: 0.04,
    pitchEnv: { from: 14, time: 0.05 } },
  /** Harsh detuned crunch. The death sound is deliberately unpleasant. */
  crunch: { wave: 'saw', duty: 0.5, gain: 0.3, a: 0.001, d: 0.16, s: 0.1, r: 0.06, hold: 0.14,
    detune: 31, pitchEnv: { from: 9, time: 0.13 },
    filter: { type: 'lowpass', freq: 2200, q: 4, sweep: 2.5, time: 0.12 } },
  /** The noise half of the death burst. */
  burst: { wave: 'noise', noise: 'white', gain: 0.34, a: 0.001, d: 0.16, s: 0, r: 0.05, hold: 0.12,
    fixed: 64, filter: { type: 'bandpass', freq: 1100, q: 0.6, sweep: 3, time: 0.14 } },
  /** Warm confirming chime for save points. Soft attack, long friendly tail. */
  chime: { wave: 'triangle', duty: 0.5, gain: 0.3, a: 0.012, d: 0.32, s: 0.22, r: 0.5, hold: 0.9,
    vibrato: { rate: 5, depth: 9, delay: 0.22 } },
  /** Sweetener an octave up under the chime. */
  chimeAir: { wave: 'square', duty: 0.125, gain: 0.075, a: 0.02, d: 0.3, s: 0.12, r: 0.45, hold: 0.8 },
  /** Dull thud when the fox lands. Almost subliminal on purpose. */
  thud: { wave: 'noise', noise: 'white', gain: 0.13, a: 0.001, d: 0.06, s: 0, r: 0.02, hold: 0.04,
    fixed: 46, filter: { type: 'lowpass', freq: 700, q: 1.1 } },
  /** Low dissonant buzz for a rejected input. */
  buzz: { wave: 'square', duty: 0.5, gain: 0.16, a: 0.002, d: 0.1, s: 0.5, r: 0.04, hold: 0.1,
    detune: 24 },
  /** Long descending roar for a dying boss. */
  roar: { wave: 'saw', duty: 0.5, gain: 0.22, a: 0.01, d: 0.9, s: 0.2, r: 0.35, hold: 0.9,
    detune: -18, pitchEnv: { from: 16, time: 0.85 },
    filter: { type: 'lowpass', freq: 1400, q: 3, sweep: 3, time: 0.8 } },
  /** Noise sweep partner for `roar`. */
  sweep: { wave: 'noise', noise: 'white', gain: 0.24, a: 0.02, d: 0.8, s: 0.15, r: 0.4, hold: 0.85,
    fixed: 72, filter: { type: 'bandpass', freq: 500, q: 1.2, sweep: 8, time: 0.85 } },
} as const satisfies Record<string, Instrument>

/**
 * MIDI note -> percussion voice for a pattern channel declared as a kit.
 * Written so a pattern reads like a drum staff: c2 kick, d2 snare, e2 clap,
 * f#2 closed hat, g2 tom, a#2 open hat, b2 metal.
 */
export const DRUM_KIT: Record<number, InstrumentName> = {
  36: 'kick',      // c2
  37: 'kickHard',  // c#2
  38: 'snare',     // d2
  40: 'clap',      // e2
  42: 'hat',       // f#2
  43: 'tom',       // g2
  46: 'hatOpen',   // a#2
  47: 'metal',     // b2
  35: 'clank',     // b1
}

// -------------------------------------------------------------- the synth ---

/** Harmonics kept in a generated wave. Enough bite, no aliasing screech. */
const HARMONICS = 28
/** Exponential ramps cannot reach zero, so silence is this instead. */
const EPS = 0.0005
/** Hard voice cap. Past this, new notes are dropped rather than mudding out. */
const MAX_VOICES = 32

export class Synth {
  private readonly ctx: AudioContext
  private readonly out: AudioNode
  private readonly waves = new Map<string, PeriodicWave>()
  private readonly noises = new Map<NoiseKind, AudioBuffer>()
  private voices = 0

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx
    this.out = out
  }

  /** Number of voices currently sounding. Exposed for debugging overlays. */
  get activeVoices(): number {
    return this.voices
  }

  /**
   * Schedule one note.
   *
   * `when` is an absolute AudioContext timestamp; `dur` is how long the key is
   * held, excluding the release tail. Nothing here reads currentTime except to
   * refuse to schedule in the past, so callers stay in charge of timing.
   */
  note(
    inst: Instrument,
    midi: number,
    when: number,
    dur: number,
    vel = 1,
    dest?: AudioNode,
  ): void {
    if (this.voices >= MAX_VOICES) return
    const ctx = this.ctx
    const start = Math.max(when, ctx.currentTime)
    const pitch = inst.fixed ?? midi
    const freq = midiToFreq(pitch)
    if (!(freq > 0) || !Number.isFinite(freq)) return

    const cap = inst.hold !== undefined && inst.hold > 0 ? inst.hold : Infinity
    const hold = Math.max(0.012, Math.min(dur, cap))

    // ---- source ----
    let src: AudioScheduledSourceNode
    let pitchParam: AudioParam
    let pitchBase: number
    let detuneParam: AudioParam | null = null

    if (inst.wave === 'noise') {
      const b = ctx.createBufferSource()
      b.buffer = this.noiseBuffer(inst.noise ?? 'white')
      b.loop = true
      // Noise is "tuned" by resampling; MIDI 60 is the buffer's native rate.
      pitchBase = Math.max(0.02, freq / midiToFreq(60))
      b.playbackRate.value = pitchBase
      pitchParam = b.playbackRate
      src = b
    } else {
      const o = ctx.createOscillator()
      if (inst.wave === 'triangle') o.type = 'triangle'
      else o.setPeriodicWave(this.wave(inst.wave, inst.duty ?? 0.5))
      pitchBase = freq
      o.frequency.value = freq
      if (inst.detune) o.detune.value = inst.detune
      detuneParam = o.detune
      pitchParam = o.frequency
      src = o
    }

    if (inst.pitchEnv) {
      const from = pitchBase * Math.pow(2, inst.pitchEnv.from / 12)
      pitchParam.setValueAtTime(from, start)
      pitchParam.exponentialRampToValueAtTime(pitchBase, start + Math.max(0.005, inst.pitchEnv.time))
    }

    // ---- vibrato ----
    let lfo: OscillatorNode | null = null
    let lfoGain: GainNode | null = null
    if (inst.vibrato && detuneParam) {
      lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = inst.vibrato.rate
      lfoGain = ctx.createGain()
      // Ramp the depth in so the note starts dead-centre and blooms.
      lfoGain.gain.setValueAtTime(0, start)
      lfoGain.gain.setValueAtTime(0, start + inst.vibrato.delay)
      lfoGain.gain.linearRampToValueAtTime(inst.vibrato.depth, start + inst.vibrato.delay + 0.12)
      lfo.connect(lfoGain)
      lfoGain.connect(detuneParam)
      lfo.start(start)
    }

    // ---- envelope ----
    const env = ctx.createGain()
    const peak = Math.max(EPS, inst.gain * vel)
    const sustain = Math.max(EPS, peak * inst.s)
    const attackEnd = start + Math.max(0.001, inst.a)
    const off = Math.max(start + hold, attackEnd + 0.002)
    const decayEnd = Math.min(attackEnd + Math.max(0.001, inst.d), off)

    env.gain.setValueAtTime(EPS, start)
    env.gain.linearRampToValueAtTime(peak, attackEnd)
    env.gain.exponentialRampToValueAtTime(sustain, decayEnd)
    // Pin the value at note-off, otherwise the release ramp would be measured
    // from the end of the decay and the note would fade through its sustain.
    env.gain.setValueAtTime(sustain, off)
    const release = Math.max(0.005, inst.r)
    env.gain.exponentialRampToValueAtTime(EPS, off + release)

    // ---- filter ----
    let filter: BiquadFilterNode | null = null
    if (inst.filter) {
      filter = ctx.createBiquadFilter()
      filter.type = inst.filter.type
      filter.Q.value = inst.filter.q
      const target = Math.max(20, Math.min(inst.filter.freq, ctx.sampleRate * 0.45))
      if (inst.filter.sweep && inst.filter.sweep > 0) {
        const from = Math.max(20, Math.min(target * inst.filter.sweep, ctx.sampleRate * 0.45))
        filter.frequency.setValueAtTime(from, start)
        filter.frequency.exponentialRampToValueAtTime(target, start + Math.max(0.005, inst.filter.time ?? 0.1))
      } else {
        filter.frequency.value = target
      }
    }

    // ---- wiring ----
    const tail = dest ?? this.out
    if (filter) {
      src.connect(filter)
      filter.connect(env)
    } else {
      src.connect(env)
    }
    env.connect(tail)

    const stopAt = off + release + 0.03
    src.start(start)
    src.stop(stopAt)
    if (lfo) lfo.stop(stopAt)

    this.voices++
    src.onended = () => {
      this.voices--
      try {
        src.disconnect()
        filter?.disconnect()
        env.disconnect()
        lfo?.disconnect()
        lfoGain?.disconnect()
      } catch {
        // A node can already be torn down if the context died under us.
      }
    }
  }

  /** Drop cached buffers and waves. The context owns nothing else of ours. */
  dispose(): void {
    this.waves.clear()
    this.noises.clear()
  }

  // ------------------------------------------------------------- waveforms ---

  private wave(kind: WaveKind, duty: number): PeriodicWave {
    const key = kind === 'square' ? `sq:${duty.toFixed(3)}` : kind
    const cached = this.waves.get(key)
    if (cached) return cached
    const made = kind === 'saw' ? this.sawWave() : this.pulseWave(duty)
    this.waves.set(key, made)
    return made
  }

  /**
   * Fourier series of a bipolar pulse with the given duty cycle:
   *   a(n) = 2/(n*pi) * sin(2*pi*n*d)
   *   b(n) = 2/(n*pi) * (1 - cos(2*pi*n*d))
   * At d = 0.5 the cosine terms vanish and this collapses to a plain square,
   * which is exactly the check to run if a duty ever sounds wrong.
   */
  private pulseWave(duty: number): PeriodicWave {
    const d = Math.min(0.95, Math.max(0.05, duty))
    const real = new Float32Array(HARMONICS + 1)
    const imag = new Float32Array(HARMONICS + 1)
    for (let n = 1; n <= HARMONICS; n++) {
      const k = 2 * Math.PI * n * d
      const amp = 2 / (n * Math.PI)
      real[n] = amp * Math.sin(k)
      imag[n] = amp * (1 - Math.cos(k))
    }
    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false })
  }

  /** Band-limited sawtooth: b(n) = 2/(n*pi), alternating sign. */
  private sawWave(): PeriodicWave {
    const real = new Float32Array(HARMONICS + 1)
    const imag = new Float32Array(HARMONICS + 1)
    for (let n = 1; n <= HARMONICS; n++) {
      imag[n] = (2 / (n * Math.PI)) * (n % 2 === 0 ? -1 : 1)
    }
    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false })
  }

  /**
   * Noise from a linear-feedback shift register rather than Math.random, for
   * two reasons: the 15-bit register is the same trick the era's sound chips
   * used and it sounds like it, and the short-period variant gives a tonal,
   * metallic buzz that white noise simply cannot produce.
   *
   * Buffer lengths are exact multiples of the register period, so looping is
   * seamless with no click at the wrap.
   */
  private noiseBuffer(kind: NoiseKind): AudioBuffer {
    const cached = this.noises.get(kind)
    if (cached) return cached
    const ctx = this.ctx
    // Hold each register output for several samples so the noise has a
    // definite "rate" that playbackRate can then transpose musically.
    const oversample = kind === 'white' ? 3 : 7
    const period = kind === 'white' ? 32767 : 93
    const frames = period * oversample
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let reg = 0x7ffe
    let held = 0
    for (let i = 0; i < frames; i++) {
      if (i % oversample === 0) {
        // Tap 1 for long noise, tap 6 for the short metallic period.
        const tap = kind === 'white' ? (reg >> 1) & 1 : (reg >> 6) & 1
        const bit = ((reg & 1) ^ tap) & 1
        reg = (reg >> 1) | (bit << 14)
        held = (reg & 1) === 0 ? 1 : -1
      }
      data[i] = held * 0.7
    }
    this.noises.set(kind, buf)
    return buf
  }
}

// ------------------------------------------------------------- scheduling ---

/**
 * A plain interval that pumps a callback. It carries no musical state of its
 * own; the caller decides what "now plus the lookahead window" means.
 */
export class Scheduler {
  private readonly pump: () => void
  private id: ReturnType<typeof setInterval> | null = null

  constructor(pump: () => void) {
    this.pump = pump
  }

  get running(): boolean {
    return this.id !== null
  }

  start(): void {
    if (this.id !== null) return
    this.pump()
    this.id = setInterval(this.pump, SCHEDULER_INTERVAL_MS)
  }

  stop(): void {
    if (this.id === null) return
    clearInterval(this.id)
    this.id = null
  }
}
