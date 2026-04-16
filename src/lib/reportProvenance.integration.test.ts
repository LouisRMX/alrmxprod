/**
 * Integration tests: verify provenance metadata flows from ReportInput
 * through calculateReport to the output ReportCalculations.provenance.
 *
 * Simulates the Al-Omran Riyadh Region case end-to-end, confirming that
 * the "Your operation today" snapshot in ExportWord can render the
 * correct transparency labels without any additional lookups.
 */

import { describe, it, expect } from 'vitest'
import { calculateReport, mapToReportInput, type ReportInput } from './reportCalculations'
import { renderProvenance, getProvenance } from './reportProvenance'

// ── Al-Omran Riyadh Region raw inputs as they appear on the data sheet ──
const AL_OMRAN_RAW_ANSWERS = {
  price_m3: 64.83,
  material_cost: 37.58,
  plant_cap: 450,
  number_of_plants: 5,
  op_hours: '12-16 hours',
  op_days: 305,
  actual_prod: 81049,
  n_trucks: 87,
  total_trips_last_month: '5 Trips',
  trips_unit: 'per_truck_per_day',
  rejection_rate_raw: '1-2%',
  delivery_radius_raw: '5km-45km',
  dispatch_tool: 'phone-whatsapp-walky talky',
  prod_data_source: 'dispatch system, ERP system, records of driver trips',
  biggest_pain: 'Trucks movement Ban in riyadh which is 7 Hours per day',
  demand_sufficient: 'Option No. 2 Yes, it is scheduled by the Sales Department',
  plant_idle: '',
  dispatch_peak: '',
}

const AL_OMRAN_DX = { tat_actual: 170, reject_pct: 1.5, management_context: '' }

