/**
 * Every type in the pure core is plain, structurally-clonable data.
 * No classes with methods, no closures held on state, no DOM handles --
 * a World must survive structuredClone() and JSON round-trips so that
 * replays, save states and headless verification all work.
 */

// ------------------------------------------------------------------ input ---

export const IN_LEFT = 1 << 0
export const IN_RIGHT = 1 << 1
export const IN_JUMP = 1 << 2
export const IN_SHOOT = 1 << 3
export const IN_RESTART = 1 << 4
export const IN_SUICIDE = 1 << 5

/**
 * Edge-latched input for exactly one tick.
 *
 * `pressed` and `released` are sticky flags set by the host's event handlers
 * and cleared once the simulator consumes them. Without this, a jump tap that
 * begins and ends between two 20 ms ticks would vanish entirely -- and the
 * release edge is what drives variable jump height, so it would vanish twice.
 */
export interface InputFrame {
  held: number
  pressed: number
  released: number
}

export function emptyInput(): InputFrame {
  return { held: 0, pressed: 0, released: 0 }
}

// ----------------------------------------------------------------- player ---

export interface Player {
  x: number
  y: number
  hspeed: number
  vspeed: number
  /** Jumps remaining. Refilled to MAX_JUMPS on landing. */
  jumps: number
  facing: number
  onGround: boolean
  dead: boolean
  /** Ticks since death; the shell uses it for the respawn delay. */
  deathTimer: number
  /** 1 = normal, -1 = flipped. Gravity flip is a genre staple. */
  gravDir: number
  /** 0 = none, else the water tile id currently containing the player. */
  inWater: number
  /** -1 clinging to a wall on the left, 1 on the right, 0 free. */
  onVine: number
  /** Ticks left of the save-point flash cooldown. */
  saveCooldown: number
  /** Set while standing on ice, which replaces instant hspeed with acceleration. */
  onIce: boolean
  /** Horizontal carry from conveyors and moving platforms, applied once. */
  carryX: number
  carryY: number
}

// ---------------------------------------------------------------- runtime ---

export interface Entity {
  /** Registry id, e.g. "cherry", "turret". */
  t: string
  x: number
  y: number
  vx: number
  vy: number
  /** Spawn position, restored when the room resets. */
  ox: number
  oy: number
  /** Direction / variant selector. */
  d: number
  /** Author-set properties, only non-defaults are serialized. */
  p: Record<string, number>
  /** Per-entity state machine slot. */
  state: number
  timer: number
  /** Phase accumulator for periodic motion, in SIN_LUT steps. */
  phase: number
  hp: number
  alive: boolean
}

export interface Bullet {
  x: number
  y: number
  vx: number
  life: number
  alive: boolean
}

/** Hostile projectiles, kept separate from player bullets. */
export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  kind: number
  alive: boolean
}

// ----------------------------------------------------------------- events ---

/**
 * The core cannot play a sound or spawn a particle -- it has no host. It
 * appends events here and the shell drains them after each tick.
 */
export type GameEvent =
  | { k: 'jump' }
  | { k: 'djump' }
  | { k: 'shoot' }
  | { k: 'death'; x: number; y: number }
  | { k: 'save'; x: number; y: number }
  | { k: 'blockbreak'; x: number; y: number }
  | { k: 'bosshit'; x: number; y: number }
  | { k: 'bossdie'; x: number; y: number }
  | { k: 'room'; index: number }
  | { k: 'win' }
  | { k: 'land' }

// ------------------------------------------------------------------ level ---

export interface LevelMeta {
  title: string
  author: string
  created: number
  /** Author's own 1-5 rating. Purely informational. */
  difficulty: number
  tags: string[]
  verifiedStrict: boolean
  verifiedAssist: boolean
  clearMs: number
}

export interface RoomBg {
  color: string
  art: string
  par: number
}

export interface EntitySpawn {
  t: string
  x: number
  y: number
  d?: number
  p?: Record<string, number>
}

export interface RoomLayers {
  bg: number[]
  main: number[]
  fg: number[]
}

export interface Room {
  /** Position on the integer world grid, not in pixels. */
  x: number
  y: number
  bg: RoomBg
  music: string
  layers: RoomLayers
  entities: EntitySpawn[]
}

export interface LevelData {
  format: string
  v: number
  id: string
  meta: LevelMeta
  tileset: string
  tile: number
  roomW: number
  roomH: number
  rooms: Room[]
  start: { room: number }
}

// ------------------------------------------------------------------ world ---

export interface SaveState {
  room: number
  x: number
  y: number
  gravDir: number
  tick: number
}

export const DIFF_MEDIUM = 0
export const DIFF_HARD = 1
export const DIFF_VHARD = 2
export const DIFF_IMPOSSIBLE = 3

export interface World {
  level: LevelData
  /** Index into level.rooms. */
  room: number
  player: Player
  entities: Entity[]
  bullets: Bullet[]
  projectiles: Projectile[]
  /** Ticks elapsed since the run started. The on-screen timer. */
  tick: number
  deaths: number
  rng: { s: number }
  save: SaveState | null
  events: GameEvent[]
  won: boolean
  difficulty: number
  /**
   * Assist may ONLY reinterpret input (jump buffering, coyote ticks,
   * slow motion). It must never touch hitboxes, constants or geometry,
   * otherwise the test matrix doubles permanently.
   */
  assist: boolean
  /** Cached main layer of the current room; the hot path in collision. */
  main: number[]
  /** Ticks of assist-mode jump buffer remaining, 0 in strict mode. */
  jumpBuffer: number
  coyote: number
  /** 0 = normal gravity, 1 = low, 2 = high. Set by gravity zones. */
  gravityScale: number
  /** Vertical auto-scroll, in px per tick. 0 when inactive. */
  scrollSpeed: number
  scrollY: number
  /** Screen shake magnitude; cosmetic, but lives here so replays match. */
  shake: number
  /** Trailing player positions, used by the mirror boss. */
  bossMirror: { x: number; y: number }[]
}
