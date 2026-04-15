/**
 * Report assembly: token replacement and deterministic text generation.
 * Pure functions, zero side effects.
 */

import type { ReportCalculations, ReportInput } from './reportCalculations'

function fmtCurrency(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

function fmtDec(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1)
}

function fmtM3(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/**
 * Replace {{TOKEN}} placeholders in AI narrative with formatted rc values.
 * Returns the processed text.
 */
export function replaceNarrativeTokens(text: string, rc: ReportCalculations, input: ReportInput): string {
  const tatExcess = Math.max(0, input.avg_turnaround_min - rc.target_tat_min)
  // Monthly actual range (daily × op_days), re-rounded to nearest 50 outward
  const actualMonthlyLow = Math.floor(rc.actual_daily_m3_low * rc.op_days_per_month / 50) * 50
  const actualMonthlyHigh = Math.ceil(rc.actual_daily_m3_high * rc.op_days_per_month / 50) * 50
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
    '{{GAP_M3_LOW}}': fmtM3(rc.monthly_gap_m3_low),
    '{{GAP_M3_HIGH}}': fmtM3(rc.monthly_gap_m3_high),
    '{{ACTUAL_M3_LOW}}': fmtM3(actualMonthlyLow),
    '{{ACTUAL_M3_HIGH}}': fmtM3(actualMonthlyHigh),
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
  const gapLowStr = fmtM3(rc.monthly_gap_m3_low)
  const gapHighStr = fmtM3(rc.monthly_gap_m3_high)

  if (rc.gap_driver === 'tat') {
    const targetTripsTotal = Math.round(rc.target_trips_per_truck_per_day * input.trucks_assigned)
    const actualTripsTotal = Math.round(rc.actual_trips_per_truck_per_day * input.trucks_assigned)
    const missingTrips = targetTripsTotal - actualTripsTotal
    const idlePct = targetTripsTotal > 0 ? Math.round((missingTrips / targetTripsTotal) * 100) : 0

    return `Your ${input.trucks_assigned} trucks completed ${actualTripsTotal} trips per day last month \u2014 ${missingTrips} fewer than the ${targetTripsTotal} daily trips the fleet would achieve at the ${rc.target_tat_min}-minute target. This ${idlePct}% gap \u2014 equivalent to ${gapLowStr}-${gapHighStr} m\u00B3 of unrealised monthly output \u2014 is what this assessment will quantify and explain.`
  }

  // gap_driver === 'utilisation' or 'mixed'
  const targetM3 = Math.round(rc.target_daily_output_m3 * rc.op_days_per_month)
  const actualLowMonthly = Math.floor(rc.actual_daily_m3_low * rc.op_days_per_month / 50) * 50
  const actualHighMonthly = Math.ceil(rc.actual_daily_m3_high * rc.op_days_per_month / 50) * 50
  const utilGapPct = targetM3 > 0 ? Math.round((rc.monthly_gap_m3 / targetM3) * 100) : 0

  return `Your plant produced ${fmtM3(actualLowMonthly)}-${fmtM3(actualHighMonthly)} m\u00B3 last month against a target of ${fmtM3(targetM3)} m\u00B3. The ${gapLowStr}-${gapHighStr} m\u00B3 shortfall represents ${utilGapPct}% of available capacity. This assessment will determine where this gap originates.`
}
