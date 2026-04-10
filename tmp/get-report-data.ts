import { calc, type Answers } from '../src/lib/calculations'
import { buildValidatedDiagnosis } from '../src/lib/diagnosis-pipeline'

const answers: Answers = {
  plant_cap: '75', op_hours: '12', op_days: '312',
  actual_prod: '15700', working_days_month: '26',
  n_trucks: '20', turnaround: '100 to 125 minutes, slow',
  mixer_capacity: '10', deliveries_day: '80',
  delivery_radius: 'Most deliveries 12 to 20 km, suburban / outer city',
  price_m3: '60', cement_cost: '20', aggregate_cost: '10', admix_cost: '5',
  truck_availability: '16', qualified_drivers: '16',
  order_to_dispatch: '25 to 40 minutes, slow',
  dispatch_tool: 'Spreadsheet combined with WhatsApp',
  route_clustering: 'Sometimes, depends on the dispatcher',
  plant_idle: 'Regularly, most busy periods',
  reject_pct: '2.9',
  reject_cause: 'Even split, roughly equal plant and site causes',
  demand_sufficient: 'Operations, we have more demand than we can currently produce or deliver',
  batch_calibration: '1 to 2 years ago',
  washout_time: '10 to 20 minutes, standard',
  surplus_concrete: '0.2 to 0.5 m\u00B3, moderate',
  partial_load_size: '7',
  partial_load_pct: '25',
  return_liability: 'Clause exists but rarely enforced',
  demurrage_policy: 'Clause exists but rarely enforced',
  typical_month: 'Yes, normal month, representative of typical operations',
} as Answers

const r = calc(answers, { season: 'summer' })
const vd = buildValidatedDiagnosis(r, answers, { country: 'SA', plant: 'Al Noor Riyadh East', date: '2026-04-09' })

const throughput = r.turnaroundLeakMonthly + r.capLeakMonthly
const leakage = r.rejectMaterialLoss + r.partialLeakMonthly + r.surplusLeakMonthly + r.breakdownCostMonthly
const total = throughput + leakage

console.log('=== REPORT DATA ===')
console.log('Constraint:', r.bottleneck)
console.log('TAT:', r.ta, 'min (target', r.TARGET_TA, 'min, excess', r.excessMin, 'min)')
console.log('Fleet daily:', Math.round(r.effectiveUnits * ((r.opH * 60) / r.ta) * r.effectiveMixCap), 'm3/day')
console.log('Plant daily:', Math.round(r.cap * 0.92 * r.opH), 'm3/day')
console.log('Actual daily:', Math.round(r.actual * r.opH), 'm3/day')
console.log('Util:', Math.round(r.util * 100), '%')
console.log('Trucks:', r.trucks, '(effective:', r.effectiveUnits, ')')
console.log('Trips/truck/day:', Math.round((r.opH * 60) / r.ta * 10) / 10)
console.log('MixCap:', r.effectiveMixCap.toFixed(1), 'm3')
console.log('Margin:', r.contribSafe, '$/m3')
console.log('')
console.log('--- THROUGHPUT LOSS ---')
console.log('Turnaround leak:', r.turnaroundLeakMonthly)
console.log('Cap leak:', r.capLeakMonthly)
console.log('Throughput total:', throughput)
console.log('')
console.log('--- ADDITIVE LEAKAGE ---')
console.log('Reject (material):', r.rejectMaterialLoss)
console.log('Partial loads:', r.partialLeakMonthly)
console.log('Surplus:', r.surplusLeakMonthly)
console.log('Breakdown cost:', r.breakdownCostMonthly)
console.log('Leakage total:', leakage)
console.log('')
console.log('--- RECOVERY (not in total) ---')
console.log('Demurrage:', r.demurrageOpportunity)
console.log('')
console.log('TOTAL MONTHLY LOSS:', total)
console.log('Recovery range:', vd.combined_recovery_range.lo, '-', vd.combined_recovery_range.hi)
console.log('')
console.log('--- NARRATIVE ---')
console.log('Verdict:', vd.verdict_cause)
console.log('Narrative:', vd.executive_narrative)
console.log('Claim strength:', vd.claim_strength)
console.log('Lost volume:', vd.lost_volume_m3, 'm3/mo')
console.log('')
console.log('--- ACTIONS ---')
vd.actions.forEach((a, i) => console.log(`${i+1}. [${a.time_horizon}] ${a.text}`))
