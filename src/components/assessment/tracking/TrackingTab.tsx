'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LineChart, Line, ComposedChart, Bar, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useIsMobile } from '@/hooks/useIsMobile'
import { InterventionsList } from '@/components/fieldlog/InterventionsView'

// ── Types ──────────────────────────────────────────────────────────────────

interface TrackingConfig {
  id: string
  assessment_id: string
  started_at: string
  baseline_turnaround: number | null
  baseline_reject_pct: number | null
  baseline_dispatch_min: number | null
  target_turnaround: number | null
  target_reject_pct: number | null
  target_dispatch_min: number | null
  track_turnaround: boolean
  track_reject: boolean
  track_dispatch: boolean
  coeff_turnaround: number
  coeff_reject: number  // repurposed as coeffDispatch in v2 UI
  baseline_monthly_loss: number | null
  consent_case_study: boolean
}

interface TrackingEntry {
  id: string
  config_id: string
  week_number: number
  logged_at: string
  turnaround_min: number | null
  reject_pct: number | null
  dispatch_min: number | null
  notes: string | null
  /** Populated when the entry was synthesised from daily_logs aggregation
   *  (not manually entered). Client uses this to show a 'auto' badge. */
  source?: 'manual' | 'auto'
  /** Trip count behind the synthesis (auto entries only). */
  trip_count?: number
}

/** One row per week returned by get_weekly_kpis_from_daily_logs RPC. */
interface WeeklyAggregate {
  week_number: number
  trip_count: number
  complete_trip_count: number
  partial_trip_count: number
  total_m3: number | null
  avg_load_m3: number | null
  avg_tat_min: number | null
  avg_plant_queue_min: number | null
  avg_loading_min: number | null
  avg_transit_out_min: number | null
  avg_site_wait_min: number | null
  avg_pouring_min: number | null
  avg_washout_min: number | null
  avg_transit_back_min: number | null
  reject_count: number
  reject_pct: number | null
  reject_plant_side_count: number
  reject_customer_side_count: number
  slump_tested_count: number
  slump_pass_count: number
  slump_pass_pct: number | null
  unique_trucks: number
  unique_drivers: number
  unique_sites: number
  days_with_trips: number
  avg_trips_per_truck_per_day: number | null
  avg_m3_per_truck_per_day: number | null
  week_start_date: string
  week_end_date: string
  origin_plant_breakdown: Record<string, number>
  site_type_breakdown: Record<string, number>
  reject_cause_breakdown: Record<string, number>
}

/** Minimum trips per week required before we synthesise a weekly KPI
 *  entry from daily_logs. Below this the numbers aren't statistically
 *  meaningful and we'd rather show "no data" than misleading averages. */
const MIN_TRIPS_FOR_AUTO_ENTRY = 3

/** Merge manual tracking_entries with daily_logs aggregates.
 *  Manual entries always win; auto entries fill in gaps when enough
 *  trips are logged for the week. */
function mergeEntries(manual: TrackingEntry[], aggregates: WeeklyAggregate[], configId: string): TrackingEntry[] {
  const manualByWeek = new Map(manual.map(e => [e.week_number, e]))
  const aggregateByWeek = new Map(aggregates.map(a => [a.week_number, a]))

  const weeks = new Set<number>()
  manual.forEach(e => weeks.add(e.week_number))
  aggregates.forEach(a => weeks.add(a.week_number))

  const merged: TrackingEntry[] = []
  for (const w of Array.from(weeks).sort((a, b) => a - b)) {
    const m = manualByWeek.get(w)
    if (m) {
      merged.push({ ...m, source: 'manual' })
      continue
    }
    const agg = aggregateByWeek.get(w)
    if (agg && agg.trip_count >= MIN_TRIPS_FOR_AUTO_ENTRY) {
      merged.push({
        id: `auto-${w}`,
        config_id: configId,
        week_number: w,
        logged_at: agg.week_end_date,
        turnaround_min: agg.avg_tat_min != null ? Math.round(agg.avg_tat_min) : null,
        // "Dispatch" in Track = plant queue time (time from truck arriving
        // at plant queue to loading start). Closest daily_logs equivalent.
        dispatch_min: agg.avg_plant_queue_min != null ? Math.round(agg.avg_plant_queue_min) : null,
        reject_pct: agg.reject_pct != null ? Math.round(agg.reject_pct * 10) / 10 : null,
        notes: null,
        source: 'auto',
        trip_count: agg.trip_count,
      })
    }
  }
  return merged
}

interface DailyEntry {
  id: string
  config_id: string
  logged_date: string   // 'YYYY-MM-DD'
  deliveries_completed: number
  orders_received: number | null
  rejects: number | null
}

interface DailyChartPoint {
  date: string
  deliveries: number | undefined
  rolling7: number | undefined
}

export interface TrackingProps {
  assessmentId: string
  isAdmin: boolean
  viewOnly?: boolean  // owner role, sees charts but no weekly input form
  plant?: string
  country?: string
  /** The assessment's lifecycle phase. Baseline is "forming" during
   *  onsite, and "locked" once the analyst transitions to complete. */
  phase?: 'workshop' | 'workshop_complete' | 'onsite' | 'complete' | 'full'
  perMinTACoeff?: number
  baselineTurnaround: number | null
  baselineRejectPct: number | null
  baselineDispatchMin: number | null
  coeffTurnaround: number
  coeffReject: number
  coeffDispatch: number
  baselineMonthlyLoss: number
  targetTA: number
}

interface ChartPoint {
  week: number
  baseline: number
  predicted: number
  actual?: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k'
  return '$' + Math.round(n)
}

function getWeekNumber(startedAt: string): number {
  const start = new Date(startedAt)
  const today = new Date()
  const days = Math.floor((today.getTime() - start.getTime()) / 86_400_000)
  return Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
}

function progressPct(baseline: number | null, latest: number | null, target: number | null): number {
  if (baseline == null || latest == null || target == null) return 0
  if (baseline <= target) return 100
  return Math.min(100, Math.max(0, Math.round((baseline - latest) / (baseline - target) * 100)))
}

// ── Intervention helpers ───────────────────────────────────────────────────
export interface InterventionMarker {
  id: string
  title: string
  date: string
  targetMetric: string | null
  week: number  // 0 if before tracking started, else 1-13
}

/** Convert an intervention's intervention_date to a week number based on
 *  the tracking_config's started_at. Returns 0 if before tracking start. */
function interventionToWeek(interventionDate: string, trackingStartedAt: string): number {
  const diffMs = new Date(interventionDate).getTime() - new Date(trackingStartedAt).getTime()
  const days = Math.floor(diffMs / 86_400_000)
  if (days < 0) return 0
  return Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
}

/** Compute the "forming" baseline TAT from onsite-phase trips.
 *  Average turnaround across all trips logged BEFORE the first
 *  intervention_date. Returns null if fewer than 5 eligible trips.
 *
 *  Rationale: the onsite week IS the diagnosis phase. Trips logged
 *  during onsite are the measurement of how the plant operates
 *  pre-intervention. As soon as an intervention is logged, subsequent
 *  trips are post-intervention and must not contaminate the baseline. */
async function computeFormingBaseline(
  supabase: ReturnType<typeof createClient>,
  assessmentId: string,
): Promise<{ avg: number; tripCount: number } | null> {
  // Find the earliest intervention (if any). Trips after this are
  // post-intervention and excluded from baseline.
  const { data: firstIv } = await supabase
    .from('intervention_logs')
    .select('intervention_date')
    .eq('assessment_id', assessmentId)
    .order('intervention_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const cutoff = firstIv?.intervention_date ?? null

  let query = supabase
    .from('daily_logs')
    .select('plant_queue_start, departure_loaded, arrival_plant')
    .eq('assessment_id', assessmentId)
    .not('arrival_plant', 'is', null)

  if (cutoff) {
    query = query.lt('log_date', cutoff)
  }

  const { data: rows } = await query
  if (!rows || rows.length < 5) return null

  let sum = 0
  let count = 0
  for (const r of rows) {
    const start = r.plant_queue_start ?? r.departure_loaded
    const end = r.arrival_plant
    if (!start || !end) continue
    const diff = (new Date(end).getTime() - new Date(start).getTime()) / 60000
    if (diff > 0 && diff < 720) {  // sanity: ignore > 12h outliers
      sum += diff
      count += 1
    }
  }
  if (count < 5) return null
  return { avg: Math.round(sum / count), tripCount: count }
}

/** React hook that loads intervention markers for a given assessment,
 *  mapped to week numbers relative to tracking start. Returns empty
 *  in demo mode or before tracking has started. */
function useInterventionMarkers(
  assessmentId: string,
  trackingStartedAt: string,
  isDemo: boolean,
): InterventionMarker[] {
  const [markers, setMarkers] = useState<InterventionMarker[]>([])
  useEffect(() => {
    if (isDemo) return
    const supabase = createClient()
    supabase
      .from('intervention_logs')
      .select('id, title, intervention_date, target_metric')
      .eq('assessment_id', assessmentId)
      .order('intervention_date', { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []) as Array<{
          id: string
          title: string
          intervention_date: string
          target_metric: string | null
        }>
        setMarkers(rows.map(r => ({
          id: r.id,
          title: r.title,
          date: r.intervention_date,
          targetMetric: r.target_metric,
          week: interventionToWeek(r.intervention_date, trackingStartedAt),
        })))
      })
  }, [assessmentId, trackingStartedAt, isDemo])
  return markers
}

function calcMonthlyRecovery(entry: TrackingEntry, cfg: TrackingConfig, coeffDispatch: number): number {
  let r = 0
  if (entry.turnaround_min != null && cfg.baseline_turnaround != null) {
    r += Math.max(0, cfg.baseline_turnaround - entry.turnaround_min) * cfg.coeff_turnaround
  }
  if (entry.dispatch_min != null && cfg.baseline_dispatch_min != null) {
    r += Math.max(0, cfg.baseline_dispatch_min - entry.dispatch_min) * coeffDispatch
  }
  return Math.round(r)
}

