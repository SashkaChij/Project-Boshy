/**
 * Six original looping tracks, written as tracker patterns.
 *
 * Everything here is data plus one playback loop. A pattern is a string of
 * sixteen whitespace-separated tokens - one 16th note each, one bar per
 * pattern - and a channel is an order list naming which pattern plays in which
 * bar. That indirection is what keeps a 16-bar loop down to a few hundred
 * bytes and, more usefully, what makes the loops survive repetition: bars can
 * recur with one element varied instead of the whole arrangement restating.
 *
 * Tokens:
 *   c4  a#3  eb2   a note (letter, optional # or b, octave; c4 is MIDI 60)
 *   -             rest / note off
 *   .             hold: extend the previous note through this step
 *
 * On the channel declared as `kit`, the note picks a percussion voice instead
 * of a pitch, so a drum pattern reads like a drum staff:
 *   c2 kick   c#2 hard kick   d2 snare   e2 clap
 *   f#2 hat   g2 tom          a#2 open hat   b2 metal   b1 clank
 *
 * These are deliberately not five-second jingles. This genre asks the player to
 * die two hundred times in one room, and a track that grates on the fifth death
 * is a bug in the game, not a matter of taste. Hence long-ish loops, bars that
 * vary rather than repeat exactly, and melodies that leave gaps for the sound
 * effects to sit in.
 */

import {
  DRUM_KIT,
  INSTRUMENTS,
  RESYNC_SLIP_S,
  SCHEDULE_AHEAD_S,
  Scheduler,
  Synth,
  type Instrument,
  type InstrumentName,
} from './synth.js'

export type TrackName = 'title' | 'trial' | 'factory' | 'void' | 'boss' | 'victory'

export const TRACK_NAMES: readonly TrackName[] = ['title', 'trial', 'factory', 'void', 'boss', 'victory']

const STEPS_PER_BAR = 16
const STEPS_PER_BEAT = 4
/** Step values below zero are commands rather than pitches. */
const REST = -1
const HOLD = -2
/** A held note can never run longer than this many steps. Runaway guard. */
const MAX_HOLD_STEPS = 64

// ---------------------------------------------------------------- authoring ---

interface ChannelData {
  inst: InstrumentName | 'kit'
  gain: number
  /** -1 hard left .. 1 hard right. A little width, never a hard pan. */
  pan?: number
  order: number[]
  patterns: string[]
}

interface TrackData {
  bpm: number
  /** Delays every odd 16th by this fraction of a step. 0.12-0.16 is a groove. */
  swing?: number
  loop: boolean
  channels: ChannelData[]
}

// ------------------------------------------------------------------- title ---
// Slow, ominous, and pleased with itself. A minor with a raised-seventh sneer,
// the melody always arriving a beat later than you expect.

