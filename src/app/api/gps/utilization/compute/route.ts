/**
 * POST /api/gps/utilization/compute
 *
 * Reads normalised events + plant profile for the assessment, runs the
 * utilization engine (current avg + demonstrated capacity + gap + monthly
 * USD), persists the result to utilization_analysis_results.
 *
 * Two analysis modes:
 *   - baseline       (default): filters OUT events from any active
 *                    utilization_exclusions range. Produces the "steady
 *                    state" view that is robust to Ramadan/holidays.
 *   - within_period: restricts TO events within a specific exclusion
 *                    range. Produces a period-specific view (primary use
 *                    case: a Ramadan-only analysis rendered next to
 *                    baseline as a competitive differentiator).
 *
 * Prereqs: /api/gps/stop-details/parse must have populated
 * normalized_gps_events, and plant_operational_profile must have rows
 * for each plant in scope.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { NormalizedStopEvent } from '@/lib/gps/stopDetailsParser'
import {
  classifyOperatingDays,
  summariseOperatingDays,
} from '@/lib/gps/coordinateClustering'
import {
  countLoadsPerOperatingDay,
  computeUtilizationMetrics,
  computeGap,
  computeMedianTat,
  type PlantGeofence,
} from '@/lib/gps/utilizationEngine'

export const maxDuration = 60

type AnalysisMode = 'baseline' | 'within_period'

interface ComputeBody {
  assessmentId?: string
  mode?: AnalysisMode
  exclusionId?: string
}

interface ExclusionRow {
  id: string
  start_date: string
  end_date: string
  label: string
  reason: string
  active: boolean
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as ComputeBody | null
  const assessmentId = body?.assessmentId
  const mode: AnalysisMode = body?.mode ?? 'baseline'
  const exclusionId = body?.exclusionId ?? null

  if (!assessmentId) {
    return NextResponse.json({ error: 'assessmentId required' }, { status: 400 })
  }
  if (mode === 'within_period' && !exclusionId) {
    return NextResponse.json(
      { error: 'exclusionId required for within_period mode' },
      { status: 400 },
    )
  }

  // ── Load assessment answers (global financials + operating params) ────
  const { data: assessment, error: asmtErr } = await supabase
    .from('assessments')
    .select('id, answers, plant_id')
    .eq('id', assessmentId)
    .single()

  if (asmtErr || !assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  const answers = (assessment.answers ?? {}) as Record<string, string | number | null>
  const priceM3 = numOr(answers.price_m3, 0)
  const materialCost = numOr(answers.material_cost, 0)
  const marginPerM3 = priceM3 - materialCost
  const m3PerLoad = numOr(answers.mixer_capacity, 7.5)

  if (marginPerM3 <= 0) {
    return NextResponse.json({
      error: 'Margin per m³ not computable — answer price_m3 and material_cost first',
    }, { status: 422 })
  }

  // ── Load plant profiles ──────────────────────────────────────────────
  const { data: profiles } = await supabase
    .from('plant_operational_profile')
    .select('*')
    .eq('assessment_id', assessmentId)

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({
      error: 'No plant profiles found — confirm plant clusters first',
    }, { status: 422 })
  }

  const plants: PlantGeofence[] = profiles.map((p: Record<string, unknown>) => ({
    slug: String(p.plant_slug),
    name: String(p.plant_name),
    centroidLat: Number(p.centroid_lat),
    centroidLon: Number(p.centroid_lon),
    radiusM: Number(p.plant_radius_m ?? 500),
  }))

  // ── Load exclusions ──────────────────────────────────────────────────
  const { data: exclusionRows } = await supabase
    .from('utilization_exclusions')
    .select('id, start_date, end_date, label, reason, active')
    .eq('assessment_id', assessmentId)
  const exclusions = (exclusionRows ?? []) as ExclusionRow[]

  // Resolve the target period if in within_period mode.
  let targetPeriod: ExclusionRow | null = null
  if (mode === 'within_period') {
    targetPeriod = exclusions.find(e => e.id === exclusionId) ?? null
    if (!targetPeriod) {
      return NextResponse.json(
        { error: 'Exclusion not found for this assessment' },
        { status: 404 },
      )
    }
  }

  // ── Load + filter events ─────────────────────────────────────────────
  const allEvents = await loadAllEvents(supabase, assessmentId)
  if (allEvents.length === 0) {
    return NextResponse.json({
      error: 'No normalized events found — upload Stop Details files first',
    }, { status: 422 })
  }

  const events = filterEventsByMode(allEvents, mode, exclusions, targetPeriod)
  if (events.length === 0) {
    return NextResponse.json({
      error: mode === 'within_period'
        ? `No events fall within ${targetPeriod?.label}`
        : 'All events are excluded by active exclusions — disable one or upload different data',
    }, { status: 422 })
  }

  // ── Operating day classification ─────────────────────────────────────
  const distinctMixerTrucks = new Set(
    events.filter(e => e.truckType === 'mixer_truck').map(e => e.truckId),
  ).size

  const operatingDays = classifyOperatingDays(events, distinctMixerTrucks)
  const opDaySummary = summariseOperatingDays(operatingDays)

  // ── Run the engine ───────────────────────────────────────────────────
  const perDayLoads = countLoadsPerOperatingDay(events, plants, operatingDays)
  const metrics = computeUtilizationMetrics(perDayLoads, operatingDays)
  const gap = computeGap(metrics, {
    m3PerLoad,
    marginPerM3,
    monthlyOperatingDays: 25,
  })
  const tat = computeMedianTat(events, plants)

  // ── Per-plant breakdown ──────────────────────────────────────────────
  const plantLoads = new Map<string, number>()
  perDayLoads.forEach(rec => {
    rec.perPlant.forEach((count, slug) => {
      plantLoads.set(slug, (plantLoads.get(slug) ?? 0) + count)
    })
  })
  const plantBreakdown = plants.map(p => ({
    plant_slug: p.slug,
    plant_name: p.name,
    total_plant_loads: plantLoads.get(p.slug) ?? 0,
    share_of_loads: events.length > 0
      ? (plantLoads.get(p.slug) ?? 0) / Math.max(1, Array.from(plantLoads.values()).reduce((s, v) => s + v, 0))
      : 0,
  }))

  // ── Archive previous live row for THIS (mode, exclusion) combination ─
  // Important: baseline archive only touches baseline rows, and each
  // within_period run only touches its own period's row. Running one
  // doesn't wipe the other.
  let archiveQuery = supabase
    .from('utilization_analysis_results')
    .update({ archived: true })
    .eq('assessment_id', assessmentId)
    .eq('archived', false)
    .eq('analysis_mode', mode)
  if (mode === 'within_period') {
    archiveQuery = archiveQuery.eq('exclusion_id', exclusionId as string)
  } else {
    archiveQuery = archiveQuery.is('exclusion_id', null)
  }
  await archiveQuery

  const windowDates = events.map(e => e.startedAt.slice(0, 10)).sort()
  const windowStart = windowDates[0]
  const windowEnd = windowDates[windowDates.length - 1]

  const contextNotes: string[] = [...metrics.computationNotes]
  if (tat.medianTatMin !== null) {
    contextNotes.push(
      `Median TAT = ${tat.medianTatMin.toFixed(1)} min across ${tat.tripsCount} plant-to-plant cycles` +
      (tat.cyclesDiscarded > 0 ? ` (${tat.cyclesDiscarded} discarded as <15 min or >4 h)` : ''),
    )
  } else {
    contextNotes.push(
      'Median TAT not computable — no plant-to-plant cycles with a non-plant stop between them were found',
    )
  }
  if (mode === 'baseline') {
    const active = exclusions.filter(e => e.active)
    if (active.length > 0) {
      contextNotes.push(
        `Baseline excludes ${active.length} period(s): ${active.map(e => `${e.label} (${e.start_date}→${e.end_date})`).join(', ')}`,
      )
    }
  } else if (targetPeriod) {
    contextNotes.push(
      `Within-period analysis: ${targetPeriod.label} (${targetPeriod.start_date}→${targetPeriod.end_date})`,
    )
  }

  const insertRow = {
    assessment_id: assessmentId,
    window_start: windowStart,
    window_end: windowEnd,
    total_calendar_days: opDaySummary.totalDays,
    operating_days: opDaySummary.operatingDays,
    fridays_excluded: opDaySummary.fridays,
    low_activity_days_excluded: opDaySummary.lowActivityDays,
    events_total: events.length,
    events_in_scope: events.length,
    events_out_of_scope: 0,
    trucks_in_scope: distinctMixerTrucks,
    trucks_out_of_scope: 0,
    trucks_outlier: 0,
    outlier_profiles: [],
    current_loads_per_op_day: metrics.current.loadsPerOpDay,
    current_trips_per_truck_per_op_day: metrics.current.tripsPerTruckPerOpDay,
    current_utilization_pct: null,
    current_median_tat_min: tat.medianTatMin,
    demonstrated_loads_per_op_day: metrics.demonstrated?.loadsPerOpDay ?? null,
    demonstrated_trips_per_truck_per_op_day: metrics.demonstrated?.tripsPerTruckPerOpDay ?? null,
    demonstrated_median_tat_min: null,
    demonstrated_utilization_pct: null,
    demonstrated_weeks: metrics.demonstratedWeeks,
    peak_loads_per_op_day: metrics.peak?.loadsPerOpDay ?? null,
    peak_week_start: metrics.peakWeekStart,
    gap_loads_per_op_day: gap?.gapLoadsPerOpDay ?? null,
    monthly_value_usd: gap?.monthlyValueUsd ?? null,
    plant_breakdown: plantBreakdown,
    computation_notes: contextNotes.map(n => ({ note: n })),
    analysis_mode: mode,
    period_label: targetPeriod?.label ?? null,
    exclusion_id: mode === 'within_period' ? exclusionId : null,
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('utilization_analysis_results')
    .insert(insertRow)
    .select('id')
    .single()

  if (insertErr) {
    return NextResponse.json(
      { error: `Persist failed: ${insertErr.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    id: inserted.id,
    mode,
    periodLabel: targetPeriod?.label ?? null,
    summary: {
      operatingDays: opDaySummary.operatingDays,
      currentLoadsPerOpDay: metrics.current.loadsPerOpDay,
      demonstratedLoadsPerOpDay: metrics.demonstrated?.loadsPerOpDay ?? null,
      gapLoadsPerOpDay: gap?.gapLoadsPerOpDay ?? null,
      monthlyValueUsd: gap?.monthlyValueUsd ?? null,
    },
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────

function numOr(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Apply mode-specific filtering.
 *   baseline       — drop events that fall in ANY active exclusion.
 *   within_period  — keep ONLY events that fall in the target exclusion.
 *
 * Date comparison uses the event's local-date prefix (YYYY-MM-DD) against
 * the exclusion range (inclusive on both ends). Timezone offsets below
 * day granularity don't matter here because the utilization engine
 * aggregates per operating-day anyway.
 */