function buildChartPoints(
  entries: TrackingEntry[],
  baseline: number,
  target: number,
  key: 'turnaround_min' | 'dispatch_min'
): ChartPoint[] {
  const points: ChartPoint[] = []
  points.push({ week: 0, baseline, predicted: baseline, actual: baseline })
  for (let w = 1; w <= 12; w++) {
    const entry = entries.find(e => e.week_number === w)
    const predicted = Math.round(baseline - (baseline - target) * (w / 12))
    const val = entry?.[key]
    points.push({ week: w, baseline, predicted, actual: val != null ? val : undefined })
  }
  return points
}

function buildDailyChartPoints(entries: DailyEntry[]): DailyChartPoint[] {
  // Build date→entry map
  const map: Record<string, DailyEntry> = {}
  for (const e of entries) map[e.logged_date] = e

  // Generate last 30 calendar days
  const today = new Date()
  const points: DailyChartPoint[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const entry = map[dateStr]

    // Rolling 7: avg of up to 7 most-recent prior logged entries
    const prior = entries
      .filter(e => e.logged_date < dateStr)
      .sort((a, b) => b.logged_date.localeCompare(a.logged_date))
      .slice(0, 7)
    const rolling7 = prior.length >= 3
      ? Math.round(prior.reduce((s, e) => s + e.deliveries_completed, 0) / prior.length)
      : undefined

    points.push({ date: dateStr, deliveries: entry?.deliveries_completed, rolling7 })
  }
  return points
}

function calcTrendAlert(entries: DailyEntry[]): string | null {
  const sorted = [...entries].sort((a, b) => b.logged_date.localeCompare(a.logged_date))
  const last7 = sorted.slice(0, 7)
  const prev7 = sorted.slice(7, 14)
  if (last7.length < 4 || prev7.length < 4) return null
  const avgLast = last7.reduce((s, e) => s + e.deliveries_completed, 0) / last7.length
  const avgPrev = prev7.reduce((s, e) => s + e.deliveries_completed, 0) / prev7.length
  if (avgPrev === 0) return null
  const drop = (avgPrev - avgLast) / avgPrev
  if (drop >= 0.10) {
    return `Deliveries down ~${Math.round(drop * 100)}% vs prior 7 days. Check fleet availability or order intake.`
  }
  return null
}

// ── Basic sub-components ───────────────────────────────────────────────────

function ProgressBar({ pct, color = 'var(--green)' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: '3px', transition: 'width .3s' }} />
    </div>
  )
}

function StatusBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'var(--phase-complete)' : pct >= 40 ? 'var(--warning)' : 'var(--gray-400)'
  const bg = pct >= 80 ? 'var(--phase-complete-bg)' : pct >= 40 ? 'var(--warning-bg, #fef9c3)' : 'var(--gray-50)'
  return (
    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: bg, color }}>
      {pct >= 80 ? 'On track' : pct >= 40 ? 'Improving' : 'Early'}
    </span>
  )
}

// ── ImpactSummary (Section A) ──────────────────────────────────────────────