const TITLE: TrackData = {
  bpm: 76,
  loop: true,
  channels: [
    {
      inst: 'pulseThin', gain: 0.95, pan: -0.16,
      order: [0, 1, 2, 3, 0, 1, 4, 5, 0, 1, 2, 3, 6, 7, 8, 9],
      patterns: [
        '-   -   -   -     a4  .   .   -     c5  .   -   -     b4  .   .   .  ',
        'a4  .   .   .     .   -   -   -     -   -   -   -     -   -   e4  .  ',
        'f4  .   .   -     e4  .   .   -     d4  .   .   .     .   -   -   -  ',
        'd4  .   -   -     g4  .   .   -     b4  .   .   .     .   .   -   -  ',
        'd5  .   .   -     c5  .   .   -     a4  .   .   .     .   -   -   -  ',
        'b4  .   -   -     g#4 .   .   -     e4  .   .   .     .   .   -   -  ',
        'c5  .   .   -     b4  .   .   -     g4  .   .   .     .   -   -   -  ',
        'f4  .   .   -     d4  .   .   -     b3  .   .   .     .   -   -   -  ',
        'e4  .   -   -     g#4 .   -   -     b4  .   -   -     d5  .   .   .  ',
        '.   .   .   .     .   .   .   -     -   -   -   -     -   -   -   -  ',
      ],
    },
    {
      inst: 'pulseSoft', gain: 0.8, pan: 0.22,
      order: [0, 0, 1, 2, 0, 0, 3, 4, 0, 0, 1, 2, 5, 6, 4, 4],
      patterns: [
        '-   -   -   -     e4  -   a4  -     -   -   -   -     c5  -   -   -  ',
        '-   -   -   -     f4  -   a4  -     -   -   -   -     c5  -   -   -  ',
        '-   -   -   -     d4  -   g4  -     -   -   -   -     b4  -   -   -  ',
        '-   -   -   -     f4  -   a4  -     -   -   -   -     d5  -   -   -  ',
        '-   -   -   -     e4  -   g#4 -     -   -   -   -     b4  -   -   -  ',
        '-   -   -   -     e4  -   g4  -     -   -   -   -     c5  -   -   -  ',
        '-   -   -   -     d4  -   f4  -     -   -   -   -     b4  -   -   -  ',
      ],
    },
    {
      inst: 'bassTri', gain: 0.9,
      order: [0, 0, 1, 2, 0, 0, 3, 4, 0, 0, 1, 2, 5, 6, 4, 4],
      patterns: [
        'a1  .   .   -     a1  .   .   -     e2  .   .   -     a1  .   .   -  ',
        'f1  .   .   -     f1  .   .   -     c2  .   .   -     f1  .   .   -  ',
        'g1  .   .   -     g1  .   .   -     d2  .   .   -     g1  .   .   -  ',
        'd2  .   .   -     d2  .   .   -     a1  .   .   -     d2  .   .   -  ',
        'e1  .   .   -     e1  .   .   -     b1  .   .   -     e1  -   g#1 -  ',
        'c2  .   .   -     c2  .   .   -     g1  .   .   -     c2  .   .   -  ',
        'b1  .   .   -     b1  .   .   -     f2  .   .   -     b1  .   .   -  ',
      ],
    },
    {
      inst: 'kit', gain: 0.75, pan: 0.06,
      order: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2],
      patterns: [
        'c2  -   -   -     -   -   f#2 -     -   -   c2  -     -   -   f#2 -  ',
        'c2  -   -   -     -   -   f#2 -     -   -   c2  -     -   g2  g2  f#2',
        'c2  -   -   -     -   -   f#2 -     -   -   c2  b1     -  g2  g2  a#2',
      ],
    },
  ],
}

// ------------------------------------------------------------------- trial ---
// The forest world. Bouncy swung eighths on top, a bassline that keeps sliding
// a semitone off the root so the cheerfulness never quite settles.

const TRIAL: TrackData = {
  bpm: 142,
  swing: 0.14,
  loop: true,
  channels: [
    {
      inst: 'pulseLead', gain: 0.9, pan: -0.18,
      order: [0, 1, 2, 3, 0, 1, 4, 5, 6, 1, 2, 3, 4, 5, 3, 7],
      patterns: [
        'e4  -   g4  -     b4  -   g4  -     e4  -   b4  -     a4  -   g4  -  ',
        'e4  -   f#4 -     g4  -   a4  -     b4  -   .   -     a4  -   g4  -  ',
        'c5  -   b4  -     g4  -   e4  -     c5  -   .   -     b4  -   g4  -  ',
        'b4  -   d#5 -     f#5 -   d#5 -     b4  -   f#4 -     d#4 -   b3  -  ',
        'g4  -   b4  -     d5  -   b4  -     g4  -   d5  -     e5  -   d5  -  ',
        'a4  -   c5  -     e5  -   c5  -     a4  -   e4  -     c4  -   a3  -  ',
        'e5  -   d5  -     b4  -   g4  -     f#4 -   g4  -     a4  -   b4  -  ',
        '-   -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
      ],
    },
    {
      inst: 'pulseStab', gain: 0.85, pan: 0.24,
      order: [0, 0, 1, 2, 0, 0, 3, 4, 0, 0, 1, 2, 3, 4, 2, 2],
      patterns: [
        '-   -   b4  -     -   -   b4  -     -   -   b4  -     -   -   a4  -  ',
        '-   -   c5  -     -   -   c5  -     -   -   g4  -     -   -   g4  -  ',
        '-   -   f#4 -     -   -   f#4 -     -   -   f#4 -     -   -   f#4 -  ',
        '-   -   d5  -     -   -   d5  -     -   -   b4  -     -   -   b4  -  ',
        '-   -   e5  -     -   -   e5  -     -   -   c5  -     -   -   c5  -  ',
      ],
    },
    {
      inst: 'bassPluck', gain: 0.95,
      order: [0, 0, 1, 2, 0, 0, 3, 4, 0, 0, 1, 2, 3, 4, 2, 2],
      patterns: [
        'e1  -   e1  -     e1  -   g1  -     e1  -   e1  -     a#1 -   b1  -  ',
        'c2  -   c2  -     c2  -   d#2 -     c2  -   c2  -     g1  -   g#1 -  ',
        'b1  -   b1  -     b1  -   d2  -     b1  -   b1  -     f#1 -   f1  -  ',
        'g1  -   g1  -     g1  -   a#1 -     g1  -   g1  -     d2  -   d#2 -  ',
        'a1  -   a1  -     a1  -   c2  -     a1  -   a1  -     e2  -   d#2 -  ',
      ],
    },
    {
      inst: 'kit', gain: 0.85, pan: 0.05,
      order: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 2],
      patterns: [
        'c2  -   f#2 -     d2  -   f#2 c2      -   -   f#2 -     d2  -   f#2 f#2',
        'c2  -   f#2 -     d2  -   f#2 c2      -   -   f#2 -     d2  g2  g2  a#2',
        'c2  -   f#2 c2     d2  -   f#2 c2     c2  -   f#2 -     d2  g2  d2  a#2',
      ],
    },
  ],
}

