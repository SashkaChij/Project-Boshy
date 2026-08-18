import {
  BULLET_LIFE, BULLET_SPEED, DJUMP_SPEED, GRAVITY, GRAVITY_HIGH, GRAVITY_LOW,
  ICE_ACCEL, JUMP_CUT, JUMP_SPEED, MAX_BULLETS, MAX_JUMPS, MAX_VSPEED,
  VINE_JUMP_H, VINE_JUMP_V, VINE_SLIDE_SPEED, WALK_SPEED, WATER_MAX_FALL,
} from '../constants.js'
import {
  boxBlocked, boxHitsHazard, groundMaterial, isGrounded, playerBox, sampleWater, vineSide,
  type SolidRect,
} from '../collide.js'
import { approach, sign } from '../math.js'
import { IN_JUMP, IN_LEFT, IN_RIGHT, IN_SHOOT, type InputFrame, type World } from '../types.js'

/**
 * One player tick.
 *
 * ORDER IS LOAD-BEARING. Gravity is applied AFTER the terminal-velocity clamp
 * and BEFORE the move, which is why the first frame of a jump displaces 8.1 px
 * rather than 8.5, and why terminal fall displacement is 9.4 rather than 9.0.
 * Change the order and every jump height in the game shifts. tests/physics.spec.ts
 * pins the three numbers this produces (86.1 / 143.9 / 22.9).
 */
export function stepPlayer(w: World, input: InputFrame, solids: readonly SolidRect[]): void {
  const p = w.player
  const main = w.main
  if (p.dead) {
    p.deathTimer++
    return
  }

  const g = p.gravDir
  let box = playerBox(p.x, p.y, g)

  // --- 1. sample the world we are standing in -----------------------------
  p.onGround = isGrounded(main, box, solids, g)
  const gm = groundMaterial(main, box, g)
  p.onIce = p.onGround && gm.slip
  const vine = vineSide(main, box)
  p.onVine = !p.onGround && vine !== 0 ? vine : 0
  p.inWater = sampleWater(main, box)

  // Grounded refills the AIR jump only. A ground jump does not consume it,
  // which is why walking off a ledge leaves you one air jump, not two.
  if (p.onGround) p.jumps = MAX_JUMPS - 1
  if (p.saveCooldown > 0) p.saveCooldown--

  // --- 2. horizontal input ------------------------------------------------
  let dir = 0
  if (input.held & IN_LEFT) dir -= 1
  if (input.held & IN_RIGHT) dir += 1
  if (dir !== 0) p.facing = dir

  if (p.onIce) {
    p.hspeed = approach(p.hspeed, dir * WALK_SPEED, ICE_ACCEL)
  } else {
    // Instant on/off. No acceleration, no friction, no air drag -- getting
    // this "wrong" by adding smoothing is the single most common way a
    // fangame clone stops feeling like one.
    p.hspeed = dir * WALK_SPEED
  }

  // --- 3. jump ------------------------------------------------------------
  let jumpPressed = (input.pressed & IN_JUMP) !== 0
  if (w.assist) {
    // Assist may only REINTERPRET input. It never touches hitboxes,
    // constants or geometry, so the physics under it stays identical.
    if (jumpPressed) w.jumpBuffer = 6
    if (p.onGround) w.coyote = 6
    else if (w.coyote > 0) w.coyote--
    if (w.jumpBuffer > 0) {
      w.jumpBuffer--
      if (p.onGround || w.coyote > 0) jumpPressed = true
    }
  }

  if (jumpPressed) {
    if (p.onVine !== 0) {
      p.hspeed = -p.onVine * VINE_JUMP_H
      p.vspeed = -VINE_JUMP_V * g
      p.jumps = MAX_JUMPS - 1
      w.events.push({ k: 'jump' })
      if (w.assist) w.jumpBuffer = 0
    } else if (p.onGround || (w.assist && w.coyote > 0)) {
      p.vspeed = -JUMP_SPEED * g
      w.events.push({ k: 'jump' })
      if (w.assist) { w.jumpBuffer = 0; w.coyote = 0 }
    } else if (p.jumps > 0) {
      p.vspeed = -DJUMP_SPEED * g
      p.jumps--
      w.events.push({ k: 'djump' })
      if (w.assist) w.jumpBuffer = 0
    }
  }

  // Variable jump height: releasing while still rising cuts the climb.
  // This is the skill expression of the whole genre.
  if ((input.released & IN_JUMP) !== 0 && p.vspeed * g < 0) {
    p.vspeed *= JUMP_CUT
  }

  // --- 4. environment modifiers ------------------------------------------
  if (p.onVine !== 0 && p.vspeed * g > VINE_SLIDE_SPEED) {
    p.vspeed = VINE_SLIDE_SPEED * g
  }
  if (p.inWater !== 0) {
    if (p.vspeed * g > WATER_MAX_FALL) p.vspeed = WATER_MAX_FALL * g
    // Water 1 and 3 refill the air jump every tick; water 2 does not.
    if (p.inWater !== 2) p.jumps = MAX_JUMPS - 1
  }

  // --- 5. clamp, THEN gravity, THEN move ---------------------------------
  if (p.vspeed > MAX_VSPEED) p.vspeed = MAX_VSPEED
  if (p.vspeed < -MAX_VSPEED) p.vspeed = -MAX_VSPEED

  let grav = GRAVITY
  if (w.gravityScale === 1) grav = GRAVITY_LOW
  else if (w.gravityScale === 2) grav = GRAVITY_HIGH
  p.vspeed += grav * g

  // --- 6. move and resolve, X before Y ------------------------------------
  // X first so that running into a wall while falling does not eat the landing.
  let dx = p.hspeed + p.carryX
  if (p.onGround && gm.conveyor !== 0) dx += gm.conveyor
  moveX(w, solids, dx)

  const dy = p.vspeed + p.carryY
  moveY(w, solids, dy)

  p.carryX = 0
  p.carryY = 0

  // --- 7. did we just die? ------------------------------------------------
  box = playerBox(p.x, p.y, p.gravDir)
  if (boxHitsHazard(main, box)) killPlayer(w)
}

