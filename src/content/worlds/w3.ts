/**
 * WORLD 3 -- "The Void" / "Пустота".
 *
 * The final world stops playing fair with space itself. World 1 lied about
 * blocks and world 2 lied about machinery; this one lies about which way is
 * down. Gravity flips, blocks that are not there, blocks that are there and
 * invisible, water that hangs in vertical columns, and a mirror that walks
 * the fox's own path back at her.
 *
 * Room geometry contract, identical to the other worlds so the seams line up:
 *   - floor surface is the top of tile row 16 (player feet land at y = 511),
 *   - tile rows 14 and 15 are open at columns 0 and 24 so left/right room
 *     transitions always meet at the same height,
 *   - tile row 0 is a solid slab across every room. Under flipped gravity it
 *     is the FLOOR, so it obeys the same rules the real floor does: at least
 *     two tiles of clear air below it wherever the fox has to run.
 *
 * FLIPPED-GRAVITY CHEAT SHEET (used constantly below):
 *   - gravity pulls toward -y, so the fox stands on the UNDERSIDE of row 0
 *     and occupies rows 1-2.
 *   - a jump moves her +y (down the screen) by the same 2.69 tiles.
 *   - a 'v' spike hangs from the ceiling by its base: it is a floor spike,
 *     mirrored, and it is cleared by jumping "over" it, i.e. downward.
 *   - a solid tile in row 1 is a one-tile step up, not an obstacle overhead.
 */

import { at, buildLevel, goalAt, saveAt, spawnAt } from '../build.js'
import type { LevelData } from '../../core/types.js'

const SOLID_ROW = 'mmmmmmmmmmmmmmmmmmmmmmmmm'
const OPEN_ROW = '.........................'
const WALL_ROW = 'm.......................m'
/** Left wall, right edge open -- room 0 only, which has no western neighbour. */
const LOPEN_ROW = 'm........................'
/** Left edge open, right wall -- the boss arena, which has no eastern one. */
const ROPEN_ROW = '........................m'

const VOID_BG = '#0b0716'
const VOID_DEEP = '#140a20'