// ----------------------------------------------------------------- factory ---
// D minor, hammered sixteenths, and percussion that is mostly metal being hit.
// The lead is a machine that repeats itself with one part slipping; the bass
// leans on a flat second for one bar in every eight so the loop never settles.

const FACTORY: TrackData = {
  bpm: 152,
  loop: true,
  channels: [
    {
      inst: 'sawLead', gain: 0.95, pan: -0.2,
      order: [0, 1, 0, 2, 0, 1, 3, 4, 0, 1, 0, 2, 5, 1, 3, 4],
      patterns: [
        'd4  -   f4  -     d4  -   a#4 -     a4  -   g4  -     f4  -   -   -  ',
        'd4  -   f4  -     d4  -   a#4 -     a4  -   a#4 -     c5  -   d5  -  ',
        'f5  -   -   d5      -   -   c5  -     a#4 -   a4  -     g4  -   f4  -  ',
        'd5  .   .   .     .   -   -   -     a#4 .   .   .     .   -   -   -  ',
        '-   -   -   -     -   -   -   -     -   -   -   -     e4  -   f4  -  ',
        'd5  -   c5  -     a#4 -   a4  -     g4  -   f4  -     e4  -   d4  -  ',
      ],
    },
    {
      inst: 'pulseStut', gain: 0.8, pan: 0.26,
      order: [0, 1, 0, 1, 0, 1, 2, 2, 0, 1, 0, 1, 0, 1, 2, 2],
      patterns: [
        'a5  a5  -   a5      -   a5  a5  -     a#5 -   a5  -     g5  -   f5  -  ',
        'd5  d5  -   d5      -   d5  d5  -     f5  -   e5  -     d5  -   c5  -  ',
        'a5  -   a5  a5      -   a5  -   a5     a#5 a#5 -   a5     g5  -   -   -  ',
      ],
    },
    {
      inst: 'bassSaw', gain: 1, pan: -0.04,
      order: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 2, 1],
      patterns: [
        'd2  d2  d2  d2      d2  d2  c2  d2       d2  d2  d2  d2      f2  f2  e2  d#2',
        'd2  d2  d2  d2      d2  d2  c2  d2       a#1 a#1 a#1 a#1     c2  c2  c2  d2 ',
        'd2  d2  a#1 a#1     c2  c2  d2  d2      d#2 d#2 d2  d2      c2  c2  a#1 a1 ',
      ],
    },
    {
      inst: 'kit', gain: 0.9, pan: 0.04,
      order: [0, 0, 0, 1, 0, 0, 0, 1, 2, 0, 0, 1, 0, 0, 1, 3],
      patterns: [
        'c2  f#2 f#2 f#2     d2  f#2 f#2 f#2     c2  f#2 c2  f#2     d2  f#2 a#2 f#2',
        'c2  f#2 f#2 c2      d2  f#2 f#2 f#2     c2  f#2 c2  f#2     d2  g2  g2  a#2',
        'c2  b2  f#2 b2      d2  f#2 b2  f#2     c2  b2  f#2 b2      d2  f#2 b2  a#2',
        'c2  f#2 f#2 c2      d2  f#2 g2  g2      c2  b2  b2  b2      d2  a#2 b2  b2 ',
      ],
    },
  ],
}

