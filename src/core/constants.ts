/**
 * The frozen physics table.
 *
 * Every number here is transcribed from the documented behaviour of the
 * IWBTG-fangame engine lineage (renex2, YoYoYo GMS2.3, Zephyr Edition).
 * Mechanics and constants are not copyrightable; none of this is copied code.
 *
 * UNITS: every value is per 50 Hz tick. Never convert these to per-second.
 * The genre's level geometry is expressed in tick-counts, and rescaling to
 * 60 Hz breaks replay determinism and accumulates drift.
 */

/** Simulation rate. One tick is exactly 20 ms. */
export const TICK_HZ = 50
export const TICK_MS = 1000 / TICK_HZ

// ---------------------------------------------------------------- player ---

/** Downward acceleration, applied AFTER the vspeed clamp and BEFORE moving. */
export const GRAVITY = 0.4
/** Upward velocity of a grounded jump. */
export const JUMP_SPEED = 8.5
/** Upward velocity of the second (air) jump. Deliberately weaker. */
export const DJUMP_SPEED = 7
/** Ground jump + one air jump. */
export const MAX_JUMPS = 2
/** Releasing jump while rising multiplies vspeed by this. Variable jump height. */
export const JUMP_CUT = 0.45
/** Horizontal speed. Instant on/off - no acceleration, no friction, no air drag. */
export const WALK_SPEED = 3
/** Terminal velocity, clamped in BOTH directions. */
export const MAX_VSPEED = 9

/** Player AABB, relative to the origin. 11 x 21 px. */
export const HITBOX_L = -5
export const HITBOX_R = 5
export const HITBOX_T = -12
export const HITBOX_B = 8

/** No coyote time and no input buffering. The genre does not forgive. */
export const COYOTE_TICKS = 0
export const JUMP_BUFFER_TICKS = 0

// ------------------------------------------------------------------ world ---

export const TILE = 32
export const ROOM_W = 25
export const ROOM_H = 19
export const VIEW_W = ROOM_W * TILE // 800
export const VIEW_H = ROOM_H * TILE // 608

// ---------------------------------------------------------------- bullets ---

export const MAX_BULLETS = 4
export const BULLET_SPEED = 16
/** 40 ticks * 16 px = 640 px of range. */
export const BULLET_LIFE = 40
export const BULLET_HALF = 4

// ------------------------------------------------------------------ rules ---

export const SAVE_COOLDOWN = 30
export const DEATH_PARTICLES = 40
/** Falling block starts descending at this speed once armed. */
export const FALLBLOCK_SPEED = 2
export const RISEBLOCK_SPEED = -2
/** Jump refresher pad comes back after 100 ticks. */
export const REFRESHER_RESPAWN = 100

// ------------------------------------------------------------- modifiers ---

/** Ice accelerates toward WALK_SPEED instead of snapping to it. */
export const ICE_ACCEL = 0.2
/** Water clamps sink speed and refreshes the double jump. */
export const WATER_MAX_FALL = 2
export const GRAVITY_LOW = 0.2
export const GRAVITY_HIGH = 0.7
export const VINE_SLIDE_SPEED = 2
export const VINE_JUMP_H = 15
export const VINE_JUMP_V = 9

// ------------------------------------------------------------------ caps ---

export const MAX_ROOMS = 64
export const MAX_ENTITIES_PER_ROOM = 200
export const MAX_ENTITIES_PER_LEVEL = 2000
export const MAX_PROJECTILES = 128
export const MAX_PARTICLES = 120

// --------------------------------------------------------------- derived ---
// These are the design language of the genre. Asserted in tests/physics.spec.ts
// because getting them wrong invalidates every level ever built.

/** Peak of a full single jump: 86.1 px = 2.69 tiles. 3 tiles is NOT clearable. */
export const SINGLE_JUMP_APEX = 86.1
/** Peak of jump + air-jump-at-apex: 143.9 px = 4.497 tiles. The "4.5 block jump". */
export const DOUBLE_JUMP_APEX = 143.9
