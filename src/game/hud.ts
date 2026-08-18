import { VIEW_H, VIEW_W } from '../core/constants.js'
import { ENTITY_DEFS, prop } from '../core/registry/entityDefs.js'
import type { World } from '../core/types.js'
import { formatTicks, t, tp } from '../i18n/index.js'
import { drawText, measureText } from '../platform/text.js'

/**
 * The death counter and the timer are never hidden.
 *
 * That permanence is the genre's whole attitude: the game keeps a running
 * tally of your failure in the corner of the screen and does not offer to
 * turn it off. It is also, in practice, the main feedback loop -- players
 * measure a room by how many deaths it cost.
 */
export function drawHud(ctx: CanvasRenderingContext2D, w: World): void {
  const deaths = tp('hud.deaths', w.deaths)
  const time = formatTicks(w.tick)

  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, VIEW_W, 30)

  drawText(ctx, deaths, 12, 8, { scale: 2, color: '#ff6b6b', shadow: '#000' })
  drawText(ctx, time, VIEW_W - 12, 8, { scale: 2, color: '#e8e2d4', align: 'right', shadow: '#000' })

  if (w.assist) {
    const label = t('hud.assist')
    const x = VIEW_W / 2 - measureText(label, { scale: 2 }) / 2
    drawText(ctx, label, x, 8, { scale: 2, color: '#6fd3ff', shadow: '#000' })
  }

  drawBossBar(ctx, w)

  if (w.player.dead) drawDeathOverlay(ctx, w)
}

function drawBossBar(ctx: CanvasRenderingContext2D, w: World): void {
  const boss = w.entities.find((e) => e.t === 'boss' && e.alive)
  if (!boss) return
  const def = ENTITY_DEFS['boss']
  const max = Math.max(1, prop(def, boss.p, 'hp'))
  const frac = Math.max(0, Math.min(1, boss.hp / max))

  const barW = VIEW_W - 160
  const x = 80
  const y = VIEW_H - 34

  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(x - 4, y - 4, barW + 8, 22)
  ctx.fillStyle = '#2a1418'
  ctx.fillRect(x, y, barW, 14)
  ctx.fillStyle = frac > 0.66 ? '#e8323d' : frac > 0.33 ? '#ff8c2a' : '#ffd23f'
  ctx.fillRect(x, y, Math.round(barW * frac), 14)
  drawText(ctx, t('hud.boss'), x, y - 20, { scale: 2, color: '#ff6b6b', shadow: '#000' })
}

function drawDeathOverlay(ctx: CanvasRenderingContext2D, w: World): void {
  // Deliberately faint and brief. A full-screen "YOU DIED" card would break
  // the sub-second retry loop that makes the genre bearable.
  const a = Math.min(0.35, w.player.deathTimer / 40)
  ctx.fillStyle = `rgba(120,0,0,${a})`
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  if (w.player.deathTimer > 12) {
    drawText(ctx, t('death.hint'), VIEW_W / 2, VIEW_H / 2 + 60, {
      scale: 2, align: 'center', color: '#ffb0b0', shadow: '#000',
    })
  }
}
