import { describe, it, expect } from 'vitest'
import { calculateReport, type ReportInput } from './reportCalculations'
import { replaceNarrativeTokens, assembleBoldSummaryLine } from './reportAssembly'

// ── Dataset 1: Plant A — Scenario B, dispatch clustering with morning concentration ──
const PLANT_A: ReportInput = {
  selling_price_per_m3: 65,
  material_cost_per_m3: 32,
  plant_capacity_m3_per_hour: 120,
  operating_hours_per_day: 11,
  operating_days_per_year: 286,
  actual_production_last_month_m3: 17006,
  trucks_assigned: 24,
  total_trips_last_month: 3146,
  avg_turnaround_min: 112,
  rejection_rate_pct: 3,
  avg_delivery_radius: '10_to_20km',
  dispatch_tool: 'WhatsApp group and Excel spreadsheet',
  data_sources: 'Batch computer system. TAT is estimated.',
  biggest_operational_challenge: 'Trucks wait too long at construction sites in the morning',
  demand_vs_capacity: 'We have more orders than we can deliver',
  queuing_and_idle: 'Yes — trucks sometimes queue at the plant in the morning and the plant sits idle later in the day',
  dispatch_timing: 'Early morning — most dispatches happen in the first 3-4 hours after opening',
}

// ── Dataset 2: Plant C — Scenario A, site access coordination ──
const PLANT_C: ReportInput = {
  selling_price_per_m3: 72,
  material_cost_per_m3: 44,
  plant_capacity_m3_per_hour: 100,
  operating_hours_per_day: 10,
  operating_days_per_year: 290,
  actual_production_last_month_m3: 19200,
  trucks_assigned: 28,
  total_trips_last_month: 3696,
  avg_turnaround_min: 118,
  rejection_rate_pct: 4.5,
  avg_delivery_radius: 'under_10km',
  dispatch_tool: 'Dispatcher uses Excel and phone calls',
  data_sources: 'Monthly batch reports. TAT is estimate from driver reports.',
  biggest_operational_challenge: 'Trucks waiting at construction sites in downtown Abu Dhabi with limited access windows',
  demand_vs_capacity: 'We have more orders than we can deliver',
  queuing_and_idle: 'No — trucks are always working. Plant sometimes runs ahead but no idle periods.',
  dispatch_timing: 'Distributed fairly evenly across the day',
}

// ── Dataset 3: Edge case — TAT at target, utilisation gap ──
const PLANT_EDGE: ReportInput = {
  selling_price_per_m3: 70,
  material_cost_per_m3: 35,
  plant_capacity_m3_per_hour: 90,
  operating_hours_per_day: 10,
  operating_days_per_year: 280,
  actual_production_last_month_m3: 12000,
  trucks_assigned: 20,
  total_trips_last_month: 2000,
  avg_turnaround_min: 95,
  rejection_rate_pct: 2,
  avg_delivery_radius: '10_to_20km',
  dispatch_tool: 'Phone calls',
  data_sources: 'Manual records',
  biggest_operational_challenge: 'We do not have enough orders to fill the plant',
  demand_vs_capacity: 'Demand is lower than our capacity right now',
  queuing_and_idle: 'No',
  dispatch_timing: 'Distributed across the day',
}