// -------------------------------------------------------------------- void ---
// Almost nothing happens, and what happens is wrong. Two drones a tritone
// apart, blips that refuse to resolve, and a clank somewhere off-screen.

const VOID: TrackData = {
  bpm: 66,
  loop: true,
  channels: [
    {
      inst: 'pulseGhost', gain: 0.9, pan: -0.3,
      order: [0, 1, 0, 2, 0, 1, 0, 3, 0, 2, 0, 1, 4, 0, 3, 0],
      patterns: [
        '-   -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
        '-   -   -   -     c5  .   -   -     -   -   -   -     f#4 .   .   -  ',
        '-   -   -   b4      -   -   -   -     -   -   a#4 .     -   -   -   -  ',
        'g5  .   -   -     -   -   -   -     c#5 .   .   -     -   -   -   -  ',
        '-   -   f#5 .       .   -   -   -     -   -   -   -     c5  .   -   -  ',
      ],
    },
    {
      inst: 'bellGlass', gain: 0.85, pan: 0.34,
      order: [0, 0, 1, 0, 0, 2, 0, 0, 0, 1, 0, 0, 2, 0, 1, 0],
      patterns: [
        '-   -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
        'f#5 .   .   .     .   .   -   -     -   -   -   -     -   -   -   -  ',
        '-   -   -   -     -   -   -   -     c6  .   .   .     .   -   -   -  ',
      ],
    },
    {
      inst: 'droneTri', gain: 0.9,
      order: [0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 1, 1, 2, 2, 1, 0],
      patterns: [
        'c1  .   .   .     .   .   .   .     .   .   .   .     .   .   .   .  ',
        'f#1 .   .   .     .   .   .   .     .   .   .   .     .   .   .   .  ',
        'b1  .   .   .     .   .   .   .     .   .   .   .     .   .   .   .  ',
      ],
    },
    {
      inst: 'kit', gain: 0.7, pan: -0.1,
      order: [0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 2, 0, 0],
      patterns: [
        '-   -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
        'b1  -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
        '-   -   -   -     -   -   -   -     g2  -   -   -     -   -   -   b1 ',
      ],
    },
  ],
}

// -------------------------------------------------------------------- boss ---
// F# harmonic minor at speed. Sixteenth-note bass, arpeggios that climb a
// register each bar, and the raised seventh landing like a threat.

