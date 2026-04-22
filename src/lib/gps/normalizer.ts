/**
 * GPS Data Normalizer, Layer 4A
 *
 * Converts raw CSV rows into NormalizedGpsEvent objects
 * using the canonical column mapping from autoMapper.
 * Handles timezone conversion and location type inference.
 */

import type { CanonicalField } from './autoMapper'

export type LocationType = 'plant' | 'site' | 'transit' | 'unknown'

export interface NormalizedGpsEvent {
  truckId: string | null
  eventTimestamp: Date | null
  stopStartTime: Date | null
  stopEndTime: Date | null
  locationName: string | null
  latitude: number | null
  longitude: number | null
  eventType: string | null
  driverId: string | null
  speed: number | null
  odometer: number | null
  inferredLocationType: LocationType
  rawRowReference: number
  derivedDeliveryId: string | null
}

export interface NormalizationResult {
  events: NormalizedGpsEvent[]
  rowsParsed: number
  rowsTotal: number
  rowsFailedIndices: number[]
  parseErrorLog: { row: number; error: string }[]
}

// ── Timezone offsets ────────────────────────────────────────
const TIMEZONE_OFFSET_HOURS: Record<string, number> = {
  UTC: 0,
  AST: 3,   // Arabia Standard Time (UTC+3), Saudi, Qatar, Kuwait
  GST: 4,   // Gulf Standard Time (UTC+4), UAE, Oman
}

// ── Location name patterns ───────────────────────────────────
const PLANT_KEYWORDS = ['plant', 'batching', 'rmc', 'factory', 'depot', 'yard', 'batch', 'concrete plant']
// Site keywords include common GCC delivery-destination types so real
// customer location names ("Al-Faisaliya Tower", "King Khalid Hospital")
// classify correctly without requiring an explicit "Site" prefix.
const SITE_KEYWORDS = [
  'site', 'project', 'pour', 'delivery', 'client', 'construction', 'customer', 'job',
  'tower', 'villa', 'hospital', 'mall', 'university', 'school', 'bridge', 'metro',
  'hotel', 'office', 'building', 'residential', 'compound',
]

function inferLocationType(
  locationName: string | null,
  speed: number | null,
  plantLat?: number | null,
  plantLon?: number | null,
  lat?: number | null,
  lon?: number | null,
): LocationType {
  // Speed-based: moving = transit
  if (speed !== null && speed > 5) return 'transit'

  // Name-based
  if (locationName) {
    const lower = locationName.toLowerCase()
    if (PLANT_KEYWORDS.some(k => lower.includes(k))) return 'plant'
    if (SITE_KEYWORDS.some(k => lower.includes(k))) return 'site'
  }

  // Coordinate-based (Type A without location names): 500m geofence around plant
  if (plantLat != null && plantLon != null && lat != null && lon != null) {
    const distM = haversineMeters(plantLat, plantLon, lat, lon)
    if (distM <= 500) return 'plant'
  }

  return 'unknown'
}

/** Haversine distance in metres */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Parse a timestamp string to UTC Date using the selected timezone */
function parseTimestamp(raw: string | undefined, offsetHours: number): Date | null {
  if (!raw || raw.trim() === '') return null

  // Try direct ISO parse first
  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) {
    // If no timezone info in the string, apply the offset
    const hasTimezone = /[Zz]|[+\-]\d{2}:?\d{2}$/.test(raw.trim())
    if (!hasTimezone) {
      return new Date(iso.getTime() - offsetHours * 3600 * 1000)
    }
    return iso
  }

  // Try DD/MM/YYYY HH:mm:ss
  const dmyMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/)
  if (dmyMatch) {
    const [, d, m, y, h, min, s = '0'] = dmyMatch
    const local = new Date(`${y}-${m}-${d}T${h}:${min}:${s}`)
    if (!isNaN(local.getTime())) {
      return new Date(local.getTime() - offsetHours * 3600 * 1000)
    }
  }

  // Try MM/DD/YYYY HH:mm:ss (US format)
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?/)
  if (mdyMatch) {
    const [, m, d, y, h, min, s = '0'] = mdyMatch
    const local = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${h}:${min}:${s}`)
    if (!isNaN(local.getTime())) {
      return new Date(local.getTime() - offsetHours * 3600 * 1000)
    }
  }

  return null
}

function parseFloat2(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null
  const n = parseFloat(v.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function getString(v: string | undefined): string | null {
  if (!v || v.trim() === '') return null
  return v.trim()
}

export function normalizeRows(
  rows: Record<string, string>[],
  mapping: Record<CanonicalField, string | null>,
  timezone: string,
  plantLat?: number | null,
  plantLon?: number | null,
): NormalizationResult {
  const offsetHours = TIMEZONE_OFFSET_HOURS[timezone] ?? 3
  const events: NormalizedGpsEvent[] = []
  const rowsFailedIndices: number[] = []
  const parseErrorLog: { row: number; error: string }[] = []

  const col = (field: CanonicalField, row: Record<string, string>) => {
    const colName = mapping[field]
    return colName ? row[colName] : undefined
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    try {
      const truckId = getString(col('truck_id', row))
      const eventTimestamp = parseTimestamp(col('event_timestamp', row), offsetHours)
      const stopStartTime = parseTimestamp(col('stop_start_time', row), offsetHours)
      const stopEndTime = parseTimestamp(col('stop_end_time', row), offsetHours)
      const locationName = getString(col('location_name', row))
      const lat = parseFloat2(col('latitude', row))
      const lon = parseFloat2(col('longitude', row))
      const speed = parseFloat2(col('speed', row))

      const inferredLocationType = inferLocationType(
        locationName,
        speed,
        plantLat,
        plantLon,
        lat,
        lon,
      )

      events.push({
        truckId,
        eventTimestamp,
        stopStartTime,
        stopEndTime,
        locationName,
        latitude: lat,
        longitude: lon,
        eventType: getString(col('event_type', row)),
        driverId: getString(col('driver_id', row)),
        speed,
        odometer: parseFloat2(col('odometer', row)),
        inferredLocationType,
        rawRowReference: i + 2, // +2: header row + 1-indexed
        derivedDeliveryId: null,
      })
    } catch (err) {
      rowsFailedIndices.push(i)
      parseErrorLog.push({ row: i + 2, error: String(err) })
    }
  }

  return {
    events,
    rowsParsed: events.length,
    rowsTotal: rows.length,
    rowsFailedIndices,
    parseErrorLog,
  }
}
