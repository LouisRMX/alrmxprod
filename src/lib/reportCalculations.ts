/**
 * Pure, testable calculation function for pre-assessment reports.
 * Zero side effects. No API calls, no database, no Next.js imports.
 */

import { parseNumberOrRange, parseTrips, type ProvenanceMap, type TripsUnit } from './reportProvenance'

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
  avg_delivery_radius: string  // Raw customer input, enum, or range string, parsed by parseRadius()
  dispatch_tool: string
  data_sources: string
  biggest_operational_challenge: string
  demand_vs_capacity: string
  queuing_and_idle: string
  dispatch_timing: string
  /**
   * Optional per-field provenance metadata. Populated by mapToReportInput
   * when customer gives a range or ambiguous answer. Empty/missing means
   * all fields are treated as Reported (backwards compatible).
   */
  provenance?: ProvenanceMap
  /**
   * Number of batching plants (for display when customer runs multiple).
   * Defaults to 1 if absent. Affects provenance description for plant capacity.
   */
  number_of_plants?: number
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
  has_external_constraint: boolean
  regulatory_scenario: RegulatoryScenario | null
  // Optional secondary context for CONSTRAINT cell (e.g. external restriction note)
  constraint_note?: string
  // m³ ranges for narrative/bold-line use (pre-assessment uncertainty band)
  // Asymmetric widths: gap ±15% (model-derived, wider band), actual daily ±5%
  // (customer-reported, tighter band). All rounded to nearest 50 m³ outward.
  monthly_gap_m3_low: number
  monthly_gap_m3_high: number
  actual_daily_m3_low: number
  actual_daily_m3_high: number
  /**
   * Provenance metadata echoed through from ReportInput.provenance, with
   * additional calculated-field entries added during report generation.
   * Consumers (ExportWord, report-draft HTML) read this to render the
   * "Source / Calculation" column.
   *
   * Always present; empty object means all fields are Reported.
   */
  provenance: ProvenanceMap
}

export interface RegulatoryScenario {
  monthly_gap_usd: number
  recovery_low_usd: number
  recovery_high_usd: number
  basis: string
  ban_hours: number
}

const RADIUS_MAP: Record<string, number> = {
  'under_10km': 7,
  '10_to_20km': 15,
  'over_20km': 25,
}

