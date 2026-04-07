// Run with: node scripts/take-screenshots.js
const { chromium } = require('playwright-core')
const path = require('path')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })

  // Login via demo
  await page.goto('http://localhost:3000/api/demo-login', { waitUntil: 'networkidle' })
  await page.waitForURL('**/demo**', { timeout: 10000 })

  // ── Screen 1: Group dashboard ──
  // Click portfolio size 3
  try {
    await page.click('text=3', { timeout: 3000 })
    await page.waitForTimeout(800)
  } catch {}

  // Scroll to show the plant cards
  await page.evaluate(() => window.scrollTo(0, 200))
  await page.waitForTimeout(500)

  await page.screenshot({
    path: path.join(__dirname, '../public/screen-1-dashboard.png'),
    clip: { x: 0, y: 0, width: 1280, height: 700 },
  })
  console.log('✓ screen-1-dashboard.png')

  // ── Screen 2: Report tab ──
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.click('text=Report', { timeout: 5000 })
  await page.waitForTimeout(1500)

  await page.screenshot({
    path: path.join(__dirname, '../public/screen-2-report.png'),
    clip: { x: 0, y: 0, width: 1280, height: 700 },
  })
  console.log('✓ screen-2-report.png')

  // ── Screen 3: 90-day Track tab ──
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.click('text=90-day Track', { timeout: 5000 })
  await page.waitForTimeout(1500)

  await page.screenshot({
    path: path.join(__dirname, '../public/screen-3-tracking.png'),
    clip: { x: 0, y: 0, width: 1280, height: 700 },
  })
  console.log('✓ screen-3-tracking.png')

  await browser.close()
  console.log('All screenshots saved.')
})()
