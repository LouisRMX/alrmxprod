/**
 * GPS Metrics Engine, Layer 4B
 *
 * Computes three metrics from normalized GPS events:
 *   Metric 1 (Primary):   Average turnaround time
 *   Metric 2 (Secondary): Average site waiting time
 *   Metric 3 (Secondary): Probable return loads
 *
 * Benchmark: TARGET_TA = 60 + (delivery_radius_km × 1.5 × 2)
 * Fetched dynamically from assessment answers, never hardcoded.
 */

import type { NormalizedGpsEvent } from './normalizer'

export interface MetricValue {
  value: number | null
  available: boolean
  isEstimate: boolean
  note?: string
}

export interface TurnaroundMetrics {
  avg: MetricValue
  median: MetricValue
  p90: MetricValue
  targetTa: number
  deliveryRadiusKm: number
  flagged: boolean   // avg > TARGET_TA × 1.2
}

export interface SiteWaitMetrics {
  avg: MetricValue
  median: MetricValue
  flagged: boolean  // avg > 40 min
}

export interface ReturnLoadMetrics {
  count: number
  pct: number
  available: boolean
  tripsAnalyzed: number
}

export interface FleetMetrics {
  avgTripsPerTruckPerDay: number | null
  trucksAnalyzed: number
  tripsAnalyzed: number
  rowsParsedPct: number
  dateRangeDays: number
}

export interface GpsAnalysisMetrics {
  turnaround: TurnaroundMetrics
  siteWait: SiteWaitMetrics
  returnLoads: ReturnLoadMetrics
  fleet: FleetMetrics
  confidenceScore: number
  calculationNotes: string[]
}

// ── Helpers ─────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function minutesBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null
  const diff = (b.getTime() - a.getTime()) / 60000
  return diff > 0 ? diff : null
}

function round1(v: number | null): number | null {
  return v !== null ? Math.round(v * 10) / 10 : null
}

// ── Delivery grouping ────────────────────────────────────────

interface Delivery {
  truckId: string
  departedPlant: Date
  arrivedPlant: Date | null
  arrivedSite: Date | null
  departedSite: Date | null
  turnaroundMin: number | null
  siteWaitMin: number | null
  isProbableReturn: boolean
}

/**
 * Reconstruct individual deliveries from normalized events.
 * Works for all three format types.
 */
function extractDeliveries(events: NormalizedGpsEvent[]): Delivery[] {
  const deliveries: Delivery[] = []

  // Group by truck
  const byTruck = new Map<string, NormalizedGpsEvent[]>()
  for (const e of events) {
    if (!e.truckId) continue
    const list = byTruck.get(e.truckId) ?? []
    list.push(e)
    byTruck.set(e.truckId, list)
  }

  for (const [truckId, truckEvents] of Array.from(byTruck.entries())) {
    // Sort by the best available timestamp
    const sorted = [...truckEvents].sort((a, b) => {
      const ta = (a.stopStartTime ?? a.eventTimestamp)?.getTime() ?? 0
      const tb = (b.stopStartTime ?? b.eventTimestamp)?.getTime() ?? 0
      return ta - tb
    })

    // ── Type B/C: events have explicit stop_start / stop_end ──
    const hasExplicitStops = sorted.some(e => e.stopStartTime && e.stopEndTime)

    if (hasExplicitStops) {
      // Find plant departures → site stops → plant arrivals
      let plantDeparture: Date | null = null
      let siteArrival: Date | null = null
      let siteDeparture: Date | null = null

      for (const e of sorted) {
        const locType = e.inferredLocationType
        const t = e.stopStartTime ?? e.eventTimestamp

        if (locType === 'plant') {
          if (plantDeparture && (siteDeparture || siteArrival)) {
            // Complete delivery cycle
            const arrivedPlant = e.stopStartTime ?? e.eventTimestamp
            const taMin = minutesBetween(plantDeparture, arrivedPlant)
            const waitMin = siteArrival && siteDeparture
              ? minutesBetween(siteArrival, siteDeparture)
              : null
            const isReturn = waitMin !== null ? waitMin < 15 : false

            deliveries.push({
              truckId,
              departedPlant: plantDeparture,
              arrivedPlant,
              arrivedSite: siteArrival,
              departedSite: siteDeparture,
              turnaroundMin: taMin,
              siteWaitMin: waitMin,
              isProbableReturn: isReturn,
            })
            siteArrival = null
            siteDeparture = null
          }
          // New potential departure
          plantDeparture = e.stopEndTime ?? null
        } else if (locType === 'site' && plantDeparture) {
          if (!siteArrival) siteArrival = e.stopStartTime ?? t
          siteDeparture = e.stopEndTime ?? null
        }
      }
    } else {
      // ── Type A: Infer from event sequence ──────────────────
      // Look for: at-plant → transit → at-site → transit → at-plant
      let inDelivery = false
      let plantDepart: Date | null = null
      let siteArr: Date | null = null
      let siteDep: Date | null = null
      let lastPlantEvent: NormalizedGpsEvent | null = null

      for (const e of sorted) {
        const t = e.eventTimestamp
        const loc = e.inferredLocationType

        if (loc === 'plant') {
          if (inDelivery && plantDepart && t) {
            const taMin = minutesBetween(plantDepart, t)
            const waitMin = siteArr && siteDep
              ? minutesBetween(siteArr, siteDep)
              : null
            if (taMin && taMin > 5 && taMin < 600) {
              deliveries.push({
                truckId,
                departedPlant: plantDepart,
                arrivedPlant: t,
                arrivedSite: siteArr,
                departedSite: siteDep,
                turnaroundMin: taMin,
                siteWaitMin: waitMin,
                isProbableReturn: waitMin !== null ? waitMin < 15 : false,
              })
            }
            inDelivery = false
            siteArr = null
            siteDep = null
          }
          lastPlantEvent = e
        } else if (loc === 'transit' && lastPlantEvent && !inDelivery) {
          // Truck just left plant
          inDelivery = true
          plantDepart = lastPlantEvent.eventTimestamp
        } else if (loc === 'site' && inDelivery) {
          if (!siteArr) siteArr = t
          siteDep = t
        }
      }
    }
  }

  return deliveries
}