function parseRadius(value: string | number): number {
  // Exact enum match (legacy dropdown answers)
  if (typeof value === 'string' && RADIUS_MAP[value] !== undefined) return RADIUS_MAP[value]
  // Range string: extract both bounds, return exact midpoint (not bucketed)
  const rangeMatch = String(value).match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)/)
  if (rangeMatch) {
    const mid = (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2
    if (mid > 0) return Math.round(mid * 10) / 10
  }
  // Single numeric value: return exact value (with 0.1 km precision).
  // Preserves customer-reported precision instead of bucketing to 7/15/25.
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (!isNaN(num) && num > 0) {
    return Math.round(num * 10) / 10
  }
  // Qualitative string patterns (legacy, map to bucket midpoints)
  const lower = String(value).toLowerCase()
  if (/under\s*10|<\s*10|under\s*5|dense/.test(lower)) return 7
  if (/city|suburban/.test(lower)) return 15
  if (/over\s*20|>\s*20|20\+|regional/.test(lower)) return 25
  console.warn('Radius parse failed, defaulting to over_20km:', value)
  return 25
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

  // ── Avg load per trip (2-decimal precision so display matches calculator check) ──
  const avg_load_m3 = total_trips_last_month > 0
    ? Math.round((actual_production_last_month_m3 / total_trips_last_month) * 100) / 100
    : 7 // default mixer capacity

  // ── Rule 1: TARGET_TAT with robust radius parsing ──
  const radius_km = parseRadius(avg_delivery_radius)
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
    target_trips_per_truck_per_day = Math.round(actual_trips_per_truck_per_day * (75 / Math.max(1, utilisation_pct_raw(input))) * 100) / 100
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
  let target_daily_output_m3 = Math.min(fleet_target_daily_m3, plant_daily_m3)

  // ── Guard: actual exceeds target (large fleet compensates high TAT) ──
  if (actual_daily_output_m3 >= target_daily_output_m3 && plant_daily_m3 > actual_daily_output_m3) {
    // Gap is between actual and plant capacity, not fleet target
    target_daily_output_m3 = plant_daily_m3
    gap_driver = 'utilisation'
  } else if (actual_daily_output_m3 >= target_daily_output_m3) {
    // Actual exceeds both fleet target and plant capacity — use capacity ceiling
    target_daily_output_m3 = Math.max(actual_daily_output_m3 + 1, plant_daily_m3)
    gap_driver = 'utilisation'
  }

  // ── Monthly gap from annual basis (avoids Math.round(days/12) precision loss) ──
  // op_days_per_month stays integer 25 for display; gap calc uses operating_days_per_year directly.
  const daily_gap_m3 = Math.max(0, target_daily_output_m3 - actual_daily_output_m3)
  const annual_gap_m3 = daily_gap_m3 * operating_days_per_year
  const monthly_gap_m3 = annual_gap_m3 / 12
  const monthly_gap_usd = Math.round(monthly_gap_m3 * contribution_margin_per_m3 / 1000) * 1000

  // ── m³ ranges (pre-assessment uncertainty band, rounded to nearest 50 outward) ──
  // floor/ceil ensures range always strictly brackets the point estimate for non-zero gaps.
  const monthly_gap_m3_low = monthly_gap_m3 > 0 ? Math.floor(monthly_gap_m3 * 0.85 / 50) * 50 : 0
  const monthly_gap_m3_high = monthly_gap_m3 > 0 ? Math.ceil(monthly_gap_m3 * 1.15 / 50) * 50 : 0
  const actual_daily_m3_low = actual_daily_output_m3 > 0 ? Math.floor(actual_daily_output_m3 * 0.95 / 50) * 50 : 0
  const actual_daily_m3_high = actual_daily_output_m3 > 0 ? Math.ceil(actual_daily_output_m3 * 1.05 / 50) * 50 : 0

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
  const utilisation_target_pct = 75

  // ── Rule 4: Constraint logic (priority order) ──
  const qiLower = queuing_and_idle.toLowerCase()
  const dtLower = dispatch_timing.toLowerCase()
  const bocLower = biggest_operational_challenge.toLowerCase()
  const hasQueue = /queue|queuing|waiting/.test(qiLower) && !/^no[^t]|never/.test(qiLower)
  const hasIdle = /(?<!no\s)idle|sits idle/.test(qiLower) && !/^no[^t]|never|no idle/.test(qiLower)
  const hasMorning = /morning|early|first.*hours?/.test(dtLower)
  const hasSiteAccess = /site access|access window|waiting at site|queue outside|limited access/.test(bocLower)

  let constraint: string
  let constraint_note: string | undefined
  if (hasQueue && hasIdle && hasMorning) {
    constraint = 'Likely: Dispatch clustering \u2014 morning concentration'
  } else if (hasQueue && hasIdle) {
    constraint = 'Likely: Dispatch clustering'
  } else if (hasSiteAccess && !hasIdle) {
    constraint = 'Likely: Site access coordination'
  } else if (/movement ban|movement restriction|truck ban|traffic police|road block|road closure/.test(bocLower)) {
    // External factors are noted but not the actionable label.
    // Frame constraint around what on-site intervention can address.
    constraint = 'Likely: Dispatch and site coordination'
    constraint_note = 'External restrictions noted, on-site focus'
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

  // ── External constraint detection (Scenario B trigger) ──
  const has_external_constraint =
    constraint_note !== undefined ||
    /movement ban|movement restriction|truck ban|traffic police|road block|road closure|traffic restriction|\bban\b/.test(bocLower) ||
    (/traffic/.test(bocLower) && /hours?/.test(bocLower))

  // ── Regulatory scenario: near-term recovery under current restrictions ──
  let regulatory_scenario: RegulatoryScenario | null = null
  if (has_external_constraint) {
    // Extract ban hours from challenge text, default to 4
    const banMatch = biggest_operational_challenge.match(/(\d+)\s*hours?/i)
    const ban_hours = banMatch ? parseInt(banMatch[1], 10) : 4

    // Regulatory recovery = proportion of main recovery achievable within restricted hours
    // Main recovery assumes full operating hours. Ban reduces the fraction that's near-term addressable.
    const effective_hours = Math.max(1, operating_hours_per_day - (ban_hours * 0.5))
    const restriction_factor = effective_hours / operating_hours_per_day
    const reg_rec_lo = Math.round(recovery_low_usd * restriction_factor / 1000) * 1000
    const reg_rec_hi = Math.round(recovery_high_usd * restriction_factor / 1000) * 1000
    const reg_gap_usd = Math.round(monthly_gap_usd * restriction_factor / 1000) * 1000

    regulatory_scenario = {
      monthly_gap_usd: reg_gap_usd,
      recovery_low_usd: reg_rec_lo,
      recovery_high_usd: reg_rec_hi,
      ban_hours,
      basis: `Estimates ${ban_hours}-hour daily movement restriction reducing effective operating capacity. Recovery range reflects operational improvements within current regulatory constraints.`,
    }
  }

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
    has_external_constraint,
    regulatory_scenario,
    constraint_note,
    monthly_gap_m3_low,
    monthly_gap_m3_high,
    actual_daily_m3_low,
    actual_daily_m3_high,
    provenance: buildCalculationProvenance(input, {
      contribution_margin_per_m3,
      avg_load_m3,
      actual_daily_output_m3,
      monthly_gap_m3,
      monthly_gap_usd,
      utilisation_actual_pct,
      op_days_per_month,
    }),
  }
}