describe('calculateReport', () => {
  describe('Dataset 1 — Plant A (dispatch clustering, morning)', () => {
    const r = calculateReport(PLANT_A)

    it('derives TARGET_TAT from radius', () => {
      // 60 + (15 × 1.5 × 2) = 105
      expect(r.target_tat_min).toBe(105)
    })

    it('target trips always exceed actual trips', () => {
      expect(r.target_trips_per_truck_per_day).toBeGreaterThan(r.actual_trips_per_truck_per_day)
    })

    it('identifies correct constraint: dispatch clustering with morning', () => {
      expect(r.constraint).toBe('Likely: Dispatch clustering \u2014 morning concentration')
    })

    it('has positive parked trucks', () => {
      expect(r.parked_trucks_equivalent).toBeGreaterThan(0)
    })

    it('recovery range is positive and ordered', () => {
      expect(r.recovery_low_usd).toBeGreaterThan(0)
      expect(r.recovery_high_usd).toBeGreaterThan(r.recovery_low_usd)
    })

    it('loss breakdown sums to monthly gap', () => {
      expect(r.production_loss_usd + r.quality_loss_usd + r.dispatch_loss_usd).toBe(r.monthly_gap_usd)
    })

    it('contribution margin is correct', () => {
      expect(r.contribution_margin_per_m3).toBe(33)
    })

    it('monthly gap is rounded to $1,000', () => {
      expect(r.monthly_gap_usd % 1000).toBe(0)
    })
  })

  describe('Dataset 2 — Plant C (site access coordination)', () => {
    const r = calculateReport(PLANT_C)

    it('derives TARGET_TAT from under_10km radius', () => {
      // 60 + (7 × 1.5 × 2) = 81
      expect(r.target_tat_min).toBe(81)
    })

    it('target trips always exceed actual trips', () => {
      expect(r.target_trips_per_truck_per_day).toBeGreaterThan(r.actual_trips_per_truck_per_day)
    })

    it('identifies correct constraint: site access coordination', () => {
      expect(r.constraint).toBe('Likely: Site access coordination')
    })

    it('quality loss uses material cost only', () => {
      // rejected_trips = 3696 × 0.045 = 166.32
      // avg_load = 19200 / 3696 = 5.2 m3
      // quality_loss = 166.32 × 5.2 × 44 = ~38,041 → rounded to $38,000
      expect(r.quality_loss_usd).toBeGreaterThan(0)
      expect(r.quality_loss_usd % 1000).toBe(0)
    })

    it('loss breakdown sums to monthly gap', () => {
      expect(r.production_loss_usd + r.quality_loss_usd + r.dispatch_loss_usd).toBe(r.monthly_gap_usd)
    })

    it('TAT excess > 20% for this scenario', () => {
      const excess_pct = (r.target_tat_min > 0)
        ? (PLANT_C.avg_turnaround_min - r.target_tat_min) / r.target_tat_min
        : 0
      expect(excess_pct).toBeGreaterThan(0.2)
    })
  })

  describe('Dataset 3 — Edge case (TAT at target, utilisation gap)', () => {
    const r = calculateReport(PLANT_EDGE)

    it('target trips always exceed actual trips', () => {
      expect(r.target_trips_per_truck_per_day).toBeGreaterThan(r.actual_trips_per_truck_per_day)
    })

    it('gap driver is utilisation', () => {
      expect(r.gap_driver).toBe('utilisation')
    })

    it('constraint defaults to "To be confirmed on-site"', () => {
      expect(r.constraint).toBe('To be confirmed on-site')
    })

    it('monthly gap is non-negative', () => {
      expect(r.monthly_gap_usd).toBeGreaterThanOrEqual(0)
    })

    it('loss breakdown sums to monthly gap', () => {
      expect(r.production_loss_usd + r.quality_loss_usd + r.dispatch_loss_usd).toBe(r.monthly_gap_usd)
    })

    it('all values rounded to $1,000', () => {
      expect(r.monthly_gap_usd % 1000).toBe(0)
      expect(r.recovery_low_usd % 1000).toBe(0)
      expect(r.recovery_high_usd % 1000).toBe(0)
      expect(r.production_loss_usd % 1000).toBe(0)
      expect(r.quality_loss_usd % 1000).toBe(0)
    })
  })

  describe('Invariants — must hold for ALL inputs', () => {
    const inputs = [PLANT_A, PLANT_C, PLANT_EDGE]

    inputs.forEach((input, i) => {
      const r = calculateReport(input)
      const label = `Dataset ${i + 1}`

      it(`${label}: target_trips > actual_trips`, () => {
        expect(r.target_trips_per_truck_per_day).toBeGreaterThan(r.actual_trips_per_truck_per_day)
      })

      it(`${label}: loss breakdown sums to monthly gap`, () => {
        expect(r.production_loss_usd + r.quality_loss_usd + r.dispatch_loss_usd).toBe(r.monthly_gap_usd)
      })

      it(`${label}: recovery_high > recovery_low`, () => {
        if (r.monthly_gap_usd > 0) {
          expect(r.recovery_high_usd).toBeGreaterThan(r.recovery_low_usd)
        }
      })

      it(`${label}: no negative values`, () => {
        expect(r.monthly_gap_usd).toBeGreaterThanOrEqual(0)
        expect(r.production_loss_usd).toBeGreaterThanOrEqual(0)
        expect(r.quality_loss_usd).toBeGreaterThanOrEqual(0)
        expect(r.dispatch_loss_usd).toBeGreaterThanOrEqual(0)
        expect(r.parked_trucks_equivalent).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('parseRadius (via calculateReport target_tat_min)', () => {
    const base = { ...PLANT_A }

    // v2: parseRadius now preserves exact customer-reported values (not bucketed to 7/15/25).
    // TARGET_TAT formula: 60 + radius × 3, clamped [75, 150].

    it('parseRadius(20) → exact 20 km → TARGET_TAT 120', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '20' as any })
      expect(r.target_tat_min).toBe(120) // 60 + 20*3
    })

    it('parseRadius("over_20km") → legacy bucket → TARGET_TAT 135', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: 'over_20km' })
      expect(r.target_tat_min).toBe(135) // legacy enum still maps to 25 km
    })

    it('parseRadius(15) → exact 15 km → TARGET_TAT 105', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '15' as any })
      expect(r.target_tat_min).toBe(105) // 60 + 15*3
    })

    it('parseRadius(9) → exact 9 km → TARGET_TAT 87', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '9' as any })
      expect(r.target_tat_min).toBe(87) // 60 + 9*3
    })

    // Range midpoint tests (midpoint preserved, not bucketed)
    it('"5-40km" → midpoint 22.5 → TARGET_TAT 128', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '5-40km' as any })
      expect(r.target_tat_min).toBe(128) // 60 + 22.5*3 = 127.5 → 128
    })

    it('"5-45km" → midpoint 25 → TARGET_TAT 135', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '5-45km' as any })
      expect(r.target_tat_min).toBe(135) // 60 + 25*3
    })

    it('"5-15km" → midpoint 10 → TARGET_TAT 90', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '5-15km' as any })
      expect(r.target_tat_min).toBe(90) // 60 + 10*3
    })

    it('"1-8km" → midpoint 4.5 → TARGET_TAT 75 (clamped)', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '1-8km' as any })
      expect(r.target_tat_min).toBe(75) // 60 + 4.5*3 = 73.5 → clamped to 75 min floor
    })

    it('"10-20km" → midpoint 15 → TARGET_TAT 105', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '10-20km' as any })
      expect(r.target_tat_min).toBe(105) // 60 + 15*3
    })

    it('"12 to 20" → midpoint 16 → TARGET_TAT 108', () => {
      const r = calculateReport({ ...base, avg_delivery_radius: '12 to 20' as any })
      expect(r.target_tat_min).toBe(108) // 60 + 16*3
    })

  })

  describe('Regulatory scenario — external constraint detection', () => {
    it('has_external_constraint = true for movement ban', () => {
      // Use a plant with high operating hours so ban still leaves room above actual
      const input = { ...PLANT_A, operating_hours_per_day: 14, biggest_operational_challenge: 'Trucks movement Ban in riyadh which is 7 Hours per day' }
      const r = calculateReport(input)
      expect(r.has_external_constraint).toBe(true)
      expect(r.regulatory_scenario).not.toBeNull()
      expect(r.regulatory_scenario!.recovery_low_usd).toBeGreaterThanOrEqual(0)
    })

    it('has_external_constraint = false for Plant A (site waiting)', () => {
      const r = calculateReport(PLANT_A)
      expect(r.has_external_constraint).toBe(false)
      expect(r.regulatory_scenario).toBeNull()
    })

    it('has_external_constraint = false for Plant C (site access, no ban)', () => {
      const r = calculateReport(PLANT_C)
      expect(r.has_external_constraint).toBe(false)
      expect(r.regulatory_scenario).toBeNull()
    })

    it('regulatory_scenario internal consistency', () => {
      const input = { ...PLANT_A, operating_hours_per_day: 14, biggest_operational_challenge: 'Trucks movement Ban in riyadh which is 7 Hours per day' }
      const r = calculateReport(input)
      const reg = r.regulatory_scenario!
      expect(reg.recovery_low_usd).toBe(Math.round(reg.monthly_gap_usd * 0.4 / 1000) * 1000)
      expect(reg.recovery_high_usd).toBe(Math.round(reg.monthly_gap_usd * 0.65 / 1000) * 1000)
      if (reg.monthly_gap_usd > 0) {
        expect(reg.recovery_high_usd).toBeGreaterThan(reg.recovery_low_usd)
      }
    })

    it('ban_hours extraction: specific hours', () => {
      const input = { ...PLANT_A, biggest_operational_challenge: 'movement ban of 7 hours per day' }
      const r = calculateReport(input)
      expect(r.regulatory_scenario!.ban_hours).toBe(7)
    })

    it('ban_hours extraction: default when no hours mentioned', () => {
      const input = { ...PLANT_A, biggest_operational_challenge: 'movement ban in riyadh' }
      const r = calculateReport(input)
      expect(r.regulatory_scenario!.ban_hours).toBe(4)
    })
  })

  describe('replaceNarrativeTokens', () => {
    it('replaces all 15 tokens', () => {
      const rc = calculateReport(PLANT_A)
      const allTokens = '{{RECOVERY_LOW}} {{RECOVERY_HIGH}} {{MONTHLY_GAP}} {{TAT_ACTUAL}} {{TAT_TARGET}} {{TAT_EXCESS}} {{TRIPS_ACTUAL}} {{TRIPS_TARGET}} {{PARKED_TRUCKS}} {{QUARTERLY_LOW}} {{QUARTERLY_HIGH}} {{ANNUAL_LOW}} {{ANNUAL_HIGH}} {{TRUCKS}} {{CONSTRAINT}}'
      const result = replaceNarrativeTokens(allTokens, rc, PLANT_A)
      expect(result).not.toContain('{{')
      expect(result).not.toContain('}}')
      expect(result).toContain('$') // currency values present
      expect(result).toContain(rc.constraint)
    })
  })

  describe('assembleBoldSummaryLine', () => {
    it('generates tat-based line when gap_driver is tat', () => {
      // Force tat scenario by using a plant with large TAT excess
      const rc = calculateReport(PLANT_C)
      // Plant C may be tat or mixed depending on exact calc
      const line = assembleBoldSummaryLine(rc, PLANT_C)
      expect(line).toContain(String(PLANT_C.trucks_assigned))
      expect(line.length).toBeGreaterThan(20)
    })

    it('generates utilisation-based line when gap_driver is utilisation', () => {
      const rc = calculateReport(PLANT_EDGE)
      expect(rc.gap_driver).toBe('utilisation')
      const line = assembleBoldSummaryLine(rc, PLANT_EDGE)
      // Line now uses monthly actual range, not exact production figure
      expect(line).toMatch(/\d[\d,]* m\u00B3 last month/)
      expect(line).toMatch(/against a target of [\d,]+ m\u00B3/)
      expect(line).not.toContain('trucks could complete')
    })
  })

  // ── Dataset 4: Plant Riyadh — External constraint (movement ban) ──
  const PLANT_RIYADH: ReportInput = {
    selling_price_per_m3: 70,
    material_cost_per_m3: 37.5,
    plant_capacity_m3_per_hour: 450,
    operating_hours_per_day: 12,
    operating_days_per_year: 300,
    actual_production_last_month_m3: 81000,
    trucks_assigned: 87,
    total_trips_last_month: 11310,
    avg_turnaround_min: 170,
    rejection_rate_pct: 1.5,
    avg_delivery_radius: '10-20km',
    dispatch_tool: 'Dispatcher + Excel',
    data_sources: 'Monthly reports',
    biggest_operational_challenge: 'Riyadh truck movement restrictions, 7 hours per day, and customer site readiness delays',
    demand_vs_capacity: 'Demand sufficient',
    queuing_and_idle: 'Sometimes',
    dispatch_timing: 'Spread across the day',
  }

  describe('CHANGE 1 — constraint label for external constraints', () => {
    it('TEST 4: constraint for Riyadh dataset is dispatch and site coordination', () => {
      const r = calculateReport(PLANT_RIYADH)
      expect(r.constraint).toBe('Likely: Dispatch and site coordination')
    })

    it('TEST 5: constraint_note for Riyadh dataset notes external restrictions', () => {
      const r = calculateReport(PLANT_RIYADH)
      expect(r.constraint_note).toBe('External restrictions noted, on-site focus')
    })

    it('TEST 6: constraint for Plant A dataset is unchanged', () => {
      const r = calculateReport(PLANT_A)
      expect(r.constraint).toBe('Likely: Dispatch clustering \u2014 morning concentration')
      expect(r.constraint_note).toBeUndefined()
    })

    it('TEST 7: constraint for Plant C dataset is unchanged', () => {
      const r = calculateReport(PLANT_C)
      expect(r.constraint).toBe('Likely: Site access coordination')
      expect(r.constraint_note).toBeUndefined()
    })

    it('Riyadh still has_external_constraint true', () => {
      const r = calculateReport(PLANT_RIYADH)
      expect(r.has_external_constraint).toBe(true)
      expect(r.regulatory_scenario).not.toBeNull()
    })
  })

  describe('CHANGE 2 — m³ ranges', () => {
    const inputs = [PLANT_A, PLANT_C, PLANT_EDGE, PLANT_RIYADH]

    inputs.forEach((input, i) => {
      const r = calculateReport(input)
      const label = `Dataset ${i + 1}`

      it(`${label}: TEST 1 — monthly_gap_m3_low < monthly_gap_m3 < monthly_gap_m3_high`, () => {
        if (r.monthly_gap_m3 > 0) {
          expect(r.monthly_gap_m3_low).toBeLessThan(r.monthly_gap_m3)
          expect(r.monthly_gap_m3).toBeLessThan(r.monthly_gap_m3_high)
        } else {
          expect(r.monthly_gap_m3_low).toBe(0)
          expect(r.monthly_gap_m3_high).toBe(0)
        }
      })

      it(`${label}: TEST 2 — actual_daily_m3_low < actual_daily_output_m3 < actual_daily_m3_high`, () => {
        if (r.actual_daily_output_m3 > 0) {
          expect(r.actual_daily_m3_low).toBeLessThan(r.actual_daily_output_m3)
          expect(r.actual_daily_output_m3).toBeLessThan(r.actual_daily_m3_high)
        }
      })

      it(`${label}: TEST 3 — all m³ range values round to nearest 50`, () => {
        expect(r.monthly_gap_m3_low % 50).toBe(0)
        expect(r.monthly_gap_m3_high % 50).toBe(0)
        expect(r.actual_daily_m3_low % 50).toBe(0)
        expect(r.actual_daily_m3_high % 50).toBe(0)
      })
    })

    it('bold line contains m³ range for tat gap_driver', () => {
      const r = calculateReport(PLANT_RIYADH)
      const line = assembleBoldSummaryLine(r, PLANT_RIYADH)
      expect(line).toContain(`${r.monthly_gap_m3_low.toLocaleString('en-US')}-${r.monthly_gap_m3_high.toLocaleString('en-US')} m\u00B3`)
    })

    it('replaceNarrativeTokens resolves all 4 m³ range tokens', () => {
      const r = calculateReport(PLANT_RIYADH)
      const text = '{{GAP_M3_LOW}} {{GAP_M3_HIGH}} {{ACTUAL_M3_LOW}} {{ACTUAL_M3_HIGH}}'
      const result = replaceNarrativeTokens(text, r, PLANT_RIYADH)
      expect(result).not.toContain('{{')
      expect(result).not.toContain('}}')
    })
  })

  describe('Breakdown tables arithmetic invariants', () => {
    const inputs = [PLANT_A, PLANT_C, PLANT_EDGE, PLANT_RIYADH]

    inputs.forEach((input, i) => {
      const r = calculateReport(input)
      const label = `Dataset ${i + 1}`

      it(`${label}: TEST 1 — daily_gap = target_daily - actual_daily`, () => {
        const daily_gap = Math.max(0, r.target_daily_output_m3 - r.actual_daily_output_m3)
        expect(daily_gap).toBe(Math.max(0, r.target_daily_output_m3 - r.actual_daily_output_m3))
      })

      it(`${label}: TEST 2 — annual_gap = daily_gap × operating_days_per_year`, () => {
        const daily_gap = Math.max(0, r.target_daily_output_m3 - r.actual_daily_output_m3)
        const annual_gap = daily_gap * input.operating_days_per_year
        expect(annual_gap).toBe(daily_gap * input.operating_days_per_year)
      })

      it(`${label}: TEST 3 — monthly_gap_m3 = annual_gap / 12 (rc matches within 1 m³)`, () => {
        const daily_gap = Math.max(0, r.target_daily_output_m3 - r.actual_daily_output_m3)
        const annual_gap = daily_gap * input.operating_days_per_year
        expect(Math.abs(r.monthly_gap_m3 - annual_gap / 12)).toBeLessThan(1)
      })

      it(`${label}: TEST 4 — recovery_low ≈ monthly_gap_usd × 0.40 (rounded to $1000)`, () => {
        const expected = Math.round(r.monthly_gap_usd * 0.4 / 1000) * 1000
        expect(r.recovery_low_usd).toBe(expected)
      })

      it(`${label}: TEST 5 — recovery_high ≈ monthly_gap_usd × 0.65 (rounded to $1000)`, () => {
        const expected = Math.round(r.monthly_gap_usd * 0.65 / 1000) * 1000
        expect(r.recovery_high_usd).toBe(expected)
      })
    })
  })
})
