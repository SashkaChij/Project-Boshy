import { describe, it } from 'vitest'
import { world as w1 } from '../src/content/worlds/w1.js'
import { createWorld, loadRoom } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { IN_JUMP, IN_RIGHT } from '../src/core/types.js'

function run(room: number, x0: number, y0: number, rel: number, dj: number, targetX: number, stopX = 1e9, maxTicks = 160) {
  const w = createWorld(w1)
  loadRoom(w, room)
  w.player.x = x0; w.player.y = y0; w.player.vspeed = 0; w.player.onGround = true; w.player.jumps = 2
  for (let t = 0; t < maxTicks; t++) {
    let held = 0, pressed = 0, released = 0
    if (w.player.x < stopX) held |= IN_RIGHT
    if (t === 0) { pressed |= IN_JUMP; held |= IN_JUMP }
    else if (t < rel) held |= IN_JUMP
    else if (t === rel) released |= IN_JUMP
    if (dj > 0 && t === dj) { pressed |= IN_JUMP; held |= IN_JUMP }
    else if (dj > 0 && t > dj && t < dj + 25) held |= IN_JUMP
    step(w, { held, pressed, released })
    if (w.player.dead) return 'X'
    if (w.player.onGround && w.player.x > targetX) return 'O'
  }
  return '-'
}
const sweep = (f: (r: number) => string, n = 30) =>
  Array.from({ length: n }, (_, i) => f(i + 1)).join('')

describe('windows', () => {
  it('r2 toothed pit: takeoff shelf y=535, land past 672', () => {
    console.log('single   ', sweep((r) => run(2, 603, 535, r, 0, 672)))
    console.log('dj sweep ', [3, 6, 10, 15, 20, 25].map((d) => `${d}:${run(2, 603, 535, 1, d, 672)}`).join(' '))
  })
  it('r2 step down 14->15 and step up 22->23', () => {
    console.log('stepup   ', sweep((r) => run(2, 731, 535, r, 0, 740)))
  })
  it('r3 pillar chain (release right after landing)', () => {
    console.log('g->p8    ', sweep((r) => run(3, 219, 503, r, 0, 264, 300)))
    console.log('p9->p12  ', sweep((r) => run(3, 315, 439, r, 0, 392, 428)))
    console.log('p13->p16 ', sweep((r) => run(3, 443, 439, r, 0, 520, 556)))
    console.log('p17->gnd ', sweep((r) => run(3, 571, 439, r, 0, 648, 700)))
  })
  it('r5 stones 14/15 -> 18/19 (fake middle)', () => {
    console.log('stones   ', sweep((r) => run(5, 507, 439, r, 0, 580, 630)))
    console.log('gnd->st14', sweep((r) => run(5, 411, 503, r, 0, 452, 500)))
  })
  it('r6 pit + hops', () => {
    console.log('hop1     ', sweep((r) => run(6, 155, 503, r, 0, 264, 330)))
    console.log('pit dbl  ', [5, 8, 10, 12, 15, 18].map((d) => `${d}:${run(6, 347, 503, 1, d, 490, 540)}`).join(' '))
    console.log('hop2     ', sweep((r) => run(6, 571, 503, r, 0, 680, 740)))
  })
  it('r1 wall + pit', () => {
    console.log('wall dbl ', [4, 6, 8, 10, 12, 15].map((d) => `${d}:${run(1, 250, 503, 4, d, 270, 340)}`).join(' '))
    console.log('pit dbl  ', [10, 12, 15, 18, 20, 25].map((d) => `${d}:${run(1, 443, 503, 3, d, 585, 690)}`).join(' '))
  })
  it('r0 pit', () => { console.log('r0       ', sweep((r) => run(0, 603, 503, r, 0, 680))) })
})
