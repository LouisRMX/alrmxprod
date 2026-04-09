import { calc, type Answers } from '../src/lib/calculations'

function scenario(name: string, overrides: Partial<Answers>) {
  const base: Answers = {
    plant_cap: '75', op_hours: '12', op_days: '312',
    actual_prod: '15700', working_days_month: '26',
    n_trucks: '20', turnaround: '100 to 125 minutes, slow',
    mixer_capacity: '10', deliveries_day: '80',
    delivery_radius: 'Most deliveries 12 to 20 km, suburban / outer city',
    price_m3: '60', cement_cost: '20', aggregate_cost: '10', admix_cost: '5',
    truck_availability: '16', qualified_drivers: '16',
    order_to_dispatch: '25 to 40 minutes, slow',
    dispatch_tool: 'WhatsApp messages only, no spreadsheet',
    route_clustering: 'Rarely or never',
    plant_idle: 'Regularly, most busy periods',
    reject_pct: '3',
    reject_cause: 'Even split, roughly equal plant and site causes',
    demand_sufficient: 'Operations, we have more demand than we can currently produce or deliver',
    ...overrides,
  } as Answers
  const r = calc(base)
  const ta = r.ta
  const fleetCapacity = r.effectiveUnits > 0 && ta > 0
    ? r.effectiveUnits * Math.floor((r.opH * 60) / ta) * r.effectiveMixCap
    : r.delDay * r.effectiveMixCap
  const plantDaily = Math.round(r.cap * 0.92 * r.opH)
  const actualDaily = Math.round(r.actual * r.opH)
  console.log(`\n=== ${name} ===`)
  console.log(`Fleet capacity:  ${Math.round(fleetCapacity)} m3/day (${r.effectiveUnits} trucks × ${ta > 0 ? Math.floor((r.opH*60)/ta) : '?'} trips × ${r.effectiveMixCap.toFixed(1)} m3)`)
  console.log(`Plant daily:     ${plantDaily} m3/day`)
  console.log(`Actual daily:    ${actualDaily} m3/day`)
  console.log(`Fleet < Plant:   ${Math.round(fleetCapacity) < plantDaily} → ${Math.round(fleetCapacity) < plantDaily ? 'FLEET constraint' : 'PLANT constraint'}`)
  console.log(`Bottleneck:      ${r.bottleneck}`)
  console.log(`Demand:          ${r.demandSufficient}`)
  console.log(`TAT leak:        $${r.turnaroundLeakMonthly.toLocaleString()}/mo`)
  console.log(`Cap leak:        $${r.capLeakMonthly.toLocaleString()}/mo`)
  console.log(`Reject leak:     $${r.rejectLeakMonthly.toLocaleString()}/mo`)
  console.log(`Partial leak:    $${r.partialLeakMonthly.toLocaleString()}/mo`)
  console.log(`Surplus leak:    $${r.surplusLeakMonthly.toLocaleString()}/mo`)
  const total = r.turnaroundLeakMonthly + r.capLeakMonthly + r.rejectLeakMonthly + r.partialLeakMonthly + r.surplusLeakMonthly
  console.log(`TOTAL:           $${total.toLocaleString()}/mo`)
}

// Scenario 1: Fleet constrained (Al Noor)
scenario('1. FLEET CONSTRAINED (Al Noor)', {})

// Scenario 2: Production constrained
// Tiny plant (30 m3/hr = 331 m3/day), fleet well-matched, plant is the limit
// Fleet daily = 55 del × 8 m3 = 440 > plant 331
scenario('2. PRODUCTION CONSTRAINED', {
  turnaround: 'Under 80 minutes, benchmark performance',
  plant_cap: '30',
  actual_prod: '7000',
  deliveries_day: '55',
  mixer_capacity: '8',
  n_trucks: '12',
  truck_availability: '12',
  qualified_drivers: '12',
})

// Scenario 3: Demand constrained
scenario('3. DEMAND CONSTRAINED', {
  demand_sufficient: 'Demand, our volume reflects available orders, not operational limits',
})
