/**
 * WORLD 1 -- "Forest of Lies" / "Лес обмана".
 *
 * The teaching world. Every mechanic is introduced in a room where it cannot
 * kill you, and then immediately reused in a room where it can. The forest is
 * not hard because it is dense; it is hard because it lies about which route
 * is the safe one, and it only ever lies about things you could have checked.
 *
 * Geometry budget, per src/core/constants.ts:
 *   single jump  86.1 px = 2.69 tiles up, ~3.9 tiles across
 *   double jump 143.9 px = 4.50 tiles up, ~6.0 tiles across
 * So a 3-tile wall is a hard stop on one jump, and a 4-tile pit crossed at a
 * 2-tile rise is a hard stop as well. Both are used here on purpose.
 *
 * The eight rooms sit at gx 0..7 on row gy 0, so the whole world is one
 * left-to-right walk and every room hands the player over at the same floor
 * height: main ground surface is the top of row 16 (y = 512 px), and columns
 * 0 and 24 are always open at rows 13..15 so the seam is never a wall.
 */

import { at, buildLevel, goalAt, half, saveAt, spawnAt } from '../build.js'
import type { LevelData } from '../../core/types.js'

const FOREST = '#101c14'
const DEEP = '#0c1710'

// ---------------------------------------------------------------- room 0 ---
// TEACHES: walking, the single jump, reading a step. Nothing here can kill you
// except the very last thing in the room -- a pit that is exactly as wide as it
// looks. The whole point is that the player leaves room 0 believing the world
// is honest.
const R0 = [
  '#########################',
  '.........................',
  '..,.....,......,........,',
  '.........................',
  '.....`.........`.........',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '............==...........',
  '........==..==...........',
  '###################..####',
  '===================..####',
  '###################..####',
]

// ---------------------------------------------------------------- room 1 ---
// TEACHES: the double jump, twice, in the two ways it matters.
// The pillar at columns 8..10 is exactly 3 tiles tall: 96 px, and a single jump
// tops out at 86.1 px. It is not a difficulty spike, it is a proof. Then the
// pit at columns 14..17 is 4 tiles wide AND lands 2 tiles higher, which puts it
// outside the single jump's reach in both axes at once.
const R1 = [
  '#########################',
  '.........................',
  '.....,..........,........',
  '.........................',
  '..`..........`...........',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '........###..............',
  '........###.......====...',
  '........###.......====...',
  '##############....#######',
  '==============....=======',
  '##############....#######',
]

// ---------------------------------------------------------------- room 2 ---
// TEACHES: spikes, and the first real betrayal.
// The floor spikes at columns 7..9 are the honest lesson. The pit at 19..21 is
// the lie: it is only 3 tiles wide, so the reflex is a full-height jump -- and
// a full jump puts the fox's head at y=405, straight into the spike teeth
// hanging at y=416. The pit is crossed with a SHORT hop. The teeth are drawn in
// plain sight, and the sign in front of them says there is nothing above you.
const R2 = [
  '#########################',
  '.........................',
  '...,.........,...........',
  '.........................',
  '.........`...........`...',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '..................====...',
  '...................vv....',
  '.........................',
  '.........................',
  '#######^^^#####........##',
  '===================..====',
  '###################..####',
]

// ---------------------------------------------------------------- room 3 ---
// TEACHES: fallblock. Four stepping pillars over a spike bed, each with a block
// hanging four tiles above it. Landing on a pillar puts the fox under the block
// and arms it; it then takes about 43 ticks to arrive. That is a generous
// second of thinking time and no more, so the room becomes a rhythm: land,
// leave, land, leave. Stand still and the ceiling takes the pillar away from
// you.
const R3 = [
  '#########################',
  '.........................',
  '.,.....,......,.......,..',
  '.........................',
  '.......`..........`......',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '........##..##..##.......',
  '........##..##..##.......',
  '#######^##^^##^^##^^#####',
  '=========================',
  '#########################',
]