const BOSS: TrackData = {
  bpm: 178,
  loop: true,
  channels: [
    {
      inst: 'pulseLead', gain: 0.95, pan: -0.14,
      order: [0, 0, 1, 1, 0, 0, 2, 2, 3, 3, 1, 1, 0, 4, 2, 5],
      patterns: [
        'f#4 a4  c#5 a4      f#4 a4  c#5 e5      f#5 e5  c#5 a4      f#4 e4  c#4 a3 ',
        'd4  f#4 a4  f#4     d4  f#4 a4  d5      f#5 d5  a4  f#4     d4  a3  f#3 a3 ',
        'c#4 f4  g#4 f4      c#4 f4  g#4 c#5     f5  c#5 g#4 f4      c#4 g#3 f3  c#3',
        'e4  g#4 b4  g#4     e4  g#4 b4  e5      g#5 e5  b4  g#4     e4  b3  g#3 e3 ',
        'f#5 -   f#5 -       f#5 -   -   -       e5  -   e5  -       e5  -   -   -  ',
        'c#5 -   c#5 c#5     f5  -   -   -       g#5 -   f5  -       c#5 -   -   -  ',
      ],
    },
    {
      inst: 'pulseStab', gain: 0.9, pan: 0.2,
      order: [0, 0, 1, 1, 0, 0, 2, 2, 3, 3, 1, 1, 0, 0, 2, 2],
      patterns: [
        '-   -   c#5 -     -   -   c#5 -     -   -   c#5 -     -   -   c#5 -  ',
        '-   -   d5  -     -   -   d5  -     -   -   a4  -     -   -   a4  -  ',
        '-   -   g#4 -     -   -   g#4 -     -   -   c#5 -     -   -   c#5 -  ',
        '-   -   b4  -     -   -   b4  -     -   -   e5  -     -   -   e5  -  ',
      ],
    },
    {
      inst: 'bassPluck', gain: 1, pan: -0.03,
      order: [0, 0, 1, 1, 0, 0, 2, 2, 3, 3, 1, 1, 0, 0, 2, 4],
      patterns: [
        'f#1 f#1 f#2 f#1     f#1 f#1 f#2 f#1     f#1 f#1 f#2 f#1     e1  e1  f1  f1 ',
        'd1  d1  d2  d1      d1  d1  d2  d1      d1  d1  d2  d1      a1  a1  g#1 g1 ',
        'c#1 c#1 c#2 c#1     c#1 c#1 c#2 c#1     c#1 c#1 c#2 c#1     g#1 g#1 g1  f1 ',
        'e1  e1  e2  e1      e1  e1  e2  e1      e1  e1  e2  e1      b1  b1  a#1 a1 ',
        'c#1 c#1 c#2 c#1     c#1 c#1 c#2 c#1     f1  f1  f1  f1      f1  f1  f1  f1 ',
      ],
    },
    {
      inst: 'kit', gain: 0.9, pan: 0.05,
      order: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 2],
      patterns: [
        'c#2 c2  f#2 c2      d2  c2  f#2 c2      c#2 c2  f#2 c2      d2  c2  f#2 f#2',
        'c#2 c2  f#2 c2      d2  c2  f#2 c2      c#2 c2  f#2 c2      d2  g2  g2  a#2',
        'c#2 c2  d2  c2      d2  g2  g2  g2      c#2 c2  d2  c2      d2  d2  a#2 a#2',
      ],
    },
  ],
}

// ----------------------------------------------------------------- victory ---
// Four bars of D major, then silence. This one must NOT loop: it plays over the
// clear screen and the player has earned the quiet afterwards.

const VICTORY: TrackData = {
  bpm: 144,
  loop: false,
  channels: [
    {
      inst: 'pulseLead', gain: 1, pan: -0.12,
      order: [0, 1, 2, 3],
      patterns: [
        'd5  -   a4  -     d5  -   f#5 -     a5  .   .   -     -   -   -   -  ',
        'g5  -   f#5 -     e5  -   d5  -     a5  .   .   .     .   .   -   -  ',
        'd6  .   .   .     .   .   .   .     .   .   .   .     .   .   .   .  ',
        '-   -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
      ],
    },
    {
      inst: 'pulseSoft', gain: 0.9, pan: 0.18,
      order: [0, 1, 2, 3],
      patterns: [
        '-   -   -   -     -   -   -   -     f#5 .   .   -     -   -   -   -  ',
        '-   -   -   -     -   -   -   -     f#5 .   .   .     .   .   -   -  ',
        'a5  .   .   .     .   .   .   .     .   .   .   .     .   .   .   .  ',
        '-   -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
      ],
    },
    {
      inst: 'bassTri', gain: 1,
      order: [0, 1, 2, 3],
      patterns: [
        'd2  -   d2  -     d2  -   d2  -     d2  .   .   -     -   -   -   -  ',
        'g2  -   g2  -     a2  -   a2  -     d2  .   .   .     .   .   -   -  ',
        'd2  .   .   .     .   .   .   .     .   .   .   .     .   .   .   .  ',
        '-   -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
      ],
    },
    {
      inst: 'kit', gain: 0.9,
      order: [0, 1, 2, 3],
      patterns: [
        'c2  -   c2  -     c2  -   c2  -     d2  -   -   -     -   -   -   -  ',
        'c2  -   c2  -     d2  -   d2  -     c2  -   g2  g2      -   -   -   -  ',
        'd2  -   d2  -     d2  d2  d2  d2      c2  -   -   -     -   -   -   -  ',
        '-   -   -   -     -   -   -   -     -   -   -   -     -   -   -   -  ',
      ],
    },
  ],
}

