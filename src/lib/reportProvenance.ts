/**
 * Provenance tracking for report inputs.
 *
 * Each field in the pre-assessment report must be traceable to one of:
 *   - Reported: customer entered a single precise value
 *   - Midpoint: customer entered a range, midpoint was used
 *   - Calculated: value derived from other inputs
 *   - Interpreted: customer answer was ambiguous, consultant interpretation applied
 *
 * The provenance is rendered in the "Source / Calculation" column of the
 * "Your operation today" snapshot table and throughout the appendix.
 *
 * Design:
 *   - Parallel metadata-map alongside ReportInput (Option B from sparring)
 *   - Backwards compatible: missing entries default to Reported
 *   - Pure functions, zero side effects
 */

export type ProvenanceType = 'reported' | 'midpoint' | 'calculated' | 'interpreted'

export interface ProvenanceEntry {
  type: ProvenanceType
  /**
   * The raw string the customer entered, preserved verbatim for display.
   * Example: "12-16 hours" or "5 Trips".
   */
  raw?: string
  /**
   * For midpoint provenance: the min and max bounds of the range.
   */
  min?: number
  max?: number
  /**
   * For calculated provenance: the formula as a human-readable string.
   * Example: "81,049 m³ × $27.25 margin"
   */
  formula?: string
  /**
   * For interpreted provenance: what the raw answer was assumed to mean.
   * Example: "Interpreted as trips/truck/day"
   */
  interpretation?: string
  /**
   * Optional flag: this value should be validated during the on-site visit.
   */
  to_verify_on_site?: boolean
}

/**
 * Map of ReportInput field name to its provenance entry.
 * Missing keys default to { type: 'reported' } at render time.
 */
export type ProvenanceMap = Partial<Record<string, ProvenanceEntry>>

// ── Parsing helpers ─────────────────────────────────────────────────────────

/**
 * Result of parsing a numeric input that could be either a single number
 * or a range. The midpoint (or the single value itself) is returned as
 * `value`, together with provenance metadata for later display.
 */
export interface ParsedNumber {
  value: number
  provenance: ProvenanceEntry
}

/**
 * Parse a numeric input that may be:
 *   - A number ("14", 14)
 *   - A range ("12-16", "12 to 16", "12–16")
 *   - A string with a single number ("14 hours")
 *   - Empty/invalid → fallback to 0 with "interpreted" provenance
 *
 * Always prefers single precise numbers. Falls back to midpoint when a
 * range is detected.
 *
 * @param raw  The customer's raw answer (string or number)
 * @param fallback  Value to return if parsing fails
 */
export function parseNumberOrRange(
  raw: string | number | null | undefined,
  fallback = 0
): ParsedNumber {
  // Empty / null / undefined
  if (raw === null || raw === undefined || raw === '') {
    return {
      value: fallback,
      provenance: { type: 'interpreted', raw: '', interpretation: `No answer provided, defaulting to ${fallback}` },
    }
  }

  // Already a number
  if (typeof raw === 'number' && !isNaN(raw)) {
    return { value: raw, provenance: { type: 'reported' } }
  }

  const rawStr = String(raw).trim()
  if (rawStr === '') {
    return {
      value: fallback,
      provenance: { type: 'interpreted', raw: '', interpretation: `No answer provided, defaulting to ${fallback}` },
    }
  }

  // Range detection: "12-16", "12 to 16", "12–16", "5km-45km", "1-2%"
  // Allows units/whitespace around numbers.
  const rangeMatch = rawStr.match(/(-?\d+(?:\.\d+)?)\s*[^\d,.-]*\s*(?:[-–—]|to)\s*[^\d,.-]*\s*(-?\d+(?:\.\d+)?)/i)
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1])
    const max = parseFloat(rangeMatch[2])
    if (!isNaN(min) && !isNaN(max) && min <= max) {
      const midpoint = (min + max) / 2
      return {
        value: midpoint,
        provenance: { type: 'midpoint', raw: rawStr, min, max },
      }
    }
  }

  // Single number, possibly with units: "14", "14 hours", "1.5%"
  const singleMatch = rawStr.match(/-?\d+(?:\.\d+)?/)
  if (singleMatch) {
    const num = parseFloat(singleMatch[0])
    if (!isNaN(num)) {
      // If the string was just digits (+ optional decimal), it's reported.
      // If it had additional non-unit text, still report as reported but preserve raw.
      const isClean = /^-?\d+(?:\.\d+)?$/.test(rawStr)
      return {
        value: num,
        provenance: isClean ? { type: 'reported' } : { type: 'reported', raw: rawStr },
      }
    }
  }

  // Unparseable
  return {
    value: fallback,
    provenance: { type: 'interpreted', raw: rawStr, interpretation: `Could not parse "${rawStr}", defaulting to ${fallback}` },
  }
}

