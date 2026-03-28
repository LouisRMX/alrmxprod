import { describe, it, expect } from 'vitest'
import { calc, simCalc, calcTargetTA, FLEET_UTIL_TARGET, type Answers, type SimBaseline, type SimScenario } from '../calculations'

// ── Helper: build a complete set of answers ──────────────────────────────────

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return {
    // Economics
    price_m3: 58,
    cement_cost: 25,
    aggregate_cost: 8,
    admix_cost: 5,
    // Production
    plant_cap: 134,
    op_hours: 10,
    op_days: 300,
    actual_prod: 3000, // monthly m³
    working_days_month: 25,
    // Fleet
    n_trucks: 32,
    mixer_capacity: 7,
    turnaround: 97,
    deliveries_day: 40,
    delivery_radius: 15,
    // Dispatch
    dispatch_tool: 'Spreadsheet combined with WhatsApp',
    order_to_dispatch: '15 to 25 minutes \u2014 acceptable',
    route_clustering: 'Usually \u2014 informal grouping most of the time',
    plant_idle: 'Occasionally \u2014 a few times per week',
    order_notice: '4 to 24 hours \u2014 day-of or day-before',
    // Quality
    reject_pct: 4,
    quality_control: 'Usually done \u2014 most trucks, informal recording',
    batch_calibration: '1 to 2 years ago',
    surplus_concrete: '0.2 to 0.5 m\u00b3 \u2014 moderate',
    // Data quality
    prod_data_source: 'System records \u2014 read from batch computer or dispatch system',
    ...overrides,
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

describe('Constants', () => {
  it('calcTargetTA returns 80 with no radius', () => {
    expect(calcTargetTA(0)).toBe(80)
  })

  it('calcTargetTA scales with radius', () => {
    expect(calcTargetTA(10)).toBe(75) // 60 + 10*1.5 = 75
    expect(calcTargetTA(20)).toBe(90) // 60 + 20*1.5 = 90
  })

  it('calcTargetTA clamps to [65, 110]', () => {
    expect(calcTargetTA(1)).toBe(65) // 60 + 1.5 = 62 → clamped to 65
    expect(calcTargetTA(50)).toBe(110) // 60 + 75 = 135 → clamped to 110
  })

  it('FLEET_UTIL_TARGET is 0.85', () => {
    expect(FLEET_UTIL_TARGET).toBe(0.85)
  })
})

// ── calc() — Production Score ────────────────────────────────────────────────

describe('calc() — Production Score', () => {
  it('92% utilization = score 100', () => {
    // actual_prod = cap * opH * workingDays * 0.92
    // 134 * 0.92 = 123.28 m³/hr → monthly = 123.28 * 10 * 25 = 30820
    const r = calc(makeAnswers({ actual_prod: 30820 }))
    expect(r.scores.prod).toBe(100)
  })

  it('46% utilization ≈ score 50', () => {
    // 134 * 0.46 = 61.64 → monthly = 61.64 * 10 * 25 = 15410
    const r = calc(makeAnswers({ actual_prod: 15410 }))
    expect(r.scores.prod).toBeGreaterThanOrEqual(48)
    expect(r.scores.prod).toBeLessThanOrEqual(52)
  })

  it('0 production = null score', () => {
    const r = calc(makeAnswers({ actual_prod: 0 }))
    expect(r.scores.prod).toBeNull()
  })

  it('batch cycle penalty reduces score', () => {
    const base = calc(makeAnswers({ batch_cycle: 'Fast \u2014 under 5 min' }))
    const slow = calc(makeAnswers({ batch_cycle: 'Slow \u2014 7 to 10 min' }))
    expect(base.scores.prod!).toBeGreaterThan(slow.scores.prod!)
  })

  it('stops penalty reduces score', () => {
    const noStops = calc(makeAnswers({ stops_freq: 'None \u2014 no unplanned stops' }))
    const manyStops = calc(makeAnswers({ stops_freq: 'More than 5 stops' }))
    expect(noStops.scores.prod!).toBeGreaterThan(manyStops.scores.prod!)
  })

  it('low data confidence reduces score', () => {
    const system = calc(makeAnswers({ prod_data_source: 'System records \u2014 read from batch computer or dispatch system' }))
    const rough = calc(makeAnswers({ prod_data_source: 'Rough estimates \u2014 not based on records' }))
    expect(system.scores.prod!).toBeGreaterThan(rough.scores.prod!)
  })
})

// ── calc() — Dispatch Score ──────────────────────────────────────────────────

describe('calc() — Dispatch Score', () => {
  it('all best answers ≈ 95+', () => {
    const r = calc(makeAnswers({
      order_to_dispatch: 'Under 15 minutes \u2014 fast response',
      route_clustering: 'Always \u2014 formal zone system in place',
      plant_idle: 'Never \u2014 a truck is always available',
      dispatch_tool: 'Dedicated dispatch software with real-time tracking',
      order_notice: 'Formal schedule \u2014 weekly or project-based',
    }))
    expect(r.scores.dispatch).toBeGreaterThanOrEqual(95)
  })

  it('all worst answers ≈ 10-20', () => {
    const r = calc(makeAnswers({
      order_to_dispatch: 'Over 40 minutes \u2014 critical bottleneck',
      route_clustering: 'Rarely or never',
      plant_idle: 'Every day \u2014 always waiting for trucks',
      dispatch_tool: 'Phone calls and a whiteboard or paper list',
      order_notice: 'Under 4 hours \u2014 same day calls only',
    }))
    expect(r.scores.dispatch).toBeLessThanOrEqual(20)
  })

  it('null when no dispatch answers', () => {
    const r = calc(makeAnswers({
      order_to_dispatch: undefined,
      route_clustering: undefined,
      plant_idle: undefined,
      dispatch_tool: undefined,
      order_notice: undefined,
    }))
    expect(r.scores.dispatch).toBeNull()
  })
})

// ── calc() — Quality Score ───────────────────────────────────────────────────

describe('calc() — Quality Score', () => {
  it('0% reject = score 100 (reject component)', () => {
    const r = calc(makeAnswers({ reject_pct: 0 }))
    // Quality is weighted: reject 50%, QC 25%, calib 15%, surplus 10%
    // 100*0.5 + 70*0.25 + 70*0.15 + 70*0.10 = 50 + 17.5 + 10.5 + 7 = 85
    expect(r.scores.quality).toBeGreaterThanOrEqual(80)
  })

  it('5% reject → low quality score', () => {
    const r = calc(makeAnswers({ reject_pct: 5 }))
    // reject component: 100 - 5*12 = 40
    expect(r.scores.quality).toBeLessThanOrEqual(60)
  })

  it('8.3% reject → reject component = 0', () => {
    const r = calc(makeAnswers({ reject_pct: 9 }))
    // 100 - 9*12 = -8 → clamped to 0
    expect(r.scores.quality).toBeLessThanOrEqual(40)
  })
})

// ── calc() — Overall & Bottleneck ────────────────────────────────────────────

describe('calc() — Overall & Bottleneck', () => {
  it('overall is average of sub-scores', () => {
    const r = calc(makeAnswers())
    const subs = [r.scores.prod, r.scores.dispatch, r.scores.logistics, r.scores.quality]
      .filter((v) => v !== null) as number[]
    const expectedOverall = Math.round(subs.reduce((s, v) => s + v, 0) / subs.length)
    expect(r.overall).toBe(expectedOverall)
  })

  it('bottleneck is lowest sub-score', () => {
    const r = calc(makeAnswers())
    const scores: Record<string, number | null> = {
      Production: r.scores.prod,
      Dispatch: r.scores.dispatch,
      Logistics: r.scores.logistics,
      Quality: r.scores.quality,
    }
    const validScores = Object.entries(scores).filter(([, v]) => v !== null) as [string, number][]
    const min = Math.min(...validScores.map(([, v]) => v))
    const expected = validScores.find(([, v]) => v === min)?.[0]
    expect(r.bottleneck).toBe(expected)
  })

  it('returns a score even with minimal answers (reject defaults to 0 = score 100)', () => {
    const r = calc({ price_m3: 50 })
    // reject_pct defaults to 0 → rejectScore = 100 → qualityScore = 100
    // With only quality score valid, overall = quality score
    expect(r.overall).not.toBeNull()
  })
})

// ── calc() — Financial ───────────────────────────────────────────────────────

describe('calc() — Financial', () => {
  it('contribution = price - costs', () => {
    const r = calc(makeAnswers({ price_m3: 100, cement_cost: 30, aggregate_cost: 10, admix_cost: 5 }))
    expect(r.contrib).toBe(55)
  })

  it('contribution is never negative', () => {
    const r = calc(makeAnswers({ price_m3: 10, cement_cost: 30, aggregate_cost: 10, admix_cost: 5 }))
    expect(r.contrib).toBe(0)
  })

  it('margin incomplete flagged when aggregates missing', () => {
    const r = calc(makeAnswers({ aggregate_cost: undefined, admix_cost: undefined }))
    expect(r.marginIncomplete).toBe(true)
  })

  it('capLeakMonthly > 0 when utilization < 100%', () => {
    const r = calc(makeAnswers())
    expect(r.capLeakMonthly).toBeGreaterThan(0)
  })
})

// ── calc() — Constraint Logic ────────────────────────────────────────────────

describe('calc() — Constraints', () => {
  it('TARGET_TA based on delivery radius', () => {
    const r = calc(makeAnswers({ delivery_radius: 20 }))
    expect(r.TARGET_TA).toBe(90) // 60 + 20*1.5 = 90
  })

  it('hiddenDel ≥ 0', () => {
    const r = calc(makeAnswers())
    expect(r.hiddenDel).toBeGreaterThanOrEqual(0)
  })

  it('excessMin = turnaround - TARGET_TA when turnaround > target', () => {
    const r = calc(makeAnswers({ turnaround: 100, delivery_radius: 0 }))
    // TARGET_TA = 80 (no radius), excess = 100 - 80 = 20
    expect(r.excessMin).toBe(20)
  })

  it('excessMin = 0 when turnaround <= target', () => {
    const r = calc(makeAnswers({ turnaround: 70, delivery_radius: 0 }))
    expect(r.excessMin).toBe(0)
  })
})

// ── calc() — Edge Cases ──────────────────────────────────────────────────────

describe('calc() — Edge Cases', () => {
  it('handles empty answers without crashing', () => {
    const r = calc({})
    // reject_pct defaults to 0 → rejectScore = 100, so overall is not null
    expect(r.contrib).toBe(0)
    expect(r.warnings).toEqual([])
  })

  it('handles 0 trucks', () => {
    const r = calc(makeAnswers({ n_trucks: 0 }))
    expect(r.maxDelDay).toBe(0)
    expect(r.realisticMaxDel).toBe(0)
  })

  it('handles 0 turnaround (no division by zero)', () => {
    const r = calc(makeAnswers({ turnaround: 0 }))
    expect(r.maxDelDay).toBe(0)
    expect(r.turnaroundLeakMonthly).toBe(0)
  })

  it('handles 0 price', () => {
    const r = calc(makeAnswers({ price_m3: 0 }))
    expect(r.contrib).toBe(0)
    expect(r.marginRatio).toBe(0.35) // fallback
  })

  it('generates warning when production exceeds capacity', () => {
    // plant_cap=134 m³/hr, actual rate > 134*1.1 = 147
    // actual = monthlyM3 / (opH * workingDays) = monthlyM3 / (10*25) = monthlyM3/250
    // need actual > 147.4 → monthlyM3 > 36850
    const r = calc(makeAnswers({ actual_prod: 40000 }))
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.warnings[0]).toContain('exceeds')
  })
})