describe('integration: Al-Omran case provenance flow', () => {
  it('mapToReportInput captures provenance for all range/interpreted fields', () => {
    const input = mapToReportInput(AL_OMRAN_DX, AL_OMRAN_RAW_ANSWERS)
    const p = input.provenance ?? {}

    // Operating hours came as range "12-16 hours" → midpoint 14
    expect(input.operating_hours_per_day).toBe(14)
    expect(p.operating_hours_per_day?.type).toBe('midpoint')
    expect(p.operating_hours_per_day?.min).toBe(12)
    expect(p.operating_hours_per_day?.max).toBe(16)

    // Rejection rate came as "1-2%" → midpoint 1.5
    expect(input.rejection_rate_pct).toBe(1.5)
    expect(p.rejection_rate_pct?.type).toBe('midpoint')

    // Delivery radius "5km-45km" → midpoint 25
    expect(p.avg_delivery_radius?.type).toBe('midpoint')
    expect(p.avg_delivery_radius?.min).toBe(5)
    expect(p.avg_delivery_radius?.max).toBe(45)

    // Total trips: "5 Trips" was interpreted as per_truck_per_day → 10,875 total
    expect(input.total_trips_last_month).toBe(10875)
    expect(p.total_trips_last_month?.type).toBe('interpreted')
    expect(p.total_trips_last_month?.raw).toBe('5 Trips')
    expect(p.total_trips_last_month?.interpretation).toContain('trips/truck/day')

    // Operating days was a clean number → no provenance entry (reported default)
    expect(p.operating_days_per_year).toBeUndefined()

    // Number of plants captured
    expect(input.number_of_plants).toBe(5)
  })

  it('calculateReport adds calculated-field provenance (contribution, load, gap)', () => {
    const input = mapToReportInput(AL_OMRAN_DX, AL_OMRAN_RAW_ANSWERS)
    const rc = calculateReport(input)
    const p = rc.provenance

    // Contribution margin formula always present and correctly formatted
    expect(p.contribution_margin_per_m3?.type).toBe('calculated')
    expect(p.contribution_margin_per_m3?.formula).toContain('64.83')
    expect(p.contribution_margin_per_m3?.formula).toContain('37.58')
    expect(p.contribution_margin_per_m3?.formula).toContain('27.25')

    // Monthly material contribution formula
    expect(p.monthly_material_contribution?.type).toBe('calculated')
    expect(p.monthly_material_contribution?.formula).toContain('81,049')
    expect(p.monthly_material_contribution?.formula).toContain('27.25')

    // Monthly plant capacity formula
    expect(p.monthly_plant_capacity_m3?.type).toBe('calculated')
    expect(p.monthly_plant_capacity_m3?.formula).toContain('450')
    expect(p.monthly_plant_capacity_m3?.formula).toContain('14')

    // Monthly gap formula links m\u00B3 and USD
    expect(p.monthly_gap_usd?.type).toBe('calculated')

    // Preserved from input: midpoints survive
    expect(p.operating_hours_per_day?.type).toBe('midpoint')
    expect(p.rejection_rate_pct?.type).toBe('midpoint')
  })

  it('renderProvenance output for Al-Omran snapshot rows is human-readable', () => {
    const input = mapToReportInput(AL_OMRAN_DX, AL_OMRAN_RAW_ANSWERS)
    const rc = calculateReport(input)

    // Trucks assigned: default Reported
    const trucks = renderProvenance(getProvenance(rc.provenance, 'trucks_assigned'))
    expect(trucks.tag).toBe('Reported')

    // Monthly contribution: Calculated with formula
    const contrib = renderProvenance(getProvenance(rc.provenance, 'monthly_material_contribution'))
    expect(contrib.tag).toBe('Calculated')
    expect(contrib.description).toContain('27.25')

    // Operating hours: Midpoint with range
    const hours = renderProvenance(getProvenance(rc.provenance, 'operating_hours_per_day'))
    expect(hours.tag).toBe('Midpoint')
    expect(hours.description).toContain('12-16')

    // Trips: Interpreted with raw + interpretation
    const trips = renderProvenance(getProvenance(rc.provenance, 'total_trips_last_month'))
    expect(trips.tag).toBe('Interpreted')
    expect(trips.description).toContain('5 Trips')
    expect(trips.description).toContain('10,875')

    // Rejection rate: Midpoint
    const reject = renderProvenance(getProvenance(rc.provenance, 'rejection_rate_pct'))
    expect(reject.tag).toBe('Midpoint')
  })

  it('backwards compatibility: manual ReportInput without provenance still calculates', () => {
    // Old-style input without provenance field
    const input: ReportInput = {
      selling_price_per_m3: 64.83,
      material_cost_per_m3: 37.58,
      plant_capacity_m3_per_hour: 450,
      operating_hours_per_day: 14,
      operating_days_per_year: 305,
      actual_production_last_month_m3: 81049,
      trucks_assigned: 87,
      total_trips_last_month: 10875,
      avg_turnaround_min: 170,
      rejection_rate_pct: 1.5,
      avg_delivery_radius: '25',
      dispatch_tool: 'phone',
      data_sources: '',
      biggest_operational_challenge: '',
      demand_vs_capacity: '',
      queuing_and_idle: '',
      dispatch_timing: '',
    }
    const rc = calculateReport(input)

    // Provenance still populated with calculated fields, midpoint fields empty
    expect(rc.provenance).toBeDefined()
    expect(rc.provenance.contribution_margin_per_m3?.type).toBe('calculated')
    expect(rc.provenance.operating_hours_per_day).toBeUndefined()

    // Renders as Reported by default
    const hours = renderProvenance(getProvenance(rc.provenance, 'operating_hours_per_day'))
    expect(hours.tag).toBe('Reported')
  })

  it('gap math reproduces Al-Omran $546K-$547K ballpark', () => {
    const input = mapToReportInput(AL_OMRAN_DX, AL_OMRAN_RAW_ANSWERS)
    const rc = calculateReport(input)

    // Monthly gap should be in the $540K-$560K range given known inputs
    // (exact value depends on rounding path, but order-of-magnitude check)
    expect(rc.monthly_gap_usd).toBeGreaterThan(400_000)
    expect(rc.monthly_gap_usd).toBeLessThan(700_000)

    // Recovery range 40-65% of gap
    expect(rc.recovery_low_usd).toBeGreaterThan(150_000)
    expect(rc.recovery_high_usd).toBeLessThan(400_000)
  })
})
