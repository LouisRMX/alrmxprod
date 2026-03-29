/**
 * alRMX Guided Visit Mode — Trigger Logic
 * Determines which deep-dive question groups to show based on core answers.
 */

import type { CalcResult, Answers } from './calculations'

export interface GuidedTrigger {
  id: string
  icon: string
  title: string
  why: string
  ids: string[]
}

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

const GCC_COUNTRIES = ['Saudi Arabia', 'UAE', 'Kuwait', 'Qatar', 'Bahrain']

export function getGuidedTriggers(r: CalcResult, a: Answers, meta?: { country?: string }): GuidedTrigger[] {
  const triggers: GuidedTrigger[] = []

  if (r.ta > 0 && r.excessMin > 10) {
    triggers.push({
      id: 'turnaround',
      icon: '',
      title: 'Turnaround deep-dive',
      why: `Turnaround is ${r.ta} min — ${r.excessMin} min above the ${r.TARGET_TA}-min target. Where is the time going?`,
      ids: ['site_wait_time', 'washout_time', 'delivery_radius'],
    })
  }

  if (r.rejectPct > 2) {
    triggers.push({
      id: 'reject',
      icon: '',
      title: 'Reject & return rate',
      why: `${r.rejectPct}% reject rate is above the 1.5% threshold — ${fmt(r.rejectLeakMonthly)}/month.`,
      ids: ['reject_cause', 'return_liability', 'demurrage_policy', 'surplus_concrete'],
    })
  }

  if (r.hiddenDel > 5 && !r.hiddenSuspect) {
    triggers.push({
      id: 'capacity',
      icon: '',
      title: 'Hidden capacity',
      why: `${r.hiddenDel} deliveries/day unrealised — potential ${fmt(r.hiddenRevMonthly)}/month.`,
      ids: ['truck_availability', 'qualified_drivers', 'partial_load_size'],
    })
  }

  const truckAvail = +(a.truck_availability ?? 0) || 0
  const nTrucks = +(a.n_trucks ?? 0) || 0
  if (truckAvail > 0 && nTrucks > 0 && truckAvail / nTrucks < 0.85) {
    triggers.push({
      id: 'maintenance',
      icon: '',
      title: 'Fleet maintenance',
      why: `Only ${truckAvail} of ${nTrucks} trucks operative — ${Math.round(truckAvail / nTrucks * 100)}% availability.`,
      ids: ['maint_programme', 'truck_breakdowns'],
    })
  }

  if (r.util < 0.75 && r.actual > 0) {
    triggers.push({
      id: 'production',
      icon: '',
      title: 'Production efficiency',
      why: `Plant running at ${Math.round(r.util * 100)}% — ${Math.round((0.92 - r.util) * 100)} points below 92% target.`,
      ids: ['batch_cycle', 'stops_freq', 'operator_backup', 'batch_calibration'],
    })
  }

  if (+(a.cement_cost ?? 0) > 0) {
    triggers.push({
      id: 'mix',
      icon: '',
      title: 'Mix design & margin',
      why: 'Cement cost entered — check if mix design is optimised and margin is fully costed.',
      ids: ['mix_design_review', 'admix_strategy', 'high_strength_price', 'aggregate_cost', 'admix_cost'],
    })
  }

  const country = meta?.country || ''
  if (GCC_COUNTRIES.includes(country)) {
    triggers.push({
      id: 'gcc',
      icon: '',
      title: 'GCC operational factors',
      why: 'GCC-specific factors — Ramadan, summer heat, cement and aggregate supply.',
      ids: ['ramadan_schedule', 'summer_cooling', 'silo_days', 'aggregate_days'],
    })
  }

  triggers.push({
    id: 'supplementary',
    icon: '',
    title: 'Additional context',
    why: 'Supplementary data that improves report accuracy and dollar estimates.',
    ids: ['mixer_capacity', 'fuel_per_delivery', 'water_cost', 'order_notice', 'top_customer_pct', 'data_freshness', 'data_observed', 'data_crosscheck'],
  })

  return triggers
}
