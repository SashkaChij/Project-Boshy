import { describe, it } from 'vitest'
import { world as w1 } from '../src/content/worlds/w1.js'
import { createWorld } from '../src/core/sim/world.js'
import { loadRoom } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { IN_JUMP, IN_RIGHT, IN_LEFT } from '../src/core/types.js'

/** Try every combination of: release-tick, second-jump tick, dir-hold, and see
 *  whether the player gets from (x0,y0) to a target predicate alive. */
function probe(room: number, x0: number, y0: number, ok: (p: {x:number;y:number}) => boolean, dirBit = IN_RIGHT, maxTicks = 120) {
  const results: string[] = []
  for (let rel = 1; rel <= 45; rel++) {
    for (let dj = 0; dj <= 60; dj++) {
      for (const delay of [0, 3, 6, 10, 15]) {
        const w = createWorld(w1)
        loadRoom(w, room)
        w.player.x = x0; w.player.y = y0; w.player.vspeed = 0; w.player.onGround = true; w.player.jumps = 2
        let done = false
        for (let t = 0; t < maxTicks; t++) {
          let held = 0, pressed = 0, released = 0
          if (t >= delay) held |= dirBit
          if (t === 0) { pressed |= IN_JUMP; held |= IN_JUMP }
          else if (t < rel) held |= IN_JUMP
          else if (t === rel) released |= IN_JUMP
          if (dj > 0 && t === dj) { pressed |= IN_JUMP; held |= IN_JUMP }
          else if (dj > 0 && t > dj && t < dj + 20) held |= IN_JUMP
          step(w, { held, pressed, released })
          if (w.player.dead) break
          if (ok(w.player)) { done = true; break }
        }
        if (done) { results.push(`rel=${rel} dj=${dj} delay=${delay}`); if (results.length > 3) return results }
      }
    }
  }
  return results
}
void IN_LEFT

describe('w1 reachability probes', () => {
  it('r1: 3-tile wall at cols 8..10 (top y=416) from ground x=250', () => {
    const r = probe(1, 250, 503, (p) => p.x > 270 && p.y < 412 && p.y > 380)
    console.log('R1 wall:', r.slice(0, 3))
  })
  it('r1: 4-tile pit -> ledge top y=448 (cols 18..21)', () => {
    const r = probe(1, 440, 503, (p) => p.x > 585 && p.y > 430 && p.y < 445)
    console.log('R1 pit:', r.slice(0, 3))
  })
  it('r2: short hop over pit 19..21 under spike teeth', () => {
    const r = probe(2, 600, 503, (p) => p.x > 710 && p.y > 495)
    console.log('R2 hop:', r.slice(0, 3))
  })
  it('r2: hop over floor spikes 7..9', () => {
    const r = probe(2, 215, 503, (p) => p.x > 330 && p.y > 495)
    console.log('R2 spikes:', r.slice(0, 3))
  })
  it('r3: ground col6 -> pillar col8 top y=448', () => {
    const r = probe(3, 215, 503, (p) => p.x > 265 && p.y > 430 && p.y < 445)
    console.log('R3 first pillar:', r.slice(0, 3))
  })
  it('r5: stone col14 -> stone col18 (skip the fake)', () => {
    const r = probe(5, 470, 439, (p) => p.x > 585 && p.y > 430 && p.y < 445)
    console.log('R5 stone skip:', r.slice(0, 3))
  })
  it('r6: 4-tile bottomless pit cols 11..14', () => {
    const r = probe(6, 345, 503, (p) => p.x > 490 && p.y > 495)
    console.log('R6 pit:', r.slice(0, 3))
  })
  it('r6: spike hop cols 5..7', () => {
    const r = probe(6, 155, 503, (p) => p.x > 265 && p.y > 495)
    console.log('R6 spikes1:', r.slice(0, 3))
  })
  it('r6: spike hop cols 18..20', () => {
    const r = probe(6, 570, 503, (p) => p.x > 680 && p.y > 495)
    console.log('R6 spikes2:', r.slice(0, 3))
  })
  it('r0: pit cols 19..20', () => {
    const r = probe(0, 600, 503, (p) => p.x > 680 && p.y > 495)
    console.log('R0 pit:', r.slice(0, 3))
  })
})
