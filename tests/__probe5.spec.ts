import { describe, it } from 'vitest'
import { world as w1 } from '../src/content/worlds/w1.js'
import { createWorld, loadRoom } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { IN_JUMP, IN_RIGHT } from '../src/core/types.js'

/** Walk right off the last stone at t=wait, ride whatever catches you, and see
 *  whether the fox is standing on solid ground past x=740 inside 400 ticks. */
function ferry(wait: number) {
  const w = createWorld(w1)
  loadRoom(w, 5)
  w.player.x = 632; w.player.y = 439; w.player.onGround = true; w.player.jumps = 2
  for (let t = 0; t < 400; t++) {
    let held = 0, pressed = 0, released = 0
    if (t >= wait && w.player.x < 760) held |= IN_RIGHT
    if (t === wait + 60) { pressed |= IN_JUMP; held |= IN_JUMP }
    step(w, { held, pressed, released })
    if (w.player.dead) return `dead@${t}`
    if (w.player.onGround && w.player.x > 745) return `ok@${t}`
  }
  return `stuck y=${w.player.y.toFixed(0)} x=${w.player.x.toFixed(0)}`
}
void IN_JUMP

describe('room 5 ferry', () => {
  it('boards at many different waits', () => {
    console.log([0, 10, 20, 40, 60, 80, 100, 140, 180].map((s) => `${s}:${ferry(s)}`).join('  '))
  })
})
