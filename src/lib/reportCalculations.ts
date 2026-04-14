/**
 * Pure, testable calculation function for pre-assessment reports.
 * Zero side effects. No API calls, no database, no Next.js imports.
 */

export interface ReportInput {
  selling_price_per_m3: number
  material_cost_per_m3: number
  plant_capacity_m3_per_hour: number
  operating_hours_per_day: number
  operating_days_per_year: number
  actual_production_last_month_m3: number
  trucks_assigned: number
  total_trips_last_month: number
  avg_turnaround_min: number
  rejection_rate_pct: number
  avg_delivery_radius: 'under_10km' | '10_to_20km' | 'over_20km'
  dispatch_tool: string
  data_sources: string
  biggest_operational_challenge: string
  demand_vs_capacity: string
  queuing_and_idle: string
  dispatch_timing: string
}

export interface ReportCalculations {
  contribution_margin_per_m3: number
  op_days_per_month: number
  avg_load_m3: number
  target_tat_min: number
  target_trips_per_truck_per_day: number
  actual_trips_per_truck_per_day: number
  target_daily_output_m3: number
  actual_daily_output_m3: number
  monthly_gap_m3: number
  monthly_gap_usd: number
  recovery_low_usd: number
  recovery_high_usd: number
  parked_trucks_equivalent: number
  utilisation_actual_pct: number
  utilisation_target_pct: number
  gap_driver: 'tat' | 'utilisation' | 'mixed'
  constraint: string
  quality_loss_usd: number
  dispatch_loss_usd: number
  production_loss_usd: number
  quarterly_gap_low: number
  quarterly_gap_high: number
  annual_gap_low: number
  annual_gap_high: number
}

const RADIUS_MAP: Record<string, number> = {
  'under_10km': 7,
  '10_to_20km': 15,
  'over_20km': 25,
}

