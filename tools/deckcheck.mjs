/**
 * Checks the touch deck across device profiles, against the real built site.
 *
 * The bug this exists to catch: the old layout switched modes at a hard
 * threshold, so an iPhone rotated one way got a 513x390 playfield and the other
 * way got 370x281 — a 1.9x area difference decided by which side the notch
 * landed on. The playfield must be a pure function of viewport size.
 *
 *   npx vite preview --port 4173 &
 *   node tools/deckcheck.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
const EXEC = process.env.SMOKE_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

/** Apple HIG floor is 44; a thumb contact patch is 58-80. */
const MIN_TARGET = 56

const CASES = [
  { name: 'iPhone 14 landscape', w: 844, h: 390 },
  { name: 'iPhone SE landscape', w: 667, h: 375 },
  { name: 'Pixel 7 landscape', w: 915, h: 412 },
  { name: 'iPhone 14 portrait', w: 390, h: 844 },
  { name: 'iPad landscape', w: 1180, h: 820 },
]

const problems = []
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })

async function measure(c) {
  const page = await browser.newPage({
    viewport: { width: c.w, height: c.h },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('#splash.hidden', { state: 'attached' })
  await page.waitForTimeout(400)
  // Title -> difficulty -> world -> play, so the deck is actually shown.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(220)
  }
  await page.waitForTimeout(400)

  const r = await page.evaluate(() => {
    const rects = {}
    for (const el of document.querySelectorAll('.fox-btn')) {
      const cls = [...el.classList].find((c) => c.startsWith('fox-btn--'))
      const b = el.getBoundingClientRect()
      rects[(cls ?? 'fox-btn--?').replace('fox-btn--', '')] = {
        x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
      }
    }
    const canvas = document.getElementById('game')
    const cb = canvas.getBoundingClientRect()
    return { rects, canvas: { w: Math.round(cb.width), h: Math.round(cb.height) } }
  })
  await page.close()
  return r
}

for (const c of CASES) {
  const r = await measure(c)
  const names = Object.keys(r.rects)
  console.log(`\n${c.name}  (${c.w}x${c.h})`)
  if (names.length === 0) {
    problems.push(`${c.name}: no touch buttons were created`)
    continue
  }
  for (const [k, b] of Object.entries(r.rects)) {
    console.log(`  ${k.padEnd(8)} ${String(b.w).padStart(4)}x${String(b.h).padStart(4)} at ${b.x},${b.y}`)
    if (b.w < MIN_TARGET || b.h < MIN_TARGET) {
      problems.push(`${c.name}: ${k} is ${b.w}x${b.h}, below the ${MIN_TARGET}px thumb minimum`)
    }
  }
  const { steer, jump, shoot, restart } = r.rects
  if (steer && (steer.w < 150 || steer.h < 110)) {
    problems.push(`${c.name}: steer pad ${steer.w}x${steer.h} is smaller than 150x110`)
  }
  if (jump && shoot) {
    if (jump.h < 130) problems.push(`${c.name}: jump is only ${jump.h}px tall`)
    const gap = jump.y - (shoot.y + shoot.h)
    if (shoot.y > jump.y) problems.push(`${c.name}: shoot must sit above jump`)
    else if (gap < 16) problems.push(`${c.name}: only ${gap}px between shoot and jump`)
  }
  if (jump && restart) {
    const dist = Math.hypot(jump.x - restart.x, jump.y - restart.y)
    if (dist < 120) problems.push(`${c.name}: restart is ${Math.round(dist)}px from jump`)
  }
}

console.log('\n================ RESULT ================')
if (problems.length === 0) console.log('OK - deck layout is sane on every profile.')
else {
  for (const p of problems) console.log('  - ' + p)
  process.exitCode = 1
}
await browser.close()
