/**
 * Renders every room of every authored world onto one sheet.
 *
 * Level art is ASCII in a source file. This is the only way to see whether a
 * room is actually a good room: whether the jumps read, whether a spike is
 * where it looks like it is, whether the path from left edge to right edge
 * exists at all.
 *
 *   npx vite --port 5199 &
 *   node tools/levelsheet.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL_ = process.env.SHEET_URL ?? 'http://localhost:5199/tools/levelsheet.html'
const EXEC = process.env.SMOKE_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const OUT = process.env.SMOKE_OUT ?? 'smoke'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.goto(URL_, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.title.startsWith('ready:'), { timeout: 20000 })
console.log('worlds rendered:', (await page.title()).split(':')[1])
await page.screenshot({ path: `${OUT}/levelsheet.png`, fullPage: true })
await browser.close()
