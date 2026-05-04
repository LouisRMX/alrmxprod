'use client'

/**
 * Measurements drill-down for the Tracking tab.
 *
 * One row per measurement, scoped to the picked stage. Helpers asked
 * for visibility into the raw data behind the weekly KPIs: when did
 * each Loading happen, how long did it take, on which batching unit,
 * which mix, etc. The weekly aggregates roll this up; this view shows
 * it un-aggregated.
 *
 * Design choices:
 * - Stage chips at the top (Loading default — that is the most common
 *   capture and also what helpers see by default in the live timer)
 * - 6-stat summary (count, avg, median, p90, min, max) so the analyst
 *   gets a quick distribution read before scrolling rows
 * - Row sort: most recent first (descending by stage start timestamp)
 * - Optional filters: site, batching unit, mix, cement type, measurer
 *   — applied client-side because the row count is bounded (last 1000
 *   rows for the assessment)
 *
 * Data:
 * - Both full-cycle trips (every stage measured) and single-stage trips
 *   contribute. For single-stage rows we trust measured_stage; for
 *   full-cycle rows we compute the per-stage minutes from the stage's
 *   start/end timestamps and only include rows where both are present.
 *
 * No charts here — that is what the existing Diagnostics + Weekly
 * Progress views are for. This view is about transparency into the
 * individual data points.
 */

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/hooks/useIsMobile'

interface DailyLogRow {
  id: string
  log_date: string
  truck_id: string | null
  driver_name: string | null
  site_name: string | null
  measurer_name: string | null
  origin_plant: string | null
  batching_unit: string | null
  mix_type: string | null
  cement_type: string | null
  load_m3: number | null
  rejected: boolean
  is_partial: boolean | null
  measurement_mode: 'full' | 'single' | null
  measured_stage: string | null
  plant_queue_start: string | null
  loading_start: string | null
  loading_end: string | null
  departure_loaded: string | null
  arrival_site: string | null
  discharge_start: string | null
  discharge_end: string | null
  departure_site: string | null
  arrival_plant: string | null
  plant_prep_end: string | null
}

type StageKey =
  | 'plant_queue' | 'loading' | 'weighbridge' | 'transit_out'
  | 'site_wait' | 'pouring' | 'site_washout' | 'transit_back' | 'plant_prep'

interface StageDef {
  key: StageKey
  label: string
  startCol: keyof DailyLogRow
  endCol: keyof DailyLogRow
}

const STAGES: ReadonlyArray<StageDef> = [
  { key: 'plant_queue',  label: 'Plant queue',  startCol: 'plant_queue_start', endCol: 'loading_start' },
  { key: 'loading',      label: 'Loading',      startCol: 'loading_start',     endCol: 'loading_end' },
  { key: 'weighbridge',  label: 'Weighbridge',  startCol: 'loading_end',       endCol: 'departure_loaded' },
  { key: 'transit_out',  label: 'Transit out',  startCol: 'departure_loaded',  endCol: 'arrival_site' },
  { key: 'site_wait',    label: 'Site wait',    startCol: 'arrival_site',      endCol: 'discharge_start' },
  { key: 'pouring',      label: 'Pouring',      startCol: 'discharge_start',   endCol: 'discharge_end' },
  { key: 'site_washout', label: 'Site washout', startCol: 'discharge_end',     endCol: 'departure_site' },
  { key: 'transit_back', label: 'Transit back', startCol: 'departure_site',    endCol: 'arrival_plant' },
  { key: 'plant_prep',   label: 'Plant prep',   startCol: 'arrival_plant',     endCol: 'plant_prep_end' },
] as const

interface Measurement {
  row: DailyLogRow
  minutes: number | null
  startTs: string | null
}