// ---------------------------------------------------------------- room 4 ---
// TEACHES: cherries. Four cherrySine hazards with speed 0 hover in place and
// swing 96 px up and down forever, at four different frequencies, so they never
// settle into one readable pattern. The safe pockets between them (columns 9,
// 13, 17) are wide enough to stand in and wait, which is the lesson: this room
// is about patience, not speed. Linear cherries rain from the canopy and one
// sweeps the floor from the right to teach what a cherry does before the
// hovering ones ask you to time it.
const R4 = [
  '#########################',
  '.........................',
  '....,......,......,......',
  '.........................',
  '..`.......`.......`......',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '............==...........',
  '............==...........',
  '#########################',
  '=========================',
  '#########################',
]

// ---------------------------------------------------------------- room 5 ---
// TEACHES: fakeblock, in both of its moods.
// The pillar at column 10 looks like it reaches the ground; its bottom two
// tiles are fake and the fox walks straight through them. That is the kind
// version, and it happens before anything is at stake. Then the crossing over
// the spike bed: three stepping stones at columns 14, 16, 18 -- and the middle
// one is a lie. The 96 px hop from 14 straight to 18 is an ordinary single
// jump; trusting the middle stone is what kills. A moving platform carries the
// fox off the last stone, so the room ends on something that is exactly what it
// appears to be.
const R5 = [
  '#########################',
  '.........................',
  '...,..........,..........',
  '.........................',
  '......`...........`......',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '..........#..............',
  '..........#..............',
  '..........#..............',
  '..........#..............',
  '..............##..##.....',
  '.........................',
  '#############^^^^^^^^^^##',
  '=========================',
  '#########################',
]

// ---------------------------------------------------------------- room 6 ---
// TEACHES: nothing. Asks for everything.
// Spike hop under a swinging cherry, a pair of fallblock shutters that arm the
// moment you land, a 4-tile pit spanned by a bridge made entirely of fakeblock,
// and a second spike hop guarded by another swinging cherry. The bridge is the
// centrepiece: by now the fox has been shown a fake block, and a bridge that
// floats over a bottomless pit with nothing holding it up is the least
// trustworthy object in the forest. The pit is 4 tiles, which is a double jump
// and always was.
const R6 = [
  '#########################',
  '.........................',
  '..,......,........,......',
  '.........................',
  '.....`.........`.....`...',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '.........................',
  '#####^^^###....###^^^####',
  '===========....==========',
  '###########....##########',
]

// ---------------------------------------------------------------- room 7 ---
// The crow. A wide flat arena, walled on both sides except for the mouth the
// fox walks in through, with two low pillars for cover from the crow's aimed
// shots. The crow's nest sits sealed in the canopy at the top right: the goal
// is visible from the floor and cannot be walked to, so the only way out of the
// forest is through the bird.
const R7 = [
  '#########################',
  '#...................#####',
  '#...................#...#',
  '#...................#####',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '#.......................#',
  '........................#',
  '........................#',
  '.......##.......##......#',
  '.......##.......##......#',
  '#########################',
  '=========================',
  '#########################',
]