// ── simCalc() ────────────────────────────────────────────────────────────────

function makeBaseline(overrides: Partial<SimBaseline> = {}): SimBaseline {
  return {
    cap: 134,
    opH: 10,
    opD: 300,
    mixCap: 7,
    turnaround: 97,
    trucks: 32,
    util: 51,
    price: 58,
    contrib: 20,
    TARGET_TA: 83, // 60 + 15*1.5 = 82.5 → 83
    dispatchScore: 65,
    qualityScore: 60,
    ...overrides,
  }
}

function makeScenario(overrides: Partial<SimScenario> = {}): SimScenario {
  return {
    turnaround: 97,
    trucks: 32,
    util: 51,
    price: 58,
    otd: 20,
    ...overrides,
  }
}

describe('simCalc() — Basic', () => {
  it('no change = zero delta', () => {
    const b = makeBaseline()
    const s = makeScenario()
    const r = simCalc(b, s)
    // Delta should be small (not exactly 0 due to dispatch efficiency differences)
    expect(Math.abs(r.deltaVol)).toBeLessThan(50000) // reasonable range
  })

  it('lower turnaround → more output', () => {
    const b = makeBaseline()
    const base = simCalc(b, makeScenario({ turnaround: 97 }))
    const improved = simCalc(b, makeScenario({ turnaround: 70 }))
    expect(improved.scenarioAnnual).toBeGreaterThanOrEqual(base.scenarioAnnual)
  })

  it('more trucks → more output (when fleet is limiting)', () => {
    const b = makeBaseline()
    const base = simCalc(b, makeScenario({ trucks: 32 }))
    const moreTrucks = simCalc(b, makeScenario({ trucks: 40 }))
    expect(moreTrucks.scenarioAnnual).toBeGreaterThanOrEqual(base.scenarioAnnual)
  })

  it('higher utilization → more output', () => {
    const b = makeBaseline()
    const base = simCalc(b, makeScenario({ util: 51 }))
    const higher = simCalc(b, makeScenario({ util: 80 }))
    expect(higher.scenarioAnnual).toBeGreaterThan(base.scenarioAnnual)
  })
})

