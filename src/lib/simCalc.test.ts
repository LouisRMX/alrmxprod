/**
 * Tests for simCalc v2: 8 sliders across Operational / Structural / Commercial / Quality groups.
 *
 * Al-Omran Riyadh Region is the primary stress-test fixture. Baseline scenario
 * must equal baseline (identity). Recovery scenarios must match the numbers
 * shown in the pre-assessment report (~$546K for TAT-only, etc.).
 */

import { describe, it, expect } from 'vitest'
import { simCalc, type SimBaseline, type SimScenario } from './calculations'

// ── Al-Omran baseline (from reportCalculations + data sheet) ──
const AL_OMRAN: SimBaseline = {
  cap: 450,
  opH: 14,
  opD: 305,
  mixCap: 7.45,
  turnaround: 170,
  trucks: 87,
  util: 51,
  price: 64.83,
  contrib: 27.25,
  TARGET_TA: 135,
  deliveryRadius: 25,
  avgLoadM3: 7.45,
  materialCost: 37.58,
  plantSiteHandlingMin: 60,
  numberOfPlants: 5,
  truckBanHours: 7,
  demandStatus: 'constrained',
  dispatchTool: 'Phone, WhatsApp, walkie-talkie',
  rejectPct: 1.5,
}

/** Helper: build a scenario matching baseline values (identity scenario). */
function baselineScenario(b: SimBaseline): SimScenario {
  return {
    turnaround: b.turnaround,
    deliveryRadius: b.deliveryRadius,
    plantSiteHandlingMin: b.plantSiteHandlingMin,
    trucks: b.trucks,
    avgLoadM3: b.avgLoadM3,
    price: b.price,
    materialCost: b.materialCost,
    rejectPct: b.rejectPct,
  }
}

describe('simCalc v2: Al-Omran baseline', () => {
  it('baseline scenario produces zero upside (identity)', () => {
    const result = simCalc(AL_OMRAN, baselineScenario(AL_OMRAN))
    expect(result.contribUpside).toBe(0)
    expect(result.deltaVol).toBe(0)
    expect(result.revenueUpside).toBe(0)
  })

  it('baseline scenario daily output matches reported (~3,242 m\u00B3)', () => {
    const result = simCalc(AL_OMRAN, baselineScenario(AL_OMRAN))
    // Expected: 87 trucks × (14×60÷170) trips × 7.45 m\u00b3 ≈ 3,206 m\u00b3/day
    // Allow ±100 m\u00b3 tolerance for rounding in trip calc
    const dailyOutput = result.scenarioMonthly / Math.round(AL_OMRAN.opD / 12)
    expect(dailyOutput).toBeGreaterThan(3000)
    expect(dailyOutput).toBeLessThan(3500)
  })

  it('baseline scenario utilisation ≈ 51%', () => {
    const result = simCalc(AL_OMRAN, baselineScenario(AL_OMRAN))
    expect(result.sUtil).toBeGreaterThanOrEqual(48)
    expect(result.sUtil).toBeLessThanOrEqual(54)
  })
})

describe('simCalc v2: operational scenarios', () => {
  it('TAT fix (170 \u2192 135) produces ~$546K/mo recovery', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), turnaround: 135 }
    const result = simCalc(AL_OMRAN, scenario)

    // Monthly recovery = contribUpside / 12
    const monthlyRecovery = result.contribUpside / 12
    expect(monthlyRecovery).toBeGreaterThan(400_000)
    expect(monthlyRecovery).toBeLessThan(700_000)
  })

  it('TAT fix moves utilisation from 51% to ~64%', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), turnaround: 135 }
    const result = simCalc(AL_OMRAN, scenario)
    expect(result.sUtil).toBeGreaterThanOrEqual(60)
    expect(result.sUtil).toBeLessThanOrEqual(68)
  })

  it('delivery radius 25 \u2192 21 km reduces scenario target TAT', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), deliveryRadius: 21, turnaround: 123 }
    const result = simCalc(AL_OMRAN, scenario)
    // New target TAT = 60 + 21×3 = 123 min
    expect(result.scenarioTargetTA).toBe(123)
    expect(result.contribUpside).toBeGreaterThan(0)
  })

  it('plant/site handling 60 \u2192 80 min pushes target TAT up', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), plantSiteHandlingMin: 80 }
    const result = simCalc(AL_OMRAN, scenario)
    // New target TAT = 80 + 25×3 = 155 min
    expect(result.scenarioTargetTA).toBe(155)
  })
})

describe('simCalc v2: structural scenarios', () => {
  it('add 8 trucks (87 \u2192 95) WITHOUT TAT fix produces smaller recovery', () => {
    const withoutTATFix = { ...baselineScenario(AL_OMRAN), trucks: 95 }
    const withTATFix = { ...baselineScenario(AL_OMRAN), trucks: 95, turnaround: 135 }

    const r1 = simCalc(AL_OMRAN, withoutTATFix)
    const r2 = simCalc(AL_OMRAN, withTATFix)

    // Trucks alone < trucks + TAT together
    expect(r1.contribUpside).toBeLessThan(r2.contribUpside)
  })

  it('avg load 7.45 \u2192 8.0 m\u00B3 increases contribution', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), avgLoadM3: 8.0 }
    const result = simCalc(AL_OMRAN, scenario)
    expect(result.contribUpside).toBeGreaterThan(0)
  })
})

describe('simCalc v2: commercial scenarios', () => {
  it('price increase 64.83 \u2192 70 adds margin without changing volume', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), price: 70 }
    const result = simCalc(AL_OMRAN, scenario)
    expect(result.deltaVol).toBe(0)           // volume unchanged
    expect(result.contribUpside).toBeGreaterThan(0)  // margin up
  })

  it('material cost reduction 37.58 \u2192 35 increases margin', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), materialCost: 35 }
    const result = simCalc(AL_OMRAN, scenario)
    expect(result.contribUpside).toBeGreaterThan(0)
    expect(result.deltaVol).toBe(0)
  })

  it('contribution recomputed from scenario price and material cost', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), price: 70, materialCost: 35 }
    const result = simCalc(AL_OMRAN, scenario)
    expect(result.sContrib).toBeCloseTo(35, 2)
  })
})

describe('simCalc v2: quality scenarios', () => {
  it('rejection 1.5% \u2192 0.5% produces positive rejectDelta', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), rejectPct: 0.5 }
    const result = simCalc(AL_OMRAN, scenario)
    expect(result.rejectDelta).toBeGreaterThan(0)
  })

  it('rejection 1.5% \u2192 3% produces negative rejectDelta (more losses)', () => {
    const scenario = { ...baselineScenario(AL_OMRAN), rejectPct: 3 }
    const result = simCalc(AL_OMRAN, scenario)
    expect(result.rejectDelta).toBeLessThan(0)
  })
})

describe('simCalc v2: combined scenarios', () => {
  it('full recovery (TAT 135 + radius 21 + trucks 95 + load 8) approaches 70% utilisation', () => {
    const scenario: SimScenario = {
      turnaround: 123,
      deliveryRadius: 21,
      plantSiteHandlingMin: 60,
      trucks: 95,
      avgLoadM3: 8.0,
      price: AL_OMRAN.price,
      materialCost: AL_OMRAN.materialCost,
      rejectPct: AL_OMRAN.rejectPct,
    }
    const result = simCalc(AL_OMRAN, scenario)
    expect(result.sUtil).toBeGreaterThanOrEqual(65)
  })
})