export const world: LevelData = buildLevel({
  id: 'w1',
  title: 'Forest of Lies',
  author: 'Fox',
  difficulty: 2,
  start: 0,
  rooms: [
    {
      gx: 0, gy: 0, main: R0, color: FOREST, music: 'trial',
      entities: [
        spawnAt(2, 16, 1),
        saveAt(4, 15),
        at('sign', 6, 15, 0, { text: 9 }),
        saveAt(16, 15),
        at('sign', 18, 15, 0, { text: 0 }),
      ],
    },
    {
      gx: 1, gy: 0, main: R1, color: FOREST, music: 'trial',
      entities: [
        saveAt(2, 15),
        at('sign', 6, 15, 0, { text: 1 }),
        // On top of the 3-tile wall, so the proof only has to be done once.
        saveAt(9, 12),
        at('sign', 12, 15, 0, { text: 4 }),
        saveAt(23, 15),
      ],
    },
    {
      gx: 2, gy: 0, main: R2, color: FOREST, music: 'trial',
      entities: [
        saveAt(3, 15),
        at('sign', 5, 15, 0, { text: 8 }),
        // Both of these sit on the sunken shelf, one row lower than the rest
        // of the world's floor.
        saveAt(15, 16),
        at('sign', 17, 16, 0, { text: 2 }),
        saveAt(23, 15),
      ],
    },
    {
      gx: 3, gy: 0, main: R3, color: DEEP, music: 'trial',
      entities: [
        saveAt(3, 15),
        at('sign', 5, 15, 0, { text: 10 }),
        // One block per pillar, over the LEFT tile -- the tile you land on.
        // Sidestepping right buys a moment; standing still does not.
        at('fallblock', 8, 10, 0, { delay: 5 }),
        at('fallblock', 12, 10, 0, { delay: 5 }),
        at('fallblock', 16, 10, 0, { delay: 5 }),
        // The last pillar loses both tiles. There is nowhere to wait.
        at('fallblock', 17, 10, 0, { delay: 25 }),
        at('sign', 21, 15, 0, { text: 6 }),
        saveAt(23, 15),
      ],
    },
    {
      gx: 4, gy: 0, main: R4, color: DEEP, music: 'trial',
      entities: [
        saveAt(2, 15),
        at('sign', 4, 15, 0, { text: 7 }),
        // speed 0 turns cherrySine into a hazard that hovers and swings
        // forever instead of leaving the room. Four different frequencies so
        // the four of them never lock into one shared beat.
        at('cherrySine', 7, 12, 0, { speed: 0, amp: 96, freq: 80 }),
        at('cherrySine', 11, 12, 0, { speed: 0, amp: 96, freq: 100 }),
        at('cherrySine', 15, 12, 0, { speed: 0, amp: 96, freq: 70 }),
        at('cherrySine', 19, 12, 0, { speed: 0, amp: 96, freq: 90 }),
        // One that actually travels, high enough to only punish panic jumps.
        at('cherrySine', 0, 10, 0, { speed: 2, amp: 64, freq: 44 }),
        // Rain from the canopy: d = 1 is down.
        at('cherry', 5, 2, 1, { speed: 2 }),
        at('cherry', 13, 2, 1, { speed: 2 }),
        at('cherry', 21, 2, 1, { speed: 2 }),
        // The floor sweeper: d = 2 is left. Sits at standing height, so it has
        // to be jumped, which is the whole introduction in one object.
        at('cherry', 24, 15, 2, { speed: 3 }),
        saveAt(9, 15),
        saveAt(17, 15),
        at('sign', 21, 15, 0, { text: 15 }),
      ],
    },
    {
      gx: 5, gy: 0, main: R5, color: FOREST, music: 'trial',
      entities: [
        saveAt(3, 15),
        at('sign', 8, 15, 0, { text: 13 }),
        // The kind lie: the bottom of the pillar is not there at all.
        at('fakeblock', 10, 14),
        at('fakeblock', 10, 15),
        saveAt(12, 15),
        at('sign', 11, 15, 0, { text: 5 }),
        // The unkind lie: the middle stepping stone over the spikes.
        at('fakeblock', 16, 14),
        at('fakeblock', 17, 14),
        // Honest to a fault. Shuttles from the last stone to the far bank.
        half('platform', 20, 15.25, 0, { dx: 1, dy: 0, dist: 96, speed: 1 }),
        saveAt(23, 15),
      ],
    },
    {
      gx: 6, gy: 0, main: R6, color: DEEP, music: 'trial',
      entities: [
        saveAt(2, 15),
        at('sign', 3, 15, 0, { text: 12 }),
        // Swings over the first spike hop; a full-height jump meets it.
        at('cherrySine', 6, 13, 0, { speed: 0, amp: 48, freq: 90 }),
        // Shutters over the run-up to the pit. Armed on landing, they arrive
        // in about a second: enough to cross at a run, not enough to think.
        at('fallblock', 9, 12, 0, { delay: 10 }),
        at('fallblock', 10, 12, 0, { delay: 10 }),
        // The bridge. There is no bridge.
        at('fakeblock', 11, 13),
        at('fakeblock', 12, 13),
        at('fakeblock', 13, 13),
        at('fakeblock', 14, 13),
        saveAt(16, 15),
        // Swings over the second spike hop.
        at('cherrySine', 19, 13, 0, { speed: 0, amp: 64, freq: 64 }),
        at('sign', 22, 15, 0, { text: 11 }),
        saveAt(23, 15),
      ],
    },
    {
      gx: 7, gy: 0, main: R7, color: '#180f16', music: 'boss',
      entities: [
        saveAt(2, 15),
        at('sign', 4, 15, 0, { text: 14 }),
        at('boss', 12, 7, 0, { pattern: 0, hp: 150 }),
        goalAt(22, 2),
      ],
    },
  ],
})