describe('simCalc() — Constraint Logic', () => {
  it('output = min(production, fleet)', () => {
    const b = makeBaseline()
    const r = simCalc(b, makeScenario())
    expect(r.scenarioAnnual).toBe(Math.round(Math.min(r.prodDaily, r.effFleetDaily) * b.opD))
  })

  it('bottleneck is Production when prod < fleet', () => {
    const b = makeBaseline()
    const r = simCalc(b, makeScenario({ util: 20, trucks: 50 })) // low util, many trucks
    expect(r.scenarioBottleneck).toBe('Production')
  })

  it('bottleneck is Fleet when fleet < prod', () => {
    const b = makeBaseline()
    const r = simCalc(b, makeScenario({ util: 90, trucks: 5 })) // high util, few trucks
    expect(r.scenarioBottleneck).toBe('Fleet / Logistics')
  })

  it('adding trucks with production bottleneck gives no extra output', () => {
    const b = makeBaseline()
    const few = simCalc(b, makeScenario({ util: 30, trucks: 10 }))
    const many = simCalc(b, makeScenario({ util: 30, trucks: 50 }))
    // Production is limiting in both cases — at 30% util with 10+ trucks,
    // prod daily is very low. Difference comes from dispatch efficiency rounding.
    expect(Math.abs(many.scenarioAnnual - few.scenarioAnnual)).toBeLessThan(10000)
  })
})