/**
 * Build the calculated-field provenance entries. Starts from any user-supplied
 * provenance on ReportInput (for range/midpoint/interpreted entries), then
 * layers on the deterministic formulas for derived values.
 *
 * Keeping this in a separate function keeps calculateReport readable, and
 * lets tests exercise just the provenance logic.
 */
function buildCalculationProvenance(
  input: ReportInput,
  derived: {
    contribution_margin_per_m3: number
    avg_load_m3: number
    actual_daily_output_m3: number
    monthly_gap_m3: number
    monthly_gap_usd: number
    utilisation_actual_pct: number
    op_days_per_month: number
  }
): ProvenanceMap {
  const p: ProvenanceMap = { ...(input.provenance ?? {}) }

  // Contribution margin: always calculated from selling price − material cost
  p.contribution_margin_per_m3 = {
    type: 'calculated',
    formula: `$${input.selling_price_per_m3.toFixed(2)} \u2212 $${input.material_cost_per_m3.toFixed(2)} = $${derived.contribution_margin_per_m3.toFixed(2)}`,
  }

  // Operating days per month: derived from operating_days_per_year
  p.op_days_per_month = {
    type: 'calculated',
    formula: `${input.operating_days_per_year} days/year \u00F7 12 = ${derived.op_days_per_month}`,
  }

  // Avg load: derived from monthly output \u00F7 total trips
  if (input.total_trips_last_month > 0) {
    p.avg_load_m3 = {
      type: 'calculated',
      formula: `${input.actual_production_last_month_m3.toLocaleString('en-US')} m\u00B3 \u00F7 ${input.total_trips_last_month.toLocaleString('en-US')} trips = ${derived.avg_load_m3} m\u00B3`,
    }
  }

  // Actual daily output: monthly output \u00F7 op days
  if (derived.op_days_per_month > 0) {
    p.actual_daily_output_m3 = {
      type: 'calculated',
      formula: `${input.actual_production_last_month_m3.toLocaleString('en-US')} \u00F7 ${derived.op_days_per_month} = ${derived.actual_daily_output_m3.toLocaleString('en-US')} m\u00B3/day`,
    }
  }

  // Monthly material contribution (not a ReportCalculations field but rendered
  // in the "Your operation today" table). Tracked by synthetic key.
  p.monthly_material_contribution = {
    type: 'calculated',
    formula: `${input.actual_production_last_month_m3.toLocaleString('en-US')} m\u00B3 \u00D7 $${derived.contribution_margin_per_m3.toFixed(2)} margin`,
  }

  // Monthly plant capacity (synthetic key)
  p.monthly_plant_capacity_m3 = {
    type: 'calculated',
    formula: `${input.plant_capacity_m3_per_hour} m\u00B3/hr \u00D7 ${input.operating_hours_per_day} hrs/day \u00D7 ${derived.op_days_per_month} days`,
  }

  // Capacity utilisation
  if (derived.utilisation_actual_pct > 0) {
    const monthlyPlantCap = input.plant_capacity_m3_per_hour * input.operating_hours_per_day * derived.op_days_per_month
    p.utilisation_actual_pct = {
      type: 'calculated',
      formula: `${input.actual_production_last_month_m3.toLocaleString('en-US')} \u00F7 ${monthlyPlantCap.toLocaleString('en-US')}`,
    }
  }

  // Monthly gap (m\u00B3 \u2192 USD)
  p.monthly_gap_usd = {
    type: 'calculated',
    formula: `${Math.round(derived.monthly_gap_m3).toLocaleString('en-US')} m\u00B3 \u00D7 $${derived.contribution_margin_per_m3.toFixed(2)} = $${derived.monthly_gap_usd.toLocaleString('en-US')}`,
  }

  // Plant capacity (if customer has multiple plants)
  const nPlants = input.number_of_plants ?? 1
  if (nPlants > 1 && !p.plant_capacity_m3_per_hour) {
    const perPlant = input.plant_capacity_m3_per_hour / nPlants
    p.plant_capacity_m3_per_hour = {
      type: 'interpreted',
      raw: `${nPlants} plants, ${perPlant} m\u00B3/hr each`,
      interpretation: `${nPlants} \u00D7 ${perPlant} m\u00B3/hr reported`,
      to_verify_on_site: true,
    }
  }

  return p
}

