import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

// 2x scale = crisp retina-quality screenshots
await page.setViewportSize({ width: 1280, height: 900 })
await browser.newContext({ deviceScaleFactor: 2 })

// Login via demo
await page.goto('http://localhost:3000/api/demo-login', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

// ── Screen 1: Group dashboard — 3 plants, showing dollar cards ──
try { await page.click('text=All plants', { timeout: 3000 }) } catch {}
await page.waitForTimeout(600)

// Click portfolio size 3
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button')).filter(b => ['1','3','10','20'].includes(b.textContent.trim()))
  if (btns[1]) btns[1].click()
})
await page.waitForTimeout(1500)

// Scroll past the banner/nav to show header stats + plant cards
await page.evaluate(() => window.scrollTo(0, 90))
await page.waitForTimeout(500)

await page.screenshot({
  path: path.join(__dirname, '../public/screen-1-dashboard.png'),
  clip: { x: 100, y: 90, width: 1080, height: 520 },
  scale: 'device',
})
console.log('✓ screen-1-dashboard.png')

// ── Screen 2: Report — Performance Scorecard only ──
await page.evaluate(() => window.scrollTo(0, 0))
await page.click('text=Report', { timeout: 5000 })
await page.waitForTimeout(1800)

await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(300)

await page.screenshot({
  path: path.join(__dirname, '../public/screen-2-report.png'),
  clip: { x: 45, y: 400, width: 980, height: 500 },
  scale: 'device',
})
console.log('✓ screen-2-report.png')

// ── Screen 3: 90-day Track — 12-week trajectory chart + milestones ──
await page.evaluate(() => window.scrollTo(0, 0))
await page.click('text=90-day Track', { timeout: 5000 })
await page.waitForTimeout(1800)

// Scroll to show the chart (past the top VALUE RECOVERED card)
await page.evaluate(() => window.scrollTo(0, 280))
await page.waitForTimeout(500)

await page.screenshot({
  path: path.join(__dirname, '../public/screen-3-tracking.png'),
  clip: { x: 230, y: 255, width: 820, height: 500 },
  scale: 'device',
})
console.log('✓ screen-3-tracking.png')

await browser.close()
console.log('Done.')
