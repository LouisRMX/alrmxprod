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

// ── PlantCard ──────────────────────────────────────────────────────────────

function PlantCard({ plant, portfolioTotalGap }: { plant: PlantCardData; portfolioTotalGap: number }) {
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

      {/* Bottom row: status chip + tracking context + view link */}
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
          {trackCtx && (
            <span style={{ fontSize: '11px', color: trackCtx.color, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {trackCtx.text}
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

  return (
    <div style={{
      padding: isMobile ? '16px 14px' : '28px 32px',
      maxWidth: '780px', margin: '0 auto',
    }}>

      {/* Demo banner */}
      {isDemo && (
        <div style={{
          background: '#f0f9ff', border: '1px solid #bae6fd',
          borderRadius: '8px', padding: '10px 16px', marginBottom: '20px',
          fontSize: '12px', color: '#0369a1',
          display: 'flex', gap: '10px', alignItems: 'center',
          flexWrap: 'wrap', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ flexShrink: 0 }}>🎯</span>
            <span>
              Demo — Al-Noor RMX Group · {plants.length} plant{plants.length !== 1 ? 's' : ''} across Saudi Arabia.
              Click any plant to explore the live assessment tool.
            </span>
          </div>
          {onDemoPlantCountChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', color: '#64b2d4', marginRight: '2px' }}>Portfolio size:</span>
              {([1, 3, 10, 20] as const).map(n => (
                <button
                  key={n}
                  onClick={() => onDemoPlantCountChange(n)}
                  style={{
                    padding: '3px 10px', borderRadius: '20px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: demoPlantCount === n ? 700 : 400,
                    fontFamily: 'var(--font)',
                    background: demoPlantCount === n ? '#0369a1' : 'transparent',
                    color: demoPlantCount === n ? '#fff' : '#0369a1',
                    border: `1px solid ${demoPlantCount === n ? '#0369a1' : '#7dd3fc'}`,
                    transition: 'all .15s',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Page header */}
      <div style={{ marginBottom: '20px' }}>
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
            <PlantCard key={plant.id} plant={plant} portfolioTotalGap={totalGap} />
          ))}
        </div>
      )}

      <style>{`
        .plant-card:hover { box-shadow: 0 2px 12px rgba(15,110,86,0.08); }
      `}</style>
    </div>
  )
}
