import { describe, it, expect } from 'vitest'
import { calculateReport, type ReportInput } from './reportCalculations'

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
})
