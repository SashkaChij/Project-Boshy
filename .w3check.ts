import { world } from './src/content/worlds/w3.js'
import { createWorld } from './src/core/sim/world.js'
import { step } from './src/core/sim/step.js'
import { IN_LEFT, IN_RIGHT, IN_JUMP, type InputFrame } from './src/core/types.js'
import { ROOM_W, ROOM_H, TILE } from './src/core/constants.js'
import { material } from './src/core/registry/tileMaterials.js'

// --- static geometry audit -------------------------------------------------
const CH = ['.', '#', '=', 'B', 'b', 'M', 'm', '-', '[', ']', '~', 'W', 'w', 'i', '<', '>', '^', 'v', '(', ')', ',', "'", '"', '`']
world.rooms.forEach((r, i) => {
  const g = (tx: number, ty: number) => r.layers.main[ty * ROOM_W + tx] ?? 0
  const rows: string[] = []
  for (let y = 0; y < ROOM_H; y++) {
    let s = ''
    for (let x = 0; x < ROOM_W; x++) s += CH[g(x, y)]
    rows.push(s)
  }
  const leftOpen = [14, 15].every((y) => !material(g(0, y)).solid)
  const rightOpen = [14, 15].every((y) => !material(g(ROOM_W - 1, y)).solid)
  console.log(`room ${i} gx=${r.x} leftOpen=${leftOpen} rightOpen=${rightOpen} ents=${r.entities.length}`)
  // saves / spawns must be in free air with support
  for (const e of r.entities) {
    const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE)
    if (e.t === 'save' || e.t === 'spawn') {
      const m = material(g(tx, ty))
      if (m.solid || m.hazard) console.log(`  !! ${e.t} in tile ${tx},${ty} = ${CH[g(tx, ty)]}`)
      const below = material(g(tx, ty + 1))
      const above = material(g(tx, ty - 1))
      if (!below.solid && !above.solid) console.log(`  ?? ${e.t} at ${tx},${ty} has no floor below and no ceiling above`)
      if (below.hazard || above.hazard) console.log(`  ?? ${e.t} at ${tx},${ty} adjacent hazard`)
    }
    if (e.t === 'gravflip') {
      // the column it launches along must be clear of solids/hazards
      const dir = ty > 8 ? -1 : 1
      for (let y = ty + dir; y > 0 && y < ROOM_H - 1; y += dir) {
        const m = material(g(tx, y))
        if (m.hazard) { console.log(`  !! gravflip ${tx},${ty} launch column hits hazard at ${tx},${y}`); break }
        if (m.solid) { console.log(`  gravflip ${tx},${ty} launch lands on solid at ${tx},${y}`); break }
      }
    }
  }
  void rows
})

// --- scripted traversal ----------------------------------------------------
function run(label: string, startRoom: number, plan: [number, string][]): void {
  const w = createWorld(world)
  // teleport into the room under test at its left doorway
  if (startRoom !== 0) {
    const { loadRoom } = require('./src/core/sim/world.js')
    void loadRoom
  }
  const inp: InputFrame = { held: 0, pressed: 0, released: 0 }
  let prevHeld = 0
  let t = 0
  for (const [ticks, keys] of plan) {
    for (let k = 0; k < ticks; k++) {
      let held = 0
      if (keys.includes('R')) held |= IN_RIGHT
      if (keys.includes('L')) held |= IN_LEFT
      if (keys.includes('J')) held |= IN_JUMP
      inp.held = held
      inp.pressed = held & ~prevHeld
      inp.released = prevHeld & ~held
      prevHeld = held
      step(w, inp)
      t++
      if (w.player.dead) { console.log(`${label}: DIED at t=${t} room=${w.room} x=${w.player.x.toFixed(0)} y=${w.player.y.toFixed(0)}`); return }
    }
  }
  console.log(`${label}: alive t=${t} room=${w.room} x=${w.player.x.toFixed(0)} y=${w.player.y.toFixed(0)} grav=${w.player.gravDir} onGround=${w.player.onGround}`)
}

// Room 0: walk right onto the flip pad, ride to the ceiling, walk to the
// second pad, come back down, walk out the right door.
run('room0 walk right 200', 0, [[200, 'R']])
run('room0 walk right 400', 0, [[400, 'R']])