const TRACK_DATA: Record<TrackName, TrackData> = {
  title: TITLE,
  trial: TRIAL,
  factory: FACTORY,
  void: VOID,
  boss: BOSS,
  victory: VICTORY,
}

// ------------------------------------------------------------------ parsing ---

const SEMITONES: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
}

/** 'a#3' -> 58, 'c4' -> 60, 'eb2' -> 39. Returns REST if unparseable. */
function noteToMidi(token: string): number {
  const t = token.toLowerCase()
  const base = SEMITONES[t[0] ?? '']
  if (base === undefined) return REST
  let i = 1
  let acc = 0
  const second = t[1]
  if (second === '#') {
    acc = 1
    i = 2
  } else if (second === 'b') {
    acc = -1
    i = 2
  }
  const octave = Number.parseInt(t.slice(i), 10)
  if (!Number.isFinite(octave)) return REST
  return (octave + 1) * 12 + base + acc
}

/**
 * Parse one bar. Malformed patterns are padded or truncated to the bar length
 * rather than thrown on: a typo in a pattern should cost one wrong note, not
 * take the whole game down at module-import time.
 */
function parsePattern(src: string): number[] {
  const out: number[] = new Array<number>(STEPS_PER_BAR).fill(REST)
  const tokens = src.trim().split(/\s+/)
  const n = Math.min(tokens.length, STEPS_PER_BAR)
  for (let i = 0; i < n; i++) {
    const tok = tokens[i] ?? '-'
    if (tok === '-') out[i] = REST
    else if (tok === '.') out[i] = HOLD
    else out[i] = noteToMidi(tok)
  }
  return out
}

// ------------------------------------------------------------ compiled form ---

interface Channel {
  inst: InstrumentName | 'kit'
  gain: number
  pan: number
  /** Flattened order, one entry per step for the whole loop. */
  steps: number[]
}

export interface Track {
  bpm: number
  swing: number
  loop: boolean
  stepDur: number
  length: number
  channels: Channel[]
}

const compiled = new Map<TrackName, Track>()

function compile(name: TrackName): Track {
  const cached = compiled.get(name)
  if (cached) return cached
  const data = TRACK_DATA[name]
  let bars = 0
  for (const ch of data.channels) bars = Math.max(bars, ch.order.length)
  const length = bars * STEPS_PER_BAR

  const channels: Channel[] = data.channels.map((ch) => {
    const patterns = ch.patterns.map(parsePattern)
    const steps: number[] = new Array<number>(length).fill(REST)
    for (let bar = 0; bar < bars; bar++) {
      const pat = patterns[ch.order[bar] ?? -1]
      if (!pat) continue
      for (let s = 0; s < STEPS_PER_BAR; s++) steps[bar * STEPS_PER_BAR + s] = pat[s] ?? REST
    }
    return { inst: ch.inst, gain: ch.gain, pan: ch.pan ?? 0, steps }
  })

  const track: Track = {
    bpm: data.bpm,
    swing: data.swing ?? 0,
    loop: data.loop,
    stepDur: 60 / data.bpm / STEPS_PER_BEAT,
    length,
    channels,
  }
  compiled.set(name, track)
  return track
}

/** Loop length in seconds. Handy for the title screen's fade timings. */
export function trackDuration(name: TrackName): number {
  const t = compile(name)
  return t.length * t.stepDur
}

// ------------------------------------------------------------------ player ---

/**
 * Pattern playback on top of the lookahead scheduler.
 *
 * The playhead is a step index plus an absolute AudioContext timestamp for that
 * step. Each pump commits every step that falls inside the lookahead window and
 * advances. Time is accumulated by adding one step duration at a time, so an
 * expensive frame or a stalled timer costs nothing: the notes were already
 * handed to the audio clock.
 */
