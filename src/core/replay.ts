import { levelHash } from './level.js'
import { createWorld } from './sim/world.js'
import { step } from './sim/step.js'
import type { InputFrame, LevelData } from './types.js'

/**
 * Input replays.
 *
 * Because step() is pure and the tick rate is fixed, a run is fully described
 * by the input frames that produced it. That makes three things possible at
 * once: physics regression tests that assert on a real playthrough, a level
 * that ships proof it is completable, and cross-browser determinism checks.
 *
 * The header carries a hash of the level, so editing a level makes its old
 * replays fail LOUDLY instead of desyncing into nonsense halfway through.
 */
export const REPLAY_VERSION = 1

export interface Replay {
  v: number
  levelHash: number
  difficulty: number
  assist: boolean
  seed: number
  ticks: number
  /** Run-length encoded pairs: [packedFrame, count, packedFrame, count, ...] */
  rle: number[]
}

function pack(f: InputFrame): number {
  return (f.held & 0xff) | ((f.pressed & 0xff) << 8) | ((f.released & 0xff) << 16)
}

function unpack(v: number): InputFrame {
  return { held: v & 0xff, pressed: (v >> 8) & 0xff, released: (v >> 16) & 0xff }
}

export class ReplayRecorder {
  private rle: number[] = []
  private last = -1
  private run = 0
  private count = 0

  push(f: InputFrame): void {
    const p = pack(f)
    this.count++
    if (p === this.last) {
      this.run++
      return
    }
    if (this.last >= 0) this.rle.push(this.last, this.run)
    this.last = p
    this.run = 1
  }

  finish(level: LevelData, difficulty: number, assist: boolean, seed: number): Replay {
    const rle = this.rle.slice()
    if (this.last >= 0) rle.push(this.last, this.run)
    return {
      v: REPLAY_VERSION,
      levelHash: levelHash(level),
      difficulty,
      assist,
      seed,
      ticks: this.count,
      rle,
    }
  }

  get length(): number {
    return this.count
  }
}

export function* replayFrames(r: Replay): Generator<InputFrame> {
  for (let i = 0; i < r.rle.length; i += 2) {
    const value = r.rle[i] ?? 0
    const n = r.rle[i + 1] ?? 0
    const frame = unpack(value)
    for (let k = 0; k < n; k++) yield frame
  }
}

export interface VerifyResult {
  ok: boolean
  reason: 'cleared' | 'died-out' | 'never-finished' | 'level-changed' | 'wrong-version'
  ticks: number
  deaths: number
}

/**
 * Re-runs a replay headlessly and reports whether it still clears the level.
 * This is what makes a "verified" badge mean something: it is not the author's
 * claim, it is a reproduction.
 */
export function verifyReplay(level: LevelData, replay: Replay): VerifyResult {
  if (replay.v !== REPLAY_VERSION) {
    return { ok: false, reason: 'wrong-version', ticks: 0, deaths: 0 }
  }
  if (replay.levelHash !== levelHash(level)) {
    return { ok: false, reason: 'level-changed', ticks: 0, deaths: 0 }
  }
  const w = createWorld(level, {
    difficulty: replay.difficulty,
    assist: replay.assist,
    seed: replay.seed,
  })
  let ticks = 0
  for (const frame of replayFrames(replay)) {
    step(w, frame)
    ticks++
    if (w.won) return { ok: true, reason: 'cleared', ticks, deaths: w.deaths }
  }
  return { ok: false, reason: 'never-finished', ticks, deaths: w.deaths }
}
