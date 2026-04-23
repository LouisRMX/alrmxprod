/**
 * Utilization analysis engine.
 *
 * Inputs: normalized stop events (post-region-filter) + plant coordinates +
 * operational profile (margin, m³/load, batching mixer count).
 *
 * Outputs: current vs demonstrated-capacity gap, in loads/op-day and USD.
 *
 * Self-benchmarked model. "Demonstrated capacity" = top-2 operating
 * weeks averaged, by loads/operating-day. Not a target. Not an external
 * benchmark. The plant's own evidence that this output level is
 * achievable because it's been done.
 */

import type { NormalizedStopEvent } from './stopDetailsParser'
import type { OperatingDay } from './coordinateClustering'

// ── Trip reconstruction from stop events ─────────────────────────────────

export interface ReconstructedTrip {
  truckId: string
  plantSlug: string          // which plant the load came from
  loadStart: string          // ISO timestamp, truck entered plant geofence
  loadEnd: string            // truck left plant geofence
  siteArrival: string | null // first non-plant stop after loading
  siteDeparture: string | null
  tatMin: number | null      // plant-exit to next plant-entry
}

export interface PlantGeofence {
  slug: string
  name: string
  centroidLat: number
  centroidLon: number
  radiusM: number
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Classify each stop event by plant membership. */
export function classifyStopByPlant(
  event: NormalizedStopEvent,
  plants: PlantGeofence[],
): string | null {
  for (const p of plants) {
    const dist = haversineM(p.centroidLat, p.centroidLon, event.latitude, event.longitude)
    if (dist <= p.radiusM) return p.slug
  }
  return null // not at any plant → customer site / elsewhere
}

/**
 * Count "loads" — each stop at a plant by a mixer-truck is approximately
 * one loading event. This is a proxy; actual loading might not happen
 * on short transit-through stops, but for aggregate metrics (loads/day)
 * the approximation holds.
 *
 * Returns per-operating-day mixer-truck plant-stops.
 */
export function countLoadsPerOperatingDay(
  events: NormalizedStopEvent[],
  plants: PlantGeofence[],
  operatingDays: OperatingDay[],
): Map<string, { loads: number; activeMixers: Set<string>; perPlant: Map<string, number> }> {
  const operatingSet = new Set(operatingDays.filter(d => d.isOperating).map(d => d.date))
  const perDay = new Map<string, { loads: number; activeMixers: Set<string>; perPlant: Map<string, number> }>()

  for (const e of events) {
    if (e.truckType !== 'mixer_truck') continue
    const date = e.startedAt.slice(0, 10)
    if (!operatingSet.has(date)) continue
    const plantSlug = classifyStopByPlant(e, plants)
    if (!plantSlug) continue // not a load; site or other stop

    let rec = perDay.get(date)
    if (!rec) {
      rec = { loads: 0, activeMixers: new Set(), perPlant: new Map() }
      perDay.set(date, rec)
    }
    rec.loads += 1
    rec.activeMixers.add(e.truckId)
    rec.perPlant.set(plantSlug, (rec.perPlant.get(plantSlug) ?? 0) + 1)
  }
  return perDay
}

// ── Weekly aggregation ───────────────────────────────────────────────────

export interface WeeklyAggregate {
  /** First day of the 7-day rolling window (YYYY-MM-DD). */
  windowStart: string
  /** Last day (inclusive). */
  windowEnd: string
  /** Operating days within this window. */
  operatingDaysInWindow: number
  /** Total plant-stop loads across the window. */
  totalLoads: number
  /** Loads per operating day (key ranking metric). */
  loadsPerOpDay: number
  /** Avg distinct active mixer-trucks per operating day. */
  avgActiveMixers: number
  /** Trips per active mixer-truck per operating day. */
  tripsPerTruckPerOpDay: number
}

/**
 * Build rolling 7-day windows across the operating-day calendar, one per
 * calendar day start. Each window is evaluated on operating-day basis
 * (window_operating_days can be 0-7 depending on weekends/holidays in it).
 */
export function buildWeeklyAggregates(
  perDayLoads: Map<string, { loads: number; activeMixers: Set<string>; perPlant: Map<string, number> }>,
  operatingDays: OperatingDay[],
): WeeklyAggregate[] {
  const operating = operatingDays.filter(d => d.isOperating)
  if (operating.length < 7) return [] // need at least one full-ish week

  // Sort operating days chronologically
  operating.sort((a, b) => a.date.localeCompare(b.date))

  const out: WeeklyAggregate[] = []
  // Rolling window of 7 consecutive operating days (not 7 calendar days —
  // we want "best 7 working days" not "best 7-day period that might
  // contain only 4 working days")
  for (let i = 0; i + 7 <= operating.length; i++) {
    const window = operating.slice(i, i + 7)
    let totalLoads = 0
    const allMixers = new Set<string>()
    let sumActivePerDay = 0

    for (const d of window) {
      const rec = perDayLoads.get(d.date)
      if (!rec) continue
      totalLoads += rec.loads
      rec.activeMixers.forEach(id => allMixers.add(id))
      sumActivePerDay += rec.activeMixers.size
    }

    const loadsPerOpDay = totalLoads / 7
    const avgActiveMixers = sumActivePerDay / 7
    const tripsPerTruckPerOpDay = avgActiveMixers > 0 ? loadsPerOpDay / avgActiveMixers : 0

    out.push({
      windowStart: window[0].date,
      windowEnd: window[window.length - 1].date,
      operatingDaysInWindow: 7,
      totalLoads,
      loadsPerOpDay,
      avgActiveMixers,
      tripsPerTruckPerOpDay,
    })
  }
  return out
}

// ── Current + Demonstrated + Peak ────────────────────────────────────────

export interface UtilizationMetrics {
  current: MetricSet
  demonstrated: MetricSet | null  // null if <2 operating weeks available
  peak: MetricSet | null           // null if <1 operating week
  demonstratedWeeks: Array<{ weekStart: string; loadsPerOpDay: number }>
  peakWeekStart: string | null
  computationNotes: string[]
}

export interface MetricSet {
  loadsPerOpDay: number
  tripsPerTruckPerOpDay: number
  activeMixers: number
}

export function computeUtilizationMetrics(
  perDayLoads: ReturnType<typeof countLoadsPerOperatingDay>,
  operatingDays: OperatingDay[],
): UtilizationMetrics {
  const notes: string[] = []

  // ── Current: rolling 30 days (or full window if shorter), operating-day normalized ──
  const operating = operatingDays.filter(d => d.isOperating)
  const currentWindow = operating.slice(-30)
  let currentLoads = 0
  let currentSumMixers = 0
  for (const d of currentWindow) {
    const rec = perDayLoads.get(d.date)
    if (!rec) continue
    currentLoads += rec.loads
    currentSumMixers += rec.activeMixers.size
  }
  const currentOpDays = currentWindow.length
  const currentLoadsPerOpDay = currentOpDays > 0 ? currentLoads / currentOpDays : 0
  const currentAvgMixers = currentOpDays > 0 ? currentSumMixers / currentOpDays : 0
  const currentTripsPerTruck =
    currentAvgMixers > 0 ? currentLoadsPerOpDay / currentAvgMixers : 0

  // ── Weekly aggregates ──
  const weeks = buildWeeklyAggregates(perDayLoads, operatingDays)
  if (weeks.length === 0) {
    notes.push('Not enough operating days to compute weekly aggregates (need ≥7)')
    return {
      current: {
        loadsPerOpDay: currentLoadsPerOpDay,
        tripsPerTruckPerOpDay: currentTripsPerTruck,
        activeMixers: currentAvgMixers,
      },
      demonstrated: null,
      peak: null,
      demonstratedWeeks: [],
      peakWeekStart: null,
      computationNotes: notes,
    }
  }

  // ── Peak: single best week by loads/op-day ──
  const sortedWeeks = [...weeks].sort((a, b) => b.loadsPerOpDay - a.loadsPerOpDay)
  const peakWeek = sortedWeeks[0]

  // ── Demonstrated: top-2 weeks averaged ──
  let demonstrated: MetricSet | null = null
  let demonstratedWeeks: Array<{ weekStart: string; loadsPerOpDay: number }> = []
  if (sortedWeeks.length >= 2) {
    const top2 = sortedWeeks.slice(0, 2)
    demonstrated = {
      loadsPerOpDay: (top2[0].loadsPerOpDay + top2[1].loadsPerOpDay) / 2,
      tripsPerTruckPerOpDay: (top2[0].tripsPerTruckPerOpDay + top2[1].tripsPerTruckPerOpDay) / 2,
      activeMixers: (top2[0].avgActiveMixers + top2[1].avgActiveMixers) / 2,
    }
    demonstratedWeeks = top2.map(w => ({
      weekStart: w.windowStart,
      loadsPerOpDay: w.loadsPerOpDay,
    }))
    notes.push(`Demonstrated capacity = average of top-2 operating weeks (${top2[0].windowStart} and ${top2[1].windowStart})`)
  } else {
    notes.push(`Only ${sortedWeeks.length} operating week(s) — demonstrated capacity not computable (need ≥2)`)
  }

  // Flag outlier-risk: if peak is >20% above demonstrated, peak is an outlier.
  if (demonstrated && peakWeek.loadsPerOpDay > demonstrated.loadsPerOpDay * 1.2) {
    notes.push(
      `Peak week (${peakWeek.windowStart}) is ${Math.round(
        (peakWeek.loadsPerOpDay / demonstrated.loadsPerOpDay - 1) * 100,
      )}% above demonstrated capacity — possible outlier`,
    )
  }

  return {
    current: {
      loadsPerOpDay: currentLoadsPerOpDay,
      tripsPerTruckPerOpDay: currentTripsPerTruck,
      activeMixers: currentAvgMixers,
    },
    demonstrated,
    peak: {
      loadsPerOpDay: peakWeek.loadsPerOpDay,
      tripsPerTruckPerOpDay: peakWeek.tripsPerTruckPerOpDay,
      activeMixers: peakWeek.avgActiveMixers,
    },
    demonstratedWeeks,
    peakWeekStart: peakWeek.windowStart,
    computationNotes: notes,
  }
}

// ── Gap + monthly USD value ──────────────────────────────────────────────

export interface FinancialInputs {
  m3PerLoad: number
  marginPerM3: number
  /** Monthly operating days baseline. If omitted, uses observed
   *  operating-day rate in window × 30 / window days. Default 25
   *  (= OMIX pre-assessment's "305 op days/year ÷ 12 months"). */
  monthlyOperatingDays?: number
}

export interface GapMetrics {
  gapLoadsPerOpDay: number         // demonstrated - current
  gapPctOfDemonstrated: number     // gap / demonstrated
  monthlyValueUsd: number          // gap × m³/load × margin × monthly_op_days
  perLoadMargin: number            // m³/load × margin (for labeling)
}

export function computeGap(
  metrics: UtilizationMetrics,
  financial: FinancialInputs,
): GapMetrics | null {
  if (!metrics.demonstrated) return null
  const gap = Math.max(0, metrics.demonstrated.loadsPerOpDay - metrics.current.loadsPerOpDay)
  const perLoadMargin = financial.m3PerLoad * financial.marginPerM3
  const monthlyDays = financial.monthlyOperatingDays ?? 25
  const monthlyValue = gap * perLoadMargin * monthlyDays
  return {
    gapLoadsPerOpDay: gap,
    gapPctOfDemonstrated: metrics.demonstrated.loadsPerOpDay > 0
      ? gap / metrics.demonstrated.loadsPerOpDay
      : 0,
    monthlyValueUsd: monthlyValue,
    perLoadMargin,
  }
}
