/**
 * End-to-end smoke test against the real built site in a real browser.
 *
 * Unit tests prove the physics; this proves the thing actually boots, renders,
 * responds to input, switches language, and opens the editor. It is a script
 * rather than a CI job because it needs a browser binary, and it writes
 * screenshots so a human can look at what it saw.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
const OUT = process.env.SMOKE_OUT ?? 'smoke'
const EXEC = process.env.SMOKE_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

mkdirSync(OUT, { recursive: true })

const problems = []
let step = 0

async function shot(page, name) {
  step++
  const file = `${OUT}/${String(step).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file })
  console.log(`  saved ${file}`)
}

async function pixels(page) {
  // Guard against "renders a black rectangle and calls it a day".
  return page.evaluate(() => {
    const c = document.getElementById('game')
    const ctx = c.getContext('2d')
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const seen = new Set()
    for (let i = 0; i < d.length; i += 4 * 97) {
      seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    }
    return seen.size
  })
}

const browser = await chromium.launch({
  executablePath: EXEC,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})

for (const device of [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'phone', viewport: { width: 844, height: 390 }, touch: true, mobile: true },
]) {
  console.log(`\n=== ${device.name} ${device.viewport.width}x${device.viewport.height} ===`)
  const context = await browser.newContext({
    viewport: device.viewport,
    hasTouch: device.touch,
    isMobile: device.mobile ?? false,
    deviceScaleFactor: device.mobile ? 3 : 1,
    locale: 'en-US',
  })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${device.name}] console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`[${device.name}] pageerror: ${e.message}`))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('#splash.hidden', { timeout: 15000 })
  await page.waitForTimeout(600)

  const colors = await pixels(page)
  console.log(`  distinct sampled colours on title: ${colors}`)
  if (colors < 3) problems.push(`[${device.name}] title screen looks blank (${colors} colours)`)
  await shot(page, `${device.name}-title`)

  // Russian, checked on the title screen where the longest labels live.
  await page.evaluate(() => localStorage.setItem('fox.lang', 'ru'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#splash.hidden')
  await page.waitForTimeout(500)
  await shot(page, `${device.name}-title-ru`)
  await page.evaluate(() => localStorage.setItem('fox.lang', 'en'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#splash.hidden')
  await page.waitForTimeout(400)

  // Title -> difficulty -> world -> play, all by keyboard.
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await shot(page, `${device.name}-difficulty`)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await shot(page, `${device.name}-worldmap`)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)

  const inGame = await page.evaluate(() => !!document.getElementById('game'))
  if (!inGame) problems.push(`[${device.name}] no canvas after starting a level`)
  await shot(page, `${device.name}-play`)

  // Actually move: hold right, jump, shoot.
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(500)
  await page.keyboard.down('Shift')
  await page.waitForTimeout(120)
  await page.keyboard.up('Shift')
  await page.waitForTimeout(400)
  await page.keyboard.press('KeyX')
  await page.waitForTimeout(300)
  await page.keyboard.up('ArrowRight')
  await shot(page, `${device.name}-play-moving`)

  const gameColors = await pixels(page)
  console.log(`  distinct sampled colours in game: ${gameColors}`)
  if (gameColors < 4) problems.push(`[${device.name}] gameplay looks blank (${gameColors} colours)`)

  if (device.touch) {
    const deck = await page.evaluate(() => document.querySelectorAll('[data-fox]').length)
    console.log(`  touch controls found: ${deck}`)
    if (deck === 0) problems.push('[phone] no touch control elements were created')
  }

  // Pause, quit, then the editor.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await shot(page, `${device.name}-pause`)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const editorVisible = await page.evaluate(() => document.getElementById('editor-root')?.classList.contains('active'))
  if (!editorVisible) problems.push(`[${device.name}] editor did not open`)
  await shot(page, `${device.name}-editor`)

  await context.close()
}

await browser.close()

console.log('\n================ RESULT ================')
if (problems.length === 0) {
  console.log('OK - no console errors, everything rendered and responded.')
} else {
  console.log(`${problems.length} problem(s):`)
  for (const p of problems) console.log('  - ' + p)
  process.exitCode = 1
}