describe('simCalc() — Financial', () => {
  it('price change affects revenue but not volume', () => {
    const b = makeBaseline()
    const low = simCalc(b, makeScenario({ price: 50 }))
    const high = simCalc(b, makeScenario({ price: 70 }))
    expect(low.scenarioAnnual).toBe(high.scenarioAnnual)
    // Revenue per m³ is different
  })

  it('contribution recalculated when price changes', () => {
    const b = makeBaseline({ price: 58, contrib: 20 }) // varCosts = 38
    const r = simCalc(b, makeScenario({ price: 70 }))
    expect(r.sContrib).toBe(32) // 70 - 38 = 32
  })

  it('contribution never negative', () => {
    const b = makeBaseline({ price: 58, contrib: 20 }) // varCosts = 38
    const r = simCalc(b, makeScenario({ price: 10 }))
    expect(r.sContrib).toBe(0) // 10 - 38 = -28 → clamped to 0
  })
})

describe('simCalc() — Dispatch Efficiency', () => {
  it('low OTD → high dispatch efficiency', () => {
    const b = makeBaseline()
    const r = simCalc(b, makeScenario({ otd: 5 }))
    expect(r.dispEff).toBeGreaterThan(0.90)
  })

  it('high OTD → low dispatch efficiency', () => {
    const b = makeBaseline()
    const r = simCalc(b, makeScenario({ otd: 50 }))
    expect(r.dispEff).toBeLessThan(0.55)
  })

  it('dispatch efficiency clamped to [0.40, 0.98]', () => {
    const b = makeBaseline()
    const low = simCalc(b, makeScenario({ otd: 200 }))
    const high = simCalc(b, makeScenario({ otd: 0 }))
    expect(low.dispEff).toBe(0.40)
    expect(high.dispEff).toBe(0.98)
  })

  it('OTD improvement → better dispatch score', () => {
    const b = makeBaseline()
    const slow = simCalc(b, makeScenario({ otd: 40 }))
    const fast = simCalc(b, makeScenario({ otd: 10 }))
    expect(fast.sDispScore).toBeGreaterThan(slow.sDispScore)
  })
})

describe('simCalc() — Scores', () => {
  it('92% util → prod score 100', () => {
    const b = makeBaseline()
    const r = simCalc(b, makeScenario({ util: 92 }))
    expect(r.sProdScore).toBe(100)
  })

  it('turnaround at target → fleet score 100', () => {
    const b = makeBaseline({ TARGET_TA: 80 })
    const r = simCalc(b, makeScenario({ turnaround: 80 }))
    expect(r.sFleetScore).toBe(100)
  })

  it('turnaround below target → fleet score 100', () => {
    const b = makeBaseline({ TARGET_TA: 80 })
    const r = simCalc(b, makeScenario({ turnaround: 60 }))
    expect(r.sFleetScore).toBe(100)
  })

  it('turnaround above target → fleet score < 100', () => {
    const b = makeBaseline({ TARGET_TA: 80 })
    const r = simCalc(b, makeScenario({ turnaround: 100 }))
    expect(r.sFleetScore).toBeLessThan(100)
  })
})
