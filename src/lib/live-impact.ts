/**
 * alRMX Live Impact Text Generator
 * Shows real-time calculation impact below each question input.
 */

import type { CalcResult, Answers } from './calculations'

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

/**
 * Returns live impact text lines for a given question, or null if no impact to show.
 */
export function getLiveImpact(questionId: string, r: CalcResult, a: Answers): string[] | null {
  switch (questionId) {
    case 'actual_prod': {
      if (r.monthlyM3 <= 0 || r.cap <= 0) return null
      const utilPct = Math.round(r.util * 100)
      const avgLine = `Average output: ${r.actual.toFixed(1)} m³/hr (${r.monthlyM3.toLocaleString()} m³ ÷ ${Math.round(r.opH * (r.opD / 12))} hours/month)`
      if (r.util < 0.92) {
        const gapPts = Math.round((0.92 - r.util) * 100)
        const dollarLine = r.capLeakMonthly > 0
          ? `Capacity gap costs ${fmt(r.capLeakMonthly)}/month in lost contribution margin`
          : 'Enter economics data to calculate dollar impact'
        return [avgLine, `Utilization: ${utilPct}% — ${gapPts} points below 92% target`, dollarLine]
      }
      return [avgLine, `Utilization: ${utilPct}% — at or above 92% target`, 'Production is not the primary constraint at this plant']
    }

    case 'turnaround': {
      if (r.ta <= 0) return null
      if (r.excessMin > 0) {
        const perMin = r.turnaroundLeakMonthly > 0
          ? `Each extra minute costs ${fmt(Math.round(r.turnaroundLeakMonthly / r.excessMin))}/month`
          : 'Enter economics data for dollar estimate'
        return [
          `+${r.excessMin} min above ${r.TARGET_TA}-min regional target`,
          r.turnaroundLeakMonthly > 0 ? `Lost delivery capacity: ${fmt(r.turnaroundLeakMonthly)}/month` : 'Enter economics data for dollar estimate',
          perMin,
        ]
      }
      return [`${r.ta} min — within ${r.TARGET_TA}-min regional target`, 'Fleet turnaround is not the primary constraint at this plant']
    }

    case 'deliveries_day': {
      if (r.delDay <= 0 || r.realisticMaxDel <= 0) return null
      if (r.hiddenSuspect) {
        return ['Check inputs — gap seems unusually large', 'Verify turnaround time, operating hours, and daily deliveries are consistent']
      }
      if (r.hiddenDel > 0) {
        const dollarLine = r.hiddenRevMonthly > 0
          ? `${fmt(r.hiddenRevMonthly)}/month in reachable contribution margin`
          : 'Enter economics data for dollar estimate'
        return [
          `Best practice target: ${r.realisticMaxDel} deliveries/day (${r.trucks} trucks at 85% utilisation, ${r.TARGET_TA}-min turnaround)`,
          `Current: ${r.delDay} — gap of ${r.hiddenDel} deliveries/day`,
          dollarLine,
        ]
      }
      return [`At or above best practice target of ${r.realisticMaxDel} deliveries/day`, 'Fleet utilisation is strong — focus on dispatch and turnaround time']
    }

    case 'reject_pct': {
      if (r.rejectPct <= 0) return null
      const perPct = r.rejectPct > 0 ? Math.round(r.rejectLeakMonthly / r.rejectPct) : 0
      return [
        r.rejectLeakMonthly > 0 ? `Full write-off cost: ${fmt(r.rejectLeakMonthly)}/month` : 'Enter economics data for dollar estimate',
        perPct > 0 ? `Each 1% reduction saves ${fmt(perPct)}/month` : '',
      ].filter(Boolean)
    }

    case 'price_m3':
    case 'cement_cost':
    case 'aggregate_cost':
    case 'admix_cost': {
      if (r.price <= 0) return null
      const lines = [`Contribution margin: ${fmt(r.contrib)}/m³ (${Math.round(r.marginRatio * 100)}% of selling price)`]
      if (r.marginRatio >= 0.95) {
        // No meaningful costs entered yet — margin is just the selling price
        lines.push('Material costs not yet entered — margin will update as you answer cement, aggregate and admixture questions.')
      } else if (r.marginIncomplete) {
        lines.push('Warning: aggregate and admixture costs not entered — actual margin is likely $8–15/m³ lower than shown.')
      } else if (r.price < 45 || r.price > 150) {
        lines.push(`Note: selling price ${r.price < 45 ? 'below' : 'above'} typical GCC range — double-check the figure.`)
      } else if (r.contrib < 12) {
        lines.push('Warning: margin below $12/m³ — verify all material costs are entered correctly.')
      } else if (r.contrib > 55) {
        lines.push('Note: margin above $55/m³ — confirm this excludes fixed overhead costs.')
      } else {
        lines.push('Margin looks realistic for ready-mix in this region.')
      }
      return lines
    }

    case 'order_to_dispatch': {
      const DELAY_MAP: Record<string, number> = {
        'Under 15 minutes — fast response': 0,
        '15 to 25 minutes — acceptable': 10,
        '25 to 40 minutes — slow': 27,
        'Over 40 minutes — critical bottleneck': 42,
      }
      const ex = DELAY_MAP[a.order_to_dispatch as string]
      if (ex === undefined) return null
      if (ex === 0) {
        return ['Under 15 min — dispatch is within best practice target']
      }
      if (r.trucks > 0 && r.contrib > 0) {
        const cost = Math.round(ex / 60 * r.trucks * 0.25 * r.contrib * r.mixCap * (r.opD / 12))
        return [`~${ex} min above 15-min target per order`, `Estimated dispatch delay cost: ${fmt(cost)}/month`]
      }
      return [`~${ex} min above 15-min target — enter economics data for dollar estimate`]
    }

    default:
      return null
  }
}
