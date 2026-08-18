import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const S = '/tmp/claude-0/-home-user-Project-Boshy/421ee095-1f96-58ab-a63a-e617a159d304/scratchpad'
const MOD = readFileSync(`${S}/touch.js`, 'utf8')
const EXEC = process.env.SMOKE_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const HTML = `<!doctype html><meta charset=utf8>
<style>
 html,body{margin:0;padding:0;overflow:hidden;background:#07070c;color:#e8e2d4;height:100%}
 #host{position:fixed;inset:0;touch-action:none}
 #game{display:block;width:100%;height:100%}
</style>
<div id="host"><canvas id="game"></canvas></div>
<script type="module">
${MOD}
window.__attach = attachTouch
</script>`

const CASES = [
  { name: 'iPhone 14 landscape, notch LEFT', w: 844, h: 390, ins: { left: 44, right: 0, top: 0, bottom: 21 } },
  { name: 'iPhone 14 landscape, notch RIGHT', w: 844, h: 390, ins: { left: 0, right: 44, top: 0, bottom: 21 } },
  { name: 'iPhone SE landscape (no notch)', w: 667, h: 375, ins: { left: 0, right: 0, top: 0, bottom: 0 } },
  { name: 'Pixel 7 landscape', w: 915, h: 412, ins: { left: 0, right: 0, top: 0, bottom: 0 } },
  { name: 'iPhone 14 PORTRAIT', w: 390, h: 844, ins: { left: 0, right: 0, top: 59, bottom: 34 } },
  { name: 'iPad landscape', w: 1180, h: 820, ins: { left: 0, right: 0, top: 24, bottom: 20 } },
]

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })
const out = []
for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: c.w, height: c.h }, hasTouch: true, isMobile: true })
  await page.setContent(HTML, { waitUntil: 'load' })
  const r = await page.evaluate(async (c) => {
    const VIEW_W = 800, VIEW_H = 608
    const st = document.createElement('style')
    st.textContent = `.fox-touch-probe{padding-left:${c.ins.left}px!important;padding-right:${c.ins.right}px!important;padding-top:${c.ins.top}px!important;padding-bottom:${c.ins.bottom}px!important}`
    document.head.appendChild(st)
    const host = document.getElementById('host')
    const log = []
    const acc = {
      held: 0,
      down(b) { if ((this.held & b) === 0) log.push('+' + b); this.held |= b },
      up(b) { if (this.held & b) log.push('-' + b); this.held &= ~b },
    }
    let reserve = 0
    host.addEventListener('fox:deckresize', (e) => { reserve = e.detail.reservedBottom })
    const ctl = window.__attach(acc, host)
    ctl.setVisible(true)

    // Mimic display.ts exactly.
    const view = (reserved) => {
      const viewW = c.w, viewH = c.h
      const availH = Math.max(1, viewH - reserved)
      const scale = Math.min(viewW / VIEW_W, availH / VIEW_H)
      const gameW = Math.floor(VIEW_W * scale), gameH = Math.floor(VIEW_H * scale)
      return { gameX: Math.floor((viewW - gameW) / 2), gameY: Math.floor((availH - gameH) / 2), gameW, gameH, viewW, viewH }
    }
    // Two passes: layout -> reserve -> shell resizes -> layout again.
    ctl.layout(view(0))
    const r1 = reserve
    const v = view(r1)
    ctl.layout(v)
    const r2 = reserve
    const L = ctl.getLayout()

    // ---- interaction probes -------------------------------------------
    const ev = (type, id, x, y) => {
      const e = new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true, cancelable: true, isPrimary: id === 1 })
      ;(type === 'pointerdown' ? document.getElementById('game') : window).dispatchEvent(e)
    }
    const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2]
    const probes = {}
    const IN_LEFT = 1, IN_RIGHT = 2, IN_JUMP = 4, IN_SHOOT = 8, IN_RESTART = 16

    // steer: press left half, drift far off the pad, still steering
    let [sx, sy] = mid(L.steer)
    ev('pointerdown', 1, L.steer.x + 20, sy)
    probes.steerSeedLeft = !!(acc.held & IN_LEFT)
    ev('pointermove', 1, sx + 300, sy - 200) // way off the pad, over the playfield
    probes.steerHoldsAfterDriftOffPad = !!(acc.held & IN_RIGHT)   // moved right past dead band
    ev('pointermove', 1, sx + 300 - 40, sy - 200)
    probes.steerFlipsBackOnReverse = !!(acc.held & IN_LEFT)
    // jump while steering (multi-touch)
    const [jx, jy] = mid(L.jump)
    ev('pointerdown', 2, jx, jy)
    const [shx, shy] = mid(L.shoot)
    ev('pointerdown', 3, shx, shy)
    probes.threeAtOnce = (acc.held & (IN_LEFT | IN_JUMP | IN_SHOOT)) === (IN_LEFT | IN_JUMP | IN_SHOOT)
    // jump hysteresis: 20 px past the rect is still held, 30 px is not
    ev('pointermove', 2, jx, L.jump.y + L.jump.h + 20)
    probes.jumpHeldAt20pxDrift = !!(acc.held & IN_JUMP)
    ev('pointermove', 2, jx, L.jump.y + L.jump.h + 30)
    probes.jumpReleasedAt30pxDrift = !(acc.held & IN_JUMP)
    probes.steerSurvivesJumpRelease = !!(acc.held & IN_LEFT)
    ev('pointerup', 3, shx, shy)
    probes.steerSurvivesShootUp = !!(acc.held & IN_LEFT)
    ev('pointerup', 1, 0, 0)
    probes.steerReleasedOnUp = !(acc.held & (IN_LEFT | IN_RIGHT))

    // restart: single tap does nothing, double tap fires
    const [rx, ry] = mid(L.restart)
    ev('pointerdown', 4, rx, ry); ev('pointerup', 4, rx, ry)
    probes.restartSingleTapInert = !(acc.held & IN_RESTART) && !log.includes('+16')
    ev('pointerdown', 5, rx, ry); ev('pointerup', 5, rx, ry)
    probes.restartDoubleTapFires = log.includes('+16')
    // restart: hold
    log.length = 0
    ev('pointerdown', 6, rx, ry)
    await new Promise((r) => setTimeout(r, 520))
    probes.restartHoldFires = log.includes('+16')
    ev('pointerup', 6, rx, ry)

    // pause dispatches Escape
    let esc = 0
    window.addEventListener('keydown', (e) => { if (e.code === 'Escape') esc++ })
    const [px, py] = mid(L.pause)
    ev('pointerdown', 7, px, py); ev('pointerup', 7, px, py)
    probes.pauseFiresEscape = esc === 1

    // blur clears a held direction
    ev('pointerdown', 8, sx, sy + 0)
    ev('pointermove', 8, sx + 40, sy)
    const beforeBlur = acc.held
    window.dispatchEvent(new Event('blur'))
    probes.blurClearsHeld = beforeBlur !== 0 && acc.held === 0

    // slop: a press 10 px outside the jump rect still counts
    ev('pointerdown', 9, jx, L.jump.y - 10)
    probes.pressSlopWorks = !!(acc.held & IN_JUMP)
    ev('pointerup', 9, jx, L.jump.y - 10)

    // a press on bare playfield must reach the canvas (menus keep working)
    let canvasSaw = 0
    document.getElementById('game').addEventListener('pointerdown', () => canvasSaw++)
    ev('pointerdown', 10, v.gameX + v.gameW / 2, v.gameY + v.gameH / 2)
    probes.playfieldTapReachesCanvas = canvasSaw === 1
    ev('pointerdown', 11, jx, jy)
    probes.deckTapDoesNotReachCanvas = canvasSaw === 1
    ev('pointerup', 11, jx, jy)

    const el = (cls) => { const e = document.querySelector('.fox-btn--' + cls); return { overlay: e.classList.contains('is-overlay') } }
    return {
      reserveFirstPass: r1, reserveSettled: r2, view: v, layout: L,
      overlay: { steer: el('steer').overlay, jump: el('jump').overlay, shoot: el('shoot').overlay },
      probes, leftover: acc.held,
    }
  }, c)
  out.push({ case: c.name, ...r })
  await page.close()
}
await browser.close()
console.log(JSON.stringify(out, null, 1))