// ── Main metrics calculation ─────────────────────────────────

export function computeMetrics(
  events: NormalizedGpsEvent[],
  rowsTotal: number,
  rowsParsed: number,
  deliveryRadiusKm: number,
): GpsAnalysisMetrics {
  const notes: string[] = []

  // Dynamic TARGET_TA, consistent with Al-RMX's existing scoring logic
  const targetTa = 60 + deliveryRadiusKm * 1.5 * 2

  const deliveries = extractDeliveries(events)

  // ── Date range ────────────────────────────────────────────
  const timestamps = events
    .map(e => (e.stopStartTime ?? e.eventTimestamp)?.getTime())
    .filter((t): t is number => t !== undefined && !isNaN(t))
  const minTs = timestamps.length ? Math.min(...timestamps) : null
  const maxTs = timestamps.length ? Math.max(...timestamps) : null
  const dateRangeDays = minTs && maxTs
    ? Math.max(1, Math.round((maxTs - minTs) / 86400000))
    : 0

  const uniqueTrucks = new Set(events.map(e => e.truckId).filter(Boolean))
  const trucksAnalyzed = uniqueTrucks.size

  // ── Metric 1: Turnaround ──────────────────────────────────
  const validTA = deliveries
    .map(d => d.turnaroundMin)
    .filter((v): v is number => v !== null && v > 5 && v < 600)

  let turnaroundAvg: number | null = null
  let turnaroundMedian: number | null = null
  let turnaroundP90: number | null = null
  let turnaroundAvailable = false

  if (validTA.length >= 3) {
    turnaroundAvg = round1(validTA.reduce((a, b) => a + b, 0) / validTA.length)
    turnaroundMedian = round1(median(validTA))
    turnaroundP90 = round1(percentile(validTA, 90))
    turnaroundAvailable = true
  } else if (validTA.length > 0) {
    turnaroundAvg = round1(validTA.reduce((a, b) => a + b, 0) / validTA.length)
    turnaroundAvailable = true
    notes.push(`Turnaround based on only ${validTA.length} trips, treat as directional`)
  } else {
    notes.push('Insufficient trip data to calculate turnaround')
  }

  // ── Metric 2: Site Wait ───────────────────────────────────
  const validWait = deliveries
    .map(d => d.siteWaitMin)
    .filter((v): v is number => v !== null && v >= 0 && v < 300)

  let waitAvg: number | null = null
  let waitMedian: number | null = null
  let waitAvailable = false

  if (validWait.length >= 3) {
    waitAvg = round1(validWait.reduce((a, b) => a + b, 0) / validWait.length)
    waitMedian = round1(median(validWait))
    waitAvailable = true
  } else {
    notes.push('Insufficient stop data to calculate site waiting time')
  }

  // ── Metric 3: Return Loads ────────────────────────────────
  const returnLoads = deliveries.filter(d => d.isProbableReturn)
  const returnLoadsPct = deliveries.length > 0
    ? Math.round((returnLoads.length / deliveries.length) * 100 * 10) / 10
    : 0

  // ── Confidence score ──────────────────────────────────────
  const rowsParsedPct = rowsTotal > 0 ? (rowsParsed / rowsTotal) * 100 : 0
  let confidence = 0

  if (turnaroundAvailable && waitAvailable && returnLoadsPct !== null && rowsParsedPct >= 80) {
    confidence = 1.0
  } else if (turnaroundAvailable && rowsParsedPct >= 60) {
    confidence = 0.7 + (waitAvailable ? 0.1 : 0) + (rowsParsedPct >= 80 ? 0.1 : 0)
  } else if (turnaroundAvailable) {
    confidence = 0.4 + (rowsParsedPct / 100) * 0.2
  } else {
    confidence = 0.2
  }
  confidence = Math.min(1.0, Math.round(confidence * 100) / 100)

  // Avg trips per truck per day
  const avgTripsPerTruckPerDay = trucksAnalyzed > 0 && dateRangeDays > 0
    ? Math.round((deliveries.length / trucksAnalyzed / dateRangeDays) * 10) / 10
    : null

  return {
    turnaround: {
      avg: { value: turnaroundAvg, available: turnaroundAvailable, isEstimate: validTA.length < 10 },
      median: { value: turnaroundMedian, available: turnaroundAvailable, isEstimate: false },
      p90: { value: turnaroundP90, available: turnaroundAvailable, isEstimate: false },
      targetTa: Math.round(targetTa),
      deliveryRadiusKm,
      flagged: turnaroundAvg !== null && turnaroundAvg > targetTa * 1.2,
    },
    siteWait: {
      avg: { value: waitAvg, available: waitAvailable, isEstimate: false },
      median: { value: waitMedian, available: waitAvailable, isEstimate: false },
      flagged: waitAvg !== null && waitAvg > 40,
    },
    returnLoads: {
      count: returnLoads.length,
      pct: returnLoadsPct,
      available: deliveries.length >= 3,
      tripsAnalyzed: deliveries.length,
    },
    fleet: {
      avgTripsPerTruckPerDay,
      trucksAnalyzed,
      tripsAnalyzed: deliveries.length,
      rowsParsedPct: Math.round(rowsParsedPct * 10) / 10,
      dateRangeDays,
    },
    confidenceScore: confidence,
    calculationNotes: notes,
  }
}
