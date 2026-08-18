import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const S = '/tmp/claude-0/-home-user-Project-Boshy/421ee095-1f96-58ab-a63a-e617a159d304/scratchpad'
const MOD = readFileSync(`${S}/touch.js`, 'utf8')
const EXEC = process.env.SMOKE_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const HTML = `<!doctype html><meta charset=utf8><style>html,body{margin:0;height:100%;overflow:hidden}#host{position:fixed;inset:0}#game{display:block;width:100%;height:100%}</style><div id="host"><canvas id="game"></canvas></div><script type="module">${MOD}
window.__attach = attachTouch</script>`
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 900, height: 500 } })
await page.setContent(HTML, { waitUntil: 'load' })
const bad = await page.evaluate(() => {
  const VIEW_W = 800, VIEW_H = 608
  const host = document.getElementById('host')
  const acc = { held: 0, down(b) { this.held |= b }, up(b) { this.held &= ~b } }
  let reserve = 0
  host.addEventListener('fox:deckresize', (e) => { reserve = e.detail.reservedBottom })
  const ctl = window.__attach(acc, host)
  ctl.setVisible(true)
  const st = document.createElement('style'); document.head.appendChild(st)
  const bad = []
  const inset = (i) => { st.textContent = `.fox-touch-probe{padding-left:${i[0]}px!important;padding-right:${i[1]}px!important;padding-top:${i[2]}px!important;padding-bottom:${i[3]}px!important}` }
  const view = (w, h, reserved) => {
    const availH = Math.max(1, h - reserved)
    const scale = Math.min(w / VIEW_W, availH / VIEW_H)
    const gw = Math.floor(VIEW_W * scale), gh = Math.floor(VIEW_H * scale)
    return { gameX: Math.floor((w - gw) / 2), gameY: Math.floor((availH - gh) / 2), gameW: gw, gameH: gh, viewW: w, viewH: h }
  }
  const inter = (a, b, pad) => a.x - pad < b.x + b.w + pad && a.x + a.w + pad > b.x - pad && a.y - pad < b.y + b.h + pad && a.y + a.h + pad > b.y - pad
  const INSETS = [[0,0,0,0],[44,0,0,21],[0,44,0,21],[0,0,59,34],[34,34,0,21]]
  for (let w = 300; w <= 1400; w += 13) {
    for (let h = 300; h <= 1000; h += 11) {
      for (const ins of INSETS) {
        inset(ins)
        ctl.layout(view(w, h, 0)); const r1 = reserve
        ctl.layout(view(w, h, r1)); const r2 = reserve
        const L = ctl.getLayout()
        const keys = ['steer', 'jump', 'shoot', 'restart', 'pause']
        const tag = `${w}x${h} ins[${ins}]`
        if (r1 !== r2) bad.push(`${tag}: reserve not stable ${r1}->${r2}`)
        for (const k of keys) {
          const r = L[k]
          if (r.w < 56 || r.h < 56) bad.push(`${tag}: ${k} ${r.w}x${r.h} below 56`)
          if (r.x < 0 || r.y < 0 || r.x + r.w > w || r.y + r.h > h) bad.push(`${tag}: ${k} outside viewport ${r.x},${r.y},${r.w},${r.h}`)
        }
        if ((L.steer.w < 150 && L.jump.x - (L.steer.x + L.steer.w) > 20) || L.steer.h < 120) bad.push(`${tag}: steer ${L.steer.w}x${L.steer.h} under 150x120`)
        if (L.jump.h < 140 && h > 360) bad.push(`${tag}: jump h ${L.jump.h}`)
        if (L.jump.y - (L.shoot.y + L.shoot.h) < 20) bad.push(`${tag}: shoot/jump gap ${L.jump.y - (L.shoot.y + L.shoot.h)}`)
        if (L.shoot.y + L.shoot.h > L.jump.y) bad.push(`${tag}: shoot not above jump`)
        if (L.restart.x < 24 || L.restart.y < 24 || w - (L.restart.x + L.restart.w) < 24) bad.push(`${tag}: restart too close to edge`)
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
          if (inter(L[keys[i]], L[keys[j]], 12)) bad.push(`${tag}: ${keys[i]} and ${keys[j]} padded rects overlap`)
        }
        if (bad.length > 40) return bad
      }
    }
  }
  return bad
})
await browser.close()
console.log(bad.length ? bad.slice(0, 40).join('\n') : 'SWEEP CLEAN')
console.log('violations:', bad.length)
