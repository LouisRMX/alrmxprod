'use client'

/**
 * Day 1 Diagnostics view.
 *
 * Purpose: as soon as the consultant has logged 10-15 trips on-site, show
 * what the real data is saying. Compare measured median to the pre-assessment
 * assumptions, identify the biggest stage contributors, and surface outliers.
 *
 * Panels:
 *   1. Expected-vs-measured banner (TAT assumption from report vs live measurement)
 *   2. Stage breakdown stacked bar per trip
 *   3. Stage summary table (median, p25, p75, share of TAT)
 *   4. Top outliers list (which trips pulled the median)
 */

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  computeStageDurations,
  summariseStages,
  findOutliers,
  formatStageName,
  median,
  STAGE_KEYS,
  type DailyLogWithStages,
  type StageKey,
  type TripWithStageDurations,
} from './tripAnalysis'

interface Props {
  assessmentId: string
  /** Optional: the reported TAT from the pre-assessment report, for the expected-vs-measured banner. */
  reportedTAT?: number | null
  /** Optional: the target TAT for the comparison. */
  targetTAT?: number | null
}

const STAGE_COLORS: Record<StageKey, string> = {
  plant_queue: '#C0392B',
  loading: '#E67E22',
  transit_out: '#F1C40F',
  site_wait: '#8E44AD',
  pouring: '#2980B9',
  washout: '#16A085',
  transit_back: '#27AE60',
}

