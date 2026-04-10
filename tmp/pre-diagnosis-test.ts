import { calc, type Answers, type CalcOverrides } from '../src/lib/calculations'
import { buildValidatedDiagnosis } from '../src/lib/diagnosis-pipeline'

const PRE_OVERRIDES: CalcOverrides = { estimatedInputs: true }

function run(name: string, answers: Answers) {
  const r = calc(answers, { season: 'summer' }, PRE_OVERRIDES)
  const vd = buildValidatedDiagnosis(r, answers)
  const throughput = r.turnaroundLeakMonthly + r.capLeakMonthly
  const leakage = r.rejectMaterialLoss + r.partialLeakMonthly + r.surplusLeakMonthly + r.breakdownCostMonthly
  const total = throughput + leakage
  const recovLo = Math.round(total * 0.40)
  const recovHi = Math.round(total * 0.65)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${name}`)
  console.log(`${'='.repeat(60)}`)
  console.log(`\nInputs:`)
  console.log(`  Plant cap: ${answers.plant_cap} m3/hr | OpH: ${answers.op_hours} | OpD: ${answers.op_days}`)
  console.log(`  Trucks: ${answers.n_trucks} (avail: ${answers.truck_availability || 'all'})`)
  console.log(`  TAT: ${answers.turnaround}`)
  console.log(`  Production: ${answers.actual_prod} m3/mo | Deliveries: ${answers.deliveries_day}/day`)
  console.log(`  Price: $${answers.price_m3}/m3 | Margin: $${r.contribSafe}/m3`)
  console.log(`  MixCap nominal: ${answers.mixer_capacity || 7} | Effective: ${r.effectiveMixCap.toFixed(1)}`)
  console.log(`\nOutput:`)
  console.log(`  Constraint:       ${r.bottleneck}`)
  console.log(`  TAT:              ${r.ta} min (target ${r.TARGET_TA} min)`)
  console.log(`  Util:             ${Math.round(r.util * 100)}%`)
  console.log(`  Fleet daily:      ${Math.round(r.effectiveUnits * ((r.opH * 60) / r.ta) * r.effectiveMixCap)} m3/day`)
  console.log(`  Plant daily:      ${Math.round(r.cap * 0.92 * r.opH)} m3/day`)
  console.log(`  Actual daily:     ${Math.round(r.actual * r.opH)} m3/day`)
  console.log(`  Throughput loss:   $${throughput.toLocaleString()}/mo`)
  console.log(`  Leakage:          $${leakage.toLocaleString()}/mo`)
  console.log(`  TOTAL LOSS:       $${total.toLocaleString()}/mo`)
  console.log(`  Recoverable:      $${recovLo.toLocaleString()}-$${recovHi.toLocaleString()}/mo`)
  if (r.warnings.length > 0) {
    console.log(`\n  ⚠ WARNINGS:`)
    r.warnings.forEach(w => console.log(`    - ${w}`))
  }
  return { total, throughput, leakage }
}

// ══════════════════════════════════════════════════════════════
// CASE 1: Clean data (consistent inputs)
// ══════════════════════════════════════════════════════════════

const case1: Answers = {
  plant_cap: '75', op_hours: '12', op_days: '312', working_days_month: '26',
  actual_prod: '15700',
  n_trucks: '20', truck_availability: '16', qualified_drivers: '16',
  turnaround: '100 to 125 minutes, slow',
  mixer_capacity: '10', deliveries_day: '80',
  delivery_radius: 'Most deliveries 12 to 20 km, suburban / outer city',
  price_m3: '60', cement_cost: '20', aggregate_cost: '10', admix_cost: '5',
  reject_pct: '2.9', reject_cause: 'Even split, roughly equal plant and site causes',
  demand_sufficient: 'Operations, we have more demand than we can currently produce or deliver',
  partial_load_size: '7', partial_load_pct: '25',
  surplus_concrete: '0.2 to 0.5 m\u00B3, moderate',
  order_to_dispatch: '25 to 40 minutes, slow',
  dispatch_tool: 'Spreadsheet combined with WhatsApp',
  route_clustering: 'Sometimes, depends on the dispatcher',
  plant_idle: 'Regularly, most busy periods',
  typical_month: 'Yes, normal month, representative of typical operations',
  batch_calibration: '1 to 2 years ago',
  washout_time: '10 to 20 minutes, standard',
  return_liability: 'Clause exists but rarely enforced',
  demurrage_policy: 'Clause exists but rarely enforced',
} as Answers

const c1 = run('CASE 1: Clean data (internally consistent)', case1)

// Sensitivity: change TAT from "slow" (112) to "acceptable" (90)
console.log('\n--- Sensitivity: TAT slow → acceptable ---')
const c1b = run('CASE 1b: TAT changed to acceptable', { ...case1, turnaround: '80 to 100 minutes, acceptable' } as Answers)
console.log(`\n  DELTA: $${(c1.total - c1b.total).toLocaleString()}/mo (${Math.round((c1.total - c1b.total) / c1.total * 100)}% change)`)

// ══════════════════════════════════════════════════════════════
// CASE 2: Realistic estimated data (slightly inconsistent)
// ══════════════════════════════════════════════════════════════

const case2: Answers = {
  plant_cap: '80', op_hours: '10', op_days: '300', working_days_month: '25',
  actual_prod: '12000', // slightly low for 80 m3/hr × 10hr × 25 days = 20,000 capacity
  n_trucks: '15', truck_availability: '13', qualified_drivers: '13',
  turnaround: '100 to 125 minutes, slow',
  mixer_capacity: '10', deliveries_day: '55', // 55/13 = 4.2 trips/truck. At 112 min TAT: 5.4 possible. Slightly low.
  delivery_radius: 'Most deliveries 5 to 12 km, city radius',
  price_m3: '55', cement_cost: '18', aggregate_cost: '8', admix_cost: '4',
  reject_pct: '3.5', reject_cause: 'Mostly plant side, batching or dosing',
  demand_sufficient: 'Operations, we have more demand than we can currently produce or deliver',
  partial_load_size: '8', partial_load_pct: '20',
  surplus_concrete: 'Under 0.2 m\u00B3, minimal waste',
  order_to_dispatch: '25 to 40 minutes, slow',
  dispatch_tool: 'WhatsApp messages only, no spreadsheet',
  route_clustering: 'Rarely or never',
  plant_idle: 'Every day, always waiting for trucks',
  typical_month: 'Yes, normal month, representative of typical operations',
} as Answers

const c2 = run('CASE 2: Realistic estimated data (slightly inconsistent)', case2)

// Sensitivity: change deliveries from 55 to 70
console.log('\n--- Sensitivity: deliveries 55 → 70/day ---')
const c2b = run('CASE 2b: Deliveries changed to 70', { ...case2, deliveries_day: '70' } as Answers)
console.log(`\n  DELTA: $${(c2.total - c2b.total).toLocaleString()}/mo (${Math.round((c2.total - c2b.total) / c2.total * 100)}% change)`)

// ══════════════════════════════════════════════════════════════
// CASE 3: Poor data quality (clearly inconsistent)
// ══════════════════════════════════════════════════════════════

const case3: Answers = {
  plant_cap: '60', op_hours: '10', op_days: '300', working_days_month: '25',
  actual_prod: '18000', // IMPOSSIBLE: 60 × 10 × 25 = 15,000 max
  n_trucks: '25', truck_availability: '25', qualified_drivers: '25',
  turnaround: 'Over 125 minutes, critical bottleneck',
  mixer_capacity: '10', deliveries_day: '200', // 200/25 = 8 trips at 140 min = impossible (10hr × 60 / 140 = 4.3 max)
  delivery_radius: 'Most deliveries 12 to 20 km, suburban / outer city',
  price_m3: '50', cement_cost: '15', aggregate_cost: '7', admix_cost: '3',
  reject_pct: '5', reject_cause: 'Even split, roughly equal plant and site causes',
  demand_sufficient: 'Operations, we have more demand than we can currently produce or deliver',
  partial_load_size: '5', partial_load_pct: '40',
  surplus_concrete: '0.5 to 1.0 m\u00B3, significant',
  order_to_dispatch: 'Over 40 minutes, critical bottleneck',
  dispatch_tool: 'Phone calls and a whiteboard or paper list',
  route_clustering: 'Rarely or never',
  plant_idle: 'Every day, always waiting for trucks',
  typical_month: 'Partially, one or two unusual weeks but broadly typical',
} as Answers

const c3 = run('CASE 3: Poor data quality (clearly inconsistent)', case3)

// Sensitivity: change actual_prod from 18000 to 12000 (realistic)
console.log('\n--- Sensitivity: actual_prod 18000 → 12000 ---')
const c3b = run('CASE 3b: Production corrected to 12000', { ...case3, actual_prod: '12000' } as Answers)
console.log(`\n  DELTA: $${Math.abs(c3.total - c3b.total).toLocaleString()}/mo (${Math.round(Math.abs(c3.total - c3b.total) / Math.max(c3.total, 1) * 100)}% change)`)

// ══════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60))
console.log('  SUMMARY')
console.log('='.repeat(60))
console.log(`\n  Case 1 (clean):      $${c1.total.toLocaleString()}/mo`)
console.log(`  Case 2 (estimated):  $${c2.total.toLocaleString()}/mo`)
console.log(`  Case 3 (poor):       $${c3.total.toLocaleString()}/mo`)
