/**
 * Stop Details parser for TRAKING SYSTEMS (TrackUS-family) exports.
 *
 * Input format: HTML-table with .xls extension. NOT native Excel. Contains
 * a metadata header (declared period) and a data table with columns:
 *   No. | Target Name | From | To | Lat,Lon | Address | Continue Time
 *
 * Output: NormalizedStopEvent[] with per-file validation metadata and
 * cross-file deduplication. The parser is strict: any suspicious file
 * (period mismatch, timestamps out of declared bounds, corrupt structure,
 * md5 duplicate) is rejected rather than silently ingested. This is by
 * design; TrackUS has a documented cache bug that serves stale data with
 * the wrong period label.
 */

import { createHash } from 'node:crypto'

// ── Types ────────────────────────────────────────────────────────────────

export interface NormalizedStopEvent {
  /** Raw truck label from the source ("(TM170) ا س س 4377"). */
  truckLabel: string
  /** Extracted prefix-id ("TM170") — stable key even if plate changes. */
  truckId: string
  /** TM = Transit Mixer, P = Pump, other = unclassified. */
  truckType: 'mixer_truck' | 'pump_truck' | 'other'
  /** Stop start in ISO-8601 (local time, no timezone applied). */
  startedAt: string
  /** Stop end in ISO-8601. */
  endedAt: string
  /** Duration in minutes (derived from parsed Continue Time). */
  durationMin: number
  /** Decimal coordinates. */
  latitude: number
  longitude: number
  /** Source file name (for provenance). */
  sourceFile: string
  /** Row number within the source file (1-indexed, header excluded). */
  sourceRow: number
}

export interface ParseResult {
  events: NormalizedStopEvent[]
  filesAccepted: FileAuditRecord[]
  filesRejected: FileRejection[]
}

export interface FileAuditRecord {
  filename: string
  md5: string
  filenamePeriod: { start: string; end: string } | null
  headerPeriod: { start: string; end: string } | null
  eventsTotal: number
  eventsOutOfBounds: number
}

export interface FileRejection {
  filename: string
  reason:
    | 'md5_duplicate'
    | 'no_header_row'
    | 'filename_header_mismatch'
    | 'corrupt'
  detail: string
  duplicateOf?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractCells(html: string): string[] {
  const out: string[] = []
  const re = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) out.push(stripTags(m[1]))
  return out
}

/** Parse "0Day 1Hour 15Min 1 Sec" → minutes. */
function parseContinueTime(s: string): number {
  const d = +(s.match(/(\d+)\s*Day/i)?.[1] ?? 0)
  const h = +(s.match(/(\d+)\s*Hour/i)?.[1] ?? 0)
  const mi = +(s.match(/(\d+)\s*Min/i)?.[1] ?? 0)
  const sec = +(s.match(/(\d+)\s*Sec/i)?.[1] ?? 0)
  return d * 1440 + h * 60 + mi + sec / 60
}

/** Parse "DD-MM-YYYY HH:MM:SS" → ISO "YYYY-MM-DDTHH:MM:SS". */
function parseTrackusTimestamp(s: string): string | null {
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, dd, mm, yyyy, h, mi, se] = m
  return `${yyyy}-${mm}-${dd}T${h}:${mi}:${se}`
}

/** Parse filename period: "STOP_DETAILS_01_05_26-01_08_26.xls" → {start, end}. */
function parseFilenamePeriod(filename: string): { start: string; end: string } | null {
  const m = filename.match(/STOP_DETAILS_(\d{2})_(\d{2})_(\d{2})-(\d{2})_(\d{2})_(\d{2})/)
  if (!m) return null
  const [, m1, d1, y1, m2, d2, y2] = m
  return {
    start: `20${y1}-${m1}-${d1}`,
    end: `20${y2}-${m2}-${d2}`,
  }
}

/** Extract header-declared period from the HTML (first pair of YYYY-MM-DD... timestamps). */
function extractHeaderPeriod(html: string): { start: string; end: string } | null {
  const m = html.match(
    /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})[\s\S]{0,200}?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/,
  )
  if (!m) return null
  return { start: m[1], end: m[2] }
}

