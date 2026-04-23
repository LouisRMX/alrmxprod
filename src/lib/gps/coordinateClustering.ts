/**
 * Coordinate clustering + operating-day classification for Stop Details data.
 *
 * Two jobs:
 *   1. Group stop events by coordinate cluster so plants + customer sites
 *      can be identified without hardcoded locations. Output is a ranked
 *      list that the user confirms (see plant_operational_profile).
 *   2. Classify each calendar day as operating or non-operating. Operating
 *      day = day where ≥50% of the in-scope fleet has ≥1 stop AND the day
 *      is not a Friday (Islamic weekend in Saudi Arabia).
 *
 * Operating-day classification drives the utilization engine: current avg
 * and demonstrated capacity are both computed on a per-operating-day basis,
 * not per calendar day, so weekends and holidays don't distort the numbers.
 */

import type { NormalizedStopEvent } from './stopDetailsParser'

// ── Coordinate clustering ────────────────────────────────────────────────

export type ClusterPrecision = 'coarse' | 'fine'

export interface ClusterSummary {
  /** "lat,lon" rounded to the precision's decimal count. */
  clusterKey: string
  /** True center of mass of the events in this cluster. */
  centroid: { lat: number; lon: number }
  stopCount: number
  distinctTrucks: number
  mixerStops: number
  pumpStops: number
  otherStops: number
  /** Share of stops made by mixer trucks (0-1). High share = plant candidate. */
  mixerShare: number
  /** ISO date of first stop in this cluster. */
  firstSeen: string
  /** ISO date of last stop in this cluster. */
  lastSeen: string
  /** Number of distinct operating days the cluster was visited on. */
  daysVisited: number
}

/** Decimal places per precision level. Coarse = 2 decimals ≈ 1km.
 *  Fine = 3 decimals ≈ 100m (useful for distinguishing adjacent buildings
 *  on the same site, but noisier). */
const PRECISION_DECIMALS: Record<ClusterPrecision, number> = {
  coarse: 2,
  fine: 3,
}

export function clusterByCoordinate(
  events: NormalizedStopEvent[],
  precision: ClusterPrecision = 'coarse',
): ClusterSummary[] {
  const decimals = PRECISION_DECIMALS[precision]

  interface ClusterAcc {
    key: string
    stopCount: number
    truckIds: Set<string>
    dates: Set<string>
    mixerStops: number
    pumpStops: number
    otherStops: number
    latSum: number
    lonSum: number
    firstSeen: string
    lastSeen: string
  }

  const clusters = new Map<string, ClusterAcc>()

  for (const e of events) {
    const key = e.latitude.toFixed(decimals) + ',' + e.longitude.toFixed(decimals)
    let acc = clusters.get(key)
    if (!acc) {
      acc = {
        key,
        stopCount: 0,
        truckIds: new Set(),
        dates: new Set(),
        mixerStops: 0,
        pumpStops: 0,
        otherStops: 0,
        latSum: 0,
        lonSum: 0,
        firstSeen: e.startedAt,
        lastSeen: e.startedAt,
      }
      clusters.set(key, acc)
    }
    acc.stopCount += 1
    acc.truckIds.add(e.truckId)
    acc.dates.add(e.startedAt.slice(0, 10))
    acc.latSum += e.latitude
    acc.lonSum += e.longitude
    if (e.truckType === 'mixer_truck') acc.mixerStops += 1
    else if (e.truckType === 'pump_truck') acc.pumpStops += 1
    else acc.otherStops += 1
    if (e.startedAt < acc.firstSeen) acc.firstSeen = e.startedAt
    if (e.startedAt > acc.lastSeen) acc.lastSeen = e.startedAt
  }

  const out: ClusterSummary[] = []
  clusters.forEach(acc => {
    out.push({
      clusterKey: acc.key,
      centroid: {
        lat: acc.latSum / acc.stopCount,
        lon: acc.lonSum / acc.stopCount,
      },
      stopCount: acc.stopCount,
      distinctTrucks: acc.truckIds.size,
      mixerStops: acc.mixerStops,
      pumpStops: acc.pumpStops,
      otherStops: acc.otherStops,
      mixerShare: acc.stopCount > 0 ? acc.mixerStops / acc.stopCount : 0,
      firstSeen: acc.firstSeen.slice(0, 10),
      lastSeen: acc.lastSeen.slice(0, 10),
      daysVisited: acc.dates.size,
    })
  })

  out.sort((a, b) => b.stopCount - a.stopCount)
  return out
}

// ── Plant candidate identification ───────────────────────────────────────

export interface PlantCandidate {
  clusterKey: string
  centroid: { lat: number; lon: number }
  stopCount: number
  distinctTrucks: number
  mixerShare: number
  /** How confident the clustering is that this is a plant. */
  confidence: 'high' | 'medium' | 'low'
  /** One-line explanation for the confidence tag. */
  reasoning: string
}

