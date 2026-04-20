/**
 * Pure functions that compute TAT stage durations, medians, and outliers
 * from raw daily_logs rows. Kept separate from UI so they can be tested
 * and reused in Word exports.
 */

import type { DailyLogRow } from '@/lib/fieldlog/types'

// Re-export for backwards compatibility with consumers.
// The new stage-timer columns live on DailyLogRow itself now.
export type DailyLogWithStages = DailyLogRow

export const STAGE_KEYS = [
  'plant_queue',
  'loading',
  'weighbridge',
  'transit_out',
  'site_wait',
  'pouring',
  'site_washout',
  'transit_back',
  'plant_prep',
] as const

export type StageKey = (typeof STAGE_KEYS)[number]

export interface TripWithStageDurations {
  id: string
  truckId: string | null
  driverName: string | null
  siteName: string | null
  measurerName: string | null
  isPartial: boolean
  logDate: string
  /** Per-stage duration in minutes, or null if stage couldn't be measured. */
  stageMinutes: Record<StageKey, number | null>
  totalMinutes: number | null
}

/** Diff two ISO timestamps as minutes. Returns null if either is missing. */
function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000
  return diff >= 0 ? Math.round(diff * 10) / 10 : null
}

/** Extract the 9 stage durations from a raw daily_logs row. */
export function computeStageDurations(row: DailyLogWithStages): TripWithStageDurations {
  const stageMinutes: Record<StageKey, number | null> = {
    plant_queue: minutesBetween(row.plant_queue_start, row.loading_start),
    loading: minutesBetween(row.loading_start, row.loading_end),
    weighbridge: minutesBetween(row.loading_end, row.departure_loaded),
    transit_out: minutesBetween(row.departure_loaded, row.arrival_site),
    site_wait: minutesBetween(row.arrival_site, row.discharge_start),
    pouring: minutesBetween(row.discharge_start, row.discharge_end),
    site_washout: minutesBetween(row.discharge_end, row.departure_site),
    transit_back: minutesBetween(row.departure_site, row.arrival_plant),
    plant_prep: minutesBetween(row.arrival_plant, row.plant_prep_end),
  }

  // Total TAT spans plant_queue_start → plant_prep_end (truck fully ready for
  // next load). Falls back to arrival_plant when plant_prep_end is missing
  // (older trip, or the observer didn't tap the final stage).
  const totalFromEnds = minutesBetween(
    row.plant_queue_start ?? row.departure_loaded,
    row.plant_prep_end ?? row.arrival_plant,
  )
  const totalFromSum = Object.values(stageMinutes).some(v => v !== null)
    ? Object.values(stageMinutes).reduce<number>((acc, v) => acc + (v ?? 0), 0)
    : null
  const totalMinutes: number | null = totalFromEnds ?? totalFromSum

  return {
    id: row.id,
    truckId: row.truck_id ?? null,
    driverName: row.driver_name ?? null,
    siteName: row.site_name ?? null,
    measurerName: row.measurer_name ?? null,
    isPartial: Boolean(row.is_partial),
    logDate: row.log_date,
    stageMinutes,
    totalMinutes,
  }
}

/** Median of non-null numbers (sorted). */
export function median(values: Array<number | null | undefined>): number | null {
  const sorted = values
    .filter((v): v is number => typeof v === 'number' && !isNaN(v))
    .sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Return the values below the 25th percentile, above the 75th, and IQR. */
export function quartiles(values: Array<number | null | undefined>) {
  const sorted = values
    .filter((v): v is number => typeof v === 'number' && !isNaN(v))
    .sort((a, b) => a - b)
  if (sorted.length < 4) return { q1: null, q3: null, iqr: null }
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  return { q1, q3, iqr: q3 - q1 }
}

export interface StageSummary {
  stage: StageKey
  median: number | null
  p25: number | null
  p75: number | null
  /** Count of trips that have a measured value for this stage. */
  count: number
  /** Share of total median TAT this stage represents (for top-contributor panel). */
  shareOfTotalPct: number | null
}

/** Summarise each stage across a list of trips. */
export function summariseStages(trips: TripWithStageDurations[]): StageSummary[] {
  const medians: Record<StageKey, number | null> = {} as Record<StageKey, number | null>
  const qs: Record<StageKey, { q1: number | null; q3: number | null }> = {} as Record<StageKey, { q1: number | null; q3: number | null }>
  const counts: Record<StageKey, number> = {} as Record<StageKey, number>

  for (const stage of STAGE_KEYS) {
    const values = trips.map(t => t.stageMinutes[stage])
    medians[stage] = median(values)
    const q = quartiles(values)
    qs[stage] = { q1: q.q1, q3: q.q3 }
    counts[stage] = values.filter(v => typeof v === 'number').length
  }

  const totalMedian = STAGE_KEYS.reduce((acc, s) => acc + (medians[s] ?? 0), 0)

  return STAGE_KEYS.map(stage => ({
    stage,
    median: medians[stage],
    p25: qs[stage].q1,
    p75: qs[stage].q3,
    count: counts[stage],
    shareOfTotalPct: medians[stage] !== null && totalMedian > 0
      ? Math.round((medians[stage]! / totalMedian) * 100)
      : null,
  }))
}

export interface OutlierTrip extends TripWithStageDurations {
  /** Why this trip was flagged (e.g. "Site wait 52 min (vs median 18)"). */
  reason: string
  /** The stage key that drove the outlier classification. */
  driver: StageKey | 'total'
  /** The value that triggered (minutes). */
  value: number
}

/**
 * Identify outliers: trips where any stage is > p75 + 1.5 × IQR. Returns up
 * to `limit` outliers sorted by magnitude (how far above the upper fence).
 */
export function findOutliers(trips: TripWithStageDurations[], limit = 5): OutlierTrip[] {
  const outliers: Array<OutlierTrip & { excess: number }> = []

  for (const stage of STAGE_KEYS) {
    const values = trips.map(t => t.stageMinutes[stage]).filter((v): v is number => typeof v === 'number')
    if (values.length < 4) continue
    const { q3, iqr } = quartiles(values)
    if (q3 === null || iqr === null) continue
    const fence = q3 + 1.5 * iqr
    const medianValue = median(values) ?? 0
    for (const trip of trips) {
      const v = trip.stageMinutes[stage]
      if (typeof v === 'number' && v > fence) {
        outliers.push({
          ...trip,
          reason: `${formatStageName(stage)} ${v.toFixed(0)} min (median ${medianValue.toFixed(0)})`,
          driver: stage,
          value: v,
          excess: v - fence,
        })
      }
    }
  }

  // Dedup: keep the largest outlier per trip
  const byTrip = new Map<string, OutlierTrip & { excess: number }>()
  for (const o of outliers) {
    const existing = byTrip.get(o.id)
    if (!existing || o.excess > existing.excess) byTrip.set(o.id, o)
  }

  return Array.from(byTrip.values())
    .sort((a, b) => b.excess - a.excess)
    .slice(0, limit)
    .map(({ excess: _e, ...rest }) => rest)  // eslint-disable-line @typescript-eslint/no-unused-vars
}

export function formatStageName(stage: StageKey): string {
  return {
    plant_queue: 'Plant queue',
    loading: 'Loading',
    weighbridge: 'Weighbridge',
    transit_out: 'Transit out',
    site_wait: 'Site wait',
    pouring: 'Pouring',
    site_washout: 'Site washout',
    transit_back: 'Transit back',
    plant_prep: 'Plant prep',
  }[stage]
}