export function calculateReport(input: ReportInput): ReportCalculations {
  const {
    selling_price_per_m3, material_cost_per_m3, plant_capacity_m3_per_hour,
    operating_hours_per_day, operating_days_per_year, actual_production_last_month_m3,
    trucks_assigned, total_trips_last_month, avg_turnaround_min, rejection_rate_pct,
    avg_delivery_radius, biggest_operational_challenge, queuing_and_idle, dispatch_timing,
  } = input

  // ── Economics ──
  const contribution_margin_per_m3 = Math.max(0, selling_price_per_m3 - material_cost_per_m3)
  const op_days_per_month = Math.round(operating_days_per_year / 12)

  // ── Avg load per trip ──
  const avg_load_m3 = total_trips_last_month > 0
    ? Math.round((actual_production_last_month_m3 / total_trips_last_month) * 10) / 10
    : 7 // default mixer capacity

  // ── Rule 1: TARGET_TAT ──
  const radius_km = RADIUS_MAP[avg_delivery_radius] ?? 15
  const target_tat_min = Math.min(150, Math.max(75, Math.round(60 + radius_km * 1.5 * 2)))

  // ── Trips ──
  const actual_trips_per_truck_per_day = trucks_assigned > 0 && op_days_per_month > 0
    ? Math.round((total_trips_last_month / op_days_per_month / trucks_assigned) * 100) / 100
    : 0
  let target_trips_per_truck_per_day = target_tat_min > 0
    ? Math.round(((operating_hours_per_day * 60) / target_tat_min) * 100) / 100
    : 0

  // ── Rule 2: Target must always exceed actual ──
  let gap_driver: 'tat' | 'utilisation' | 'mixed'
  if (target_trips_per_truck_per_day <= actual_trips_per_truck_per_day) {
    // TAT is at/below target but utilisation gap exists — recalculate target from utilisation
    target_trips_per_truck_per_day = Math.round(actual_trips_per_truck_per_day * (85 / Math.max(1, utilisation_pct_raw(input))) * 100) / 100
    // Ensure target exceeds actual after adjustment
    if (target_trips_per_truck_per_day <= actual_trips_per_truck_per_day) {
      target_trips_per_truck_per_day = Math.round((actual_trips_per_truck_per_day + 0.5) * 100) / 100
    }
    gap_driver = 'utilisation'
  } else {
    const tat_excess_pct = target_tat_min > 0 ? (avg_turnaround_min - target_tat_min) / target_tat_min : 0
    gap_driver = tat_excess_pct > 0.2 ? 'tat' : tat_excess_pct > 0.05 ? 'mixed' : 'utilisation'
  }

  // ── Output volumes ──
  const actual_daily_output_m3 = op_days_per_month > 0
    ? Math.round(actual_production_last_month_m3 / op_days_per_month)
    : 0
  const plant_daily_m3 = Math.round(plant_capacity_m3_per_hour * 0.92 * operating_hours_per_day)
  const fleet_target_daily_m3 = Math.round(
    trucks_assigned * target_trips_per_truck_per_day * avg_load_m3
  )
  const target_daily_output_m3 = Math.min(fleet_target_daily_m3, plant_daily_m3)
  const monthly_gap_m3 = Math.max(0, target_daily_output_m3 - actual_daily_output_m3) * op_days_per_month
  const monthly_gap_usd = Math.round(monthly_gap_m3 * contribution_margin_per_m3 / 1000) * 1000

  // ── Recovery range (40-65%) ──
  const recovery_low_usd = Math.round(monthly_gap_usd * 0.4 / 1000) * 1000
  const recovery_high_usd = Math.round(monthly_gap_usd * 0.65 / 1000) * 1000

  // ── Rule 3: Parked trucks proportional to gap ──
  const denominator = target_trips_per_truck_per_day * op_days_per_month * avg_load_m3
  const parked_trucks_equivalent = denominator > 0
    ? Math.round((monthly_gap_m3 / denominator) * 10) / 10
    : 0

  // ── Utilisation ──
  const utilisation_actual_pct = plant_capacity_m3_per_hour > 0 && operating_hours_per_day > 0
    ? Math.round((actual_daily_output_m3 / (plant_capacity_m3_per_hour * operating_hours_per_day)) * 100)
    : 0
  const utilisation_target_pct = 85

  // ── Rule 4: Constraint logic (priority order) ──
  const qiLower = queuing_and_idle.toLowerCase()
  const dtLower = dispatch_timing.toLowerCase()
  const bocLower = biggest_operational_challenge.toLowerCase()
  const hasQueue = /queue|queuing|waiting/.test(qiLower) && !/^no[^t]|never/.test(qiLower)
  const hasIdle = /(?<!no\s)idle|sits idle/.test(qiLower) && !/^no[^t]|never|no idle/.test(qiLower)
  const hasMorning = /morning|early|first.*hours?/.test(dtLower)
  const hasSiteAccess = /site access|access window|waiting at site|queue outside|limited access/.test(bocLower)

  let constraint: string
  if (hasQueue && hasIdle && hasMorning) {
    constraint = 'Likely: Dispatch clustering \u2014 morning concentration'
  } else if (hasQueue && hasIdle) {
    constraint = 'Likely: Dispatch clustering'
  } else if (hasSiteAccess && !hasIdle) {
    constraint = 'Likely: Site access coordination'
  } else if (avg_turnaround_min > target_tat_min * 1.20) {
    constraint = 'Likely: Fleet coordination'
  } else {
    constraint = 'To be confirmed on-site'
  }

  // ── Rule 5: Quality loss (material cost only) ──
  const rejected_trips = total_trips_last_month * (rejection_rate_pct / 100)
  const quality_loss_usd = Math.round(rejected_trips * avg_load_m3 * material_cost_per_m3 / 1000) * 1000

  // ── Rule 6: Loss breakdown sums to monthly gap exactly ──
  // Round quality and production first, dispatch absorbs the exact remainder
  const capped_quality = Math.round(Math.min(quality_loss_usd, monthly_gap_usd * 0.4) / 1000) * 1000
  const dispatch_minimum = Math.max(1000, Math.round(monthly_gap_usd * 0.03 / 1000) * 1000)
  const production_loss_usd = monthly_gap_usd > 0
    ? Math.max(1000, Math.round(Math.min(monthly_gap_usd - capped_quality - dispatch_minimum, monthly_gap_usd * 0.8) / 1000) * 1000)
    : 0
  const dispatch_loss_usd = monthly_gap_usd > 0
    ? Math.max(1000, monthly_gap_usd - production_loss_usd - capped_quality)
    : 0

  // ── Timeline ──
  const quarterly_gap_low = Math.round(recovery_low_usd * 3 / 1000) * 1000
  const quarterly_gap_high = Math.round(recovery_high_usd * 3 / 1000) * 1000
  const annual_gap_low = Math.round(recovery_low_usd * 12 / 1000) * 1000
  const annual_gap_high = Math.round(recovery_high_usd * 12 / 1000) * 1000

  return {
    contribution_margin_per_m3,
    op_days_per_month,
    avg_load_m3,
    target_tat_min,
    target_trips_per_truck_per_day,
    actual_trips_per_truck_per_day,
    target_daily_output_m3,
    actual_daily_output_m3,
    monthly_gap_m3,
    monthly_gap_usd,
    recovery_low_usd,
    recovery_high_usd,
    parked_trucks_equivalent,
    utilisation_actual_pct,
    utilisation_target_pct,
    gap_driver,
    constraint,
    quality_loss_usd: capped_quality,
    dispatch_loss_usd,
    production_loss_usd,
    quarterly_gap_low,
    quarterly_gap_high,
    annual_gap_low,
    annual_gap_high,
  }
}

