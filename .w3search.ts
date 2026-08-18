import { world } from './src/content/worlds/w3.js'
import { createWorld, loadRoom } from './src/core/sim/world.js'
import { step } from './src/core/sim/step.js'
import { IN_LEFT, IN_RIGHT, IN_JUMP, type InputFrame } from './src/core/types.js'

// Deterministic PRNG so a pass/fail here is reproducible.
let s = 12345
const rnd = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

function trial(room: number, ticks: number): { reached: number; won: boolean; deadAt: number } {
  const w = createWorld(world)
  loadRoom(w, room)
  w.player.x = 8
  w.player.y = 505
  w.player.gravDir = 1
  w.player.vspeed = 0
  w.player.hspeed = 0
  let dir = 1
  let jump = false
  let prev = 0
  let best = 0
  const inp: InputFrame = { held: 0, pressed: 0, released: 0 }
  for (let t = 0; t < ticks; t++) {
    if (rnd() < 0.05) dir = rnd() < 0.85 ? 1 : rnd() < 0.5 ? 0 : -1
    if (rnd() < 0.14) jump = !jump
    let held = 0
    if (dir > 0) held |= IN_RIGHT
    if (dir < 0) held |= IN_LEFT
    if (jump) held |= IN_JUMP
    inp.held = held
    inp.pressed = held & ~prev
    inp.released = prev & ~held
    prev = held
    step(w, inp)
    if (w.room !== room) return { reached: 800, won: w.won, deadAt: -1 }
    if (w.player.dead) return { reached: best, won: false, deadAt: t }
    if (w.player.x > best) best = w.player.x
  }
  return { reached: best, won: w.won, deadAt: -1 }
}

for (let r = 0; r < 7; r++) {
  let best = 0
  let crossed = 0
  const N = 4000
  for (let i = 0; i < N; i++) {
    const res = trial(r, 900)
    if (res.reached >= 800) crossed++
    if (res.reached > best) best = res.reached
  }
  console.log(`room ${r}: crossings ${crossed}/${N}, best x ${best.toFixed(0)}`)
}