function moveX(w: World, solids: readonly SolidRect[], dx: number): void {
  if (dx === 0) return
  const p = w.player
  const g = p.gravDir
  if (boxBlocked(w.main, playerBox(p.x + dx, p.y, g), solids, false, 0)) {
    const s = sign(dx)
    while (!boxBlocked(w.main, playerBox(p.x + s, p.y, g), solids, false, 0)) {
      p.x += s
    }
    p.hspeed = 0
    return
  }
  p.x += dx
}

function moveY(w: World, solids: readonly SolidRect[], dy: number): void {
  if (dy === 0) return
  const p = w.player
  const g = p.gravDir
  const down = dy > 0
  const bottom = () => playerBox(p.x, p.y, g).b

  if (boxBlocked(w.main, playerBox(p.x, p.y + dy, g), solids, down, bottom())) {
    const s = sign(dy)
    while (!boxBlocked(w.main, playerBox(p.x, p.y + s, g), solids, down, bottom())) {
      p.y += s
    }
    if (p.vspeed * g > 0) w.events.push({ k: 'land' })
    p.vspeed = 0
    return
  }
  p.y += dy
}

export function killPlayer(w: World): void {
  const p = w.player
  if (p.dead) return
  p.dead = true
  p.deathTimer = 0
  p.hspeed = 0
  p.vspeed = 0
  w.deaths++
  w.events.push({ k: 'death', x: p.x, y: p.y })
}

/** Fire, if the four-bullet cap allows it. */
export function shoot(w: World, input: InputFrame): void {
  if ((input.pressed & IN_SHOOT) === 0) return
  const p = w.player
  if (p.dead) return
  let live = 0
  for (const b of w.bullets) if (b.alive) live++
  if (live >= MAX_BULLETS) return

  const slot = w.bullets.find((b) => !b.alive)
  const bullet = {
    x: p.x + p.facing * 8,
    y: p.y - 2 * p.gravDir,
    vx: p.facing * BULLET_SPEED,
    life: BULLET_LIFE,
    alive: true,
  }
  if (slot) Object.assign(slot, bullet)
  else w.bullets.push(bullet)
  w.events.push({ k: 'shoot' })
}