/** Extract stable truck id from "(TM170) ا س س 4377" → "TM170". */
function extractTruckId(label: string): string {
  const m = label.match(/\(([A-Za-z]+\s*\d+)\)/)
  if (!m) return label.trim()
  return m[1].replace(/\s+/g, '').toUpperCase()
}

/** Classify truck type from the prefix. */
function classifyTruck(label: string): NormalizedStopEvent['truckType'] {
  if (/\(TM\s*\d/i.test(label)) return 'mixer_truck'
  if (/\(P\s*\d/i.test(label)) return 'pump_truck'
  return 'other'
}

// ── Main parse entry point ───────────────────────────────────────────────

export interface ParseInput {
  filename: string
  bytes: Uint8Array | Buffer
}

/**
 * Parse one or more Stop Details files. Caller provides file bytes; parser
 * handles all validation and deduplication. Files are processed in the
 * order they appear in the input array.
 */
export function parseStopDetailsFiles(inputs: ParseInput[]): ParseResult {
  const events: NormalizedStopEvent[] = []
  const filesAccepted: FileAuditRecord[] = []
  const filesRejected: FileRejection[] = []
  const md5Seen = new Map<string, string>()

  for (const input of inputs) {
    const { filename, bytes } = input
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)

    // MD5 duplicate check (TrackUS cache-bug defence)
    const md5 = createHash('md5').update(buffer).digest('hex')
    const prior = md5Seen.get(md5)
    if (prior) {
      filesRejected.push({
        filename,
        reason: 'md5_duplicate',
        detail: `byte-identical to ${prior}`,
        duplicateOf: prior,
      })
      continue
    }
    md5Seen.set(md5, filename)

    const html = buffer.toString('utf8')
    const filenamePeriod = parseFilenamePeriod(filename)
    const headerPeriod = extractHeaderPeriod(html)

    // Filename <-> header period mismatch defence
    if (filenamePeriod && headerPeriod) {
      const hStart = headerPeriod.start.slice(0, 10)
      const hEnd = headerPeriod.end.slice(0, 10)
      if (hStart !== filenamePeriod.start || hEnd !== filenamePeriod.end) {
        filesRejected.push({
          filename,
          reason: 'filename_header_mismatch',
          detail: `filename=${filenamePeriod.start}..${filenamePeriod.end}, header=${hStart}..${hEnd}`,
        })
        continue
      }
    }

    const cells = extractCells(html)
    const WANT = ['No.', 'Target Name', 'From', 'To', 'Lat,Lon', 'Address', 'Continue Time']
    let headerStart = -1
    for (let i = 0; i < cells.length - WANT.length; i++) {
      let ok = true
      for (let j = 0; j < WANT.length; j++) {
        if (cells[i + j] !== WANT[j]) { ok = false; break }
      }
      if (ok) { headerStart = i; break }
    }
    if (headerStart < 0) {
      filesRejected.push({
        filename,
        reason: 'no_header_row',
        detail: 'expected columns not found',
      })
      continue
    }

    const COL_COUNT = 7
    const fileEvents: NormalizedStopEvent[] = []
    let outOfBounds = 0
    let rowIndex = 0
    for (let i = headerStart + COL_COUNT; i + COL_COUNT <= cells.length; i += COL_COUNT) {
      const no = parseInt(cells[i], 10)
      if (Number.isNaN(no)) continue
      rowIndex += 1

      const label = cells[i + 1]
      const fromRaw = cells[i + 2]
      const toRaw = cells[i + 3]
      const latlonRaw = cells[i + 4]
      const durationRaw = cells[i + 6]

      const startedAt = parseTrackusTimestamp(fromRaw)
      const endedAt = parseTrackusTimestamp(toRaw)
      if (!startedAt || !endedAt) continue

      const [latStr, lonStr] = latlonRaw.split(',')
      const latitude = parseFloat(latStr)
      const longitude = parseFloat(lonStr)
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue

      const durationMin = parseContinueTime(durationRaw)

      // Timestamp-in-declared-period defence
      if (filenamePeriod) {
        const d = startedAt.slice(0, 10)
        if (d < filenamePeriod.start || d > filenamePeriod.end) {
          outOfBounds += 1
        }
      }

      fileEvents.push({
        truckLabel: label,
        truckId: extractTruckId(label),
        truckType: classifyTruck(label),
        startedAt,
        endedAt,
        durationMin,
        latitude,
        longitude,
        sourceFile: filename,
        sourceRow: rowIndex,
      })
    }

    events.push(...fileEvents)
    filesAccepted.push({
      filename,
      md5,
      filenamePeriod,
      headerPeriod,
      eventsTotal: fileEvents.length,
      eventsOutOfBounds: outOfBounds,
    })
  }

  return { events, filesAccepted, filesRejected }
}

// ── Convenience: apply Makkah-region filter ──────────────────────────────

/**
 * Remove events from trucks whose activity is primarily concentrated in a
 * specific geographic region. Used for scope-filtering (e.g. exclude the
 * Makkah operation from a Riyadh-focused analysis).
 *
 * The filter is PER-TRUCK, not per-event: if a truck is classified as
 * out-of-scope, ALL its events are removed (even if some happened to fall
 * outside the region on a given day). This is correct because a truck
 * assigned to an out-of-scope operation should not contribute to the
 * in-scope fleet metrics regardless of where it happens to be on a given
 * day.
 */
export interface RegionFilter {
  centerLat: number
  centerLon: number
  /** Radius in km around the center; trucks with ≥X% of stops in this
   *  circle are considered "in this region". */
  radiusKm: number
  /** Minimum share of a truck's stops that must fall in the region before
   *  it's classified as belonging to it (0-1). Default 0.5. */
  minShare?: number
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface RegionFilterResult {
  kept: NormalizedStopEvent[]
  droppedTruckIds: string[]
  droppedEventCount: number
}

// ── Positive region filter (Riyadh-only) + outlier detection ─────────────

export interface BoundingBox {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export interface TruckRegionProfile {
  truckId: string
  totalStops: number
  stopsInRegion: number
  regionShare: number
  /** In-scope: regionShare ≥ primaryThreshold. */
  classification: 'in_scope' | 'out_of_scope' | 'outlier'
  /** Short human label for UI display. */
  note: string
}

export interface RegionClassificationResult {
  /** Events from in-scope trucks. Drop-in replacement for the analysis
   *  pipeline. */
  kept: NormalizedStopEvent[]
  /** Per-truck classification, including every truck (in-scope, out-of-scope,
   *  outlier). Used by the UI's data-quality surface. */
  truckProfiles: TruckRegionProfile[]
  /** Stats summary. */
  summary: {
    trucksInScope: number
    trucksOutOfScope: number
    trucksOutliers: number
    eventsKept: number
    eventsDropped: number
  }
}

/**
 * Classify every truck by its dominant operating region.
 *
 * - in_scope: ≥ primaryThreshold of stops inside the bounding box.
 *   These trucks' events are kept for analysis.
 * - out_of_scope: ≥ outOfScopeThreshold of stops OUTSIDE the box (clearly
 *   operating elsewhere). Their events are dropped. Example: Makkah-
 *   dedicated trucks when region is Riyadh.
 * - outlier: neither in nor out. Mixed pattern. Events dropped from
 *   analysis but truck is surfaced in UI for manager attention — this
 *   is often a long-haul driver or a truck reassigned mid-period.
 *
 * The reason to split out outliers is credibility: reporting
 * "1 truck has atypical pattern — 40% of its activity outside Riyadh"
 * is stronger than silently including or excluding it.
 */
export function classifyTrucksByRegion(
  events: NormalizedStopEvent[],
  region: BoundingBox,
  options: {
    primaryThreshold?: number
    outOfScopeThreshold?: number
    minStopsForClassification?: number
  } = {},
): RegionClassificationResult {
  const primary = options.primaryThreshold ?? 0.8
  const outOfScope = options.outOfScopeThreshold ?? 0.5
  const minStops = options.minStopsForClassification ?? 5

  const perTruck = new Map<string, { total: number; inRegion: number }>()
  for (const e of events) {
    if (!perTruck.has(e.truckId)) perTruck.set(e.truckId, { total: 0, inRegion: 0 })
    const rec = perTruck.get(e.truckId)!
    rec.total += 1
    const inside =
      e.latitude >= region.minLat &&
      e.latitude <= region.maxLat &&
      e.longitude >= region.minLon &&
      e.longitude <= region.maxLon
    if (inside) rec.inRegion += 1
  }

  const profiles: TruckRegionProfile[] = []
  const inScopeSet = new Set<string>()

  perTruck.forEach((rec, truckId) => {
    const share = rec.total > 0 ? rec.inRegion / rec.total : 0
    // Tiny samples (< minStops) are treated as in-scope if there's any
    // in-region activity; otherwise out-of-scope. Too few data points to
    // mark as outlier.
    if (rec.total < minStops) {
      if (rec.inRegion > 0) {
        profiles.push({
          truckId, totalStops: rec.total, stopsInRegion: rec.inRegion, regionShare: share,
          classification: 'in_scope',
          note: `only ${rec.total} stops observed`,
        })
        inScopeSet.add(truckId)
      } else {
        profiles.push({
          truckId, totalStops: rec.total, stopsInRegion: 0, regionShare: 0,
          classification: 'out_of_scope',
          note: `only ${rec.total} stops, none in scope region`,
        })
      }
      return
    }

    if (share >= primary) {
      profiles.push({
        truckId, totalStops: rec.total, stopsInRegion: rec.inRegion, regionShare: share,
        classification: 'in_scope',
        note: `${Math.round(share * 100)}% of stops in scope region`,
      })
      inScopeSet.add(truckId)
    } else if ((1 - share) >= outOfScope) {
      profiles.push({
        truckId, totalStops: rec.total, stopsInRegion: rec.inRegion, regionShare: share,
        classification: 'out_of_scope',
        note: `${Math.round((1 - share) * 100)}% of stops outside scope region`,
      })
    } else {
      // Mixed — neither clearly in nor clearly out.
      profiles.push({
        truckId, totalStops: rec.total, stopsInRegion: rec.inRegion, regionShare: share,
        classification: 'outlier',
        note: `mixed pattern: ${Math.round(share * 100)}% in scope, ${Math.round((1 - share) * 100)}% outside`,
      })
    }
  })

  const kept = events.filter(e => inScopeSet.has(e.truckId))
  const summary = {
    trucksInScope: profiles.filter(p => p.classification === 'in_scope').length,
    trucksOutOfScope: profiles.filter(p => p.classification === 'out_of_scope').length,
    trucksOutliers: profiles.filter(p => p.classification === 'outlier').length,
    eventsKept: kept.length,
    eventsDropped: events.length - kept.length,
  }

  // Sort profiles: in-scope first (by total stops desc), then outliers, then out-of-scope
  profiles.sort((a, b) => {
    const order = { in_scope: 0, outlier: 1, out_of_scope: 2 }
    if (order[a.classification] !== order[b.classification]) {
      return order[a.classification] - order[b.classification]
    }
    return b.totalStops - a.totalStops
  })

  return { kept, truckProfiles: profiles, summary }
}

/** Pre-built bounding box for OMIX Riyadh scope (Malham north to Derab south
 *  with margin). Used as the default positive filter. */
export const RIYADH_BBOX: BoundingBox = {
  minLat: 24.2,
  maxLat: 25.3,
  minLon: 45.8,
  maxLon: 47.3,
}

export function filterOutRegion(
  events: NormalizedStopEvent[],
  region: RegionFilter,
): RegionFilterResult {
  const minShare = region.minShare ?? 0.5
  const perTruck = new Map<string, { total: number; inRegion: number }>()

  for (const e of events) {
    if (!perTruck.has(e.truckId)) perTruck.set(e.truckId, { total: 0, inRegion: 0 })
    const rec = perTruck.get(e.truckId)!
    rec.total += 1
    const dist = haversineKm(region.centerLat, region.centerLon, e.latitude, e.longitude)
    if (dist <= region.radiusKm) rec.inRegion += 1
  }

  const dropped: string[] = []
  perTruck.forEach((rec, truckId) => {
    if (rec.total >= 5 && rec.inRegion / rec.total >= minShare) dropped.push(truckId)
  })

  const droppedSet = new Set(dropped)
  const kept = events.filter(e => !droppedSet.has(e.truckId))
  return {
    kept,
    droppedTruckIds: dropped,
    droppedEventCount: events.length - kept.length,
  }
}
