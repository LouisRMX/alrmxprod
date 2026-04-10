import { calc, type Answers } from '../src/lib/calculations'
const a: Answers = {
  plant_cap: '75', op_hours: '12', op_days: '312',
  actual_prod: '15700', working_days_month: '26',
  n_trucks: '20', turnaround: '100 to 125 minutes, slow',
  mixer_capacity: '10', deliveries_day: '80',
  delivery_radius: 'Most deliveries 12 to 20 km, suburban / outer city',
  price_m3: '60', cement_cost: '20', aggregate_cost: '10', admix_cost: '5',
  truck_availability: '16', qualified_drivers: '16',
  reject_pct: '2.9',
  reject_cause: 'Even split, roughly equal plant and site causes',
  demand_sufficient: 'Operations, we have more demand than we can currently produce or deliver',
  surplus_concrete: '0.2 to 0.5 m\u00B3, moderate',
  partial_load_size: '7', partial_load_pct: '25',
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
const r = calc(a, { season: 'summer' })
console.log('turnaroundLeak:', r.turnaroundLeakMonthly)
console.log('capLeak:', r.capLeakMonthly)
console.log('rejectMaterial:', r.rejectMaterialLoss)
console.log('partial:', r.partialLeakMonthly)
console.log('surplus:', r.surplusLeakMonthly)
console.log('breakdown:', r.breakdownCostMonthly)
const total = r.turnaroundLeakMonthly + r.capLeakMonthly + r.rejectMaterialLoss + r.partialLeakMonthly + r.surplusLeakMonthly + r.breakdownCostMonthly
console.log('TOTAL:', total)
console.log('Recovery lo:', Math.round(total * 0.40))
console.log('Recovery hi:', Math.round(total * 0.65))
console.log('Revenue lost:', Math.round(5824 * 60))
console.log('Revenue recovery lo:', Math.round(5824 * 60 * 0.40))
console.log('Revenue recovery hi:', Math.round(5824 * 60 * 0.65))
