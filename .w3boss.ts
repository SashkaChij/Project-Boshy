import { world } from './src/content/worlds/w3.js'
import { createWorld, loadRoom } from './src/core/sim/world.js'
import { step } from './src/core/sim/step.js'
import { IN_LEFT, IN_RIGHT, IN_JUMP, IN_SHOOT, type InputFrame } from './src/core/types.js'

let s = 999
const rnd = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

let minY = 1e9
let cheapWin = 0
let bossKilled = 0
let onShelf = 0
const N = 3000
for (let i = 0; i < N; i++) {
  const w = createWorld(world)
  loadRoom(w, 7)
  w.player.x = 40; w.player.y = 505; w.player.gravDir = 1
  let dir = 1, jump = false, shootF = false, prev = 0
  const inp: InputFrame = { held: 0, pressed: 0, released: 0 }
  for (let t = 0; t < 1200; t++) {
    if (rnd() < 0.06) dir = rnd() < 0.5 ? 1 : -1
    if (rnd() < 0.16) jump = !jump
    if (rnd() < 0.4) shootF = !shootF
    let held = 0
    if (dir > 0) held |= IN_RIGHT; else held |= IN_LEFT
    if (jump) held |= IN_JUMP
    if (shootF) held |= IN_SHOOT
    inp.held = held; inp.pressed = held & ~prev; inp.released = prev & ~held; prev = held
    step(w, inp)
    if (w.player.y < minY) minY = w.player.y
    if (Math.abs(w.player.y - 396) < 6) onShelf++
    if (w.player.dead) break
    if (w.won) {
      const boss = w.entities.find((e) => e.t === 'boss')
      if (boss && boss.alive && boss.hp > 0) cheapWin++
      else bossKilled++
      break
    }
  }
}
console.log(`trials ${N}: highest player y reached = ${minY.toFixed(1)} (goal box top=64 bottom=96); shelf-height samples=${onShelf}; goal-touch wins=${cheapWin}; boss kills=${bossKilled}`)
