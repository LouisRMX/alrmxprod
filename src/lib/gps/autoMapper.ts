/**
 * GPS Column Auto-Mapper — Layer 3
 *
 * Maps uploaded CSV column names to canonical internal fields
 * using an alias dictionary + substring matching.
 *
 * Returns confidence score per field.
 * If overall confidence < 0.85 on required fields → manual mapping needed.
 */

export type CanonicalField =
  | 'truck_id'
  | 'event_timestamp'
  | 'stop_start_time'
  | 'stop_end_time'
  | 'location_name'
  | 'latitude'
  | 'longitude'
  | 'event_type'
  | 'driver_id'
  | 'speed'
  | 'odometer'
  | 'trip_id'

/** Required fields — if these can't be mapped, parsing will fail */
export const REQUIRED_FIELDS: CanonicalField[] = ['truck_id', 'event_timestamp']

/** Fields required for Type B (Geofence Log) */
export const REQUIRED_TYPE_B: CanonicalField[] = ['stop_start_time', 'stop_end_time']

/** Fields required for Type C (Trip Summary) */
export const REQUIRED_TYPE_C: CanonicalField[] = ['stop_start_time', 'stop_end_time']

const ALIAS_DICT: Record<CanonicalField, string[]> = {
  truck_id: [
    'truck id', 'vehicle id', 'unit id', 'asset id', 'fleet id',
    'registration', 'vehicle', 'truck', 'unit', 'asset',
    'truckid', 'vehicleid', 'unitid', 'assetid', 'fleetid',
    'vehicle no', 'vehicle number', 'plate', 'plate number',
    'reg no', 'truck no',
  ],
  event_timestamp: [
    'timestamp', 'event time', 'date time', 'time', 'datetime',
    'date/time', 'created at', 'recorded at',
    'eventtimestamp', 'eventtime', 'datetime', 'date_time',
    'time stamp', 'log time', 'gps time',
  ],
  stop_start_time: [
    'arrival time', 'stop start', 'arrived at', 'entry time',
    'start time', 'check in', 'geofence entry',
    'arrivaltime', 'stopstart', 'arrivedat', 'entrytime',
    'starttime', 'checkin', 'geofenceentry',
    'arrival', 'in time', 'site arrival',
  ],
  stop_end_time: [
    'departure time', 'stop end', 'departed at', 'exit time',
    'end time', 'check out', 'geofence exit',
    'departuretime', 'stopend', 'departedat', 'exittime',
    'endtime', 'checkout', 'geofenceexit',
    'departure', 'out time', 'site departure',
  ],
  location_name: [
    'location', 'address', 'site', 'geofence', 'zone', 'destination',
    'place', 'stop name', 'customer',
    'locationname', 'stopname', 'sitename', 'geofencename',
    'place name', 'location name', 'delivery site',
  ],
  latitude: [
    'lat', 'latitude', 'gps lat', 'y',
    'gps_lat', 'lat_decimal', 'latitude_deg',
  ],
  longitude: [
    'lon', 'lng', 'long', 'longitude', 'gps lon', 'x',
    'gps_lon', 'lon_decimal', 'longitude_deg',
  ],
  event_type: [
    'event', 'event type', 'activity', 'status', 'type', 'action',
    'eventtype', 'event_type', 'activity_type',
  ],
  driver_id: [
    'driver', 'driver id', 'operator', 'driver name',
    'driverid', 'drivername', 'driver_id', 'operator_name',
  ],
  speed: [
    'speed', 'speed (km/h)', 'velocity', 'speed kmh',
    'speed_kmh', 'gps_speed', 'vehicle speed',
  ],
  odometer: [
    'odometer', 'mileage', 'distance', 'odometer (km)',
    'odometer_km', 'total_distance', 'trip_odometer',
  ],
  trip_id: [
    'trip id', 'trip', 'journey id', 'route id',
    'tripid', 'journeyid', 'routeid', 'trip_id',
  ],
}

/** Normalise a string for comparison */
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-/()]+/g, '')
}

export interface FieldMatch {
  canonicalField: CanonicalField
  uploadedColumn: string | null
  confidence: number
  matchType: 'exact' | 'alias' | 'substring' | 'none'
}