export const world: LevelData = buildLevel({
  id: 'w3',
  title: 'The Void',
  author: 'Fox',
  difficulty: 5,
  rooms: [
    // ---------------------------------------------------------------- 0 ---
    // TEACHES: gravflip, in a room that cannot kill you. There is not one
    // hazard tile here and that is deliberate -- the first time the sky and
    // the ground swap places the player needs to be free to panic, walk the
    // wrong way, and fall back down without paying for it.
    //
    // The pad at column 8 throws the fox up to the slab of row 0; she runs
    // along its underside to the pad at column 16, which drops her home.
    // Walking back left re-flips her, on purpose: the mechanic is reversible
    // and that is the whole lesson.
    {
      gx: 0, gy: 0, color: VOID_BG, music: 'void',
      main: [
        SOLID_ROW,
        WALL_ROW,
        'm..`.................`..m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        'm..........`............m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        'm....."...........".....m',
        LOPEN_ROW,
        LOPEN_ROW,
        SOLID_ROW,
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        spawnAt(3, 16, 1),
        saveAt(2, 15),
        at('sign', 5, 15, 0, { text: 0 }),
        // Up.
        at('gravflip', 8, 15),
        at('sign', 12, 1, 0, { text: 2 }),
        // Down.
        at('gravflip', 16, 1),
        saveAt(20, 15),
      ],
    },

    // ---------------------------------------------------------------- 1 ---
    // Ceiling running for real. The floor from column 6 to column 18 is a
    // spike bed, so the pad at column 5 is not optional -- walking right into
    // it is the only way through.
    //
    // The ceiling course is an ordinary platforming line read upside down:
    // a spike at 7, a one-tile step at 11-12, spikes at 16 and 19. Every one
    // of them is cleared by a jump that travels DOWN the screen, and rows 2
    // and 3 are kept empty across the whole span so that jump always has its
    // two tiles of room.
    {
      gx: 1, gy: 0, color: VOID_BG, music: 'void',
      main: [
        SOLID_ROW,
        'm......v...==...v..v....m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        'm...`...............`...m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        OPEN_ROW,
        OPEN_ROW,
        'mmmmmm^^^^^^^^^^^^^mmmmmm',
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 3, 15, 0, { text: 15 }),
        at('gravflip', 5, 15),
        at('sign', 9, 1, 0, { text: 4 }),
        // Halfway checkpoint. The save stores gravDir, so respawning here
        // puts the fox back on the ceiling rather than dropping her onto
        // thirteen tiles of spikes.
        saveAt(14, 1),
        at('gravflip', 21, 1),
        saveAt(22, 15),
      ],
    },

    // ---------------------------------------------------------------- 2 ---
    // Invisible blocks, with one rule that never breaks: EVERY real block in
    // the pit has a mark floating directly above it in row 12, and nothing
    // else does. The blocks you can see -- the three at row 14 -- are
    // fakeblocks, and they are exactly one tile off the marks. Memorising
    // this room is fine; guessing at it should never be necessary.
    //
    // The low spike ceiling at columns 2-5 is a second, quieter tell: it is
    // a corridor you may only walk through, which forces you to arrive at the
    // pit's edge at ground level, reading the marks head on.
    {
      gx: 2, gy: 0, color: VOID_BG, music: 'void',
      main: [
        SOLID_ROW,
        WALL_ROW,
        'm..`.................`..m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        'm........`.`.`.`........m',
        WALL_ROW,
        '..vvvv...................',
        OPEN_ROW,
        'mmmmmmmm.........mmmmmmmm',
        'mmmmmmmm.........mmmmmmmm',
        'mmmmmmmm.........mmmmmmmm',
      ],
      entities: [
        saveAt(1, 15),
        at('sign', 6, 15, 0, { text: 5 }),
        // The lie: a visible bridge, offset one tile from every mark.
        at('fakeblock', 10, 14, 0, { look: 6 }),
        at('fakeblock', 12, 14, 0, { look: 6 }),
        at('fakeblock', 14, 14, 0, { look: 6 }),
        // The truth: flush with the floor, under the marks.
        at('invisblock', 9, 16, 0, { look: 6 }),
        at('invisblock', 11, 16, 0, { look: 6 }),
        at('invisblock', 13, 16, 0, { look: 6 }),
        at('invisblock', 15, 16, 0, { look: 6 }),
        saveAt(18, 15),
        at('sign', 20, 15, 0, { text: 1 }),
        saveAt(23, 15),
      ],
    },

    // ---------------------------------------------------------------- 3 ---
    // Water columns. Water clamps the sink rate to 2 px and hands back the
    // air jump every tick, so a flooded shaft is a lift: hold jump and rise.
    // Both pillars are eleven tiles tall, far past the 4.5-tile double jump,
    // so the shafts are the only way over them and falling back in costs
    // nothing but time.
    //
    // The ledge at row 3 holds a warp. It is a real shortcut into room 4's
    // arena, entered from the ceiling instead of the door, and column 22 of
    // that room is kept clear from row 2 to the floor so the arrival is a
    // long safe drop rather than a landing inside a wall.
    {
      gx: 3, gy: 0, color: VOID_BG, music: 'void',
      main: [
        SOLID_ROW,
        WALL_ROW,
        WALL_ROW,
        'm....................===m',
        WALL_ROW,
        'm........======....==...m',
        'm.....~~~==....~~~~==...m',
        'm.....~~~==....~~~~==...m',
        'm.....~~~==....~~~~==...m',
        'm.....~~~==....~~~~==...m',
        'm.....~~~==....~~~~==...m',
        'm.....~~~==....~~~~==...m',
        'm.....~~~==....~~~~==...m',
        'm.....~~~==....~~~~==...m',
        '......~~~==....~~~~==....',
        '......~~~==....~~~~==....',
        SOLID_ROW,
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 4, 15, 0, { text: 9 }),
        // On top of the first pillar, once the shaft has done its work.
        saveAt(11, 4),
        at('sign', 21, 2, 0, { text: 3 }),
        at('warp', 22, 2, 0, { room: 4 }),
        saveAt(22, 15),
      ],
    },

    // ---------------------------------------------------------------- 4 ---
    // An open arena, and the first room where the hazards want you personally.
    // Homing cherries wake on a stagger of delays and then track forever at
    // 2 px -- slower than a 3 px walk, so they are outrun rather than
    // out-fought, and they turn the room into a moving maze as they collect
    // behind you.
    //
    // The bouncers are the opposite: perfectly predictable, axis-locked, and
    // fast. Two sweep the ground lane, two fall like pistons through the
    // vertical channels at columns 10 and 18.
    //
    // The spring on the pedestal at columns 8-10 is the escape hatch: it is
    // clear of the shelf above, so it throws the fox to the upper deck when
    // the floor gets crowded.
    {
      gx: 4, gy: 0, color: VOID_BG, music: 'void',
      main: [
        SOLID_ROW,
        WALL_ROW,
        'm..`.................`..m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        'm...====...====.........m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        'm......===.....===......m',
        WALL_ROW,
        '........===..............',
        OPEN_ROW,
        SOLID_ROW,
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(1, 15),
        at('sign', 3, 15, 0, { text: 10 }),
        at('cherryBounce', 2, 15, 0, { speed: 5 }),
        at('cherryHome', 6, 4, 0, { speed: 2, delay: 80 }),
        at('spring', 9, 13, 0, { power: 15 }),
        at('cherryBounce', 10, 2, 1, { speed: 4 }),
        at('cherryHome', 12, 2, 0, { speed: 2, delay: 160 }),
        saveAt(12, 15),
        at('cherryBounce', 18, 6, 1, { speed: 6 }),
        at('cherryHome', 18, 4, 0, { speed: 2, delay: 120 }),
        at('sign', 20, 15, 0, { text: 7 }),
        at('cherryBounce', 21, 10, 2, { speed: 5 }),
        // Where the warp from room 3 lands.
        saveAt(22, 15),
      ],
    },

    // ---------------------------------------------------------------- 5 ---
    // Fan spray. A fan throws `count` shots evenly around the circle, so the
    // safe pocket is never a place -- hostile shots ignore walls entirely --
    // it is the wedge between two spokes. Eight spokes at 45 degrees, and the
    // spin term rotates each wave a further 22.5, which walks the gaps
    // steadily across the floor instead of freezing them over one column.
    //
    // The middle fan spins the other way, so the two patterns cross near
    // column 12: that intersection is the room, and the two spike gaps in
    // the floor are placed under it to stop you sprinting the whole width in
    // one lucky window.
    {
      gx: 5, gy: 0, color: VOID_BG, music: 'void',
      main: [
        SOLID_ROW,
        WALL_ROW,
        'm..`.................`..m',
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
        'm....---...........---..m',
        OPEN_ROW,
        OPEN_ROW,
        'mmmmmmmm^^mmmmm^^mmmmmmmm',
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(1, 15),
        at('sign', 3, 15, 0, { text: 13 }),
        at('fan', 5, 3, 0, { rate: 80, count: 8, speed: 3, spin: 4 }),
        at('fan', 12, 3, 0, { rate: 80, count: 8, speed: 3, spin: -4 }),
        at('refresher', 12, 12),
        saveAt(12, 15),
        at('fan', 19, 3, 0, { rate: 80, count: 8, speed: 3, spin: 4 }),
        at('sign', 21, 15, 0, { text: 11 }),
        saveAt(23, 15),
      ],
    },

    // ---------------------------------------------------------------- 6 ---
    // The gauntlet. Every idea in the world, in one length, in order:
    //
    //   cols 0-9   spike hops, with a homing cherry waking behind you.
    //   col  9     the pad. It fires while you are still airborne, so the
    //              landing you were aiming at becomes a launch -- let go of
    //              right or you will drift into the ceiling course.
    //   cols 9-18  the ceiling course. The step at 11-12 is placed exactly
    //              where the drift ends: it catches an over-committed flip
    //              instead of killing it. Then two hanging spikes, with a
    //              refresher slung under the gap between them, and a piston
    //              bouncing the full height of column 13 that has to be read
    //              before you commit to either jump.
    //   col  18    the pad home. Columns 18-19 are both solid, so a flip that
    //              drifts a tile still lands on ground.
    //   cols 19-24 the last hop, over two spikes, under a fan.
    //
    // It is the hardest room in the game and none of it is hidden. The whole
    // thing is visible from the doorway.
    {
      gx: 6, gy: 0, color: VOID_DEEP, music: 'void',
      main: [
        SOLID_ROW,
        'm..........==.v.v.......m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        'm..`.................`..m',
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        WALL_ROW,
        OPEN_ROW,
        OPEN_ROW,
        'mmmm^^mm^m^^^^^^^^mm^^mmm',
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(1, 15),
        at('sign', 2, 15, 0, { text: 12 }),
        at('cherryHome', 5, 4, 0, { speed: 2, delay: 120 }),
        at('gravflip', 9, 15),
        // First thing you touch on the ceiling, before either spike.
        saveAt(10, 1),
        at('cherryBounce', 13, 8, 3, { speed: 5 }),
        at('sign', 13, 1, 0, { text: 14 }),
        at('refresher', 15, 3),
        at('gravflip', 18, 1),
        saveAt(19, 15),
        at('fan', 22, 3, 0, { rate: 100, count: 6, speed: 3, spin: 6 }),
        at('sign', 23, 15, 0, { text: 8 }),
      ],
    },

    // ---------------------------------------------------------------- 7 ---
    // BOSS: the shadow fox. Pattern 2 replays the player's own position from
    // ninety ticks ago, forty pixels above it, and spits straight down. You
    // cannot dodge it by being clever, because it is you; you dodge it by
    // never standing where you stood a second and a half ago. Standing still
    // is death, running in circles is death, and the only stable answer is a
    // wide continuous loop with shots fired backwards into your own wake.
    //
    // The arena is deliberately symmetrical and deliberately sealed: two
    // one-way shelves at matching heights, walls on both ends, nothing to
    // hide behind. The shelves sit at row 12, four tiles up: a double jump
    // reaches them and nothing higher does, which is exactly the point.
    // 250 HP at one damage a bullet and a four-bullet cap makes this long,
    // so the shelves exist to break the loop up.
    //
    // The goal hangs in the ceiling frame at row 2. Nothing in this room can
    // reach it -- a double jump off a shelf still stops four tiles short --
    // and there is no gravflip in here, which would otherwise hand the player
    // a walk straight to it along the roof.
    {
      gx: 7, gy: 0, color: VOID_DEEP, music: 'boss',
      main: [
        SOLID_ROW,
        'm.......................m',
        'm.......................m',
        'm..`.................`..m',
        'm.......................m',
        'm.......................m',
        'm...."............."....m',
        'm.......................m',
        'm.......................m',
        'm.......................m',
        'm.......................m',
        'm.......................m',
        'm..---.............---..m',
        'm.......................m',
        ROPEN_ROW,
        ROPEN_ROW,
        SOLID_ROW,
        SOLID_ROW,
        SOLID_ROW,
      ],
      entities: [
        saveAt(2, 15),
        at('sign', 4, 15, 0, { text: 6 }),
        at('boss', 12, 8, 0, { pattern: 2, hp: 250 }),
        goalAt(12, 2),
      ],
    },
  ],
})