export class MusicPlayer {
  private readonly ctx: AudioContext
  private readonly out: GainNode
  private readonly synth: Synth
  private readonly sched: Scheduler
  private readonly pans = new Map<number, AudioNode>()
  private track: Track | null = null
  private current: TrackName | null = null
  private step = 0
  private nextTime = 0

  constructor(ctx: AudioContext, out: GainNode) {
    this.ctx = ctx
    this.out = out
    this.synth = new Synth(ctx, out)
    this.sched = new Scheduler(() => this.pump())
  }

  get playing(): TrackName | null {
    return this.current
  }

  play(name: TrackName): void {
    if (this.current === name && this.sched.running) return
    this.sched.stop()
    this.track = compile(name)
    this.current = name
    this.step = 0
    // A hair of latency so the first bar is scheduled, not raced.
    this.nextTime = this.ctx.currentTime + 0.06
    this.sched.start()
  }

  /**
   * Stop scheduling. Notes already committed to the audio clock (at most one
   * lookahead window) still ring out, which is exactly the short tail you want
   * on a room transition instead of a hard cut.
   */
  stop(): void {
    this.sched.stop()
    this.track = null
    this.current = null
  }

  dispose(): void {
    this.stop()
    this.synth.dispose()
    for (const node of this.pans.values()) node.disconnect()
    this.pans.clear()
  }

  private pump(): void {
    const track = this.track
    if (!track) return
    const now = this.ctx.currentTime
    // Backgrounded tabs freeze the audio clock on some browsers and let it run
    // on others. If we have fallen a long way behind, drop the missed steps
    // instead of dumping the backlog into the graph in one burst.
    if (this.nextTime < now - RESYNC_SLIP_S) this.nextTime = now + 0.02
    const horizon = now + SCHEDULE_AHEAD_S

    while (this.nextTime < horizon) {
      if (this.step >= track.length) {
        if (!track.loop) {
          this.sched.stop()
          this.current = null
          this.track = null
          return
        }
        this.step = 0
      }
      const swing = this.step % 2 === 1 ? track.swing * track.stepDur : 0
      this.scheduleStep(track, this.step, this.nextTime + swing)
      this.nextTime += track.stepDur
      this.step++
    }
  }

  private scheduleStep(track: Track, index: number, when: number): void {
    for (let c = 0; c < track.channels.length; c++) {
      const ch = track.channels[c]
      if (!ch) continue
      const note = ch.steps[index]
      if (note === undefined || note < 0) continue

      let inst: Instrument | undefined
      let pitch = note
      if (ch.inst === 'kit') {
        const drum = DRUM_KIT[note]
        if (!drum) continue
        inst = INSTRUMENTS[drum]
        pitch = 60
      } else {
        inst = INSTRUMENTS[ch.inst]
      }
      if (!inst) continue

      const steps = this.holdLength(track, ch, index)
      // Leave a sliver of gap so repeated notes retrigger audibly instead of
      // smearing into one long tone.
      const dur = Math.max(0.02, steps * track.stepDur - 0.006)
      this.synth.note(inst, pitch, when, dur, ch.gain, this.panFor(ch.pan))
    }
  }

  /** How many steps this note sounds for, counting the HOLD steps after it. */
  private holdLength(track: Track, ch: Channel, index: number): number {
    let len = 1
    let i = index + 1
    while (len < MAX_HOLD_STEPS) {
      if (i >= track.length) {
        if (!track.loop) break
        i = 0
        // A note that wrapped the whole loop is a bug in the pattern, not a
        // very long note; the MAX_HOLD_STEPS guard catches it either way.
        if (index === 0) break
      }
      if (ch.steps[i] !== HOLD) break
      len++
      i++
    }
    return len
  }

  /** One shared panner per distinct pan value; created on demand. */
  private panFor(pan: number): AudioNode {
    if (pan === 0) return this.out
    const key = Math.round(pan * 100)
    const existing = this.pans.get(key)
    if (existing) return existing
    if (typeof this.ctx.createStereoPanner !== 'function') return this.out
    const node = this.ctx.createStereoPanner()
    node.pan.value = Math.max(-1, Math.min(1, pan))
    node.connect(this.out)
    this.pans.set(key, node)
    return node
  }
}
