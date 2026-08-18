import { describe, it } from 'vitest'
import { emptyLevel, setTile } from '../src/core/level.js'
import { createWorld } from '../src/core/sim/world.js'
import { step } from '../src/core/sim/step.js'
import { IN_JUMP, IN_RIGHT } from '../src/core/types.js'

/** Flat-ground gap test on a synthetic room: how wide a pit can ONE jump clear? */
function flatGap(gapTiles: number, dj: number) {
  const lv = emptyLevel('t', 't')
  const room = lv.rooms[0]!
  for (let tx = 0; tx < 25; tx++) {
    const inGap = tx >= 8 && tx < 8 + gapTiles
    if (!inGap) for (let ty = 16; ty < 19; ty++) setTile(room, 'main', tx, ty, 1)
  }
  room.entities = [{ t: 'spawn', x: 32 * 4 + 16, y: 16 * 32 - 9 }, { t: 'goal', x: 16, y: 16 }]
  for (let rel = 1; rel <= 50; rel++) {
    const w = createWorld(lv)
    w.player.x = 8 * 32 - 5   // right edge flush with the pit
    w.player.y = 503
    w.player.onGround = true; w.player.jumps = 2; w.player.vspeed = 0
    let landed = false
    for (let t = 0; t < 120; t++) {
      let held = IN_RIGHT, pressed = 0, released = 0
      if (t === 0) { pressed |= IN_JUMP; held |= IN_JUMP }
      else if (t < rel) held |= IN_JUMP
      else if (t === rel) released |= IN_JUMP
      if (dj > 0 && t === dj) { pressed |= IN_JUMP; held |= IN_JUMP }
      else if (dj > 0 && t > dj && t < dj + 25) held |= IN_JUMP
      step(w, { held, pressed, released })
      if (w.player.dead) break
      if (w.player.onGround && w.player.x > (8 + gapTiles) * 32) { landed = true; break }
    }
    if (landed) return rel
  }
  return -1
}

describe('flat gap capability', () => {
  it('measures', () => {
    for (const g of [2, 3, 4, 5, 6]) {
      console.log(`gap ${g} tiles: single rel=${flatGap(g, 0)}  double rel=${flatGap(g, 10)}`)
    }
  })
})