export default function MeasurementsView({ assessmentId }: { assessmentId: string }) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const [stage, setStage] = useState<StageKey>('loading')
  const [rows, setRows] = useState<DailyLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [siteFilter, setSiteFilter] = useState<string>('')
  const [unitFilter, setUnitFilter] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('daily_logs')
        .select(
          'id, log_date, truck_id, driver_name, site_name, measurer_name, ' +
          'origin_plant, batching_unit, mix_type, cement_type, load_m3, ' +
          'rejected, is_partial, measurement_mode, measured_stage, ' +
          'plant_queue_start, loading_start, loading_end, departure_loaded, ' +
          'arrival_site, discharge_start, discharge_end, departure_site, ' +
          'arrival_plant, plant_prep_end',
        )
        .eq('assessment_id', assessmentId)
        .order('log_date', { ascending: false })
        .limit(1000)
      if (cancelled) return
      setRows((data ?? []) as unknown as DailyLogRow[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [assessmentId, supabase])

  const stageDef = STAGES.find(s => s.key === stage) ?? STAGES[1]

  const measurements: Measurement[] = useMemo(() => {
    const out: Measurement[] = []
    for (const r of rows) {
      // Single-stage rows: include only if measured_stage matches the picked stage.
      // Full-cycle rows: include if both stage timestamps are present.
      if (r.measurement_mode === 'single') {
        if (r.measured_stage !== stage) continue
      }
      const startTs = r[stageDef.startCol] as string | null
      const endTs = r[stageDef.endCol] as string | null
      let minutes: number | null = null
      if (startTs && endTs) {
        const diff = (new Date(endTs).getTime() - new Date(startTs).getTime()) / 60000
        if (diff >= 0) minutes = Math.round(diff * 10) / 10
      }
      // For full-cycle rows skip if no valid duration (the trip never reached
      // this stage). For single-stage rows we keep them even if duration is
      // null so the analyst sees the metadata; missing time just shows '—'.
      if (r.measurement_mode !== 'single' && minutes == null) continue
      out.push({ row: r, minutes, startTs })
    }
    out.sort((a, b) => {
      const aT = a.startTs ? new Date(a.startTs).getTime() : 0
      const bT = b.startTs ? new Date(b.startTs).getTime() : 0
      return bT - aT
    })
    return out
  }, [rows, stage, stageDef])

  // Distinct values for the filter dropdowns. Drawn from the current
  // stage's measurement set so options stay relevant when stage changes.
  const sitesAvailable = useMemo(() => {
    const s = new Set<string>()
    for (const m of measurements) if (m.row.origin_plant) s.add(m.row.origin_plant)
    return Array.from(s).sort()
  }, [measurements])
  const unitsAvailable = useMemo(() => {
    const s = new Set<string>()
    for (const m of measurements) {
      if (siteFilter && m.row.origin_plant !== siteFilter) continue
      if (m.row.batching_unit) s.add(m.row.batching_unit)
    }
    return Array.from(s).sort()
  }, [measurements, siteFilter])

  // Apply filters
  const filtered = useMemo(() => measurements.filter(m => {
    if (siteFilter && m.row.origin_plant !== siteFilter) return false
    if (unitFilter && m.row.batching_unit !== unitFilter) return false
    return true
  }), [measurements, siteFilter, unitFilter])

  const stats = useMemo(() => {
    const valid = filtered.filter(m => m.minutes != null).map(m => m.minutes!).sort((a, b) => a - b)
    if (valid.length === 0) return null
    const sum = valid.reduce((s, x) => s + x, 0)
    const avg = sum / valid.length
    const median = valid.length % 2 === 0
      ? (valid[valid.length / 2 - 1] + valid[valid.length / 2]) / 2
      : valid[Math.floor(valid.length / 2)]
    const p90Index = Math.min(Math.floor(valid.length * 0.9), valid.length - 1)
    return {
      count: valid.length,
      avg,
      median,
      p90: valid[p90Index],
      min: valid[0],
      max: valid[valid.length - 1],
    }
  }, [filtered])

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
          Measurements
        </div>
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
          Every individual measurement for the picked process. Combines full-cycle trips
          (where every stage was timed) and single-stage observations.
        </div>
      </div>

      {/* Stage chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {STAGES.map(s => {
          const active = stage === s.key
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStage(s.key)}
              style={{
                padding: '6px 12px',
                minHeight: 36,
                borderRadius: 18,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: active ? '#0F6E56' : '#fff',
                color: active ? '#fff' : '#333',
                border: `1px solid ${active ? '#0F6E56' : '#d1d5db'}`,
              }}
            >{s.label}</button>
          )
        })}
      </div>

      {/* Filter row (Site + Unit). Only shown when the data has multiple
          values to narrow on, so a single-site assessment does not see
          irrelevant pickers. */}
      {(sitesAvailable.length > 1 || unitsAvailable.length > 1) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {sitesAvailable.length > 1 && (
            <select
              value={siteFilter}
              onChange={e => { setSiteFilter(e.target.value); setUnitFilter('') }}
              style={selectStyle}
            >
              <option value="">All sites</option>
              {sitesAvailable.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {unitsAvailable.length > 1 && (
            <select
              value={unitFilter}
              onChange={e => setUnitFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="">All units</option>
              {unitsAvailable.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Summary stats. Mobile collapses to 3 columns, desktop fits all 6. */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(auto-fit, minmax(80px, 1fr))',
          gap: 8,
          padding: '12px',
          background: '#fafafa',
          borderRadius: 10,
          marginBottom: 14,
          border: '1px solid #eee',
        }}>
          <Stat label="Count" value={String(stats.count)} />
          <Stat label="Avg" value={`${stats.avg.toFixed(1)} min`} />
          <Stat label="Median" value={`${stats.median.toFixed(1)} min`} />
          <Stat label="P90" value={`${stats.p90.toFixed(1)} min`} />
          <Stat label="Min" value={`${stats.min.toFixed(1)} min`} />
          <Stat label="Max" value={`${stats.max.toFixed(1)} min`} />
        </div>
      )}

      {loading && (
        <div style={{ padding: 20, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
          Loading measurements...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{
          background: '#fafafa', border: '1px dashed #ccc', borderRadius: 10,
          padding: 20, textAlign: 'center', fontSize: 13, color: '#888',
        }}>
          No {stageDef.label.toLowerCase()} measurements logged yet.
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(m => (
            <MeasurementCard key={m.row.id} m={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginTop: 2 }}>
        {value}
      </div>
    </div>
  )
}

function MeasurementCard({ m }: { m: Measurement }) {
  const meta: string[] = []
  if (m.row.measurer_name) meta.push(m.row.measurer_name)
  if (m.row.origin_plant) meta.push(m.row.origin_plant)
  if (m.row.batching_unit) meta.push(m.row.batching_unit)
  if (m.row.mix_type) meta.push(`Mix ${m.row.mix_type}`)
  if (m.row.cement_type) meta.push(m.row.cement_type)
  if (m.row.load_m3 != null) meta.push(`${m.row.load_m3} m³`)
  if (m.row.truck_id) meta.push(`Truck ${m.row.truck_id}`)

  const isSingle = m.row.measurement_mode === 'single'
  const isPartial = Boolean(m.row.is_partial)
  const isRejected = Boolean(m.row.rejected)

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${isRejected ? '#E8A39B' : '#e5e5e5'}`,
      borderRadius: 10,
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#444', fontWeight: 500 }}>
            {fmtDateTime(m.startTs ?? m.row.log_date)}
          </span>
          {isSingle && (
            <span style={tagStyle('#FFF4D6', '#7a5a00')}>single-stage</span>
          )}
          {isPartial && !isSingle && (
            <span style={tagStyle('#FFF4D6', '#7a5a00')}>partial</span>
          )}
          {isRejected && (
            <span style={tagStyle('#FDEDEC', '#8B3A2E')}>rejected</span>
          )}
        </div>
        <span style={{
          fontSize: 16, fontWeight: 700, color: '#0F6E56',
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
        }}>
          {m.minutes != null ? `${m.minutes.toFixed(1)} min` : '—'}
        </span>
      </div>
      {meta.length > 0 && (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          {meta.join(' · ')}
        </div>
      )}
    </div>
  )
}

function tagStyle(bg: string, fg: string): React.CSSProperties {
  return {
    padding: '1px 6px', background: bg, color: fg,
    borderRadius: 3, fontSize: 10, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '.04em',
  }
}

const selectStyle: React.CSSProperties = {
  minHeight: 36, padding: '0 10px',
  border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: 13, background: '#fff', color: '#333',
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