/**
 * Rank clusters and tag each as a plant candidate. Heuristic:
 * - High: stop-count in top-2 AND mixerShare >= 0.85 AND distinctTrucks >= 20
 * - Medium: stop-count in top-5 AND mixerShare >= 0.80
 * - Low: anything else in the top-10
 *
 * Plants are characterised by: many stops (every mixer-truck loads there
 * repeatedly), dominated by mixer-trucks (pumps don't load at the plant,
 * they stay on-site), and high distinct-truck count (the whole fleet
 * visits). A customer site fails at least one of these: stop-count is
 * lower (each truck visits once per delivery), distinctTrucks is lower if
 * the site is served by a specific crew.
 *
 * User still confirms in UI; this is just a ranked candidate list.
 */
export function identifyPlantCandidates(
  clusters: ClusterSummary[],
  maxCandidates = 10,
): PlantCandidate[] {
  const candidates: PlantCandidate[] = []
  for (let i = 0; i < Math.min(maxCandidates, clusters.length); i++) {
    const c = clusters[i]
    let confidence: PlantCandidate['confidence'] = 'low'
    let reasoning = `rank ${i + 1} by stop-count`

    if (i < 2 && c.mixerShare >= 0.85 && c.distinctTrucks >= 20) {
      confidence = 'high'
      reasoning = `top-2 by stops, ${Math.round(c.mixerShare * 100)}% mixer stops, ${c.distinctTrucks} trucks visit`
    } else if (i < 5 && c.mixerShare >= 0.8) {
      confidence = 'medium'
      reasoning = `top-5 by stops, ${Math.round(c.mixerShare * 100)}% mixer stops`
    }

    candidates.push({
      clusterKey: c.clusterKey,
      centroid: c.centroid,
      stopCount: c.stopCount,
      distinctTrucks: c.distinctTrucks,
      mixerShare: c.mixerShare,
      confidence,
      reasoning,
    })
  }
  return candidates
}

// ── Operating day classification ─────────────────────────────────────────

export interface OperatingDay {
  /** Local date in YYYY-MM-DD. */
  date: string
  /** Abbreviated day of week (Mon, Tue, etc.). */
  dayOfWeek: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'
  /** Number of distinct mixer-truck IDs with at least one stop on this date. */
  activeMixerTrucks: number
  /** activeMixerTrucks / totalMixerFleet (0-1). */
  activeSharePct: number
  /** All stop events on this date (after Makkah filter). */
  eventCount: number
  /** Is this day counted as operating for aggregation purposes?
   *  True iff: not Friday AND activeSharePct >= minActiveShare. */
  isOperating: boolean
  /** Disqualification reason if !isOperating, or null if operating. */
  disqualifiedBy: 'friday' | 'low_fleet_activity' | null
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * Classify every calendar date in the event window as operating or not.
 * minActiveShare defaults to 0.5 (≥50% of fleet active). Fleet count is
 * passed in because it's often the in-scope fleet (e.g. 80 after Makkah
 * filter), not the full source-of-truth fleet.
 *
 * Only mixer-truck activity is counted toward the threshold — pumps
 * don't cycle, they stay on one site for a day, so they're not a useful
 * signal of "plant is dispatching today".
 */
export function classifyOperatingDays(
  events: NormalizedStopEvent[],
  totalMixerFleet: number,
  minActiveShare = 0.5,
): OperatingDay[] {
  const byDate = new Map<string, { activeMixers: Set<string>; eventCount: number }>()

  for (const e of events) {
    const date = e.startedAt.slice(0, 10)
    let rec = byDate.get(date)
    if (!rec) {
      rec = { activeMixers: new Set(), eventCount: 0 }
      byDate.set(date, rec)
    }
    rec.eventCount += 1
    if (e.truckType === 'mixer_truck') rec.activeMixers.add(e.truckId)
  }

  const dates = Array.from(byDate.keys()).sort()
  const out: OperatingDay[] = []
  for (const date of dates) {
    const rec = byDate.get(date)!
    const d = new Date(date + 'T00:00:00Z')
    const dow = DOW_LABELS[d.getUTCDay()]
    const activeSharePct = totalMixerFleet > 0 ? rec.activeMixers.size / totalMixerFleet : 0

    let disqualifiedBy: OperatingDay['disqualifiedBy'] = null
    let isOperating = true
    if (dow === 'Fri') {
      isOperating = false
      disqualifiedBy = 'friday'
    } else if (activeSharePct < minActiveShare) {
      isOperating = false
      disqualifiedBy = 'low_fleet_activity'
    }

    out.push({
      date,
      dayOfWeek: dow,
      activeMixerTrucks: rec.activeMixers.size,
      activeSharePct,
      eventCount: rec.eventCount,
      isOperating,
      disqualifiedBy,
    })
  }
  return out
}

/** Summary counts over the full window. */
export interface OperatingDaySummary {
  totalDays: number
  operatingDays: number
  fridays: number
  lowActivityDays: number
}

export function summariseOperatingDays(days: OperatingDay[]): OperatingDaySummary {
  let operating = 0, fridays = 0, lowActivity = 0
  for (const d of days) {
    if (d.isOperating) operating += 1
    else if (d.disqualifiedBy === 'friday') fridays += 1
    else if (d.disqualifiedBy === 'low_fleet_activity') lowActivity += 1
  }
  return {
    totalDays: days.length,
    operatingDays: operating,
    fridays,
    lowActivityDays: lowActivity,
  }
}