// ── Monthly trips parsing ──────────────────────────────────────────────────

export type TripsUnit = 'total_monthly' | 'per_truck_per_day' | 'per_truck_per_week'

export interface ParsedTrips {
  total_monthly: number
  provenance: ProvenanceEntry
}

/**
 * Parse trip input where the customer may answer in one of three units:
 *   - Total monthly trips (preferred)
 *   - Per truck per day
 *   - Per truck per week
 *
 * Always returns total_monthly, with provenance describing how it was
 * computed.
 *
 * @param raw  Customer's raw answer
 * @param unit  Which unit the customer intended
 * @param trucks  Number of trucks (needed for per-truck-* conversions)
 * @param opDaysPerMonth  Operating days per month (needed for per-day conversion)
 */
export function parseTrips(
  raw: string | number | null | undefined,
  unit: TripsUnit,
  trucks: number,
  opDaysPerMonth: number
): ParsedTrips {
  const parsed = parseNumberOrRange(raw, 0)
  const rawStr = typeof raw === 'string' ? raw.trim() : String(raw ?? '')

  if (unit === 'total_monthly') {
    // Customer gave total already
    return {
      total_monthly: Math.round(parsed.value),
      provenance: parsed.provenance.type === 'reported' && !parsed.provenance.raw
        ? { type: 'reported' }
        : parsed.provenance,
    }
  }

  if (unit === 'per_truck_per_day') {
    const total = Math.round(parsed.value * trucks * opDaysPerMonth)
    return {
      total_monthly: total,
      provenance: {
        type: 'interpreted',
        raw: rawStr,
        interpretation: `Customer answer: "${rawStr}", interpreted as trips/truck/day. Total = ${parsed.value} × ${trucks} trucks × ${opDaysPerMonth} days = ${total.toLocaleString('en-US')}`,
      },
    }
  }

  // per_truck_per_week
  const weeksPerMonth = opDaysPerMonth > 0 ? opDaysPerMonth / (opDaysPerMonth >= 20 ? 5 : 6) : 4.33
  const total = Math.round(parsed.value * trucks * weeksPerMonth)
  return {
    total_monthly: total,
    provenance: {
      type: 'interpreted',
      raw: rawStr,
      interpretation: `Customer answer: "${rawStr}", interpreted as trips/truck/week. Total = ${parsed.value} × ${trucks} trucks × ${weeksPerMonth.toFixed(2)} weeks = ${total.toLocaleString('en-US')}`,
    },
  }
}

// ── Render helpers ──────────────────────────────────────────────────────────

/**
 * Render a provenance entry as a human-readable string for the
 * Source / Calculation column. Used by both HTML preview and Word export.
 *
 * Examples:
 *   reported              → "Reported"
 *   midpoint (1-2%)       → "Midpoint of reported 1-2% range"
 *   calculated (formula)  → "Calculated: 81,049 m³ × $27.25 margin"
 *   interpreted           → 'Customer answer: "5 Trips". Interpreted as trips/truck/day'
 *
 * Returns a short tag ("Reported") and a longer description. Callers can
 * render them separately (e.g. tag + text) or concatenated.
 */
export interface RenderedProvenance {
  tag: string
  description: string
}

export function renderProvenance(entry: ProvenanceEntry | undefined): RenderedProvenance {
  if (!entry || entry.type === 'reported') {
    // Default: reported with no extra context
    if (!entry || !entry.raw) {
      return { tag: 'Reported', description: '' }
    }
    return { tag: 'Reported', description: `Customer answer: "${entry.raw}"` }
  }

  if (entry.type === 'midpoint') {
    const rangeStr = entry.raw
      ? entry.raw
      : entry.min !== undefined && entry.max !== undefined
        ? `${entry.min}, ${entry.max}`
        : 'range'
    return {
      tag: 'Midpoint',
      description: `of reported ${rangeStr}`,
    }
  }

  if (entry.type === 'calculated') {
    return {
      tag: 'Calculated',
      description: entry.formula || '',
    }
  }

  // interpreted
  const parts: string[] = []
  if (entry.raw) parts.push(`Customer answer: "${entry.raw}"`)
  if (entry.interpretation) parts.push(entry.interpretation)
  if (entry.to_verify_on_site) parts.push('To verify on-site')
  return {
    tag: 'Interpreted',
    description: parts.join('. '),
  }
}

/**
 * Convenience: get provenance for a field with automatic fallback to
 * Reported. Never returns undefined.
 */
export function getProvenance(map: ProvenanceMap | undefined, field: string): ProvenanceEntry {
  return map?.[field] ?? { type: 'reported' }
}
