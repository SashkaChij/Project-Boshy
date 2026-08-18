import { describe, it } from 'vitest'
import { world as w1 } from '../src/content/worlds/w1.js'
import { createWorld, loadRoom } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { IN_JUMP, IN_RIGHT } from '../src/core/types.js'

function run(room: number, x0: number, y0: number, rel: number, dj: number, maxTicks = 140) {
  const w = createWorld(w1)
  loadRoom(w, room)
  w.player.x = x0; w.player.y = y0; w.player.vspeed = 0; w.player.onGround = true; w.player.jumps = 2
  let best = { x: x0, y: y0 }
  for (let t = 0; t < maxTicks; t++) {
    let held = IN_RIGHT, pressed = 0, released = 0
    if (t === 0) { pressed |= IN_JUMP; held |= IN_JUMP }
    else if (t < rel) held |= IN_JUMP
    else if (t === rel) released |= IN_JUMP
    if (dj > 0 && t === dj) { pressed |= IN_JUMP; held |= IN_JUMP }
    else if (dj > 0 && t > dj && t < dj + 25) held |= IN_JUMP
    step(w, { held, pressed, released })
    if (w.player.dead) return { dead: true, ...best }
    best = { x: w.player.x, y: w.player.y }
  }
  return { dead: false, ...best }
}

function bestSingle(room: number, x: number, y: number, ok: (p:{x:number;y:number})=>boolean) {
  for (let rel = 1; rel <= 50; rel++) {
    const r = run(room, x, y, rel, 0)
    if (!r.dead && ok(r)) return `SINGLE OK rel=${rel} -> ${r.x.toFixed(1)},${r.y.toFixed(1)}`
  }
  return 'single impossible'
}

describe('single-jump denial + trap confirmation', () => {
  it('r1 3-tile wall must reject a single jump', () => {
    console.log('wall:', bestSingle(1, 250, 503, (p) => p.y < 412 && p.x > 270))
  })
  it('r1 4-tile pit must reject a single jump', () => {
    console.log('pit:', bestSingle(1, 440, 503, (p) => p.x > 585 && p.y > 430 && p.y < 445))
  })
  it('r6 4-tile pit must reject a single jump', () => {
    console.log('r6 pit:', bestSingle(6, 345, 503, (p) => p.x > 490 && p.y > 495))
  })
  it('r2 pit is crossable with ONE cut jump', () => {
    console.log('r2 single:', bestSingle(2, 600, 503, (p) => p.x > 710 && p.y > 495))
  })
  it('r2 full-height jump over the pit is fatal', () => {
    for (const rel of [40, 30, 25, 20, 15, 12, 10, 8]) {
      const r = run(2, 600, 503, rel, 0)
      console.log(`rel=${rel} dead=${r.dead} x=${r.x.toFixed(0)} y=${r.y.toFixed(0)}`)
    }
  })
})
