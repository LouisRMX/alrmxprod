'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSetChatContext } from '@/context/ChatContext'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlantAssessmentData {
  id: string
  phase: string
  overall: number | null
  scores: {
    prod: number | null
    dispatch: number | null
    logistics: number | null
    fleet: number | null
    quality: number | null
  } | null
  bottleneck: string | null
  constraintDetail?: string | null
  ebitda_monthly: number | null
  report_released: boolean
  trackingWeek: number | null
  recoveredMonthly?: number | null
  primaryActionStatus?: 'todo' | 'in_progress' | 'done' | null
  topAction?: string | null
  trackingImprovement?: {
    turnaroundDelta: number
    dispatchDelta: number
    weekOf: number
    weekTotal: number
  } | null
  trackingTrend?: Array<{ week: number; turnaround: number }> | null
  baselineTurnaround?: number | null
  kpi?: {
    turnaroundMin: number | null
    dispatchMin: number | null
    rejectPct: number | null
    utilPct: number | null
  } | null
}

export interface PlantCardData {
  id: string
  name: string
  country: string
  assessment: PlantAssessmentData | null
  assessmentHref?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BOTTLENECK_LABELS: Record<string, string> = {
  dispatch: 'Dispatch',
  fleet:    'Fleet',
  quality:  'Quality',
  prod:     'Production',
}

function urgencyBorder(overall: number | null): string {
  if (overall === null) return 'var(--border)'
  if (overall >= 80) return '#2a9d6e'
  if (overall >= 60) return '#c96a00'
  return '#cc3333'
}

function fmtGap(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  return '$' + Math.round(n / 1_000) + 'k'
}

function rootCauseLine(bottleneck: string | null, kpi: PlantAssessmentData['kpi']): string | null {
  if (!bottleneck || !kpi) return null
  switch (bottleneck) {
    case 'dispatch':
      return kpi.dispatchMin != null
        ? `Orders leave ${Math.round(kpi.dispatchMin)} min after receipt — target 15 min`
        : null
    case 'fleet':
      return kpi.turnaroundMin != null
        ? `Trucks return in ${Math.round(kpi.turnaroundMin)} min per round trip`
        : null
    case 'quality':
      return kpi.rejectPct != null
        ? `${kpi.rejectPct}% of loads rejected on arrival — target 1.7%`
        : null
    case 'prod':
      return kpi.utilPct != null
        ? `${Math.round(kpi.utilPct)}% utilisation — target 85%`
        : null
    default:
      return null
  }
}

// ── Action status chip ─────────────────────────────────────────────────────

const ACTION_STATUS_CFG = {
  todo:        { label: 'Not started', bg: '#fff3f3', color: '#cc3333', border: '#fcc' },
  in_progress: { label: 'In progress', bg: '#fff8ed', color: '#c96a00', border: '#f5cba0' },
  done:        { label: 'Done',        bg: '#f0faf5', color: '#1a6644', border: '#b6e2ce' },
} as const

// ── Implication coefficient ────────────────────────────────────────────────
// "Every X units improved = ~$Yk / month" — makes the gap concrete

function implicationLine(bottleneck: string | null, kpi: PlantAssessmentData['kpi'], gapMonthly: number): string | null {
  if (!bottleneck || !kpi || gapMonthly <= 0) return null
  switch (bottleneck) {
    case 'fleet': {
      const excess = kpi.turnaroundMin != null ? Math.round(kpi.turnaroundMin) - 90 : 0
      if (excess <= 10) return null
      const per10 = Math.round(gapMonthly / excess * 10 / 1000)
      return per10 > 0 ? `Every 10 min saved = ~$${per10}k / month` : null
    }
    case 'dispatch': {
      const excess = kpi.dispatchMin != null ? Math.round(kpi.dispatchMin) - 15 : 0
      if (excess <= 3) return null
      const per5 = Math.round(gapMonthly / excess * 5 / 1000)
      return per5 > 0 ? `Every 5 min faster = ~$${per5}k / month` : null
    }
    case 'quality': {
      const excess = kpi.rejectPct != null ? kpi.rejectPct - 1.7 : 0
      if (excess <= 0.3) return null
      const per1 = Math.round(gapMonthly / excess / 1000)
      return per1 > 0 ? `Every 1% fewer rejections = ~$${per1}k / month` : null
    }
    case 'prod': {
      const excess = kpi.utilPct != null ? 85 - kpi.utilPct : 0
      if (excess <= 2) return null
      const per5 = Math.round(gapMonthly / excess * 5 / 1000)
      return per5 > 0 ? `Every 5% utilisation gain = ~$${per5}k / month` : null
    }
    default: return null
  }
}

// ── Tracking context ───────────────────────────────────────────────────────

function trackingContext(a: PlantAssessmentData): { text: string; color: string } | null {
  const ti = a.trackingImprovement
  if (ti) {
    const delta = ti.turnaroundDelta
    if (delta < -5)  return { text: `↑ ${Math.abs(Math.round(delta))} min faster · Wk ${ti.weekOf}/${ti.weekTotal}`, color: '#1a6644' }
    if (delta > 5)   return { text: `↓ ${Math.round(delta)} min slower · Wk ${ti.weekOf}/${ti.weekTotal}`,        color: '#cc3333' }
    return                 { text: `Flat this week · Wk ${ti.weekOf}/${ti.weekTotal}`,                             color: 'var(--gray-400)' }
  }
  if (a.trackingWeek != null) {
    return { text: `Wk ${a.trackingWeek} of 13 — tracking in progress`, color: 'var(--gray-400)' }
  }
  return null
}

// ── MiniSparkline ──────────────────────────────────────────────────────────

function MiniSparkline({
  points,
  baseline,
}: {
  points: Array<{ week: number; turnaround: number }>
  baseline: number | null
}) {
  if (points.length < 2) return null

  const vals    = points.map(p => p.turnaround)
  const allVals = baseline != null ? [...vals, baseline] : vals
  const minV    = Math.min(...allVals) * 0.96
  const maxV    = Math.max(...allVals) * 1.04
  const range   = maxV - minV || 1
  const W = 64, H = 22

  const px = (i: number) => (i / (points.length - 1)) * W
  const py = (v: number) => H - ((v - minV) / range) * H

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(p.turnaround).toFixed(1)}`).join(' ')

  const last    = vals[vals.length - 1]
  const prev    = vals[vals.length - 2]
  const improving = last < prev  // lower turnaround = better
  const color   = improving ? '#1a6644' : '#cc3333'

  return (
    <svg
      width={W} height={H}
      style={{ overflow: 'visible', flexShrink: 0, display: 'block' }}
    >
      {/* Baseline reference */}
      {baseline != null && (
        <line
          x1={0} y1={py(baseline).toFixed(1)}
          x2={W} y2={py(baseline).toFixed(1)}
          stroke="var(--border)" strokeWidth={1} strokeDasharray="3,2"
        />
      )}
      {/* Trend line */}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Latest dot */}
      <circle
        cx={px(points.length - 1).toFixed(1)}
        cy={py(last).toFixed(1)}
        r={2.5} fill={color}
      />
    </svg>
  )
}

// ── PlantCard ──────────────────────────────────────────────────────────────

function PlantCard({ plant, portfolioTotalGap, dimBests }: { plant: PlantCardData; portfolioTotalGap: number; dimBests: DimBests }) {
  const a = plant.assessment
  const href = plant.assessmentHref ?? (a ? `/dashboard/assess/${a.id}` : undefined)

  const borderColor  = urgencyBorder(a?.overall ?? null)
  const bnKey        = a?.bottleneck ?? null
  const bnLabel      = bnKey ? (BOTTLENECK_LABELS[bnKey] ?? bnKey) : null
  const cause        = rootCauseLine(bnKey, a?.kpi ?? null)
  const implication  = implicationLine(bnKey, a?.kpi ?? null, a?.ebitda_monthly ?? 0)
  const trackCtx     = a ? trackingContext(a) : null
  const actionCfg    = a?.primaryActionStatus ? ACTION_STATUS_CFG[a.primaryActionStatus] : null
  const gapPct       = portfolioTotalGap > 0 && (a?.ebitda_monthly ?? 0) > 0
    ? Math.round((a!.ebitda_monthly! / portfolioTotalGap) * 100)
    : null

  // Cross-plant benchmark: best performer in this plant's bottleneck dimension
  const bnDim         = bnKey ? KPI_DIMS.find(d => d.bnKey === bnKey) ?? null : null
  const myKpiValue    = bnDim && a?.kpi?.[bnDim.key] != null ? a.kpi[bnDim.key] as number : null
  const bestForBn     = bnKey ? (dimBests[bnKey] ?? null) : null
  const showBenchmark = bestForBn != null && bestForBn.name !== plant.name && bnDim != null && myKpiValue != null
  const gapFromBest   = showBenchmark && bnDim ? Math.abs(myKpiValue! - bestForBn!.value) : 0

  const card = (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: '12px',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      transition: 'box-shadow .15s',
    }}
      className="plant-card"
    >
      {/* Row 1: name + gap */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gray-900)', lineHeight: 1.2 }}>
            {plant.name}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>
            {plant.country}
          </div>
        </div>
        {a?.ebitda_monthly ? (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: '20px', fontWeight: 700, fontFamily: 'var(--mono)',
              color: '#cc3333', lineHeight: 1,
            }}>
              {fmtGap(a.ebitda_monthly)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>
              / month{gapPct != null ? ` · ${gapPct}% of gap` : ''}
            </div>
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: '12px' }} />

      {/* Bottleneck + root cause + implication */}
      {!a || a.overall === null ? (
        <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
          {a ? 'Assessment in progress' : 'No assessment yet'}
        </div>
      ) : bnLabel ? (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-800)', marginBottom: '4px' }}>
            {bnLabel} bottleneck
          </div>
          {cause && (
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', lineHeight: 1.5 }}>
              {cause}
            </div>
          )}
          {implication && (
            <div style={{ fontSize: '11px', color: '#c96a00', marginTop: '3px', fontWeight: 500 }}>
              {implication}
            </div>
          )}
          {showBenchmark && bnDim && (
            <div style={{
              fontSize: '11px', color: 'var(--gray-500)', marginTop: '8px',
              paddingTop: '8px', borderTop: '1px dashed var(--border)',
              display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: 600, color: '#1a6644' }}>Portfolio best:</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#1a6644' }}>
                {bnDim.unit === '%' ? `${bestForBn!.value.toFixed(1)}%` : `${Math.round(bestForBn!.value)} min`}
              </span>
              <span>{bestForBn!.name}</span>
              <span style={{ color: 'var(--gray-300)' }}>·</span>
              <span>
                you: {bnDim.unit === '%' ? `${myKpiValue!.toFixed(1)}%` : `${Math.round(myKpiValue!)} min`}
              </span>
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px',
                background: '#fff8ed', color: '#c96a00', border: '1px solid #f5cba0', flexShrink: 0,
              }}>
                {bnDim.unit === '%' ? `${gapFromBest.toFixed(1)}pp gap` : `${Math.round(gapFromBest)} min gap`}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '10px' }}>
          No bottleneck identified
        </div>
      )}

      {/* Next action */}
      {a?.topAction && (
        <div style={{
          fontSize: '12px', color: 'var(--gray-700)', lineHeight: 1.5,
          padding: '8px 10px', borderRadius: '6px',
          background: 'var(--gray-50)', border: '1px solid var(--border)',
          marginBottom: '10px',
        }}>
          <span style={{ fontWeight: 600, color: 'var(--gray-500)', marginRight: '4px' }}>Next:</span>
          {a.topAction}
        </div>
      )}

      {/* Tracking trend row — sparkline + context text */}
      {(a?.trackingTrend || trackCtx) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', marginTop: '2px' }}>
          {a?.trackingTrend && a.trackingTrend.length >= 2 && (
            <MiniSparkline points={a.trackingTrend} baseline={a.baselineTurnaround ?? null} />
          )}
          {trackCtx && (
            <span style={{ fontSize: '11px', color: trackCtx.color, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trackCtx.text}
            </span>
          )}
        </div>
      )}

      {/* Bottom row: status chip + view link */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
          {actionCfg && (
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
              background: actionCfg.bg, color: actionCfg.color,
              border: `1px solid ${actionCfg.border}`, flexShrink: 0,
            }}>
              {actionCfg.label}
            </span>
          )}
        </div>
        {href ? (
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '8px' }}>
            View report →
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--gray-300)', flexShrink: 0 }}>Pending</span>
        )}
      </div>
    </div>
  )

  if (!href) return card
  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      {card}
    </Link>
  )
}

// ── Cross-plant benchmarks ─────────────────────────────────────────────────

type KpiKey = keyof NonNullable<PlantAssessmentData['kpi']>

interface KpiDim {
  key:            KpiKey
  label:          string
  unit:           string
  target:         number
  lowerIsBetter:  boolean
  bnKey:          string
}

const KPI_DIMS: KpiDim[] = [
  { key: 'turnaroundMin', label: 'Fleet turnaround', unit: 'min', target: 90,  lowerIsBetter: true,  bnKey: 'fleet'    },
  { key: 'dispatchMin',   label: 'Dispatch time',    unit: 'min', target: 15,  lowerIsBetter: true,  bnKey: 'dispatch' },
  { key: 'rejectPct',     label: 'Rejection rate',   unit: '%',   target: 1.7, lowerIsBetter: true,  bnKey: 'quality'  },
  { key: 'utilPct',       label: 'Utilisation',      unit: '%',   target: 85,  lowerIsBetter: false, bnKey: 'prod'     },
]

// Best performer per bottleneck dimension — keyed by bnKey ('fleet', 'dispatch', etc.)
type DimBests = Record<string, { name: string; value: number }>


// ── DemoSizeToggle ─────────────────────────────────────────────────────────
// Subtle plant-count switcher for demo use only — not customer-facing UI.

export function DemoSizeToggle({
  current,
  onChange,
  minValue = 1,
}: {
  current: 1 | 3 | 10 | 20
  onChange: (n: 1 | 3 | 10 | 20) => void
  minValue?: number
}) {
  const options = ([1, 3, 10, 20] as const).filter(n => n >= minValue)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
      {options.map((n, i) => (
        <span key={n} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <span style={{ color: 'var(--gray-200)', fontSize: '11px', margin: '0 2px' }}>·</span>}
          <button
            onClick={() => onChange(n)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontFamily: 'var(--mono)',
              fontWeight: current === n ? 700 : 400,
              color: current === n ? 'var(--gray-700)' : 'var(--gray-300)',
              padding: '2px 3px',
              transition: 'color .1s',
            }}
          >
            {n}
          </button>
        </span>
      ))}
    </div>
  )
}

// ── PlantOverviewView ──────────────────────────────────────────────────────

interface PlantOverviewViewProps {
  plants: PlantCardData[]
  customerName?: string
  isDemo?: boolean
  demoPlantCount?: 1 | 3 | 10 | 20
  onDemoPlantCountChange?: (n: 1 | 3 | 10 | 20) => void
}

export default function PlantOverviewView({ plants, customerName, isDemo, demoPlantCount, onDemoPlantCountChange }: PlantOverviewViewProps) {
  const isMobile = useIsMobile()

  // Always sorted by gap descending — worst plant first
  const sorted = useMemo(() =>
    [...plants].sort((a, b) =>
      (b.assessment?.ebitda_monthly ?? 0) - (a.assessment?.ebitda_monthly ?? 0)
    ),
    [plants]
  )

  // Best performer per KPI dimension — used for inline cross-plant comparison in each card
  const dimBests = useMemo<DimBests>(() => {
    const result: DimBests = {}
    for (const dim of KPI_DIMS) {
      const points = plants
        .filter(p => p.assessment?.kpi?.[dim.key] != null)
        .map(p => ({ name: p.name, value: p.assessment!.kpi![dim.key] as number }))
      if (points.length < 2) continue
      const best = [...points].sort((a, b) =>
        dim.lowerIsBetter ? a.value - b.value : b.value - a.value
      )[0]
      result[dim.bnKey] = best
    }
    return result
  }, [plants])

  // Portfolio summary for chat context
  const withScore = plants.filter(p => p.assessment?.overall != null)
  const avgScore = withScore.length > 0
    ? Math.round(withScore.reduce((s, p) => s + p.assessment!.overall!, 0) / withScore.length)
    : null
  const totalGap       = plants.reduce((s, p) => s + (p.assessment?.ebitda_monthly ?? 0), 0)
  const totalRecovered = plants.reduce((s, p) => s + (p.assessment?.recoveredMonthly ?? 0), 0)

  useSetChatContext({
    pageType: 'plants',
    portfolioSummary: { totalPlants: plants.length, avgScore, totalGap, totalRecovered },
  })

  // ── Urgency signal ────────────────────────────────────────────────────────
  // Plants that need attention: have a financial gap AND either no active
  // actions, or a worsening trend (turnaround going up over last 2 readings).
  const urgentNoAction = sorted.filter(p => {
    const a = p.assessment
    if (!a || !(a.ebitda_monthly ?? 0)) return false
    return a.primaryActionStatus === 'todo' || a.primaryActionStatus === null
  })
  const urgentWorsening = sorted.filter(p => {
    const a = p.assessment
    if (!a || !(a.ebitda_monthly ?? 0)) return false
    return (a.trackingImprovement?.turnaroundDelta ?? 0) > 5
  })
  // Deduplicate
  const urgentIds  = new Set([...urgentNoAction, ...urgentWorsening].map(p => p.id))
  const urgentList = sorted.filter(p => urgentIds.has(p.id))
  const urgentGap  = urgentList.reduce((s, p) => s + (p.assessment?.ebitda_monthly ?? 0), 0)

  const noActionCount  = urgentNoAction.length
  const worseningCount = urgentWorsening.filter(p => !urgentNoAction.includes(p)).length

  return (
    <div style={{
      padding: isMobile ? '16px 14px' : '28px 32px',
      maxWidth: '780px', margin: '0 auto',
    }}>

      {/* Demo banner — text only, no toggle */}
      {isDemo && (
        <div style={{
          background: '#f0f9ff', border: '1px solid #bae6fd',
          borderRadius: '8px', padding: '10px 16px', marginBottom: '20px',
          fontSize: '12px', color: '#0369a1',
          display: 'flex', gap: '8px', alignItems: 'center',
        }}>
          <span style={{ flexShrink: 0 }}>🎯</span>
          <span>
            Demo — Al-Noor RMX Group · {plants.length} plant{plants.length !== 1 ? 's' : ''} across Saudi Arabia.
            Click any plant to explore the live assessment tool.
          </span>
        </div>
      )}

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '18px' : '22px', fontWeight: 700,
            color: 'var(--gray-900)', marginBottom: '3px',
          }}>
            {customerName || 'My Plants'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            {plants.length} plant{plants.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isDemo && onDemoPlantCountChange && (
          <DemoSizeToggle current={demoPlantCount ?? 3} onChange={onDemoPlantCountChange} />
        )}
      </div>

      {/* Summary chips — 2 max */}
      <div style={{
        display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap',
      }}>
        {/* Total gap */}
        {totalGap > 0 && (
          <div style={{
            background: '#fff3f3', border: '1px solid #fcc',
            borderRadius: '10px', padding: '14px 20px', flex: '1', minWidth: '140px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#e06060', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '5px' }}>
              Total gap
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--red)', lineHeight: 1 }}>
                {fmtGap(totalGap)}
              </span>
              <span style={{ fontSize: '12px', color: '#e06060', fontWeight: 500 }}>/month</span>
            </div>
          </div>
        )}

        {/* Recovered — only shown when > 0 */}
        {totalRecovered > 0 && (
          <div style={{
            background: 'var(--phase-complete-bg)', border: '1px solid var(--phase-complete)',
            borderRadius: '10px', padding: '14px 20px', flex: '1', minWidth: '140px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--phase-complete)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '5px' }}>
              Recovered
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--phase-complete)', lineHeight: 1 }}>
                {fmtGap(totalRecovered)}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--phase-complete)', fontWeight: 500 }}>/month</span>
            </div>
          </div>
        )}
      </div>

      {/* Urgency banner */}
      {urgentList.length > 0 && urgentGap > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          background: '#fff8ed', border: '1px solid #f5cba0',
          borderLeft: '4px solid #c96a00',
          borderRadius: '8px', padding: '12px 16px',
          marginBottom: '20px',
        }}>
          <span style={{ fontSize: '16px', flexShrink: 0, lineHeight: 1.4 }}>⚠</span>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#7a3e00' }}>
              {fmtGap(urgentGap)}/month at risk
            </span>
            <span style={{ fontSize: '13px', color: '#a35800' }}>
              {' '}across {urgentList.length} plant{urgentList.length > 1 ? 's' : ''}.{' '}
              {noActionCount > 0 && worseningCount === 0 && 'No active improvement actions.'}
              {worseningCount > 0 && noActionCount === 0 && `${worseningCount} plant${worseningCount > 1 ? 's' : ''} showing worsening trend.`}
              {noActionCount > 0 && worseningCount > 0 && `No active actions on ${noActionCount}. ${worseningCount} worsening.`}
            </span>
          </div>
        </div>
      )}

      {/* Plant cards — single column, sorted by gap */}
      {plants.length === 0 ? (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '60px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--gray-700)', marginBottom: '8px' }}>
            No plants yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
            Your consultant will add plants when assessments are scheduled.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sorted.map(plant => (
            <PlantCard key={plant.id} plant={plant} portfolioTotalGap={totalGap} dimBests={dimBests} />
          ))}
        </div>
      )}

      <style>{`
        .plant-card:hover { box-shadow: 0 2px 12px rgba(15,110,86,0.08); }
      `}</style>
    </div>
  )
}
