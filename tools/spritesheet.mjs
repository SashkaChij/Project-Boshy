/**
 * Renders every sprite onto one labelled contact sheet.
 *
 * Sprite data is authored as text, so a diff tells you a row changed but not
 * whether the fox still looks like a fox. Run this after touching the art:
 *
 *   npx vite --port 5199 &
 *   node tools/spritesheet.mjs        # writes smoke/spritesheet.png
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL_ = process.env.SHEET_URL ?? 'http://localhost:5199/tools/spritesheet.html'
const EXEC = process.env.SMOKE_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const OUT = process.env.SMOKE_OUT ?? 'smoke'

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1180, height: 1400 } })
await page.goto(URL_, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.title.startsWith('ready:'))
const count = (await page.title()).split(':')[1]
await page.screenshot({ path: `${OUT}/spritesheet.png`, fullPage: true })
await browser.close()
console.log(`rendered ${count} sprites to ${OUT}/spritesheet.png`)
