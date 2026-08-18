import { DEATH_PARTICLES, MAX_PARTICLES, TILE } from '../core/constants.js'
import { material } from '../core/registry/tileMaterials.js'

/**
 * Purely cosmetic. Deliberately NOT part of the simulation: particles use
 * Math.random freely, which would desync replays if it lived in core/.
 *
 * The death burst is the genre's punctuation mark -- it has to land instantly
 * and read as violent, because it is the thing the player sees more than any
 * other single frame in the game.
 */
export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  grav: number
  life: number
  color: string
  stuck: boolean
  size: number
}

const BLOOD = ['#c81f2a', '#e8323d', '#8c1119', '#ff5060']

export class ParticleField {
  private items: Particle[] = []

  clear(): void {
    this.items.length = 0
  }

  get count(): number {
    return this.items.length
  }

  /** The 40-particle burst: 36 directions, 10 degrees apart. */
  burst(x: number, y: number): void {
    for (let i = 0; i < DEATH_PARTICLES; i++) {
      if (this.items.length >= MAX_PARTICLES) this.items.shift()
      const dir = (Math.floor(Math.random() * 36) * 10 * Math.PI) / 180
      const speed = Math.random() * 6
      this.items.push({
        x, y,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        grav: 0.1 + Math.random() * 0.2,
        life: 150,
        color: BLOOD[Math.floor(Math.random() * BLOOD.length)] as string,
        stuck: false,
        size: Math.random() < 0.3 ? 3 : 2,
      })
    }
  }

  spark(x: number, y: number, color: string, n = 8, spread = 4): void {
    for (let i = 0; i < n; i++) {
      if (this.items.length >= MAX_PARTICLES) this.items.shift()
      const dir = Math.random() * Math.PI * 2
      const speed = Math.random() * spread
      this.items.push({
        x, y,
        vx: Math.cos(dir) * speed,
        vy: Math.sin(dir) * speed,
        grav: 0.15,
        life: 40,
        color,
        stuck: false,
        size: 2,
      })
    }
  }

  /** `main` is the current room's tile layer, so blood sticks to walls. */
  update(main: readonly number[], roomW: number, roomH: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i] as Particle
      p.life--
      if (p.life <= 0) {
        this.items.splice(i, 1)
        continue
      }
      if (p.stuck) continue
      p.vy += p.grav
      const nx = p.x + p.vx
      const ny = p.y + p.vy
      if (solidAt(main, roomW, roomH, nx, ny)) {
        p.stuck = true
        continue
      }
      p.x = nx
      p.y = ny
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
    }
  }
}

function solidAt(main: readonly number[], roomW: number, roomH: number, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE)
  const ty = Math.floor(py / TILE)
  if (tx < 0 || ty < 0 || tx >= roomW || ty >= roomH) return false
  return material(main[ty * roomW + tx] ?? 0).solid
}
