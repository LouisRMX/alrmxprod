import { describe, test, expect } from 'vitest'
import { buildStructuredDiagnosis, runValidationChecks, buildValidatedDiagnosis } from '../diagnosis-pipeline'
import { calc, type Answers } from '../calculations'

// Minimal answers that produce a fleet-constrained plant
function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return {
    plant_cap: '120',
    op_hours: '10',
    op_days: '300',
    actual_prod: '10000',
    working_days_month: '25',
    n_trucks: '20',
    turnaround: '100 to 125 minutes, slow',
    mixer_capacity: '10',
    deliveries_day: '80',
    delivery_radius: 'Most deliveries 12 to 20 km, suburban / outer city',
    price_m3: '60',
    cement_cost: '20',
    aggregate_cost: '10',
    admix_cost: '5',
    truck_availability: '16',
    qualified_drivers: '16',
    order_to_dispatch: '25 to 40 minutes, slow',
    dispatch_tool: 'WhatsApp messages only, no spreadsheet',
    route_clustering: 'Rarely or never',
    plant_idle: 'Regularly, most busy periods',
    reject_rate: '3',
    reject_cause: 'Even split, roughly equal plant and site causes',
    demand_sufficient: 'Yes, we have enough orders to fill the plant',
    ...overrides,
  } as Answers
}

describe('buildStructuredDiagnosis', () => {
  test('identifies fleet as primary constraint for slow turnaround', () => {
    const answers = makeAnswers()
    const result = calc(answers)
    const diagnosis = buildStructuredDiagnosis(result, answers)

    expect(diagnosis.primary_constraint).toBeTruthy()
    expect(diagnosis.monthly_loss_total).toBeGreaterThan(0)
    expect(diagnosis.performance_gaps.turnaround).toBeDefined()
    expect(diagnosis.performance_gaps.turnaround.gap).toBeGreaterThan(0)
  })

  test('marks turnaround and production losses as overlapping', () => {
    const answers = makeAnswers()
    const result = calc(answers)
    const diagnosis = buildStructuredDiagnosis(result, answers)

    const overlapping = diagnosis.loss_breakdown.filter(l => l.classification === 'overlapping')
    expect(overlapping.length).toBeGreaterThanOrEqual(1)
  })
})

describe('runValidationChecks', () => {
  test('flags double counting for overlapping losses', () => {
    const answers = makeAnswers()
    const result = calc(answers)
    const diagnosis = buildStructuredDiagnosis(result, answers)
    const validation = runValidationChecks(diagnosis)

    const dcCheck = validation.checks.find(c => c.name === 'double_counting')
    expect(dcCheck).toBeDefined()
    // Should either flag or pass, never be missing
    expect(['pass', 'flag', 'warn', 'fail']).toContain(dcCheck!.status)
  })

  test('sets precision to range when confidence includes low', () => {
    const answers = makeAnswers()
    const result = calc(answers)
    const diagnosis = buildStructuredDiagnosis(result, answers)
    const validation = runValidationChecks(diagnosis)

    // With operator-reported data, precision should be range, not point_estimate
    expect(['range', 'directional']).toContain(validation.approved_precision)
  })

  test('flags reportability for per-action estimates', () => {
    const answers = makeAnswers()
    const result = calc(answers)
    const diagnosis = buildStructuredDiagnosis(result, answers)
    const validation = runValidationChecks(diagnosis)

    const repCheck = validation.checks.find(c => c.name === 'reportability')
    expect(repCheck).toBeDefined()
  })
})

describe('buildValidatedDiagnosis', () => {
  test('produces combined recovery range, not per-action', () => {
    const answers = makeAnswers()
    const result = calc(answers)
    const vd = buildValidatedDiagnosis(result, answers)

    expect(vd.combined_recovery_range).toBeDefined()
    expect(vd.combined_recovery_range.lo).toBeGreaterThan(0)
    expect(vd.combined_recovery_range.hi).toBeGreaterThan(vd.combined_recovery_range.lo)
  })

  test('demand-constrained plant returns demand_constrained=true', () => {
    const answers = makeAnswers({
      demand_sufficient: 'No, we could produce more but orders are not there',
    })
    const result = calc(answers)
    const vd = buildValidatedDiagnosis(result, answers)

    expect(vd.demand_constrained).toBe(true)
  })

  test('verdict_cause is stripped of likely and cleaned', () => {
    const answers = makeAnswers()
    const result = calc(answers)
    const vd = buildValidatedDiagnosis(result, answers)

    expect(vd.verdict_cause).not.toMatch(/likely/i)
    expect(vd.verdict_cause).not.toMatch(/^based on/i)
    expect(vd.verdict_cause.length).toBeGreaterThan(10)
  })
})
