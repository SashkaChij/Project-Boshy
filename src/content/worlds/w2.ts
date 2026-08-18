/**
 * WORLD 2 -- "Rust Factory" / "Ржавая фабрика".
 *
 * The theme is machinery that does not care about you. Nothing in this world
 * is aimed at the player; belts run, presses press, beams sweep, and the fox
 * is simply in the way. Every hazard is on a fixed, visible cycle -- the only
 * randomness is the player's own timing.
 *
 * Room geometry contract used throughout:
 *   - floor surface is the top of tile row 16 (player feet land at y = 511),
 *   - tile rows 14 and 15 are left open at columns 0-1 and 23-24 so the
 *     left/right room transitions always line up at the same height,
 *   - two tiles of headroom over every corridor the player must run through.
 */

import { at, buildLevel, goalAt, half, saveAt, spawnAt } from '../build.js'
import type { LevelData } from '../../core/types.js'

const SOLID_ROW = '#########################'
const OPEN_ROW = '.........................'
const WALL_ROW = '#.......................#'

const FACTORY_BG = '#1d1712'

export const world: LevelData = buildLevel({
  id: 'w2',
  title: 'Rust Factory',
  author: 'Fox',
  difficulty: 3,
  rooms: [
    // ---------------------------------------------------------------- 0 ---
    // TEACHES: conveyors. Belts add +/-1 px per tick under your feet, which is
    // never enough to beat a 3 px walk -- but it is more than enough to walk
    // you into a spike while you stand still and think about it. The first
    // belt helps you toward the gap it wants you to fall in; the second belt
    // shoves you back onto the spike you just cleared.
    {
      gx: 0, gy: 0, color: FACTORY_BG, music: 'factory',
      main: [
        SOLID_ROW,
        WALL_ROW,
        '#..,.................,..#',
        WALL_ROW,
        WALL_ROW,
        '#...."............."....#',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        '#..........`....`.......#',
        '#............####........',
        '#............####........',
        '#######>>>>>^####^<<<<<##',
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        spawnAt(3, 16, 1),
        saveAt(5, 15),
        at('sign', 8, 15, 0, { text: 0 }),
        saveAt(15, 13),
        at('sign', 20, 15, 0, { text: 8 }),
        saveAt(23, 15),
      ],
    },

    // ---------------------------------------------------------------- 1 ---
    // TEACHES: turrets as rhythm. Three lanes fire leftward down the room.
    // The low lane (row 15) only touches a grounded fox, the middle and high
    // lanes only touch one that is airborne. The offsets are staggered across
    // the 120-tick cycle so the answer is never "jump" or "stand" but "jump
    // NOW" -- a wall of bullets you read instead of a wall you eat.
    {
      gx: 1, gy: 0, color: FACTORY_BG, music: 'factory',
      main: [
        SOLID_ROW,
        WALL_ROW,
        '#..,.................,..#',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        '#......----...----......#',
        OPEN_ROW,
        OPEN_ROW,
        SOLID_ROW,
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 4, 15, 0, { text: 9 }),
        // d = 2 is leftward. Same rate, three different phases.
        at('turret', 20, 15, 2, { rate: 120, speed: 4, offset: 0 }),
        at('turret', 20, 14, 2, { rate: 120, speed: 4, offset: 40 }),
        at('turret', 20, 12, 2, { rate: 120, speed: 4, offset: 80 }),
        saveAt(12, 15),
        at('sign', 17, 15, 0, { text: 3 }),
        saveAt(22, 15),
      ],
    },

    // ---------------------------------------------------------------- 2 ---
    // TEACHES: moving platforms. One horizontal shuttle, one vertical lift,
    // one short shuttle, with a stone pillar in the middle as the only fixed
    // ground. The lift bottoms out eight pixels above the spike tips, so
    // riding it all the way down is safe -- and looks like it is not.
    {
      gx: 2, gy: 0, color: FACTORY_BG, music: 'factory',
      main: [
        SOLID_ROW,
        WALL_ROW,
        '#...,...............,...#',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        '#..........##...........#',
        '...........##............',
        '...........##............',
        '####^^^^^^^##^^^^^^^#####',
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 3, 15, 0, { text: 4 }),
        // Shuttle over the first pit: x 192 -> 288, deck top at y 440.
        half('platform', 6, 14, 0, { dx: 1, dy: 0, dist: 96, speed: 1 }),
        saveAt(11, 12),
        // Lift beside the pillar: deck top swings between y 408 and y 504.
        half('platform', 14, 13, 0, { dx: 0, dy: 1, dist: 96, speed: 1.5 }),
        // Short shuttle onto the landing pad.
        half('platform', 17, 14, 0, { dx: 1, dy: 0, dist: 64, speed: 1 }),
        at('sign', 21, 15, 0, { text: 11 }),
        saveAt(22, 15),
      ],
    },

    // ---------------------------------------------------------------- 3 ---
    // TEACHES: crushers as timing windows. Three presses sit directly over
    // three two-tile spike pits and a fourth guards the exit shelf. A press
    // takes 28 ticks to fall and 56 to lift, and their dwell times differ
    // (40 / 45 / 50 / 40) so the pattern walks instead of pulsing in unison.
    // Being under one is not fatal by itself -- being under one MID-JUMP is,
    // because the ceiling arrives and the pit is still there.
    {
      gx: 3, gy: 0, color: FACTORY_BG, music: 'factory',
      main: [
        SOLID_ROW,
        WALL_ROW,
        '#..,.,...,.....,...,.,..#',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        OPEN_ROW,
        OPEN_ROW,
        '####^^####^^####^^#######',
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 3, 15, 0, { text: 7 }),
        half('crusher', 5, 8, 0, { dist: 224, speed: 8, wait: 40, offset: 0 }),
        saveAt(8, 15),
        half('crusher', 11, 8, 0, { dist: 224, speed: 8, wait: 45, offset: 15 }),
        saveAt(14, 15),
        half('crusher', 17, 8, 0, { dist: 224, speed: 8, wait: 50, offset: 30 }),
        half('crusher', 21, 8, 0, { dist: 224, speed: 8, wait: 40, offset: 25 }),
        at('sign', 22, 15, 0, { text: 1 }),
        saveAt(23, 15),
      ],
    },

    // ---------------------------------------------------------------- 4 ---
    // TEACHES: lasers, and that a beam always announces itself. Every emitter
    // here warns for at least 30 ticks before it becomes lethal for 30 -- an
    // unannounced instant-kill beam is the one trap type that reads as unfair
    // rather than hard. Five ceiling beams sweep left to right as a wave; one
    // long horizontal beam at y 352 exists purely to forbid the jump you want
    // to make from the raised block.
    {
      gx: 4, gy: 0, color: FACTORY_BG, music: 'factory',
      main: [
        SOLID_ROW,
        WALL_ROW,
        '#..,.................,..#',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        '.........###.............',
        '.........###.............',
        SOLID_ROW,
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 5, 15, 0, { text: 10 }),
        // d = 1 is downward; len 15 reaches from the ceiling to the floor.
        half('laser', 4, 1, 1, { period: 150, warn: 30, active: 30, len: 15, offset: 0 }),
        half('laser', 7, 1, 1, { period: 150, warn: 30, active: 30, len: 15, offset: 30 }),
        saveAt(10, 13),
        half('laser', 13, 1, 1, { period: 150, warn: 30, active: 30, len: 15, offset: 60 }),
        half('laser', 16, 1, 1, { period: 150, warn: 30, active: 30, len: 15, offset: 90 }),
        at('sign', 18, 15, 0, { text: 12 }),
        half('laser', 20, 1, 1, { period: 150, warn: 30, active: 30, len: 15, offset: 120 }),
        // d = 0 is rightward. Sits far above a running fox and exactly in the
        // path of one that jumps off the block.
        half('laser', 1, 11, 0, { period: 200, warn: 40, active: 40, len: 22, offset: 0 }),
        saveAt(22, 15),
      ],
    },

    // ---------------------------------------------------------------- 5 ---
    // TEACHES: ice, which swaps the instant stop for 0.2 px/tick of
    // acceleration. Both slides end in two tiles of ordinary steel before
    // anything sharp, so the stop is always available if you ask for it early.
    // The second slide runs under a pressed-steel ceiling with spikes in it:
    // the punishment there is for jumping, not for sliding.
    {
      gx: 5, gy: 0, color: FACTORY_BG, music: 'factory',
      main: [
        SOLID_ROW,
        WALL_ROW,
        '#..,.................,..#',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        '#...............######..#',
        '#...............######..#',
        '#...............#vvvv#..#',
        OPEN_ROW,
        OPEN_ROW,
        '####iiiiii##^^##iiiiiii##',
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 3, 15, 0, { text: 2 }),
        // Drips into the gap you have to jump. Slow enough to read, fast
        // enough that you cannot dawdle on the braking tiles.
        at('turret', 12, 11, 1, { rate: 80, speed: 4, offset: 0 }),
        at('sign', 14, 15, 0, { text: 13 }),
        saveAt(15, 15),
        saveAt(23, 15),
      ],
    },

    // ---------------------------------------------------------------- 6 ---
    // THE GAUNTLET. Belt into falling fire, a five-tile spike pit crossed on
    // two lifts, an ice run under a press, then a beam gate at the door.
    // Nothing new is introduced -- every element has already been taught in
    // isolation, which is the whole point: the difficulty is the sequence.
    {
      gx: 6, gy: 0, color: FACTORY_BG, music: 'factory',
      main: [
        SOLID_ROW,
        WALL_ROW,
        WALL_ROW,
        '#..,.,.........,.....,..#',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        OPEN_ROW,
        OPEN_ROW,
        '#####>>>>>^^^^^iiiii#####',
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        at('sign', 2, 15, 0, { text: 14 }),
        saveAt(4, 15),
        // Rain over the belt: the belt pushes you right, the drips ask you
        // to stop. You cannot do both, so you weave.
        at('turret', 6, 2, 1, { rate: 70, speed: 3, offset: 0 }),
        at('turret', 8, 2, 1, { rate: 70, speed: 3, offset: 35 }),
        // Two lifts over the pit, deliberately out of phase.
        half('platform', 11, 13, 0, { dx: 0, dy: 1, dist: 96, speed: 2 }),
        half('platform', 14, 12, 0, { dx: 0, dy: 1, dist: 96, speed: 1.25 }),
        saveAt(15, 15),
        // A press over the middle of the ice run, where you cannot brake.
        half('crusher', 17, 8, 0, { dist: 224, speed: 8, wait: 45, offset: 0 }),
        // The door beam. Long warning, short kill.
        half('laser', 21, 1, 1, { period: 140, warn: 35, active: 30, len: 15, offset: 0 }),
        saveAt(22, 15),
        at('sign', 23, 15, 0, { text: 6 }),
      ],
    },

    // ---------------------------------------------------------------- 7 ---
    // BOSS: the press machine. Pattern 1 rises, hovers and slams, sweeping
    // 320 px of the arena floor and throwing a spread of rivets upward on
    // impact. The two shelves at either end sit outside its sweep -- they are
    // the fox's firing positions, and reaching one is the entire fight.
    // The goal hangs in the ceiling frame, out of reach until the press stops.
    {
      gx: 7, gy: 0, color: FACTORY_BG, music: 'boss',
      main: [
        SOLID_ROW,
        WALL_ROW,
        WALL_ROW,
        '#..,.................,..#',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        '#..---.............---..#',
        WALL_ROW,
        '........................#',
        '........................#',
        SOLID_ROW,
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 4, 15, 0, { text: 15 }),
        half('boss', 12, 15, 0, { pattern: 1, hp: 200 }),
        goalAt(12, 2),
      ],
    },
  ],
})
