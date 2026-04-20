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
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'
import type { LogStringKey } from '@/lib/i18n/log-catalog'

interface Props {
  assessmentId: string
  /** Optional: the reported TAT from the pre-assessment report, for the expected-vs-measured banner. */
  reportedTAT?: number | null
  /** Optional: the target TAT for the comparison. */
  targetTAT?: number | null
}

// ColorBrewer qualitative palette. Chosen for maximum visual distinction
// between 9 stages and colorblind-friendly separation. Weighbridge and
// plant_prep use muted variants of adjacent stages to signal "support"
// activities that happen at the same physical location (plant).
const STAGE_COLORS: Record<StageKey, string> = {
  plant_queue: '#e41a1c',    // red
  loading: '#377eb8',        // blue
  weighbridge: '#1b7fa8',    // deep teal (plant support, next to loading)
  transit_out: '#4daf4a',    // green
  site_wait: '#984ea3',      // purple
  pouring: '#ff7f00',        // orange
  site_washout: '#a65628',   // brown
  transit_back: '#f781bf',   // pink
  plant_prep: '#5a5a5a',     // slate (plant support, end of cycle)
}

export default function FieldLogDiagnostics({ assessmentId, reportedTAT, targetTAT }: Props) {
  const supabase = createClient()
  const { t } = useLogT()
  const stageLabelT = (s: StageKey) => t(`stage.${s}` as LogStringKey)
  const [trips, setTrips] = useState<TripWithStageDurations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('all')
  const [siteTypeFilter, setSiteTypeFilter] = useState<'all' | 'ground_pour' | 'high_rise' | 'infrastructure' | 'unknown'>('all')
  const [rawTrips, setRawTrips] = useState<DailyLogWithStages[]>([])

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
      setRawTrips(data as DailyLogWithStages[])
      setLoading(false)
    }
    load()
  }, [assessmentId, dateRange, supabase])

  // Apply site_type filter in memory so switching doesn't re-query.
  useEffect(() => {
    const filtered = siteTypeFilter === 'all'
      ? rawTrips
      : rawTrips.filter(r => (r.site_type ?? 'unknown') === siteTypeFilter)
    setTrips(filtered.map(computeStageDurations))
  }, [rawTrips, siteTypeFilter])

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
    return <div style={{ padding: '24px', color: '#888', fontSize: '14px' }}><Bilingual k="diag.loading" /></div>
  }
  if (error) {
    return <div style={{ padding: '24px', color: '#C0392B', fontSize: '14px' }}>{t('diag.error')}: {error}</div>
  }
  if (trips.length === 0) {
    return (
      <div style={{
        padding: '32px', textAlign: 'center', background: '#fafafa',
        border: '1px dashed #ccc', borderRadius: '10px', color: '#888', fontSize: '14px',
      }}>
        <Bilingual k="diag.no_trips" />
      </div>
    )
  }

  const completeTripCount = trips.filter(t => !t.isPartial && t.totalMinutes !== null).length
  const partialTripCount = trips.filter(t => t.isPartial).length

  return (
    <div style={{ padding: '4px 0' }}>

      {/* Date range filter + counts */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: '#888', fontWeight: 600 }}><Bilingual k="diag.range" inline />:</span>
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
            {r === 'today' ? t('diag.today') : r === '7d' ? t('diag.last_7') : r === '30d' ? t('diag.last_30') : t('diag.all')}
          </button>
        ))}
        <div style={{ marginInlineStart: 'auto', fontSize: '12px', color: '#666' }}>
          <strong>{completeTripCount}</strong> {t('diag.complete')} · <strong>{partialTripCount}</strong> {t('diag.partial')}
        </div>
      </div>

      {/* Site type filter. Segments the stage summary, TAT breakdown, and
          outlier list so high-rise pours are not averaged with ground-pour. */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: '#888', fontWeight: 600 }}>
          <Bilingual k="site_type.label" inline />:
        </span>
        {(['all', 'ground_pour', 'high_rise', 'infrastructure', 'unknown'] as const).map(s => {
          const active = siteTypeFilter === s
          const labelKey: LogStringKey | null = s === 'all' ? null : `site_type.${s}` as LogStringKey
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSiteTypeFilter(s)}
              style={{
                padding: '5px 10px', fontSize: '12px', borderRadius: '5px',
                border: `1px solid ${active ? '#0F6E56' : '#ddd'}`,
                background: active ? '#E1F5EE' : '#fff',
                color: active ? '#0F6E56' : '#666',
                fontWeight: 500, cursor: 'pointer',
              }}
            >
              {s === 'all' ? t('diag.all') : labelKey ? <Bilingual k={labelKey} inline /> : null}
            </button>
          )
        })}
      </div>

      {/* Site-type TAT comparison panel (shown only when filter is 'all'
          AND we have more than one type in the raw data). Lets the analyst
          see at-a-glance whether one site-type is dragging up the median. */}
      {siteTypeFilter === 'all' && (
        <SiteTypeTATPanel rawTrips={rawTrips} />
      )}

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
      <SectionHeader title={t('diag.breakdown_title')} />
      {chartData.length === 0 ? (
        <EmptyCard text={t('diag.no_complete_trips')} />
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" fontSize={10} angle={-30} textAnchor="end" height={60} />
              <YAxis fontSize={11} label={{ value: 'min', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip
                trigger="click"
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
            {t('diag.showing_recent', { n: chartData.length })}
          </div>
        </div>
      )}

      {/* Stage summary table. Horizontal scroll on narrow screens to keep
          all 6 columns readable without squashing. */}
      <SectionHeader title={t('diag.stage_summary')} />
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
          <div style={{ minWidth: '520px' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr',
              fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.3px',
              padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e5e5',
            }}>
              <div>{t('reviewq.stage_breakdown').split(' ')[0]}</div>
              <div style={{ textAlign: 'right' }}>{t('diag.median')}</div>
              <div style={{ textAlign: 'right' }}>P25</div>
              <div style={{ textAlign: 'right' }}>P75</div>
              <div style={{ textAlign: 'right' }}>{t('diag.n')}</div>
              <div style={{ textAlign: 'right' }}>{t('diag.share_tat')}</div>
            </div>
            {stageSummaries.map(s => (
              <div key={s.stage} style={{
                display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr',
                fontSize: '13px', padding: '10px 14px',
                borderBottom: '1px solid #f5f5f5',
                fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
              }}>
                <div style={{ fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: STAGE_COLORS[s.stage], flexShrink: 0 }} />
                  <span style={{ color: '#333' }}>{stageLabelT(s.stage)}</span>
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
              <div style={{ fontFamily: 'inherit' }}>{t('diag.total_tat_median')}</div>
              <div style={{ textAlign: 'right', color: '#0F6E56' }}>{totalStageMedian > 0 ? totalStageMedian.toFixed(1) : '—'}</div>
              <div style={{ gridColumn: 'span 4' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Outliers */}
      <SectionHeader title={t('diag.top_outliers')} />
      {outliers.length === 0 ? (
        <EmptyCard text={t('diag.no_outliers')} />
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
  reportedTAT, targetTAT: _targetTAT, measuredTAT, sampleSize,
}: {
  reportedTAT: number | null
  targetTAT: number | null  // Reserved for future use; targets are not shown pre-baseline
  measuredTAT: number | null
  sampleSize: number
}) {
  const { t } = useLogT()
  if (reportedTAT === null || measuredTAT === null || sampleSize < 3) {
    return (
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e5e5', borderRadius: '10px',
        padding: '12px 14px', marginBottom: '18px', fontSize: '12px', color: '#666',
      }}>
        {t('diag.log_3_trips')}
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
        {t('diag.expected_vs_measured')}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', fontSize: '13px',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>{t('diag.reported')}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
            {reportedTAT} {t('reviewq.min')}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>{t('diag.measured')}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
            {measuredTAT.toFixed(0)} {t('reviewq.min')}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>{t('diag.delta')}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', color: delta > 0 ? '#C0392B' : delta < 0 ? '#0F6E56' : '#666' }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(0)} {t('reviewq.min')} ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
          </div>
        </div>
      </div>
      <div style={{ fontSize: '11px', color: '#666', marginTop: '10px', fontStyle: 'italic' }}>
        {t('diag.baseline_based_on', { n: sampleSize })}
      </div>
    </div>
  )
}

// ── Site-type TAT comparison panel ──────────────────────────────────────
// Shows median TAT per site_type side by side. Only renders when the
// dataset contains ≥ 2 distinct types so it's useful, not noise. The
// point: reveal when mix composition (not operational change) is
// driving the week-over-week TAT movement.
function SiteTypeTATPanel({ rawTrips }: { rawTrips: DailyLogWithStages[] }) {
  const { t } = useLogT()
  const perType = useMemo(() => {
    const groups: Record<string, number[]> = {}
    for (const r of rawTrips) {
      const type = r.site_type ?? 'unknown'
      const computed = computeStageDurations(r)
      if (computed.totalMinutes == null || computed.isPartial) continue
      if (!groups[type]) groups[type] = []
      groups[type].push(computed.totalMinutes)
    }
    return (['ground_pour', 'high_rise', 'infrastructure', 'unknown'] as const)
      .map(type => ({
        type,
        count: groups[type]?.length ?? 0,
        median: median(groups[type] ?? []),
      }))
      .filter(e => e.count > 0)
  }, [rawTrips])

  if (perType.length < 2) return null

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px',
      padding: '14px 16px', marginBottom: '16px',
    }}>
      <div style={{
        fontSize: '11px', color: '#888', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '10px',
      }}>
        <Bilingual k="site_type.label" /> · Median TAT
      </div>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {perType.map(e => (
          <div key={e.type} style={{
            flex: '1 1 140px', minWidth: '120px',
            padding: '10px 12px', background: '#fafafa',
            borderRadius: '8px', border: '1px solid #eee',
          }}>
            <div style={{ fontSize: '10px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '4px' }}>
              <Bilingual k={`site_type.${e.type}` as LogStringKey} inline />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', color: '#0F6E56' }}>
                {e.median != null ? Math.round(e.median) : '-'}
              </span>
              <span style={{ fontSize: '11px', color: '#888' }}>{t('reviewq.min')}</span>
            </div>
            <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>
              n={e.count}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