export interface MappingResult {
  mapping: Record<CanonicalField, string | null>
  fieldMatches: FieldMatch[]
  overallConfidence: number
  requiresManualMapping: boolean
  missingRequiredFields: CanonicalField[]
}

export function autoMapColumns(
  uploadedHeaders: string[],
  formatType: 'A' | 'B' | 'C' = 'B',
): MappingResult {
  const normUploaded = uploadedHeaders.map(h => ({ original: h, normalised: norm(h) }))
  const fieldMatches: FieldMatch[] = []
  const mapping: Record<CanonicalField, string | null> = {} as Record<CanonicalField, string | null>

  const allFields = Object.keys(ALIAS_DICT) as CanonicalField[]

  for (const field of allFields) {
    const aliases = ALIAS_DICT[field].map(a => norm(a))
    let bestMatch: { column: string; confidence: number; matchType: FieldMatch['matchType'] } | null = null

    for (const { original, normalised } of normUploaded) {
      // 1. Exact match on normalised string
      if (aliases.includes(normalised)) {
        bestMatch = { column: original, confidence: 1.0, matchType: 'exact' }
        break
      }
    }

    if (!bestMatch) {
      for (const { original, normalised } of normUploaded) {
        // 2. Any alias exactly matches the normalised uploaded column
        for (const alias of aliases) {
          if (normalised === alias) {
            bestMatch = { column: original, confidence: 0.95, matchType: 'alias' }
            break
          }
        }
        if (bestMatch) break
      }
    }

    if (!bestMatch) {
      // 3. Substring match — uploaded col contains an alias or vice versa
      let subMatch: { column: string; score: number } | null = null
      for (const { original, normalised } of normUploaded) {
        for (const alias of aliases) {
          if (normalised.includes(alias) || alias.includes(normalised)) {
            const score = Math.max(
              alias.length / Math.max(normalised.length, 1),
              normalised.length / Math.max(alias.length, 1),
            )
            if (!subMatch || score > subMatch.score) {
              subMatch = { column: original, score: Math.min(0.75, score * 0.85) }
            }
          }
        }
      }
      if (subMatch && subMatch.score > 0.3) {
        bestMatch = { column: subMatch.column, confidence: subMatch.score, matchType: 'substring' }
      }
    }

    fieldMatches.push({
      canonicalField: field,
      uploadedColumn: bestMatch?.column ?? null,
      confidence: bestMatch?.confidence ?? 0,
      matchType: bestMatch?.matchType ?? 'none',
    })
    mapping[field] = bestMatch?.column ?? null
  }

  // Determine required fields for this format type
  const requiredForFormat: CanonicalField[] = [
    ...REQUIRED_FIELDS,
    ...(formatType === 'B' || formatType === 'C' ? REQUIRED_TYPE_B : []),
  ]

  const missingRequiredFields = requiredForFormat.filter(f => {
    const match = fieldMatches.find(m => m.canonicalField === f)
    return !match || match.confidence < 0.5
  })

  // Overall confidence = average of required field confidences
  const requiredConfidences = requiredForFormat.map(f => {
    const match = fieldMatches.find(m => m.canonicalField === f)
    return match?.confidence ?? 0
  })
  const overallConfidence = requiredConfidences.length > 0
    ? requiredConfidences.reduce((a, b) => a + b, 0) / requiredConfidences.length
    : 0

  return {
    mapping,
    fieldMatches,
    overallConfidence,
    requiresManualMapping: overallConfidence < 0.85 || missingRequiredFields.length > 0,
    missingRequiredFields,
  }
}

/** Apply a saved mapping template — override auto-mapped fields */
export function applyTemplate(
  autoResult: MappingResult,
  templateMappings: Partial<Record<CanonicalField, string>>,
): MappingResult {
  const merged = { ...autoResult.mapping }
  for (const [field, col] of Object.entries(templateMappings)) {
    if (col) merged[field as CanonicalField] = col
  }
  return {
    ...autoResult,
    mapping: merged,
    requiresManualMapping: false,
  }
}
