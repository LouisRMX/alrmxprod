/**
 * GPS Report Generator, Layer 5
 *
 * Fills the fixed Logistics Intelligence template with computed metrics.
 * Returns a plain text string stored in logistics_analysis_results.generated_section_text.
 * No AI involved, deterministic template substitution only.
 */

import type { GpsAnalysisMetrics } from './metricsEngine'

function fmt(v: number | null, unit = ''): string {
  if (v === null) return 'N/A'
  return `${v}${unit ? ' ' + unit : ''}`
}

function confidenceLabel(score: number): string {
  if (score >= 0.8) return 'High'
  if (score >= 0.6) return 'Moderate'
  if (score >= 0.4) return 'Low, treat as directional only'
  return 'Insufficient'
}

function unavailableMsg(metric: string): string {
  return `${metric}: Insufficient data quality to calculate reliably.`
}

export function generateLogisticsSection(
  metrics: GpsAnalysisMetrics,
  dateRangeDays?: number,
): string {
  const { turnaround, siteWait, returnLoads, fleet, confidenceScore } = metrics

  // If confidence too low, return null indicator (caller should not store section)
  if (confidenceScore < 0.4) {
    return '__INSUFFICIENT_DATA__'
  }

  const confLabel = confidenceLabel(confidenceScore)
  const confPct = Math.round(confidenceScore * 100)
  const days = dateRangeDays ?? fleet.dateRangeDays

  const lines: string[] = []

  // ── Header metadata (no section title, ReportView renders that) ─────────
  lines.push(
    `Based on ${fleet.tripsAnalyzed} deliveries across ${fleet.trucksAnalyzed} trucks over ${days} days.`
  )
  lines.push(`Analysis confidence: ${confLabel} (${confPct}%)`)
  lines.push('')

  // ── Turnaround Performance ────────────────────────────────
  lines.push('TURNAROUND PERFORMANCE')

  if (!turnaround.avg.available || turnaround.avg.value === null) {
    lines.push(unavailableMsg('Turnaround time'))
  } else {
    const avg = turnaround.avg.value
    const target = turnaround.targetTa
    const radius = turnaround.deliveryRadiusKm
    const p90 = turnaround.p90.value

    lines.push(
      `Average turnaround time: ${avg} minutes` +
      ` (Plant target: ${target} min based on ${radius} km delivery radius` +
      (p90 !== null ? ` | P90: ${p90} min)` : ')')
    )

    if (avg > target * 1.2) {
      const over = Math.round(avg - target)
      const extraTrips = fleet.avgTripsPerTruckPerDay && fleet.trucksAnalyzed
        ? Math.round((20 / avg) * fleet.trucksAnalyzed * fleet.avgTripsPerTruckPerDay * 10) / 10
        : null

      lines.push(
        `Turnaround time is ${over} minutes above plant target. With ${fleet.trucksAnalyzed} trucks` +
        ` and ${fmt(fleet.avgTripsPerTruckPerDay)} trips per truck per day,` +
        ` a 20-minute reduction would yield approximately` +
        ` ${extraTrips !== null ? extraTrips : 'additional'} extra delivery capacity per day` +
        ` without fleet expansion.`
      )
    } else if (avg > target) {
      const over = Math.round(avg - target)
      lines.push(
        `Turnaround time is within acceptable range but above plant target by ${over} minutes.` +
        ` Targeted dispatch improvements could recover additional capacity per truck per day.`
      )
    } else {
      lines.push(
        `Turnaround time is performing at or below plant target. Fleet capacity is being used effectively.`
      )
    }
    if (turnaround.avg.isEstimate) {
      lines.push(`Note: Based on limited trip sample, treat as directional indicator.`)
    }
  }
  lines.push('')

  // ── Site Waiting Time ────────────────────────────────────
  lines.push('SITE WAITING TIME')

  if (!siteWait.avg.available || siteWait.avg.value === null) {
    lines.push(unavailableMsg('Site waiting time'))
  } else {
    const avg = siteWait.avg.value
    const med = siteWait.median.value

    lines.push(
      `Average site waiting time: ${avg} minutes` +
      ` (Benchmark: 25 minutes` +
      (med !== null ? ` | Median: ${med} min)` : ')')
    )

    if (avg > 40) {
      const over = Math.round(avg - 25)
      const hoursPerDay = fleet.trucksAnalyzed && fleet.avgTripsPerTruckPerDay
        ? Math.round(((avg - 25) / 60) * fleet.trucksAnalyzed * fleet.avgTripsPerTruckPerDay * 10) / 10
        : null

      lines.push(
        `Site waiting time is ${over} minutes above benchmark across ${fleet.tripsAnalyzed} analysed trips.` +
        (hoursPerDay !== null
          ? ` This represents approximately ${hoursPerDay} hours of unproductive truck time per day` +
            ` and direct demurrage exposure if not invoiced to clients.`
          : ' This represents direct demurrage exposure if not invoiced to clients.')
      )
    } else if (avg > 25) {
      lines.push(
        `Waiting time is moderately elevated. Likely site-specific friction rather than a systemic dispatch issue.`
      )
    } else {
      lines.push(`Site waiting time is within benchmark.`)
    }
  }
  lines.push('')

  // ── Return Load Signals ──────────────────────────────────
  lines.push('RETURN LOAD SIGNALS')

  if (!returnLoads.available) {
    lines.push(unavailableMsg('Return load analysis'))
  } else {
    lines.push(
      `Probable return loads identified: ${returnLoads.count}` +
      ` (${returnLoads.pct}% of analysed trips)`
    )

    if (returnLoads.pct > 5) {
      lines.push(
        `${returnLoads.pct}% of trips show characteristics consistent with load rejection or return load.` +
        ` Average load value and size should be confirmed with plant records for precise leakage calculation.`
      )
    } else {
      lines.push(
        `Return load rate is low. No significant rejection or refusal pattern detected in available data.`
      )
    }
  }
  lines.push('')

  // ── Data Note ────────────────────────────────────────────
  lines.push('DATA NOTE')
  lines.push(
    `This analysis is derived from GPS/fleet export data provided by the plant.` +
    ` Metrics marked as estimates are based on inferred trip boundaries and should be treated as directional indicators.` +
    ` Precise figures require cross-referencing with batch records and dispatch logs` +
    `, a component of the full Al-RMX physical assessment.`
  )

  return lines.join('\n')
}