function ImpactSummary({ config, entries, coeffDispatch, currentWeek }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  coeffDispatch: number
  currentWeek: number
}) {
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0] ?? null
  const currentMonthlyRecovery = latest ? calcMonthlyRecovery(latest, config, coeffDispatch) : 0

  const predictedTotal = Math.round(
    Math.max(0, (config.baseline_turnaround ?? 0) - (config.target_turnaround ?? 0)) * config.coeff_turnaround
    + Math.max(0, (config.baseline_dispatch_min ?? 0) - (config.target_dispatch_min ?? 15)) * coeffDispatch
  )

  const pct = predictedTotal > 0 ? Math.min(100, Math.round(currentMonthlyRecovery / predictedTotal * 100)) : 0
  const onTrack = pct >= 40

  return (
    <div style={{
      background: currentMonthlyRecovery > 0 ? 'linear-gradient(135deg, #f0faf6 0%, #fff 70%)' : 'var(--white)',
      border: `1px solid ${currentMonthlyRecovery > 0 ? '#b5dfc9' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '10px', color: currentMonthlyRecovery > 0 ? '#4a9a72' : 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', fontWeight: 600 }}>
            Value recovered / month
          </div>
          <div style={{ fontSize: '48px', fontWeight: 800, fontFamily: 'var(--mono)', color: currentMonthlyRecovery > 0 ? '#1a6644' : 'var(--gray-300)', lineHeight: 1, letterSpacing: '-1px' }}>
            {currentMonthlyRecovery > 0 ? fmt(currentMonthlyRecovery) : '-'}
          </div>
          {predictedTotal > 0 && (
            <div style={{ fontSize: '12px', color: '#7ab89a', marginTop: '6px' }}>
              of {fmt(predictedTotal)}/mo predicted at target
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '8px', fontWeight: 500 }}>
            Week {currentWeek} of 12
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
            <StatusBadge pct={pct} />
            {onTrack && <span style={{ fontSize: '14px', color: 'var(--phase-complete)' }}>✓</span>}
          </div>
        </div>
      </div>
      {predictedTotal > 0 && currentMonthlyRecovery > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '10px', color: '#7ab89a' }}>Progress toward full recovery</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#1a6644' }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={onTrack ? 'var(--phase-complete)' : 'var(--warning)'} />
        </div>
      )}
    </div>
  )
}

// ── Monthly Milestones ─────────────────────────────────────────────────────

function MonthlyMilestones({ config, entries, coeffDispatch }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  coeffDispatch: number
}) {
  const isMobile = useIsMobile()
  const CHECKPOINTS = [
    { label: 'Month 1', week: 4 },
    { label: 'Month 2', week: 8 },
    { label: 'Month 3', week: 13 },
  ]
  const currentWeek = getWeekNumber(config.started_at)

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '14px' }}>
        Milestones
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px' }}>
        {CHECKPOINTS.map(({ label, week }) => {
          const entry = entries.find(e => e.week_number === week)
            ?? [...entries].sort((a, b) => Math.abs(a.week_number - week) - Math.abs(b.week_number - week))[0]
          const reached = currentWeek >= week
          const taBaseline = config.baseline_turnaround ?? 0
          const taTarget = config.target_turnaround ?? taBaseline
          const diBaseline = config.baseline_dispatch_min ?? 0
          const diTarget = config.target_dispatch_min ?? diBaseline
          // Predicted at this checkpoint
          const predictedTA = Math.round(taBaseline - (taBaseline - taTarget) * (week / 12))
          const predictedDI = Math.round(diBaseline - (diBaseline - diTarget) * (week / 12))
          // Actual recovery at this checkpoint
          const actualEntry = entries.find(e => e.week_number === week)
          const taActual = actualEntry?.turnaround_min ?? null
          const diActual = actualEntry?.dispatch_min ?? null
          const predictedRecovery = Math.round(
            Math.max(0, taBaseline - predictedTA) * config.coeff_turnaround
            + Math.max(0, diBaseline - predictedDI) * coeffDispatch
          )
          const actualRecovery = reached && (taActual != null || diActual != null) ? Math.round(
            Math.max(0, taBaseline - (taActual ?? predictedTA)) * config.coeff_turnaround
            + Math.max(0, diBaseline - (diActual ?? predictedDI)) * coeffDispatch
          ) : null

          const ahead = actualRecovery != null && predictedRecovery > 0 && actualRecovery >= predictedRecovery
          const behind = actualRecovery != null && predictedRecovery > 0 && actualRecovery < predictedRecovery

          return (
            <div
              key={label}
              style={{
                padding: '12px', borderRadius: '8px',
                background: !reached ? 'var(--gray-50)' : ahead ? 'var(--phase-complete-bg)' : behind ? 'var(--warning-bg)' : 'var(--gray-50)',
                border: `1px solid ${!reached ? 'var(--border)' : ahead ? 'var(--tooltip-border)' : behind ? 'var(--warning-border)' : 'var(--border)'}`,
                opacity: !reached ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-700)' }}>{label}</div>
                <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>wk {week}</div>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '9px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '2px' }}>Predicted</div>
                <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
                  {predictedRecovery > 0 ? fmt(predictedRecovery) + '/mo' : '-'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '2px' }}>Actual</div>
                <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--mono)', color: !reached ? 'var(--gray-300)' : ahead ? 'var(--phase-complete)' : behind ? '#d97706' : 'var(--gray-900)' }}>
                  {actualRecovery != null ? fmt(actualRecovery) + '/mo' : reached ? 'not logged' : '-'}
                </div>
              </div>
              {actualRecovery != null && predictedRecovery > 0 && (
                <div style={{ marginTop: '6px', fontSize: '9px', fontWeight: 600, color: ahead ? 'var(--phase-complete)' : '#d97706' }}>
                  {ahead ? `✓ +${fmt(actualRecovery - predictedRecovery)} ahead` : `▼ ${fmt(predictedRecovery - actualRecovery)} behind`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ImpactChart (Section B) ────────────────────────────────────────────────

function ImpactChart({ config, entries, interventions = [] }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  interventions?: InterventionMarker[]
}) {
  const [mounted, setMounted] = useState(false)
  const [metric, setMetric] = useState<'turnaround' | 'dispatch'>('turnaround')
  useEffect(() => setMounted(true), [])

  // Filter interventions: show all, but highlight ones targeting the active
  // metric. Dimmed markers for unrelated interventions.
  const activeMetricKey = metric === 'turnaround' ? 'tat' : 'dispatch'

  const showDispatch = config.baseline_dispatch_min != null && config.target_dispatch_min != null

  // Baseline determines whether the baseline + predicted lines render.
  // When null (pending confirmation), only actual is drawn.
  const activeBaseline = metric === 'turnaround' ? config.baseline_turnaround : config.baseline_dispatch_min
  const activeTarget = metric === 'turnaround' ? config.target_turnaround : config.target_dispatch_min
  const hasBaseline = activeBaseline != null

  const points = metric === 'turnaround'
    ? buildChartPoints(entries, config.baseline_turnaround ?? 0, config.target_turnaround ?? 0, 'turnaround_min')
    : buildChartPoints(entries, config.baseline_dispatch_min ?? 0, config.target_dispatch_min ?? 0, 'dispatch_min')

  const label = metric === 'turnaround' ? 'Turnaround' : 'Dispatch Time'

  // Count auto vs manual entries for transparency footer
  const autoCount = entries.filter(e => e.source === 'auto').length
  const manualCount = entries.filter(e => e.source === 'manual').length

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: '16px' }}>
      {/* Header + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)' }}>{label}, 12-week trajectory</div>
        {showDispatch && (
          <div style={{ display: 'flex', gap: '2px', background: 'var(--gray-100)', borderRadius: '6px', padding: '2px' }}>
            {(['turnaround', 'dispatch'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                style={{
                  padding: '4px 10px', fontSize: '11px', fontWeight: 500, border: 'none',
                  borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font)',
                  background: metric === m ? 'var(--white)' : 'transparent',
                  color: metric === m ? 'var(--gray-900)' : 'var(--gray-400)',
                  boxShadow: metric === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                  transition: 'all .15s',
                }}
              >
                {m === 'turnaround' ? 'Turnaround' : 'Dispatch'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legend. Baseline/predicted entries hidden when baseline pending. */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {[
          ...(hasBaseline ? [{ color: '#C0392B', dash: true, label: 'Baseline' }] : []),
          ...(hasBaseline && activeTarget != null ? [{ color: '#b0b0b0', dash: true, label: 'Predicted' }] : []),
          { color: '#0F6E56', dash: false, label: 'Actual' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="20" height="10">
              <line x1="0" y1="5" x2="20" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash ? '4 3' : '0'} />
            </svg>
            <span style={{ fontSize: '10px', color: 'var(--gray-500)' }}>{l.label}</span>
          </div>
        ))}
        {!hasBaseline && metric === 'turnaround' && (
          <span style={{ fontSize: '10px', color: 'var(--warning-dark, #B7950B)', fontStyle: 'italic' }}>
            Baseline pending confirmation. Use the editor above to set it.
          </span>
        )}
      </div>

      {/* Chart */}
      {mounted ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
            <XAxis
              dataKey="week"
              tickFormatter={(w: number) => w === 0 ? 'Start' : `W${w}`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) => `${v}m`}
              width={38}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                `${value} min`,
                name === 'baseline' ? 'Baseline' : name === 'predicted' ? 'Predicted' : 'Actual'
              ]}
              labelFormatter={(w: unknown) => w === 0 ? 'Start' : `Week ${w}`}
              contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            {hasBaseline && (
              <Line dataKey="baseline" stroke="#C0392B" strokeDasharray="5 4" dot={false} strokeWidth={1.5} name="baseline" connectNulls />
            )}
            {hasBaseline && activeTarget != null && (
              <Line dataKey="predicted" stroke="#b0b0b0" strokeDasharray="5 4" dot={false} strokeWidth={1.5} name="predicted" connectNulls />
            )}
            <Line dataKey="actual" stroke="#0F6E56" strokeWidth={2.5} dot={{ r: 3.5, fill: '#0F6E56', strokeWidth: 0 }} connectNulls={false} name="actual" />
            {/* Intervention markers. Active-metric markers are solid orange,
                others are dim gray so focus stays on relevant changes. */}
            {interventions.map(iv => {
              const isRelevant = !iv.targetMetric || iv.targetMetric === activeMetricKey
              return (
                <ReferenceLine
                  key={iv.id}
                  x={iv.week}
                  stroke={isRelevant ? '#E67E22' : '#cccccc'}
                  strokeDasharray="3 3"
                  strokeWidth={isRelevant ? 2 : 1}
                  label={{
                    value: isRelevant ? `⚙ ${iv.title.slice(0, 24)}${iv.title.length > 24 ? '…' : ''}` : '',
                    position: 'top',
                    fill: '#E67E22',
                    fontSize: 10,
                  }}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 220 }} />
      )}

      {/* Data source footer: how many weeks are auto-derived vs manual */}
      {(autoCount > 0 || manualCount > 0) && (
        <div style={{
          marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--gray-100)',
          fontSize: '10px', color: 'var(--gray-400)',
          display: 'flex', gap: '14px', flexWrap: 'wrap',
        }}>
          {autoCount > 0 && (
            <span>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>●</span> {autoCount} week{autoCount !== 1 ? 's' : ''} derived from field log
            </span>
          )}
          {manualCount > 0 && (
            <span>
              <span style={{ color: 'var(--gray-400)', fontWeight: 600 }}>●</span> {manualCount} week{manualCount !== 1 ? 's' : ''} manually entered
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── KpiCard (Section C) ────────────────────────────────────────────────────

function KpiCard({ label, baseline, target, latest, coeff, unit = 'min' }: {
  label: string
  baseline: number | null
  target: number | null
  latest: number | null
  coeff: number
  unit?: string
}) {
  const delta = baseline != null && latest != null ? Math.max(0, baseline - latest) : null
  const monthlySaving = delta != null && delta > 0 ? Math.round(delta * coeff) : null
  const pct = progressPct(baseline, latest, target)
  const improved = delta != null && delta > 0

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', flex: 1, minWidth: '180px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '12px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: '20px', marginBottom: '14px' }}>
        {[
          { lbl: 'Before', val: baseline != null ? `${baseline}` : '-', faded: true },
          { lbl: 'Now', val: latest != null ? `${latest}` : '-', faded: false },
          { lbl: 'Target', val: target != null ? `${target}` : '-', faded: true },
        ].map(({ lbl, val, faded }) => (
          <div key={lbl}>
            <div style={{ fontSize: '9px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '3px' }}>{lbl}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: faded ? 'var(--gray-300)' : 'var(--gray-900)', lineHeight: 1 }}>{val}</span>
              <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '10px' }}>
        <ProgressBar pct={pct} color={pct >= 60 ? 'var(--phase-complete)' : pct >= 20 ? 'var(--warning)' : 'var(--gray-200)'} />
      </div>
      {improved && monthlySaving != null && monthlySaving > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--phase-complete)', fontWeight: 600 }}>▼ {delta} {unit} saved</span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--phase-complete)', fontWeight: 700 }}>{fmt(monthlySaving)}/mo</span>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--gray-300)' }}>No improvement logged yet</div>
      )}
    </div>
  )
}

// ── WeeklyInput (Section D) ────────────────────────────────────────────────

function WeeklyInput({ config, entries, currentWeek, isAdmin, onLogged }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  currentWeek: number
  isAdmin: boolean
  onLogged: () => void
}) {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [ta, setTa] = useState('')
  const [di, setDi] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tripSuggestion, setTripSuggestion] = useState<{ avgMin: number; uploadCount: number } | null>(null)

  const weekEntry = entries.find(e => e.week_number === selectedWeek)

  // Fetch trip_records for the selected week's date range
  useEffect(() => {
    async function fetchTripSuggestion() {
      if (!config.started_at) return
      const start = new Date(config.started_at)
      start.setDate(start.getDate() + (selectedWeek - 1) * 7)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      const weekStart = start.toISOString().slice(0, 10)
      const weekEnd   = end.toISOString().slice(0, 10)

      const { data } = await supabase
        .from('trip_records')
        .select('turnaround_s, trip_date')
        .eq('assessment_id', config.assessment_id)
        .gte('trip_date', weekStart)
        .lt('trip_date', weekEnd)

      if (!data || data.length === 0) { setTripSuggestion(null); return }
      const avgS = data.reduce((sum: number, r: { turnaround_s: number }) => sum + r.turnaround_s, 0) / data.length
      const dates = new Set(data.map((r: { trip_date: string }) => r.trip_date))
      setTripSuggestion({ avgMin: Math.round(avgS / 60), uploadCount: dates.size })
    }
    fetchTripSuggestion()
  }, [selectedWeek, config.assessment_id, config.started_at, supabase])

  async function handleSubmit() {
    if (!ta && !di) return
    setSaving(true)
    if (weekEntry) {
      await supabase.from('tracking_entries').update({
        turnaround_min: ta ? +ta : weekEntry.turnaround_min,
        dispatch_min: di ? +di : weekEntry.dispatch_min,
      }).eq('id', weekEntry.id)
    } else {
      await supabase.from('tracking_entries').insert({
        config_id: config.id,
        week_number: selectedWeek,
        turnaround_min: ta ? +ta : null,
        dispatch_min: di ? +di : null,
        reject_pct: null,
        notes: null,
      })
    }
    setSaving(false)
    setSaved(true)
    setTa(''); setDi('')
    setTimeout(() => setSaved(false), 3000)
    onLogged()
  }

  const inputStyle: React.CSSProperties = {
    width: '90px', padding: '10px 12px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '18px', fontFamily: 'var(--mono)',
    background: 'var(--white)', color: 'var(--gray-900)',
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: saved ? 'var(--phase-complete)' : 'var(--gray-700)' }}>
          {saved ? '✓ Saved' : `Log week ${selectedWeek}`}
        </div>
        {isAdmin && (
          <select
            value={selectedWeek}
            onChange={e => {
              const wk = +e.target.value
              setSelectedWeek(wk)
              const ex = entries.find(en => en.week_number === wk)
              setTa(ex?.turnaround_min != null ? String(ex.turnaround_min) : '')
              setDi(ex?.dispatch_min != null ? String(ex.dispatch_min) : '')
              setSaved(false)
            }}
            style={{
              fontSize: '12px', color: 'var(--gray-600)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '4px 8px', background: 'var(--white)',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            {Array.from({ length: currentWeek }, (_, i) => i + 1).map(w => (
              <option key={w} value={w}>
                Week {w}{entries.some(e => e.week_number === w) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>
            Turnaround time
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number" value={ta}
              onChange={e => setTa(e.target.value)}
              placeholder={weekEntry?.turnaround_min != null ? String(weekEntry.turnaround_min) : 'e.g. 88'}
              style={inputStyle}
            />
            <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>min</span>
          </div>
          {tripSuggestion && (
            <div style={{ marginTop: '7px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                {tripSuggestion.uploadCount} day{tripSuggestion.uploadCount > 1 ? 's' : ''} of trip data: avg {tripSuggestion.avgMin} min
              </span>
              <button
                type="button"
                onClick={() => setTa(String(tripSuggestion.avgMin))}
                style={{
                  fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                  borderRadius: '5px', border: '1px solid var(--green)',
                  background: 'none', color: 'var(--green)', cursor: 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                Use
              </button>
            </div>
          )}
        </div>
        {config.baseline_dispatch_min != null && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>
              Dispatch time
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number" value={di}
                onChange={e => setDi(e.target.value)}
                placeholder={weekEntry?.dispatch_min != null ? String(weekEntry.dispatch_min) : 'e.g. 20'}
                style={inputStyle}
              />
              <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>min</span>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || (!ta && !di)}
        style={{
          padding: '10px 24px',
          background: saved ? 'var(--phase-complete)' : 'var(--green)',
          color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          cursor: saving || (!ta && !di) ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font)', opacity: (!ta && !di) ? 0.5 : 1, transition: 'background .2s',
        }}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : weekEntry ? `Update week ${selectedWeek}` : `Submit week ${selectedWeek}`}
      </button>
    </div>
  )
}

// ── Setup Form ─────────────────────────────────────────────────────────────

function SetupForm({
  assessmentId, baselineTurnaround, baselineDispatchMin,
  coeffTurnaround, coeffDispatch, baselineMonthlyLoss, targetTA, onCreated,
}: TrackingProps & { onCreated: (cfg: TrackingConfig) => void }) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const [ta, setTa] = useState(String(targetTA))
  const [di, setDi] = useState('15')
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)

  const predictedRecovery = Math.round(
    Math.max(0, (baselineTurnaround ?? 0) - +ta) * coeffTurnaround
    + Math.max(0, (baselineDispatchMin ?? 0) - +di) * coeffDispatch
  )

  async function handleStart() {
    setSaving(true)
    const { data, error } = await supabase.from('tracking_configs').insert({
      assessment_id: assessmentId,
      baseline_turnaround: baselineTurnaround,
      baseline_reject_pct: null,
      baseline_dispatch_min: baselineDispatchMin,
      target_turnaround: +ta || null,
      target_reject_pct: null,
      target_dispatch_min: +di || null,
      track_turnaround: true,
      track_reject: false,
      track_dispatch: baselineDispatchMin != null,
      coeff_turnaround: coeffTurnaround,
      coeff_reject: coeffDispatch,  // repurposed column
      baseline_monthly_loss: baselineMonthlyLoss,
      consent_case_study: consent,
    }).select().single()
    setSaving(false)
    if (!error && data) onCreated(data as TrackingConfig)
  }

  const row = (label: string, baseline: number | null, unit: string, val: string, setVal: (v: string) => void) => {
    if (isMobile) {
      // Mobile: stack label above the baseline/target pair so all three
      // values are clearly labeled. No grid clipping, no "Target" header
      // pointing at a baseline cell.
      return (
        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--gray-700)', marginBottom: '8px' }}>{label}</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '2px' }}>Baseline</div>
              <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
                {baseline != null ? `${baseline} ${unit}` : '-'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '2px' }}>90-day target</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number" value={val} onChange={e => setVal(e.target.value)}
                  style={{ width: '80px', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--mono)', background: 'var(--white)', color: 'var(--gray-900)' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{unit}</span>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '160px 120px 1fr', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '13px', color: 'var(--gray-700)' }}>{label}</div>
        <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
          {baseline != null ? `${baseline} ${unit}` : '-'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number" value={val} onChange={e => setVal(e.target.value)}
            style={{ width: '80px', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--mono)', background: 'var(--white)', color: 'var(--gray-900)' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{unit}</span>
        </div>
      </div>
    )
  }

  const kpiCount = 1 + (baselineDispatchMin != null ? 1 : 0)
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '4px' }}>Start 90-day tracking</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Set {kpiCount === 1 ? 'the target' : `targets for the ${kpiCount} KPIs`}. Trips logged in the Log tab roll up into weekly numbers automatically, so you see actual vs predicted in real time.
        </div>
      </div>

      {/* Early-start callout */}
      <div style={{
        background: 'var(--info-bg)', border: '1px solid var(--info-border)',
        borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '20px',
        display: 'flex', gap: '10px', alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: '16px', flexShrink: 0 }}>⏱</span>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--phase-workshop)', marginBottom: '2px' }}>
            Start now, before the on-site visit
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-600)', lineHeight: 1.55 }}>
            Logging starts immediately so the plant records baseline weeks before interventions begin.
            By the time of the on-site visit you already have 2 to 4 weeks of real data, making the before/after comparison far stronger.
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0 20px', marginBottom: '20px' }}>
        {!isMobile && (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 120px 1fr', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            {['Metric', 'Baseline', '90-day target'].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</div>
            ))}
          </div>
        )}
        {row('Turnaround', baselineTurnaround, 'min', ta, setTa)}
        {baselineDispatchMin != null && row('Dispatch Time', baselineDispatchMin, 'min', di, setDi)}
      </div>
      {predictedRecovery > 0 && (
        <div style={{ background: 'var(--phase-complete-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--gray-700)' }}>Predicted monthly recovery if targets hit</span>
          <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--phase-complete)' }}>{fmt(predictedRecovery)}/mo</span>
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '24px', fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.5 }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: '2px', flexShrink: 0 }} />
        Client consents to anonymised before/after results being used as a case study
      </label>
      <button
        onClick={handleStart} disabled={saving}
        style={{ width: '100%', padding: '12px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Starting…' : 'Start 90-day tracking'}
      </button>
    </div>
  )
}

// ── CaseStudyCard ──────────────────────────────────────────────────────────

function CaseStudyStat({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '12px', background: highlight ? 'var(--phase-complete-bg)' : 'var(--gray-50)', borderRadius: '8px' }}>
      <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: highlight ? 'var(--phase-complete)' : 'var(--gray-900)', marginBottom: '2px' }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{sub}</div>
    </div>
  )
}

function CaseStudyCard({ config, entries, coeffDispatch }: { config: TrackingConfig; entries: TrackingEntry[]; coeffDispatch: number }) {
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0]
  if (!latest) return null

  const taImprovement = config.baseline_turnaround != null && latest.turnaround_min != null
    ? Math.max(0, config.baseline_turnaround - latest.turnaround_min) : 0
  const diImprovement = config.baseline_dispatch_min != null && latest.dispatch_min != null
    ? Math.max(0, config.baseline_dispatch_min - latest.dispatch_min) : 0
  const monthlyRecovery = calcMonthlyRecovery(latest, config, coeffDispatch)

  return (
    <div style={{ background: 'var(--white)', border: '2px solid var(--phase-complete)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--phase-complete)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>Case study ready</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)' }}>90-day before / after</div>
        </div>
        <button
          onClick={() => window.print()}
          style={{ padding: '6px 14px', background: 'var(--phase-complete)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          Export PDF
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {taImprovement > 0 && (
          <CaseStudyStat label="Turnaround reduced" value={`▼ ${taImprovement} min`} sub={`${config.baseline_turnaround} → ${latest.turnaround_min} min`} />
        )}
        {diImprovement > 0 && (
          <CaseStudyStat label="Dispatch Time reduced" value={`▼ ${diImprovement} min`} sub={`${config.baseline_dispatch_min} → ${latest.dispatch_min} min`} />
        )}
        {monthlyRecovery > 0 && (
          <CaseStudyStat label="Monthly recovery" value={fmt(monthlyRecovery)} sub={`${fmt(monthlyRecovery * 12)}/year`} highlight />
        )}
        <CaseStudyStat label="Weeks tracked" value={`${entries.length} / 13`} sub={`${entries.length * 7} days of data`} />
      </div>
    </div>
  )
}

// ── Program Complete View ──────────────────────────────────────────────────

function ProgramCompleteView({ config, entries, coeffDispatch }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  coeffDispatch: number
}) {
  const isMobile = useIsMobile()
  const sortedAsc = [...entries].sort((a, b) => a.week_number - b.week_number)
  const lastEntry = sortedAsc[sortedAsc.length - 1] ?? null

  const taBaseline = config.baseline_turnaround
  const diBaseline = config.baseline_dispatch_min
  const taFinal   = lastEntry?.turnaround_min ?? null
  const diFinal   = lastEntry?.dispatch_min   ?? null
  const taTarget  = config.target_turnaround
  const diTarget  = config.target_dispatch_min

  const taImprovement = taBaseline != null && taFinal != null ? Math.max(0, taBaseline - taFinal) : null
  const diImprovement = diBaseline != null && diFinal != null ? Math.max(0, diBaseline - diFinal) : null

  const monthlyRecovery = lastEntry ? calcMonthlyRecovery(lastEntry, config, coeffDispatch) : 0
  const yearlyRecovery  = monthlyRecovery * 12

  const taHitTarget = taFinal != null && taTarget != null && taFinal <= taTarget
  const diHitTarget = diFinal != null && diTarget != null && diFinal <= diTarget

  const rows: { label: string; before: string; after: string; delta: string; hit: boolean }[] = []
  if (taBaseline != null && taFinal != null) {
    rows.push({
      label: 'Turnaround time',
      before: `${taBaseline} min`,
      after:  `${taFinal} min`,
      delta:  taImprovement! > 0 ? `▼ ${taImprovement} min` : '-',
      hit:    taHitTarget,
    })
  }
  if (diBaseline != null && diFinal != null) {
    rows.push({
      label: 'Dispatch time',
      before: `${diBaseline} min`,
      after:  `${diFinal} min`,
      delta:  diImprovement! > 0 ? `▼ ${diImprovement} min` : '-',
      hit:    diHitTarget,
    })
  }

  return (
    <div style={{ background: 'var(--phase-complete-bg)', border: '2px solid var(--phase-complete)', borderRadius: 'var(--radius)', padding: isMobile ? '20px 16px' : '24px 28px', marginBottom: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--phase-complete)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            ✓ Program complete
          </div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--gray-900)', lineHeight: 1.2 }}>
            90-day before / after
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '3px' }}>
            {entries.length} weeks of data · started {new Date(config.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        {config.consent_case_study && (
          <button
            onClick={() => window.print()}
            style={{
              padding: '8px 18px', background: 'var(--phase-complete)', color: '#fff',
              border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
            }}
          >
            Export PDF
          </button>
        )}
      </div>

      {/* Hero number */}
      {monthlyRecovery > 0 && (
        <div style={{ background: 'var(--white)', borderRadius: '10px', padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '4px' }}>
              Value unlocked per month
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--phase-complete)', lineHeight: 1 }}>
              {fmt(monthlyRecovery)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '4px' }}>
              Annualised
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>
              {fmt(yearlyRecovery)}/year
            </div>
          </div>
        </div>
      )}

      {/* Before / After table. Horizontal scroll on narrow viewports so
          the 4 columns don't squash. */}
      {rows.length > 0 && (
        <div style={{
          background: 'var(--white)', borderRadius: '10px', overflow: 'hidden',
        }}>
          <div style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
          }}>
            <div style={{ minWidth: isMobile ? '440px' : 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '8px 16px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                {['Metric', 'Before', 'After', 'Change'].map(h => (
                  <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</div>
                ))}
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                  <div style={{ fontSize: '13px', color: 'var(--gray-700)', fontWeight: 500 }}>{row.label}</div>
                  <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-400)' }}>{row.before}</div>
                  <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-900)', fontWeight: 600 }}>
                    {row.after}
                    {row.hit && <span style={{ marginLeft: '5px', fontSize: '10px', color: 'var(--phase-complete)' }}>✓</span>}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: row.delta !== '-' ? 'var(--phase-complete)' : 'var(--gray-300)' }}>{row.delta}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Daily Ops sub-components ───────────────────────────────────────────────

function SubTabToggle({ active, onChange }: { active: 'weekly' | 'daily'; onChange: (v: 'weekly' | 'daily') => void }) {
  return (
    <div style={{ display: 'flex', gap: '2px', background: 'var(--gray-100)', borderRadius: '8px', padding: '2px', width: 'fit-content', marginBottom: '16px' }}>
      {(['weekly', 'daily'] as const).map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: '6px 14px', fontSize: '12px', fontWeight: 500,
            border: 'none', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font)',
            background: active === tab ? 'var(--white)' : 'transparent',
            color: active === tab ? 'var(--gray-900)' : 'var(--gray-400)',
            boxShadow: active === tab ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
            transition: 'all .15s',
          }}
        >
          {tab === 'weekly' ? 'Weekly Progress' : 'Daily Ops'}
        </button>
      ))}
    </div>
  )
}

function TrendAlertBanner({ message }: { message: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      background: '#fefce8', border: '1px solid #fde047',
      borderRadius: '8px', padding: '10px 14px', marginBottom: '14px',
    }}>
      <span style={{ fontSize: '14px', flexShrink: 0 }}>⚠</span>
      <span style={{ fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>{message}</span>
    </div>
  )
}

function DailyOpsChart({ entries }: { entries: DailyEntry[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const points = buildDailyChartPoints(entries)

  // X-axis ticks every 7 days
  const tickDates = points.filter((_, i) => i % 7 === 0).map(p => p.date)
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const maxVal = Math.max(...points.map(p => p.deliveries ?? 0), ...points.map(p => p.rolling7 ?? 0))

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)' }}>Daily deliveries, 30 days</div>
        <div style={{ display: 'flex', gap: '14px' }}>
          {[
            { color: '#d1d5db', label: 'Daily' },
            { color: '#0F6E56', label: '7-day avg', line: true },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {l.line
                ? <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={l.color} strokeWidth="2" /></svg>
                : <div style={{ width: '12px', height: '12px', background: l.color, borderRadius: '2px' }} />
              }
              <span style={{ fontSize: '10px', color: 'var(--gray-500)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      {mounted ? (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
            <XAxis
              dataKey="date"
              ticks={tickDates}
              tickFormatter={formatDate}
              tick={{ fontSize: 9, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
              domain={[0, maxVal + 5]}
              width={28}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                `${value}`,
                name === 'deliveries' ? 'Deliveries' : '7-day avg'
              ]}
              labelFormatter={(date: unknown) => formatDate(String(date))}
              contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Bar dataKey="deliveries" fill="#e5e7eb" stroke="#d1d5db" strokeWidth={0.5} radius={[2,2,0,0]} name="deliveries" />
            <Line dataKey="rolling7" stroke="#0F6E56" strokeWidth={2} dot={false} connectNulls name="rolling7" />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 180 }} />
      )}
    </div>
  )
}

function DailyInput({ configId, isDemo, onLogged }: { configId: string; isDemo: boolean; onLogged: () => void }) {
  const supabase = createClient()
  const [del, setDel] = useState('')
  const [ord, setOrd] = useState('')
  const [rej, setRej] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit() {
    if (!del) return
    setSaving(true)
    if (!isDemo) {
      const today = new Date().toISOString().slice(0, 10)
      await supabase.from('daily_entries').upsert({
        config_id: configId,
        logged_date: today,
        deliveries_completed: +del,
        orders_received: ord ? +ord : null,
        rejects: rej ? +rej : null,
      }, { onConflict: 'config_id,logged_date' })
    }
    setSaving(false)
    setSaved(true)
    setDel(''); setOrd(''); setRej('')
    setTimeout(() => setSaved(false), 3000)
    if (!isDemo) onLogged()
  }

  const inputStyle: React.CSSProperties = {
    width: '80px', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '16px', fontFamily: 'var(--mono)',
    background: 'var(--white)', color: 'var(--gray-900)',
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: saved ? 'var(--phase-complete)' : 'var(--gray-700)', marginBottom: '14px' }}>
        {saved ? '✓ Logged' : "Log today's deliveries"}
      </div>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {[
          { label: 'Deliveries today', val: del, set: setDel, placeholder: 'e.g. 42', required: true },
          { label: 'Orders received', val: ord, set: setOrd, placeholder: 'optional' },
          { label: 'Rejects', val: rej, set: setRej, placeholder: 'optional' },
        ].map(({ label, val, set, placeholder, required }) => (
          <div key={label}>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '5px' }}>
              {label}{required && <span style={{ color: 'var(--red)', marginLeft: '2px' }}>*</span>}
            </label>
            <input
              type="number" value={val}
              onChange={e => set(e.target.value)}
              placeholder={placeholder}
              style={inputStyle}
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={saving || !del}
        style={{
          padding: '8px 20px',
          background: saved ? 'var(--phase-complete)' : 'var(--green)',
          color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          cursor: (saving || !del) ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font)', opacity: !del ? 0.5 : 1, transition: 'background .2s',
        }}
      >
        {saving ? 'Saving…' : saved ? '✓ Logged' : 'Log today'}
      </button>
    </div>
  )
}

function DailyOpsView({ dailyEntries }: {
  configId: string
  isDemo: boolean
  dailyEntries: DailyEntry[]
  onLogged: () => void
  viewOnly?: boolean
}) {
  const alert = calcTrendAlert(dailyEntries)
  // Dashboard-only: data-entry has moved to the Log tab. Kept here for
  // historical display of daily deliveries/rejects trend chart.
  return (
    <div>
      {alert && <TrendAlertBanner message={alert} />}
      <DailyOpsChart entries={dailyEntries} />
    </div>
  )
}

// ── WeeklyFieldLogAggregates ──────────────────────────────────────────────
// Rich per-week panel showing all parameters aggregated from daily_logs
// that aren't represented by the headline KPI cards. Lets Louis drill
// into volumes, stage breakdown, throughput, and quality without leaving
// the Track dashboard.

function WeeklyFieldLogAggregates({ aggregates, currentWeek }: {
  aggregates: WeeklyAggregate[]
  currentWeek: number
}) {
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null)

  if (aggregates.length === 0) {
    return null  // no field-log data yet, nothing to show
  }

  // Show latest 4 weeks by default, sorted desc
  const sorted = [...aggregates].sort((a, b) => b.week_number - a.week_number)

  const metricCell = (value: number | null, unit: string, decimals = 0) => {
    if (value === null || value === undefined || isNaN(value)) return <span style={{ color: 'var(--gray-300)' }}>-</span>
    return <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>
      {value.toFixed(decimals)}
      <span style={{ fontSize: '10px', color: 'var(--gray-400)', marginLeft: '2px' }}>{unit}</span>
    </span>
  }

  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)' }}>Weekly field log aggregates</div>
          <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '2px' }}>
            Volume, stage breakdown, quality and throughput, derived from {aggregates.length} week{aggregates.length !== 1 ? 's' : ''} of logged trips
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
        <div style={{ minWidth: '720px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '60px 80px 70px 80px 80px 80px 80px 80px 60px',
            fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)',
            textTransform: 'uppercase', letterSpacing: '.3px',
            padding: '8px 0', borderBottom: '1px solid var(--border)',
          }}>
            <div>Week</div>
            <div style={{ textAlign: 'right' }}>Trips</div>
            <div style={{ textAlign: 'right' }}>m³</div>
            <div style={{ textAlign: 'right' }}>TAT</div>
            <div style={{ textAlign: 'right' }}>Site wait</div>
            <div style={{ textAlign: 'right' }}>Reject</div>
            <div style={{ textAlign: 'right' }}>Trucks</div>
            <div style={{ textAlign: 'right' }}>Trips/tr/d</div>
            <div style={{ textAlign: 'right' }}></div>
          </div>
          {sorted.map(a => {
            const isExpanded = expandedWeek === a.week_number
            const isCurrent = a.week_number === currentWeek
            return (
              <div key={a.week_number}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 80px 70px 80px 80px 80px 80px 80px 60px',
                  fontSize: '12px', padding: '10px 0',
                  borderBottom: isExpanded ? 'none' : '1px solid var(--border)',
                  alignItems: 'center',
                  background: isCurrent ? 'var(--phase-workshop-bg)' : 'transparent',
                }}>
                  <div style={{ fontWeight: 600, color: isCurrent ? 'var(--phase-workshop)' : 'var(--gray-700)' }}>
                    W{a.week_number}{isCurrent ? ' ·' : ''}
                  </div>
                  <div style={{ textAlign: 'right' }}>{metricCell(a.trip_count, '', 0)}</div>
                  <div style={{ textAlign: 'right' }}>{metricCell(a.total_m3, '', 0)}</div>
                  <div style={{ textAlign: 'right' }}>{metricCell(a.avg_tat_min, 'm', 0)}</div>
                  <div style={{ textAlign: 'right' }}>{metricCell(a.avg_site_wait_min, 'm', 0)}</div>
                  <div style={{ textAlign: 'right' }}>{metricCell(a.reject_pct, '%', 1)}</div>
                  <div style={{ textAlign: 'right' }}>{metricCell(a.unique_trucks, '', 0)}</div>
                  <div style={{ textAlign: 'right' }}>{metricCell(a.avg_trips_per_truck_per_day, '', 1)}</div>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedWeek(isExpanded ? null : a.week_number)}
                      style={{
                        background: 'none', border: 'none', color: 'var(--green)',
                        fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        padding: '4px 6px',
                      }}
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <WeeklyDetailRow a={a} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeeklyDetailRow({ a }: { a: WeeklyAggregate }) {
  const stageRow = (label: string, v: number | null) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
      <span style={{ color: 'var(--gray-500)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, color: v !== null ? 'var(--gray-900)' : 'var(--gray-300)' }}>
        {v !== null && !isNaN(v) ? `${v.toFixed(1)} min` : '-'}
      </span>
    </div>
  )

  const breakdownList = (title: string, breakdown: Record<string, number>) => {
    const entries = Object.entries(breakdown)
    if (entries.length === 0) return null
    return (
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '4px' }}>
          {title}
        </div>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
            <span style={{ color: 'var(--gray-500)' }}>{k}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{
      padding: '12px 0 16px',
      borderBottom: '1px solid var(--border)',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '20px',
      background: 'var(--gray-50)',
      marginLeft: '-20px', marginRight: '-20px',
      paddingLeft: '20px', paddingRight: '20px',
    }}>
      {/* Stage breakdown */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>
          Stage breakdown (avg)
        </div>
        {stageRow('Plant queue', a.avg_plant_queue_min)}
        {stageRow('Loading', a.avg_loading_min)}
        {stageRow('Transit out', a.avg_transit_out_min)}
        {stageRow('Site wait', a.avg_site_wait_min)}
        {stageRow('Pouring', a.avg_pouring_min)}
        {stageRow('Washout', a.avg_washout_min)}
        {stageRow('Transit back', a.avg_transit_back_min)}
      </div>

      {/* Volume + throughput */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>
          Volume and throughput
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Total m³</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.total_m3 != null ? a.total_m3.toFixed(0) : '-'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Avg load m³</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.avg_load_m3 != null ? a.avg_load_m3.toFixed(1) : '-'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Trips / truck / day</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.avg_trips_per_truck_per_day != null ? a.avg_trips_per_truck_per_day.toFixed(1) : '-'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>m³ / truck / day</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.avg_m3_per_truck_per_day != null ? a.avg_m3_per_truck_per_day.toFixed(1) : '-'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Unique drivers</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.unique_drivers}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Unique sites</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.unique_sites}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Days with trips</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.days_with_trips}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Partial trips</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.partial_trip_count}</span>
        </div>
      </div>

      {/* Quality */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>
          Quality
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Rejects (plant side)</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.reject_plant_side_count}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Rejects (customer side)</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.reject_customer_side_count}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Slump tested</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.slump_tested_count}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0' }}>
          <span style={{ color: 'var(--gray-500)' }}>Slump pass %</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 500 }}>{a.slump_pass_pct != null ? `${a.slump_pass_pct.toFixed(0)}%` : '-'}</span>
        </div>

        {Object.keys(a.reject_cause_breakdown).length > 0 && (
          <div style={{ marginTop: '10px' }}>
            {breakdownList('Reject causes', a.reject_cause_breakdown)}
          </div>
        )}
      </div>

      {/* Breakdowns (origin plant, site type) */}
      {(Object.keys(a.origin_plant_breakdown).length > 0 || Object.keys(a.site_type_breakdown).length > 0) && (
        <div>
          {breakdownList('Origin plant', a.origin_plant_breakdown)}
          {Object.keys(a.origin_plant_breakdown).length > 0 && Object.keys(a.site_type_breakdown).length > 0 && <div style={{ height: '10px' }} />}
          {breakdownList('Site type', a.site_type_breakdown)}
        </div>
      )}
    </div>
  )
}

// ── BaselineEditor ─────────────────────────────────────────────────────────
// Baseline TAT has three phase-tied states:
//
//   1. Pre-onsite (phase=workshop/workshop_complete): no tracking yet.
//      Nothing to show. Editor renders nothing.
//
//   2. Onsite (phase=onsite): baseline is FORMING. Shows live avg TAT
//      of all logged trips before the first intervention. Updates as
//      more trips come in. Analyst can optionally lock early with a
//      customer-provided value, but usually waits until onsite ends.
//
//   3. Complete (phase=complete): baseline should be LOCKED. If not yet
//      locked, admin sees a prominent "Lock baseline" action. Once
//      locked, shows "Baseline: X min · Locked [date]" with Edit/Clear.
//
// Baseline is the diagnosis-phase output. Post-onsite tracking compares
// against this locked value to show actual vs baseline.

function BaselineEditor({
  assessmentId,
  config,
  phase,
  formingBaseline,
  onSaved,
}: {
  assessmentId: string
  config: TrackingConfig
  phase?: TrackingProps['phase']
  formingBaseline: { avg: number; tripCount: number } | null
  onSaved: () => void
}) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(
    config.baseline_turnaround != null ? String(config.baseline_turnaround) : ''
  )
  const [saving, setSaving] = useState(false)

  const isVirtualConfig = config.id === 'virtual'
  const hasLocked = !isVirtualConfig && config.baseline_turnaround != null
  const lockedValue = config.baseline_turnaround

  // Don't render during pre-onsite phases. Nothing to confirm yet.
  if (phase === 'workshop' || phase === 'workshop_complete') {
    return null
  }

  const save = async (rawValue: number | null) => {
    setSaving(true)
    if (isVirtualConfig) {
      await supabase.from('tracking_configs').upsert({
        assessment_id: assessmentId,
        started_at: config.started_at,
        baseline_turnaround: rawValue,
        baseline_reject_pct: config.baseline_reject_pct,
        baseline_dispatch_min: config.baseline_dispatch_min,
        target_turnaround: config.target_turnaround,
        target_dispatch_min: config.target_dispatch_min,
        track_turnaround: true,
        track_reject: false,
        track_dispatch: config.baseline_dispatch_min != null,
        coeff_turnaround: config.coeff_turnaround,
        coeff_reject: config.coeff_reject,
        baseline_monthly_loss: config.baseline_monthly_loss,
        consent_case_study: false,
      }, { onConflict: 'assessment_id' })
    } else {
      await supabase
        .from('tracking_configs')
        .update({ baseline_turnaround: rawValue })
        .eq('id', config.id)
    }
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  const handleSaveManual = () => {
    const n = parseFloat(value)
    if (isNaN(n) || n <= 0) {
      alert('Enter a positive number in minutes')
      return
    }
    save(Math.round(n))
  }

  const handleLockForming = () => {
    if (formingBaseline == null) return
    save(formingBaseline.avg)
  }

  const handleClear = () => {
    if (!confirm('Clear the baseline? It will revert to the forming value (if onsite has data).')) return
    save(null)
  }

  // ── State 1: locked baseline (phase=complete, or admin pre-locked) ──
  if (hasLocked) {
    return (
      <div style={{
        background: '#F0FAF6',
        border: '1px solid #9FE1CB',
        borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>
              Baseline TAT · Locked
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gray-900)' }}>
              {lockedValue} min
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '2px' }}>
              All post-onsite trips are compared against this value
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(v => !v)}
            style={{
              padding: '8px 14px', background: 'var(--white)',
              border: '1px solid var(--border)', borderRadius: '8px',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              color: 'var(--gray-700)', minHeight: '40px', flexShrink: 0,
            }}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editing && (
          <EditForm
            value={value} setValue={setValue}
            saving={saving}
            onSaveManual={handleSaveManual}
            onClear={handleClear}
            showClear={true}
          />
        )}
      </div>
    )
  }

  // ── State 2: phase=onsite, baseline forming ──
  if (phase === 'onsite') {
    return (
      <div style={{
        background: 'var(--info-bg)',
        border: '1px solid var(--info-border)',
        borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--phase-workshop)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>
              Baseline TAT · Forming (onsite phase)
            </div>
            {formingBaseline ? (
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--gray-900)' }}>
                  {formingBaseline.avg} min
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-600)', marginTop: '2px', lineHeight: 1.5 }}>
                  Live average across {formingBaseline.tripCount} onsite trip{formingBaseline.tripCount !== 1 ? 's' : ''}
                  {' '}(pre-intervention). Updates as you log more.
                  Lock this value at end of onsite, or earlier if baseline is clear.
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--phase-workshop)' }}>
                  Not enough trips yet
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-600)', marginTop: '4px', lineHeight: 1.5 }}>
                  Log at least 5 trips (before any intervention) to see the forming baseline.
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
            {formingBaseline && (
              <button
                type="button"
                onClick={handleLockForming}
                disabled={saving}
                style={{
                  padding: '8px 14px', background: 'var(--green)',
                  color: '#fff', border: 'none', borderRadius: '8px',
                  fontSize: '12px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  minHeight: '40px', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap',
                }}
              >
                {saving ? 'Locking...' : `Lock at ${formingBaseline.avg} min`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(v => !v)}
              style={{
                padding: '8px 14px', background: 'var(--white)',
                border: '1px solid var(--border)', borderRadius: '8px',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                color: 'var(--gray-700)', minHeight: '40px', whiteSpace: 'nowrap',
              }}
            >
              {editing ? 'Cancel' : 'Custom value'}
            </button>
          </div>
        </div>
        {editing && (
          <EditForm
            value={value} setValue={setValue}
            saving={saving}
            onSaveManual={handleSaveManual}
            onClear={handleClear}
            showClear={false}
          />
        )}
      </div>
    )
  }

  // ── State 3: phase=complete but baseline NOT yet locked ──
  // This happens if admin transitioned to complete without locking baseline
  // in the onsite phase. Prompt them to lock now.
  if (phase === 'complete') {
    return (
      <div style={{
        background: 'var(--warning-bg)',
        border: '1px solid var(--warning-border)',
        borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '16px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--warning-dark, #B7950B)', marginBottom: '4px' }}>
          ⚠ Baseline not locked yet
        </div>
        <div style={{ fontSize: '12px', color: 'var(--gray-600)', lineHeight: 1.5, marginBottom: '12px' }}>
          The assessment is marked complete but baseline TAT was not locked during onsite.
          {formingBaseline
            ? ` ${formingBaseline.tripCount} onsite trip${formingBaseline.tripCount !== 1 ? 's were' : ' was'} logged with avg ${formingBaseline.avg} min.`
            : ' No onsite trips were logged.'} Set the baseline now so tracking can compute impact.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {formingBaseline && (
            <button
              type="button"
              onClick={handleLockForming}
              disabled={saving}
              style={{
                padding: '10px 14px', background: 'var(--green)',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                minHeight: '44px',
              }}
            >
              {saving ? 'Locking...' : `Lock at ${formingBaseline.avg} min (onsite data)`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing(v => !v)}
            style={{
              padding: '10px 14px', background: 'var(--white)',
              border: '1px solid var(--border)', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              color: 'var(--gray-700)', minHeight: '44px',
            }}
          >
            {editing ? 'Cancel' : 'Enter custom value'}
          </button>
        </div>
        {editing && (
          <EditForm
            value={value} setValue={setValue}
            saving={saving}
            onSaveManual={handleSaveManual}
            onClear={handleClear}
            showClear={false}
          />
        )}
      </div>
    )
  }

  return null
}

function EditForm({
  value, setValue, saving, onSaveManual, onClear, showClear,
}: {
  value: string
  setValue: (v: string) => void
  saving: boolean
  onSaveManual: () => void
  onClear: () => void
  showClear: boolean
}) {
  return (
    <div style={{
      marginTop: '12px', paddingTop: '12px',
      borderTop: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '4px', display: 'block' }}>
          Custom baseline (minutes)
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="e.g. 170"
            style={{
              width: '120px', padding: '10px 12px',
              border: '1px solid var(--border)', borderRadius: '8px',
              fontSize: '14px', fontFamily: 'var(--mono)',
              minHeight: '44px',
            }}
          />
          <button
            type="button"
            onClick={onSaveManual}
            disabled={saving || !value}
            style={{
              padding: '10px 16px', background: 'var(--green)',
              color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              minHeight: '44px', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      {showClear && (
        <div>
          <button
            type="button"
            onClick={onClear}
            disabled={saving}
            style={{
              padding: '8px 14px', background: 'transparent',
              color: 'var(--red)', border: 'none',
              fontSize: '12px', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Clear locked baseline
          </button>
        </div>
      )}
    </div>
  )
}

// ── Progress View (admin) ──────────────────────────────────────────────────

function ProgressView({ assessmentId, config, entries, aggregates, dailyEntries, onEntryLogged, coeffDispatch, phase, formingBaseline, viewOnly, isDemo }: {
  assessmentId: string
  config: TrackingConfig
  entries: TrackingEntry[]
  aggregates: WeeklyAggregate[]
  dailyEntries: DailyEntry[]
  onEntryLogged: () => void
  coeffDispatch: number
  phase?: TrackingProps['phase']
  formingBaseline: { avg: number; tripCount: number } | null
  viewOnly?: boolean
  isDemo?: boolean
}) {
  const [subTab, setSubTab] = useState<'weekly' | 'daily'>('weekly')
  const currentWeek = getWeekNumber(config.started_at)
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0] ?? null
  const weeksWithNoData = currentWeek > 2 && entries.filter(e => e.week_number <= currentWeek - 1).length < currentWeek - 2
  const canExport = config.consent_case_study && entries.length >= 8
  const isComplete = currentWeek >= 13
  const hasAnyData = entries.length > 0 || aggregates.length > 0 || dailyEntries.length > 0

  // Load intervention markers to overlay on the chart
  const interventions = useInterventionMarkers(assessmentId, config.started_at, isDemo ?? false)

  // Empty state: no trips logged yet. Track is a dashboard of logged
  // data, so if nothing is logged there's nothing to show. Point the
  // user at the Log tab.
  if (!hasAnyData && !isDemo) {
    return (
      <div style={{ padding: '48px 24px', maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>📊</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '8px' }}>
          Dashboard waiting for data
        </div>
        <div style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: '20px' }}>
          Log trips in the Log tab, either via the Live Timer, Manual entry, or CSV upload.
          As soon as at least 3 trips are captured for a week, Track will start showing
          weekly KPIs, trend charts, and intervention impact automatically.
        </div>
        <div style={{ fontSize: '12px', color: 'var(--gray-400)', fontStyle: 'italic' }}>
          Targets and baselines come from the pre-assessment. No setup needed.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '760px', margin: '0 auto' }}>
      {/* Program Complete banner, shown at week 13+ */}
      {isComplete && (
        <ProgramCompleteView config={config} entries={entries} coeffDispatch={coeffDispatch} />
      )}

      {weeksWithNoData && !isComplete && (
        <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--red)' }}>
          ⚠ No data logged in the last 2+ weeks, follow up with the plant
        </div>
      )}

      <SubTabToggle active={subTab} onChange={setSubTab} />

      {subTab === 'daily' ? (
        <DailyOpsView
          configId={config.id}
          isDemo={isDemo ?? false}
          dailyEntries={dailyEntries}
          onLogged={onEntryLogged}
          viewOnly={viewOnly}
        />
      ) : (
        <>
      {/* Baseline editor, admin only. Phase-aware:
           - workshop: hidden
           - onsite: shows forming baseline with "Lock at X min" option
           - complete: prompts to lock if not yet done
           - locked: shows value + edit/clear */}
      {!viewOnly && (
        <BaselineEditor
          assessmentId={assessmentId}
          config={config}
          phase={phase}
          formingBaseline={formingBaseline}
          onSaved={onEntryLogged}
        />
      )}

      {/* A: Impact Summary */}
      <ImpactSummary config={config} entries={entries} coeffDispatch={coeffDispatch} currentWeek={currentWeek} />

      {/* A2: Monthly milestones */}
      <MonthlyMilestones config={config} entries={entries} coeffDispatch={coeffDispatch} />

      {/* B: Chart with intervention overlays */}
      <ImpactChart config={config} entries={entries} interventions={interventions} />

      {/* C: KPI Cards */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <KpiCard
          label="Turnaround"
          baseline={config.baseline_turnaround}
          target={config.target_turnaround}
          latest={latest?.turnaround_min ?? null}
          coeff={config.coeff_turnaround}
          unit="min"
        />
        {config.baseline_dispatch_min != null && (
          <KpiCard
            label="Dispatch Time"
            baseline={config.baseline_dispatch_min}
            target={config.target_dispatch_min}
            latest={latest?.dispatch_min ?? null}
            coeff={coeffDispatch}
            unit="min"
          />
        )}
      </div>

      {/* Weekly field log aggregates - stage breakdown, volumes,
          throughput, quality breakdown. All derived from daily_logs. */}
      <WeeklyFieldLogAggregates aggregates={aggregates} currentWeek={currentWeek} />

      {/* Interventions timeline (read-only, managed from Log tab) */}
      <InterventionsList assessmentId={assessmentId} />

      {/* Case study, hidden once program is complete (ProgramCompleteView takes over) */}
      <div style={{ marginTop: '16px' }}>
        {!isComplete && canExport ? (
          <CaseStudyCard config={config} entries={entries} coeffDispatch={coeffDispatch} />
        ) : !isComplete && (
          <div style={{ padding: '12px 16px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--gray-400)' }}>
            {!config.consent_case_study
              ? 'Case study export requires client consent (update in setup).'
              : `Case study export available after 8 weeks of data (${Math.max(0, 8 - entries.length)} more week${entries.length === 7 ? '' : 's'} needed).`}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}

// ── Operator Progress Header ───────────────────────────────────────────────

function OperatorProgressHeader({ config, latest, currentWeek }: {
  config: TrackingConfig
  latest: TrackingEntry | null
  currentWeek: number
}) {
  const metrics: { label: string; baseline: number | null; now: number | null; target: number | null }[] = [
    { label: 'Turnaround', baseline: config.baseline_turnaround, now: latest?.turnaround_min ?? null, target: config.target_turnaround },
  ]
  if (config.baseline_dispatch_min != null)
    metrics.push({ label: 'Dispatch', baseline: config.baseline_dispatch_min, now: latest?.dispatch_min ?? null, target: config.target_dispatch_min })

  const hasAny = metrics.some(m => m.now !== null && m.baseline !== null)

  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasAny ? '14px' : '0' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)' }}>
          Week {currentWeek} of 12
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
          {hasAny ? 'Your progress so far' : 'No data logged yet'}
        </div>
      </div>

      {hasAny && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {metrics.map(m => {
            if (m.now === null || m.baseline === null) return null
            const delta = Math.max(0, m.baseline - m.now)
            const pct   = progressPct(m.baseline, m.now, m.target)
            const atTarget = m.target !== null && m.now <= m.target
            const color = atTarget ? 'var(--phase-complete)' : pct >= 40 ? 'var(--warning)' : 'var(--gray-500)'
            return (
              <div key={m.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>{m.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color }}>
                    {delta > 0
                      ? `▼ ${delta} min${atTarget ? ' ✓ target hit' : ` · ${pct}% toward target`}`
                      : `${m.now} min, no improvement yet`}
                  </span>
                </div>
                <ProgressBar pct={pct} color={atTarget ? 'var(--phase-complete)' : pct >= 40 ? 'var(--warning)' : 'var(--gray-200)'} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Customer Log ───────────────────────────────────────────────────────────

function CustomerLog({ assessmentId, config, entries, dailyEntries, onLogged, coeffDispatch, isDemo }: {
  assessmentId: string
  config: TrackingConfig
  entries: TrackingEntry[]
  dailyEntries: DailyEntry[]
  onLogged: () => void
  coeffDispatch: number
  isDemo?: boolean
}) {
  const [subTab, setSubTab] = useState<'weekly' | 'daily'>('weekly')
  const currentWeek = getWeekNumber(config.started_at)
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0] ?? null

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '24px 16px' }}>
      <SubTabToggle active={subTab} onChange={setSubTab} />
      {subTab === 'daily' ? (
        <DailyOpsView
          configId={config.id}
          isDemo={isDemo ?? false}
          dailyEntries={dailyEntries}
          onLogged={onLogged}
        />
      ) : (
        <>
          <OperatorProgressHeader config={config} latest={latest} currentWeek={currentWeek} />
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <KpiCard
              label="Turnaround"
              baseline={config.baseline_turnaround}
              target={config.target_turnaround}
              latest={latest?.turnaround_min ?? null}
              coeff={config.coeff_turnaround}
              unit="min"
            />
            {config.baseline_dispatch_min != null && (
              <KpiCard
                label="Dispatch Time"
                baseline={config.baseline_dispatch_min}
                target={config.target_dispatch_min}
                latest={latest?.dispatch_min ?? null}
                coeff={coeffDispatch}
                unit="min"
              />
            )}
          </div>
          <InterventionsList assessmentId={assessmentId} />
        </>
      )}
    </div>
  )
}

// ── Main TrackingTab ───────────────────────────────────────────────────────

export default function TrackingTab(props: TrackingProps) {
  const {
    assessmentId, isAdmin, viewOnly, coeffDispatch, phase,
    baselineTurnaround,  // only used for demo mock; real baseline is derived from logs
    baselineRejectPct, baselineDispatchMin,
    coeffTurnaround, baselineMonthlyLoss, targetTA, perMinTACoeff,
  } = props
  const supabase = createClient()
  const [config, setConfig] = useState<TrackingConfig | null | undefined>(undefined)
  const [entries, setEntries] = useState<TrackingEntry[]>([])
  const [aggregates, setAggregates] = useState<WeeklyAggregate[]>([])
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([])
  // Live-updating preview of what the baseline would be if locked now.
  // Avg TAT across all onsite trips before the first logged intervention.
  const [formingBaselineValue, setFormingBaselineValue] = useState<{ avg: number; tripCount: number } | null>(null)
  const isDemo = assessmentId === 'demo'

  const fetchData = useCallback(async () => {
    if (isDemo) {
      const startedAt = new Date(Date.now() - 56 * 86_400_000).toISOString()
      const mockConfig: TrackingConfig = {
        id: 'demo-cfg',
        assessment_id: 'demo',
        started_at: startedAt,
        // Baselines come from props, same data as Assessment, Report, Simulator tabs
        baseline_turnaround: baselineTurnaround,
        baseline_reject_pct: baselineRejectPct,
        baseline_dispatch_min: baselineDispatchMin,
        target_turnaround: targetTA,
        target_reject_pct: null,
        target_dispatch_min: 15,
        track_turnaround: true,
        track_reject: false,
        track_dispatch: true,
        coeff_turnaround: coeffTurnaround,
        coeff_reject: coeffDispatch,  // repurposed column
        baseline_monthly_loss: baselineMonthlyLoss,
        consent_case_study: true,
      }
      const now = Date.now()
      const mockEntries: TrackingEntry[] = [
        { id: 'e1', config_id: 'demo-cfg', week_number: 1, logged_at: new Date(now - 49 * 86_400_000).toISOString(), turnaround_min: 112, reject_pct: null, dispatch_min: 32, notes: null },
        { id: 'e2', config_id: 'demo-cfg', week_number: 2, logged_at: new Date(now - 42 * 86_400_000).toISOString(), turnaround_min: 108, reject_pct: null, dispatch_min: 29, notes: 'Demurrage clause enforced with top 3 contractors' },
        { id: 'e3', config_id: 'demo-cfg', week_number: 3, logged_at: new Date(now - 35 * 86_400_000).toISOString(), turnaround_min: 105, reject_pct: null, dispatch_min: 26, notes: null },
        { id: 'e4', config_id: 'demo-cfg', week_number: 4, logged_at: new Date(now - 28 * 86_400_000).toISOString(), turnaround_min: 101, reject_pct: null, dispatch_min: 24, notes: 'Dispatch SOP implemented, dedicated dispatcher' },
        { id: 'e5', config_id: 'demo-cfg', week_number: 5, logged_at: new Date(now - 21 * 86_400_000).toISOString(), turnaround_min: 97, reject_pct: null, dispatch_min: 21, notes: null },
        { id: 'e6', config_id: 'demo-cfg', week_number: 6, logged_at: new Date(now - 14 * 86_400_000).toISOString(), turnaround_min: 93, reject_pct: null, dispatch_min: 19, notes: 'Zone routing implemented, 4 delivery quadrants' },
        { id: 'e7', config_id: 'demo-cfg', week_number: 7, logged_at: new Date(now - 7 * 86_400_000).toISOString(), turnaround_min: 89, reject_pct: null, dispatch_min: 17, notes: null },
        { id: 'e8', config_id: 'demo-cfg', week_number: 8, logged_at: new Date(now - 1 * 86_400_000).toISOString(), turnaround_min: 85, reject_pct: null, dispatch_min: 15, notes: 'Dispatch target hit, 15 min order-to-dispatch achieved' },
      ]

      // Mock daily entries — 30 days, dip in days 10-14 ago to trigger trend alert
      const today = new Date()
      const mockDaily: DailyEntry[] = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today)
        d.setDate(d.getDate() - (29 - i))
        const dateStr = d.toISOString().slice(0, 10)
        const isDip = i >= 15 && i <= 19   // days 10-14 ago relative to today
        const base = isDip ? 30 : 42
        const noise = (i * 7 + 3) % 9 - 4  // deterministic ±4
        const deliveries = Math.max(20, base + noise)
        return {
          id: `d${i}`,
          config_id: 'demo-cfg',
          logged_date: dateStr,
          deliveries_completed: deliveries,
          orders_received: deliveries + 2 + (i % 4),
          rejects: 1 + (i % 3),
        }
      })

      setConfig(mockConfig)
      setEntries(mockEntries)
      setDailyEntries(mockDaily)
      return
    }

    // Normal Supabase path.
    // Track is now a pure dashboard. Tracking_config is not required for
    // the view to work. If one exists (legacy assessments) we use its
    // started_at as the week 1 anchor; otherwise we anchor on the first
    // logged trip date. Targets/baselines come from the pre-assessment
    // calc (passed as props) so there's no manual setup step.
    const [{ data: cfg }, { data: firstLog }, { data: aggData }] = await Promise.all([
      supabase
        .from('tracking_configs')
        .select('*')
        .eq('assessment_id', assessmentId)
        .maybeSingle(),
      supabase
        .from('daily_logs')
        .select('log_date')
        .eq('assessment_id', assessmentId)
        .order('log_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase.rpc('get_weekly_kpis_from_daily_logs', { p_assessment_id: assessmentId }),
    ])

    const aggregates = (aggData ?? []) as WeeklyAggregate[]
    setAggregates(aggregates)

    // Baseline logic tied to assessment lifecycle phase:
    //   - workshop / workshop_complete: no tracking yet, baseline N/A
    //   - onsite: baseline is FORMING from live-logged data. Shown as a
    //     live-updating value that the analyst sees build up during the
    //     onsite week. Not used as chart baseline yet (still diagnosing).
    //   - complete: baseline is LOCKED. Stored in tracking_configs once
    //     the analyst transitions the phase (or locks manually).
    //
    // If a tracking_configs row exists with a confirmed baseline, that
    // value wins in all phases (analyst may have pre-locked it).

    const lockedBaseline = cfg?.baseline_turnaround ?? null

    // "Forming" baseline = avg TAT across ALL onsite trips (excluding any
    // logged after the first intervention). Used for the live-updating
    // preview during onsite, and as the value to lock when phase becomes
    // complete. Requires >= 5 trips for statistical stability.
    const formingBaseline = await computeFormingBaseline(supabase, assessmentId)

    const effectiveConfig: TrackingConfig = cfg ?? {
      id: 'virtual',
      assessment_id: assessmentId,
      started_at: firstLog?.log_date
        ? new Date(firstLog.log_date).toISOString()
        : new Date().toISOString(),
      // Chart baseline is the locked value when phase = complete,
      // otherwise null (during onsite the chart shows only actual,
      // not a comparison line).
      baseline_turnaround: lockedBaseline,
      baseline_reject_pct: baselineRejectPct,
      baseline_dispatch_min: baselineDispatchMin,
      target_turnaround: targetTA,
      target_reject_pct: null,
      target_dispatch_min: baselineDispatchMin != null ? 15 : null,
      track_turnaround: true,
      track_reject: false,
      track_dispatch: baselineDispatchMin != null,
      coeff_turnaround: coeffTurnaround,
      coeff_reject: coeffDispatch,  // repurposed column
      baseline_monthly_loss: baselineMonthlyLoss,
      consent_case_study: false,
    }
    setConfig(effectiveConfig)
    setFormingBaselineValue(formingBaseline)

    // Load legacy manual entries if a real config exists (for bc with
    // existing customers who already typed weekly numbers).
    let manualEntries: TrackingEntry[] = []
    let dailyData: DailyEntry[] = []
    if (cfg) {
      const [{ data: ents }, { data: daily }] = await Promise.all([
        supabase
          .from('tracking_entries')
          .select('*')
          .eq('config_id', cfg.id)
          .order('week_number', { ascending: true }),
        supabase
          .from('daily_entries')
          .select('*')
          .eq('config_id', cfg.id)
          .order('logged_date', { ascending: false })
          .limit(60),
      ])
      manualEntries = (ents ?? []) as TrackingEntry[]
      dailyData = (daily ?? []) as DailyEntry[]
    }

    // Manual entries win; auto entries fill gaps where daily_logs had
    // enough data. For virtual configs (no cfg row), manualEntries is
    // empty so we show only auto-derived weeks.
    setEntries(mergeEntries(manualEntries, aggregates, effectiveConfig.id))
    setDailyEntries(dailyData)
  }, [assessmentId, isDemo, supabase, baselineTurnaround, baselineRejectPct, baselineDispatchMin, targetTA, coeffTurnaround, coeffDispatch, baselineMonthlyLoss])

  useEffect(() => { fetchData() }, [fetchData])

  // Dashboard-only: all logging has moved to the Log tab (Field Log).
  // This tab is now a read-only view of weekly progress + interventions.
  const segControl = null

  if (config === undefined || config === null) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {segControl}
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>
          Loading tracking data...
        </div>
      </div>
    )
  }

  // Track is dashboard-only now. No setup step, no "activate tracking"
  // button. Config is synthesised from assessment props when no database
  // record exists, so ProgressView always renders. Empty state inside
  // handles the "no trips logged yet" case.

  if (isAdmin) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {segControl}
        <ProgressView
          assessmentId={assessmentId}
          config={config} entries={entries} aggregates={aggregates} dailyEntries={dailyEntries}
          onEntryLogged={fetchData} coeffDispatch={coeffDispatch}
          phase={phase} formingBaseline={formingBaselineValue}
          viewOnly={viewOnly} isDemo={isDemo}
        />
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {segControl}
      <CustomerLog
        assessmentId={assessmentId}
        config={config} entries={entries} dailyEntries={dailyEntries}
        onLogged={fetchData} coeffDispatch={coeffDispatch} isDemo={isDemo}
      />
    </div>
  )
}
