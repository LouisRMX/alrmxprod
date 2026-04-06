// ── Trip Analyzer ──────────────────────────────────────────────────────────
// Converts parsed CSV rows + targets into full TripRecord objects.
// Pure function — no Supabase dependency.

import type { ParsedRow } from './parser'

export interface TripRecord {
  // Identity
  truckId:          string
  tripDate:         string   // YYYY-MM-DD
  rowIndex:         number

  // Timestamps (ISO strings, ready for Supabase insert)
  dispatchedAt:     string
  siteArrivalAt:    string | null
  siteDepartureAt:  string | null
  returnedAt:       string

  // Durations (seconds)
  turnaroundS:      number
  transitToSiteS:   number | null
  siteDwellS:       number | null
  transitBackS:     number | null

  // vs target
  turnaroundTargetS: number
  turnaroundDelayS:  number  // max(0, turnaround - target)

  // Financial
  estLossUsd:       number | null   // null if no perMinTACoeff

  // Quality
  anomalyFlags:     string[]
  dataCompleteness: 'full' | 'partial' | 'minimal'
}

// Build an ISO timestamptz string from a YYYY-MM-DD date and HH:MM time.
// Treats time as local (no UTC offset applied — Supabase stores as-is).
function toTimestamp(date: string, time: string): string {
  return `${date}T${time}:00`
}

function diffSeconds(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000)
}

export interface AnalyzerOptions {
  date:            string   // YYYY-MM-DD
  targetTAMin:     number   // turnaround target in minutes
  perMinTACoeff:   number   // $/min of excess turnaround (0 = unknown)
}

export function analyzeTrips(
  rows: ParsedRow[],
  opts: AnalyzerOptions,
): TripRecord[] {
  const { date, targetTAMin, perMinTACoeff } = opts
  const targetS = Math.round(targetTAMin * 60)

  return rows.map(row => {
    const dispatchedAt    = toTimestamp(date, row.dispatch)
    const returnedAt      = toTimestamp(date, row.returnTime)
    const siteArrivalAt   = row.siteArrival    ? toTimestamp(date, row.siteArrival)    : null
    const siteDepartureAt = row.siteDeparture  ? toTimestamp(date, row.siteDeparture) : null

    const turnaroundS = diffSeconds(dispatchedAt, returnedAt)

    // Derived splits
    const transitToSiteS   = siteArrivalAt  ? diffSeconds(dispatchedAt, siteArrivalAt)   : null
    const siteDwellS       = siteArrivalAt && siteDepartureAt
      ? diffSeconds(siteArrivalAt, siteDepartureAt) : null
    const transitBackS     = siteDepartureAt ? diffSeconds(siteDepartureAt, returnedAt)  : null

    const turnaroundDelayS = Math.max(0, turnaroundS - targetS)
    const delayMin         = turnaroundDelayS / 60
    const estLossUsd       = perMinTACoeff > 0 ? Math.round(delayMin * perMinTACoeff * 100) / 100 : null

    // Anomaly detection
    const anomalyFlags: string[] = []
    if (turnaroundS > 0 && turnaroundS < 1800)  anomalyFlags.push('suspiciously_short')
    if (turnaroundS > 14400)                     anomalyFlags.push('possibly_incomplete')
    if (turnaroundS <= 0)                        anomalyFlags.push('invalid_timestamps')
    if (siteDwellS !== null && siteDwellS < 600) anomalyFlags.push('site_time_too_short')
    if (siteDwellS !== null && siteDwellS > 7200) anomalyFlags.push('site_time_too_long')

    // Data completeness
    let dataCompleteness: 'full' | 'partial' | 'minimal'
    if (siteArrivalAt && siteDepartureAt)  dataCompleteness = 'full'
    else if (siteArrivalAt)               dataCompleteness = 'partial'
    else                                  dataCompleteness = 'minimal'

    return {
      truckId:          row.truckId,
      tripDate:         date,
      rowIndex:         row.rowIndex,
      dispatchedAt,
      siteArrivalAt,
      siteDepartureAt,
      returnedAt,
      turnaroundS,
      transitToSiteS,
      siteDwellS,
      transitBackS,
      turnaroundTargetS: targetS,
      turnaroundDelayS,
      estLossUsd,
      anomalyFlags,
      dataCompleteness,
    }
  })
}

// Format seconds as "Xh Ymin" or "X min"
export function fmtDuration(s: number | null): string {
  if (s == null) return '—'
  const m = Math.round(s / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}min`
  return `${m} min`
}

// Format delay for "vs target" column
export function fmtDelay(delayS: number): string {
  if (delayS <= 0) return '—'
  return `+${fmtDuration(delayS)}`
}

// Summary stats across trips
export interface TripSummary {
  tripCount:         number
  avgTurnaroundMin:  number
  tripsOverTarget:   number
  totalEstLossUsd:   number | null
  targetTAMin:       number
}

export function summarizeTrips(trips: TripRecord[], targetTAMin: number): TripSummary {
  if (trips.length === 0) {
    return { tripCount: 0, avgTurnaroundMin: 0, tripsOverTarget: 0, totalEstLossUsd: null, targetTAMin }
  }

  const avgTurnaroundMin = Math.round(
    trips.reduce((s, t) => s + t.turnaroundS, 0) / trips.length / 60
  )
  const tripsOverTarget = trips.filter(t => t.turnaroundDelayS > 0).length
  const hasLoss = trips.some(t => t.estLossUsd != null)
  const totalEstLossUsd = hasLoss
    ? trips.reduce((s, t) => s + (t.estLossUsd ?? 0), 0)
    : null

  return { tripCount: trips.length, avgTurnaroundMin, tripsOverTarget, totalEstLossUsd, targetTAMin }
}
