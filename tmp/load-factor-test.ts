import { calc, type Answers, type CalcOverrides } from '../src/lib/calculations'

const base: Answers = {
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
} as Answers

function test(label: string, mixCapFactor: number) {
  // Simulate different load factors by overriding mixer_capacity
  const adjustedCap = Math.round(10 * mixCapFactor * 10) / 10
  const a = { ...base, mixer_capacity: String(adjustedCap) } as Answers
  const r = calc(a, { season: 'summer' }, { estimatedInputs: true })

  const fleetDaily = Math.round(r.effectiveUnits * ((r.opH * 60) / r.ta) * r.effectiveMixCap)
  const plantDaily = Math.round(r.cap * 0.92 * r.opH)
  const throughput = r.turnaroundLeakMonthly + r.capLeakMonthly
  const leakage = r.rejectMaterialLoss + r.partialLeakMonthly + r.surplusLeakMonthly
  const total = throughput + leakage

  console.log(`${label} (mixCap=${adjustedCap}):`)
  console.log(`  Fleet: ${fleetDaily} m3/day | Plant: ${plantDaily} m3/day`)
  console.log(`  Constraint: ${r.bottleneck}`)
  console.log(`  Throughput: $${throughput.toLocaleString()} | Leakage: $${leakage.toLocaleString()}`)
  console.log(`  TOTAL: $${total.toLocaleString()}/mo`)
  console.log(`  Recovery: $${Math.round(total * 0.40).toLocaleString()}-$${Math.round(total * 0.65).toLocaleString()}/mo`)
  console.log(`  Data quality: ${r.dataQuality}`)
  console.log()
}

// On-site (derived effectiveMixCap = 7.5 m3)
console.log('=== ON-SITE REFERENCE (derived mixCap 7.5) ===')
const rOnsite = calc(base, { season: 'summer' })
const fleetOnsite = Math.round(rOnsite.effectiveUnits * ((rOnsite.opH * 60) / rOnsite.ta) * rOnsite.effectiveMixCap)
const plantOnsite = Math.round(rOnsite.cap * 0.92 * rOnsite.opH)
console.log(`Fleet: ${fleetOnsite} m3/day | Plant: ${plantOnsite} m3/day | Constraint: ${rOnsite.bottleneck}`)
console.log(`Throughput: $${(rOnsite.turnaroundLeakMonthly + rOnsite.capLeakMonthly).toLocaleString()} | Total: $${(rOnsite.turnaroundLeakMonthly + rOnsite.capLeakMonthly + rOnsite.rejectMaterialLoss + rOnsite.partialLeakMonthly + rOnsite.surplusLeakMonthly).toLocaleString()}\n`)

console.log('=== PRE-DIAGNOSIS LOAD FACTOR COMPARISON ===\n')
test('1.00 × nominal (current)', 1.00)
test('0.85 × nominal (conservative)', 0.85)
test('0.75 × nominal (aggressive)', 0.75)