/**
 * Map platform answers + diagnosis to ReportInput.
 * Accepts generic Record types to avoid importing platform-specific types.
 */
export function mapToReportInput(
  dx: { tat_actual: number; reject_pct: number; management_context?: string },
  answers: Record<string, unknown>
): ReportInput {
  const matCost = +(answers.material_cost ?? 0) || 0
  const cement = +(answers.cement_cost ?? 0) || 0
  const agg = +(answers.aggregate_cost ?? 0) || 0
  const admix = +(answers.admix_cost ?? 0) || 0
  const materialCost = matCost > 0 ? matCost : (cement + agg + admix)

  const opDays = +(answers.op_days ?? 0) || 300
  const workingDaysMonth = Math.round(opDays / 12)
  const deliveriesDay = +(answers.deliveries_day ?? 0) || 0
  const totalTripsMonth = Math.round(deliveriesDay * workingDaysMonth)

  const radiusRaw = (String(answers.delivery_radius ?? '')).toLowerCase()
  let radiusEnum: 'under_10km' | '10_to_20km' | 'over_20km' = '10_to_20km'
  if (/under 5|under 10|dense urban/.test(radiusRaw)) radiusEnum = 'under_10km'
  else if (/over 20|regional/.test(radiusRaw)) radiusEnum = 'over_20km'

  return {
    selling_price_per_m3: +(answers.price_m3 ?? 0) || 0,
    material_cost_per_m3: materialCost,
    plant_capacity_m3_per_hour: +(answers.plant_cap ?? 0) || 0,
    operating_hours_per_day: +(answers.op_hours ?? 0) || 10,
    operating_days_per_year: opDays,
    actual_production_last_month_m3: +(answers.actual_prod ?? 0) || 0,
    trucks_assigned: +(answers.n_trucks ?? 0) || 0,
    total_trips_last_month: totalTripsMonth,
    avg_turnaround_min: dx.tat_actual,
    rejection_rate_pct: dx.reject_pct,
    avg_delivery_radius: radiusEnum,
    dispatch_tool: String(answers.dispatch_tool ?? ''),
    data_sources: String(answers.prod_data_source ?? ''),
    biggest_operational_challenge: dx.management_context || String(answers.biggest_pain ?? ''),
    demand_vs_capacity: String(answers.demand_sufficient ?? ''),
    queuing_and_idle: String(answers.plant_idle ?? ''),
    dispatch_timing: String(answers.dispatch_peak ?? ''),
  }
}

// Helper: raw utilisation percentage before rounding
function utilisation_pct_raw(input: ReportInput): number {
  const opDaysMonth = Math.round(input.operating_days_per_year / 12)
  const actualDaily = opDaysMonth > 0 ? input.actual_production_last_month_m3 / opDaysMonth : 0
  const maxDaily = input.plant_capacity_m3_per_hour * input.operating_hours_per_day
  return maxDaily > 0 ? (actualDaily / maxDaily) * 100 : 0
}
