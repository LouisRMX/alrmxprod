/**
 * Report assembly: token replacement and deterministic text generation.
 * Pure functions, zero side effects.
 */

import type { ReportCalculations, ReportInput, ScenarioBCalculations } from './reportCalculations'

function fmtCurrency(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function fmtDec(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1)
}

/**
 * Replace {{TOKEN}} placeholders in AI narrative with formatted rc values.
 * Returns the processed text.
 */
export function replaceNarrativeTokens(text: string, rc: ReportCalculations, input: ReportInput): string {
  const tatExcess = Math.max(0, input.avg_turnaround_min - rc.target_tat_min)
  const map: Record<string, string> = {
    '{{RECOVERY_LOW}}': fmtCurrency(rc.recovery_low_usd),
    '{{RECOVERY_HIGH}}': fmtCurrency(rc.recovery_high_usd),
    '{{MONTHLY_GAP}}': fmtCurrency(rc.monthly_gap_usd),
    '{{TAT_ACTUAL}}': String(input.avg_turnaround_min),
    '{{TAT_TARGET}}': String(rc.target_tat_min),
    '{{TAT_EXCESS}}': String(tatExcess),
    '{{TRIPS_ACTUAL}}': fmtDec(rc.actual_trips_per_truck_per_day),
    '{{TRIPS_TARGET}}': fmtDec(rc.target_trips_per_truck_per_day),
    '{{PARKED_TRUCKS}}': fmtDec(rc.parked_trucks_equivalent),
    '{{QUARTERLY_LOW}}': fmtCurrency(rc.quarterly_gap_low),
    '{{QUARTERLY_HIGH}}': fmtCurrency(rc.quarterly_gap_high),
    '{{ANNUAL_LOW}}': fmtCurrency(rc.annual_gap_low),
    '{{ANNUAL_HIGH}}': fmtCurrency(rc.annual_gap_high),
    '{{TRUCKS}}': String(input.trucks_assigned),
    '{{CONSTRAINT}}': rc.constraint,
  }

  let result = text
  for (const [token, value] of Object.entries(map)) {
    result = result.split(token).join(value)
  }

  // Strip unit suffixes AI may have added after currency tokens
  const unitPatterns = [
    /(\$[\d,]+)\s*(?:cubic meters|cubic metres|m³)/gi,
    /(\$[\d,]+)\s*(?:trips)/gi,
    /(\$[\d,]+)\s*(?:minutes|min)/gi,
  ]
  for (const pattern of unitPatterns) {
    const match = result.match(pattern)
    if (match) {
      console.warn('AI added unit suffix after token:', match[0])
    }
    result = result.replace(pattern, '$1')
  }

  // Scan for raw numbers the AI may have generated (digits > 2 chars, not years)
  const rawNumbers = result.match(/(?<!\d)\d{3,}(?!\d)/g)
  if (rawNumbers) {
    const nonYears = rawNumbers.filter(n => !(+n >= 2024 && +n <= 2030))
    if (nonYears.length > 0) {
      console.warn('AI generated raw number:', nonYears.slice(0, 3).join(', '))
    }
  }

  return result
}

/**
 * Build the deterministic bold summary line. Never AI-generated.
 */
export function assembleBoldSummaryLine(rc: ReportCalculations, input: ReportInput): string {
  if (rc.gap_driver === 'tat') {
    const targetTripsTotal = Math.round(rc.target_trips_per_truck_per_day * input.trucks_assigned)
    const actualTripsTotal = Math.round(rc.actual_trips_per_truck_per_day * input.trucks_assigned)
    const missingTrips = targetTripsTotal - actualTripsTotal
    const idlePct = targetTripsTotal > 0 ? Math.round((missingTrips / targetTripsTotal) * 100) : 0

    return `Your ${input.trucks_assigned} trucks completed ${actualTripsTotal} trips per day last month \u2014 ${missingTrips} fewer than the ${targetTripsTotal} daily trips the fleet would achieve at the ${rc.target_tat_min}-minute target. This ${idlePct}% gap is what this assessment will quantify and explain.`
  }

  // gap_driver === 'utilisation' or 'mixed'
  const targetM3 = Math.round(rc.target_daily_output_m3 * rc.op_days_per_month)
  const gapM3 = targetM3 - input.actual_production_last_month_m3
  const utilGapPct = targetM3 > 0 ? Math.round((gapM3 / targetM3) * 100) : 0

  return `Your plant produced ${input.actual_production_last_month_m3.toLocaleString('en-US')} m\u00B3 last month against a target of ${targetM3.toLocaleString('en-US')} m\u00B3. The ${gapM3.toLocaleString('en-US')} m\u00B3 shortfall represents ${utilGapPct}% of target capacity. This assessment will determine where this gap originates.`
}

/**
 * Build the deterministic bold summary line for Scenario B.
 */
export function assembleScenarioBBoldLine(sb: ScenarioBCalculations, input: ReportInput): string {
  const targetTripsTotal = Math.round(sb.target_trips_per_truck * input.trucks_assigned)
  const actualTripsTotal = Math.round(input.total_trips_last_month / (Math.round(input.operating_days_per_year / 12)))
  const missingTrips = Math.max(0, targetTripsTotal - actualTripsTotal)
  const idlePct = targetTripsTotal > 0 ? Math.round((missingTrips / targetTripsTotal) * 100) : 0

  return `Under normal operating conditions, your ${input.trucks_assigned} trucks would complete ${targetTripsTotal} trips per day at the ${sb.target_tat_min}-minute target. The current ${missingTrips} trip gap represents ${idlePct}% of that potential \u2014 addressable through operational improvements.`
}

/**
 * Replace Scenario B tokens in AI narrative.
 */
export function replaceScenarioBTokens(text: string, sb: ScenarioBCalculations, input: ReportInput): string {
  const map: Record<string, string> = {
    '{{B_RECOVERY_LOW}}': fmtCurrency(sb.recovery_low_usd),
    '{{B_RECOVERY_HIGH}}': fmtCurrency(sb.recovery_high_usd),
    '{{B_MONTHLY_GAP}}': fmtCurrency(sb.monthly_gap_usd),
    '{{B_TARGET_TRIPS}}': fmtDec(sb.target_trips_per_truck),
    '{{B_TRUCKS}}': String(input.trucks_assigned),
  }
  let result = text
  for (const [token, value] of Object.entries(map)) {
    result = result.split(token).join(value)
  }
  return result
}
