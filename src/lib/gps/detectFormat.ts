/**
 * GPS Format Detection, Layer 2
 *
 * Detects which of three GPS export structures the uploaded CSV contains:
 *   TYPE A, Event Stream (raw position pings, high row count)
 *   TYPE B, Geofence Log (entry/exit events, paired timestamps)
 *   TYPE C, Trip Summary (one row per completed trip, explicit duration/distance)
 *
 * Fallback: TYPE B (most common GCC fleet export format)
 */

export type GpsFormatType = 'A' | 'B' | 'C'

interface DetectionResult {
  type: GpsFormatType
  confidence: number
  reasoning: string
}

/** Normalise a column name for comparison. Strips whitespace, underscores,
 *  dashes, slashes, and parenthesised segments (e.g. "Duration (min)" →
 *  "duration") so real-world headers with unit suffixes match cleanly. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s_\-/()]+/g, '')
}

const EVENT_TYPE_VALUES = new Set([
  'arrival', 'departure', 'arrive', 'depart',
  'enter', 'exit', 'entry', 'geofenceenter', 'geofenceexit',
  'in', 'out', 'checkin', 'checkout',
])

const DURATION_COL_PATTERNS = [
  'duration', 'triptime', 'traveltime', 'elapsed', 'totalduration',
  'tripduration', 'journeytime',
]

const DISTANCE_COL_PATTERNS = [
  'distance', 'tripdistance', 'totaldistance', 'mileage',
  'km', 'miles', 'tripmileage',
]

const SPEED_COL_PATTERNS = ['speed', 'velocity', 'speedkmh']

const EVENT_TYPE_COL_PATTERNS = ['eventtype', 'event', 'activity', 'status', 'type', 'action']

const START_END_TIME_PATTERNS = [
  ['arrivaltime', 'departuretime'],
  ['arrivedat', 'departedat'],
  ['stopstart', 'stopend'],
  ['entrytime', 'exittime'],
  ['starttime', 'endtime'],
  ['checkin', 'checkout'],
  ['geofenceentry', 'geofenceexit'],
]

export function detectGpsFormat(
  headers: string[],
  rows: Record<string, string>[],
): DetectionResult {
  const normHeaders = headers.map(norm)
  const headerSet = new Set(normHeaders)

  // ── Signals for TYPE C (Trip Summary) ──────────────────────
  const hasDurationCol = DURATION_COL_PATTERNS.some(p => headerSet.has(p))
  const hasDistanceCol = DISTANCE_COL_PATTERNS.some(p => headerSet.has(p))

  // Low row density relative to expected fleet trips is hard to check without
  // truck count, but we can look for per-trip IDs + explicit duration/distance
  const hasTripId = headerSet.has('tripid') || headerSet.has('trip') || headerSet.has('journeyid')

  if ((hasDurationCol || hasDistanceCol) && hasTripId) {
    return {
      type: 'C',
      confidence: 0.85,
      reasoning: 'Explicit duration/distance columns with trip ID → Trip Summary format',
    }
  }

  if (hasDurationCol && hasDistanceCol) {
    return {
      type: 'C',
      confidence: 0.80,
      reasoning: 'Both duration and distance columns present → Trip Summary format',
    }
  }

  // ── Signals for TYPE B (Geofence Log) ──────────────────────
  const hasEventTypeCol = EVENT_TYPE_COL_PATTERNS.some(p => headerSet.has(p))

  // Check if event_type column contains arrival/departure-like values
  let hasArrivalDepartureValues = false
  if (hasEventTypeCol && rows.length > 0) {
    const eventColName = headers.find(h =>
      EVENT_TYPE_COL_PATTERNS.includes(norm(h))
    )
    if (eventColName) {
      const sampleValues = rows
        .slice(0, Math.min(50, rows.length))
        .map(r => norm(r[eventColName] || ''))
        .filter(Boolean)
      hasArrivalDepartureValues = sampleValues.some(v => EVENT_TYPE_VALUES.has(v))
    }
  }

  // Check for paired start/end time columns (Type B hallmark)
  const normHeadersList = normHeaders
  const hasPairedTimes = START_END_TIME_PATTERNS.some(([start, end]) =>
    normHeadersList.includes(start) && normHeadersList.includes(end)
  )

  if (hasEventTypeCol && hasArrivalDepartureValues) {
    return {
      type: 'B',
      confidence: 0.90,
      reasoning: 'Event type column with arrival/departure values → Geofence Log format',
    }
  }

  if (hasPairedTimes) {
    return {
      type: 'B',
      confidence: 0.85,
      reasoning: 'Paired start/end timestamp columns → Geofence Log format',
    }
  }

  // ── Signals for TYPE A (Event Stream) ──────────────────────
  const hasSpeedCol = SPEED_COL_PATTERNS.some(p => headerSet.has(p))
  const hasLatLon = (headerSet.has('lat') || headerSet.has('latitude')) &&
    (headerSet.has('lon') || headerSet.has('lng') || headerSet.has('longitude'))

  // High row count per truck is the main indicator for Event Stream
  // Check for repeated truck IDs without explicit stop info
  const truckColName = headers.find(h => {
    const n = norm(h)
    return ['truckid', 'vehicleid', 'unitid', 'assetid', 'fleetid',
      'registration', 'vehicle', 'truck', 'unit', 'asset'].includes(n)
  })

  let hasRepeatedTrucks = false
  if (truckColName && rows.length > 20) {
    const truckIds = rows.slice(0, 100).map(r => r[truckColName]).filter(Boolean)
    const uniqueTrucks = new Set(truckIds)
    // If same truck appears many times → event stream
    hasRepeatedTrucks = truckIds.length > 0 && (truckIds.length / uniqueTrucks.size) > 5
  }

  if (hasSpeedCol && hasLatLon && hasRepeatedTrucks) {
    return {
      type: 'A',
      confidence: 0.85,
      reasoning: 'Speed + lat/lon + repeated truck IDs → Event Stream format',
    }
  }

  if (hasSpeedCol && hasLatLon) {
    return {
      type: 'A',
      confidence: 0.70,
      reasoning: 'Speed and lat/lon columns present, likely Event Stream',
    }
  }

  // ── Fallback: TYPE B ────────────────────────────────────────
  return {
    type: 'B',
    confidence: 0.50,
    reasoning: 'Format ambiguous, defaulting to Geofence Log (most common GCC fleet export)',
  }
}