function filterEventsByMode(
  events: NormalizedStopEvent[],
  mode: AnalysisMode,
  exclusions: ExclusionRow[],
  targetPeriod: ExclusionRow | null,
): NormalizedStopEvent[] {
  if (mode === 'within_period' && targetPeriod) {
    return events.filter(e => {
      const d = e.startedAt.slice(0, 10)
      return d >= targetPeriod.start_date && d <= targetPeriod.end_date
    })
  }
  // baseline
  const active = exclusions.filter(e => e.active)
  if (active.length === 0) return events
  return events.filter(e => {
    const d = e.startedAt.slice(0, 10)
    for (const ex of active) {
      if (d >= ex.start_date && d <= ex.end_date) return false
    }
    return true
  })
}

/**
 * Load all events for an assessment (paginated — Supabase default limit
 * is 1000 rows). Maps DB columns back to NormalizedStopEvent shape the
 * engine expects.
 */
async function loadAllEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assessmentId: string,
): Promise<NormalizedStopEvent[]> {
  const PAGE = 1000
  const out: NormalizedStopEvent[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('normalized_gps_events')
      .select('truck_id, event_timestamp, stop_start_time, stop_end_time, latitude, longitude, raw_row_reference')
      .eq('assessment_id', assessmentId)
      .order('event_timestamp', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data as Array<Record<string, unknown>>) {
      const truckId = String(row.truck_id ?? '')
      const startedAt = String(row.stop_start_time ?? row.event_timestamp ?? '')
      const endedAt = String(row.stop_end_time ?? row.event_timestamp ?? '')
      if (!truckId || !startedAt) continue
      const lat = Number(row.latitude)
      const lon = Number(row.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

      out.push({
        truckLabel: truckId,
        truckId,
        truckType: /^TM/i.test(truckId) ? 'mixer_truck'
                 : /^P/i.test(truckId) ? 'pump_truck'
                 : 'other',
        startedAt: startedAt.slice(0, 19),
        endedAt: endedAt.slice(0, 19),
        durationMin: 0,
        latitude: lat,
        longitude: lon,
        sourceFile: '',
        sourceRow: Number(row.raw_row_reference ?? 0),
      })
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}