/**
 * Map platform answers + diagnosis to ReportInput.
 * Accepts generic Record types to avoid importing platform-specific types.
 *
 * Range-tolerant parsing: fields that customers commonly answer as a range
 * (operating hours, rejection rate, delivery radius) are parsed via
 * parseNumberOrRange, which accepts both a single precise number (preferred)
 * and a range string like "12-16" or "1-2%" (midpoint used, provenance tracked).
 *
 * Trips-unit toggle: customers who only know trips/truck/day or trips/truck/week
 * can pass answers.trips_unit = 'per_truck_per_day' | 'per_truck_per_week';
 * default 'total_monthly'.
 */
export function mapToReportInput(
  dx: { tat_actual: number; reject_pct: number; management_context?: string },
  answers: Record<string, unknown>
): ReportInput {
  const provenance: ProvenanceMap = {}

  const matCost = +(answers.material_cost ?? 0) || 0
  const cement = +(answers.cement_cost ?? 0) || 0
  const agg = +(answers.aggregate_cost ?? 0) || 0
  const admix = +(answers.admix_cost ?? 0) || 0
  const materialCost = matCost > 0 ? matCost : (cement + agg + admix)
  if (matCost <= 0 && (cement > 0 || agg > 0 || admix > 0)) {
    provenance.material_cost_per_m3 = {
      type: 'calculated',
      formula: `Cement $${cement} + aggregates $${agg} + admix $${admix} = $${materialCost.toFixed(2)}`,
    }
  }

  // Operating days: single number typically
  const opDaysParsed = parseNumberOrRange(answers.op_days as string | number | undefined, 300)
  const opDays = Math.round(opDaysParsed.value)
  if (opDaysParsed.provenance.type !== 'reported') {
    provenance.operating_days_per_year = opDaysParsed.provenance
  }

  // Operating hours: accept single or range, midpoint on range
  const opHoursParsed = parseNumberOrRange(answers.op_hours as string | number | undefined, 10)
  const opHours = opHoursParsed.value
  if (opHoursParsed.provenance.type !== 'reported') {
    provenance.operating_hours_per_day = opHoursParsed.provenance
  }

  // Plant capacity: accept single or "N plants, M m3/hr each" style
  const plantCapParsed = parseNumberOrRange(answers.plant_cap as string | number | undefined, 0)
  const plantCap = plantCapParsed.value
  if (plantCapParsed.provenance.type !== 'reported') {
    provenance.plant_capacity_m3_per_hour = plantCapParsed.provenance
  }
  const numberOfPlants = +(answers.number_of_plants ?? 1) || 1

  // Rejection rate: accept single ("1.5") or range ("1-2%"), midpoint on range
  const rejectRaw = (answers.rejection_rate_raw ?? answers.rejection_rate ?? dx.reject_pct) as string | number | null | undefined
  const rejectParsed = parseNumberOrRange(rejectRaw, dx.reject_pct)
  const rejectPct = rejectParsed.value
  if (rejectParsed.provenance.type !== 'reported') {
    provenance.rejection_rate_pct = rejectParsed.provenance
  }

  const workingDaysMonth = Math.round(opDays / 12)
  const nTrucks = +(answers.n_trucks ?? 0) || 0

  // Trips: support two input paths.
  //
  // Input priority:
  //   1. answers.total_trips_last_month (explicit answer, unit controlled by trips_unit)
  //   2. answers.deliveries_day (legacy field: total FLEET deliveries per working day,
  //      not per-truck. Scaled to monthly by multiplying with working days per month.)
  //
  // deliveries_day is populated either by the assessment UI (user answers the
  // "deliveries per day" question directly) or by parse-assessment.route.ts which
  // converts monthly trips to daily average. In both cases it is fleet-level.
  const tripsUnit = (answers.trips_unit as TripsUnit | undefined) ?? 'total_monthly'
  let totalTripsMonth: number

  if (answers.total_trips_last_month != null && answers.total_trips_last_month !== '') {
    const parsed = parseTrips(
      answers.total_trips_last_month as string | number,
      tripsUnit,
      nTrucks,
      workingDaysMonth
    )
    totalTripsMonth = parsed.total_monthly
    if (parsed.provenance.type !== 'reported') {
      provenance.total_trips_last_month = parsed.provenance
    }
  } else if (answers.deliveries_day != null && answers.deliveries_day !== '') {
    const deliveriesDay = +(answers.deliveries_day ?? 0) || 0
    totalTripsMonth = Math.round(deliveriesDay * workingDaysMonth)
  } else {
    totalTripsMonth = 0
  }

  // Radius: pass raw value to parseRadius (existing enum/range logic), but track provenance.
  //
  // If the customer gave a unit-annotated range ("5km-45km") that parseRadius
  // can't parse directly, we pre-compute the midpoint via parseNumberOrRange
  // and hand parseRadius a clean numeric string. This keeps the existing
  // parseRadius bucket logic (<10 → 7, <20 → 15, else 25) intact.
  const radiusRawInput = String(answers.delivery_radius_raw ?? answers.delivery_radius ?? '')
  const radiusParsed = parseNumberOrRange(radiusRawInput, 0)
  let radiusForCalc = radiusRawInput
  if (radiusParsed.provenance.type === 'midpoint') {
    provenance.avg_delivery_radius = radiusParsed.provenance
    // Feed the clean midpoint to parseRadius so the bucket logic works
    radiusForCalc = String(radiusParsed.value)
  }

  return {
    selling_price_per_m3: +(answers.price_m3 ?? 0) || 0,
    material_cost_per_m3: materialCost,
    plant_capacity_m3_per_hour: plantCap,
    operating_hours_per_day: opHours,
    operating_days_per_year: opDays,
    actual_production_last_month_m3: +(answers.actual_prod ?? 0) || 0,
    trucks_assigned: nTrucks,
    total_trips_last_month: totalTripsMonth,
    avg_turnaround_min: dx.tat_actual,
    rejection_rate_pct: rejectPct,
    avg_delivery_radius: radiusForCalc,
    dispatch_tool: String(answers.dispatch_tool ?? ''),
    data_sources: String(answers.prod_data_source ?? ''),
    biggest_operational_challenge: dx.management_context || String(answers.biggest_pain ?? ''),
    demand_vs_capacity: String(answers.demand_sufficient ?? ''),
    queuing_and_idle: String(answers.plant_idle ?? ''),
    dispatch_timing: String(answers.dispatch_peak ?? ''),
    number_of_plants: numberOfPlants,
    provenance,
  }
}

// Helper: raw utilisation percentage before rounding
function utilisation_pct_raw(input: ReportInput): number {
  const opDaysMonth = Math.round(input.operating_days_per_year / 12)
  const actualDaily = opDaysMonth > 0 ? input.actual_production_last_month_m3 / opDaysMonth : 0
  const maxDaily = input.plant_capacity_m3_per_hour * input.operating_hours_per_day
  return maxDaily > 0 ? (actualDaily / maxDaily) * 100 : 0
}