export default function FieldLogDiagnostics({ assessmentId, reportedTAT, targetTAT }: Props) {
  const supabase = createClient()
  const [trips, setTrips] = useState<TripWithStageDurations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('daily_logs')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('log_date', { ascending: false })

      const now = new Date()
      const cutoff = new Date()
      if (dateRange === 'today') {
        cutoff.setHours(0, 0, 0, 0)
        query = query.gte('log_date', cutoff.toISOString().slice(0, 10))
      } else if (dateRange === '7d') {
        cutoff.setDate(now.getDate() - 7)
        query = query.gte('log_date', cutoff.toISOString().slice(0, 10))
      } else if (dateRange === '30d') {
        cutoff.setDate(now.getDate() - 30)
        query = query.gte('log_date', cutoff.toISOString().slice(0, 10))
      }

      const { data, error: err } = await query.limit(1000)
      if (err) {
        setError(err.message)
        setLoading(false)
        return
      }
      const computed = (data as DailyLogWithStages[]).map(computeStageDurations)
      setTrips(computed)
      setLoading(false)
    }
    load()
  }, [assessmentId, dateRange, supabase])

  const stageSummaries = useMemo(() => summariseStages(trips), [trips])
  const outliers = useMemo(() => findOutliers(trips, 5), [trips])
  const measuredMedianTAT = useMemo(
    () => median(trips.map(t => t.totalMinutes)),
    [trips],
  )
  const totalStageMedian = stageSummaries.reduce((acc, s) => acc + (s.median ?? 0), 0)

  // Prepare chart data: one entry per trip
  const chartData = useMemo(() => {
    const withTotal = trips.filter(t => t.totalMinutes !== null && !t.isPartial)
    return withTotal.slice(0, 30).reverse().map((t, i) => {
      const label = t.truckId ? `#${i + 1} · ${t.truckId}` : `#${i + 1}`
      return {
        label,
        ...t.stageMinutes,
        id: t.id,
      }
    })
  }, [trips])

  if (loading) {
    return <div style={{ padding: '24px', color: '#888', fontSize: '14px' }}>Loading trip data…</div>
  }
  if (error) {
    return <div style={{ padding: '24px', color: '#C0392B', fontSize: '14px' }}>Error: {error}</div>
  }
  if (trips.length === 0) {
    return (
      <div style={{
        padding: '32px', textAlign: 'center', background: '#fafafa',
        border: '1px dashed #ccc', borderRadius: '10px', color: '#888', fontSize: '14px',
      }}>
        No trips logged yet. Start capturing on the Live tab.
      </div>
    )
  }

  const completeTripCount = trips.filter(t => !t.isPartial && t.totalMinutes !== null).length
  const partialTripCount = trips.filter(t => t.isPartial).length

  return (
    <div style={{ padding: '4px 0' }}>

      {/* Filter + counts */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: '#888', fontWeight: 600 }}>Range:</span>
        {(['today', '7d', '30d', 'all'] as const).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setDateRange(r)}
            style={{
              padding: '5px 10px', fontSize: '12px', borderRadius: '5px',
              border: `1px solid ${dateRange === r ? '#0F6E56' : '#ddd'}`,
              background: dateRange === r ? '#E1F5EE' : '#fff',
              color: dateRange === r ? '#0F6E56' : '#666',
              fontWeight: 500, cursor: 'pointer',
            }}
          >
            {r === 'today' ? 'Today' : r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'All'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#666' }}>
          <strong>{completeTripCount}</strong> complete · <strong>{partialTripCount}</strong> partial
        </div>
      </div>

      {/* Expected vs measured banner */}
      {(reportedTAT !== undefined && reportedTAT !== null) && (
        <ExpectedVsMeasuredBanner
          reportedTAT={reportedTAT}
          targetTAT={targetTAT ?? null}
          measuredTAT={measuredMedianTAT}
          sampleSize={completeTripCount}
        />
      )}

      {/* Stage breakdown chart */}
      <SectionHeader title="Trip-by-trip TAT breakdown" />
      {chartData.length === 0 ? (
        <EmptyCard text="No complete trips yet. Log a full cycle to see breakdown." />
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" fontSize={10} angle={-30} textAnchor="end" height={60} />
              <YAxis fontSize={11} label={{ value: 'min', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: '12px' }}
                formatter={(value, name) => {
                  const stage = STAGE_KEYS.find(s => s === name)
                  return [`${value} min`, stage ? formatStageName(stage) : String(name)]
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px' }}
                formatter={(value: string) => {
                  const stage = STAGE_KEYS.find(s => s === value)
                  return stage ? formatStageName(stage) : value
                }}
              />
              {STAGE_KEYS.map(stage => (
                <Bar key={stage} dataKey={stage} stackId="tat" fill={STAGE_COLORS[stage]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={STAGE_COLORS[stage]} />
                  ))}
                </Bar>
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ fontSize: '11px', color: '#888', textAlign: 'center', marginTop: '4px' }}>
            Showing {chartData.length} most recent complete trips
          </div>
        </div>
      )}

      {/* Stage summary table */}
      <SectionHeader title="Stage summary" />
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr',
          fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.3px',
          padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e5e5',
        }}>
          <div>Stage</div>
          <div style={{ textAlign: 'right' }}>Median</div>
          <div style={{ textAlign: 'right' }}>P25</div>
          <div style={{ textAlign: 'right' }}>P75</div>
          <div style={{ textAlign: 'right' }}>n</div>
          <div style={{ textAlign: 'right' }}>% of TAT</div>
        </div>
        {stageSummaries.map(s => (
          <div key={s.stage} style={{
            display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr',
            fontSize: '13px', padding: '10px 14px',
            borderBottom: '1px solid #f5f5f5',
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
          }}>
            <div style={{ fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: STAGE_COLORS[s.stage] }} />
              <span style={{ color: '#333' }}>{formatStageName(s.stage)}</span>
            </div>
            <div style={{ textAlign: 'right', color: '#1a1a1a', fontWeight: 600 }}>{s.median?.toFixed(1) ?? '—'}</div>
            <div style={{ textAlign: 'right', color: '#888' }}>{s.p25?.toFixed(1) ?? '—'}</div>
            <div style={{ textAlign: 'right', color: '#888' }}>{s.p75?.toFixed(1) ?? '—'}</div>
            <div style={{ textAlign: 'right', color: '#888' }}>{s.count}</div>
            <div style={{ textAlign: 'right', color: s.shareOfTotalPct !== null && s.shareOfTotalPct >= 25 ? '#C0392B' : '#666', fontWeight: s.shareOfTotalPct !== null && s.shareOfTotalPct >= 25 ? 600 : 400 }}>
              {s.shareOfTotalPct !== null ? `${s.shareOfTotalPct}%` : '—'}
            </div>
          </div>
        ))}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr',
          fontSize: '13px', padding: '10px 14px', background: '#f9fafb',
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontWeight: 700,
        }}>
          <div style={{ fontFamily: 'inherit' }}>Total TAT (median)</div>
          <div style={{ textAlign: 'right', color: '#0F6E56' }}>{totalStageMedian > 0 ? totalStageMedian.toFixed(1) : '—'}</div>
          <div style={{ gridColumn: 'span 4' }} />
        </div>
      </div>

      {/* Outliers */}
      <SectionHeader title="Top outliers" />
      {outliers.length === 0 ? (
        <EmptyCard text="No outliers detected. Need more data or the operation is uniform." />
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px' }}>
          {outliers.map((o, i) => (
            <div key={o.id} style={{
              padding: '12px 14px',
              borderBottom: i < outliers.length - 1 ? '1px solid #f5f5f5' : 'none',
              display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                  {o.truckId ? `Truck ${o.truckId}` : 'Unknown truck'}
                  {o.siteName && <span style={{ color: '#888', fontWeight: 400 }}> · {o.siteName}</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#C0392B', marginTop: '2px', fontWeight: 500 }}>
                  {o.reason}
                </div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                  {o.measurerName ? `Measured by ${o.measurerName} · ` : ''}{o.logDate}
                </div>
              </div>
              <div style={{ fontSize: '16px', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', color: '#1a1a1a', fontWeight: 600 }}>
                {o.totalMinutes ? `${o.totalMinutes.toFixed(0)} min` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: '12px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>
      {title}
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div style={{
      padding: '16px', background: '#fafafa', border: '1px dashed #ddd',
      borderRadius: '8px', fontSize: '12px', color: '#888', textAlign: 'center', marginBottom: '18px',
    }}>
      {text}
    </div>
  )
}

function ExpectedVsMeasuredBanner({
  reportedTAT, targetTAT, measuredTAT, sampleSize,
}: {
  reportedTAT: number | null
  targetTAT: number | null
  measuredTAT: number | null
  sampleSize: number
}) {
  if (reportedTAT === null || measuredTAT === null || sampleSize < 3) {
    return (
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e5e5', borderRadius: '10px',
        padding: '12px 14px', marginBottom: '18px', fontSize: '12px', color: '#666',
      }}>
        Log at least 3 complete trips to compare measured TAT to pre-assessment assumptions.
      </div>
    )
  }
  const delta = measuredTAT - reportedTAT
  const deltaPct = (delta / reportedTAT) * 100
  const isClose = Math.abs(deltaPct) < 5
  return (
    <div style={{
      background: isClose ? '#E1F5EE' : deltaPct > 0 ? '#FDEDEC' : '#FFF4D6',
      border: `1px solid ${isClose ? '#A8D9C5' : deltaPct > 0 ? '#E8A39B' : '#F1D79A'}`,
      borderRadius: '10px', padding: '14px', marginBottom: '18px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '6px' }}>
        Reported vs measured TAT
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', fontSize: '13px',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>REPORTED (pre-assessment)</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
            {reportedTAT} min
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>MEASURED (on-site)</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
            {measuredTAT.toFixed(0)} min
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>DELTA</div>
          <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', color: delta > 0 ? '#C0392B' : delta < 0 ? '#0F6E56' : '#666' }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(0)} min ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
          </div>
        </div>
        {targetTAT !== null && (
          <div>
            <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>TARGET</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
              {targetTAT} min
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: '11px', color: '#666', marginTop: '10px', fontStyle: 'italic' }}>
        Based on {sampleSize} complete trips. As the sample grows, this measurement replaces the report's assumption.
      </div>
    </div>
  )
}
