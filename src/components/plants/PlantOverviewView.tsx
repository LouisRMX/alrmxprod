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

// ── Direction signal ───────────────────────────────────────────────────────

function directionSignal(ti: PlantAssessmentData['trackingImprovement']): { arrow: string; color: string } | null {
  if (!ti) return null
  const delta = ti.turnaroundDelta
  if (delta < -5)  return { arrow: '↑', color: '#1a6644' }
  if (delta > 5)   return { arrow: '↓', color: '#cc3333' }
  return               { arrow: '→', color: 'var(--gray-400)' }
}

// ── PlantCard ──────────────────────────────────────────────────────────────

function PlantCard({ plant }: { plant: PlantCardData }) {
  const a = plant.assessment
  const href = plant.assessmentHref ?? (a ? `/dashboard/assess/${a.id}` : undefined)

  const borderColor = urgencyBorder(a?.overall ?? null)
  const bnKey       = a?.bottleneck ?? null
  const bnLabel     = bnKey ? (BOTTLENECK_LABELS[bnKey] ?? bnKey) : null
  const rootCause   = rootCauseLine(bnKey, a?.kpi ?? null)

  const actionCfg   = a?.primaryActionStatus ? ACTION_STATUS_CFG[a.primaryActionStatus] : null
  const direction   = directionSignal(a?.trackingImprovement ?? null)

  const card = (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: '12px',
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
      transition: 'box-shadow .15s',
    }}
      className="plant-card"
    >
      {/* Row 1: name + gap */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '4px' }}>
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
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '1px' }}>/ month</div>
          </div>
        ) : null}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

      {/* Row 2: bottleneck + root cause */}
      {!a || a.overall === null ? (
        <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
          {a ? 'Assessment in progress' : 'No assessment yet'}
        </div>
      ) : bnLabel ? (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ marginBottom: '5px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-800)' }}>
              {bnLabel} bottleneck
            </span>
          </div>
          {rootCause && (
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', lineHeight: 1.4 }}>
              {rootCause}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
          No bottleneck identified
        </div>
      )}

      {/* Row 3: action status + direction + view link */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {actionCfg && (
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
              background: actionCfg.bg, color: actionCfg.color,
              border: `1px solid ${actionCfg.border}`,
            }}>
              {actionCfg.label}
            </span>
          )}
          {direction && (
            <span style={{ fontSize: '13px', fontWeight: 700, color: direction.color }}>
              {direction.arrow}
            </span>
          )}
        </div>
        {href ? (
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green)', whiteSpace: 'nowrap' }}>
            View report →
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--gray-300)' }}>Pending</span>
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
            <PlantCard key={plant.id} plant={plant} />
          ))}
        </div>
      )}

      <style>{`
        .plant-card:hover { box-shadow: 0 2px 12px rgba(15,110,86,0.08); }
      `}</style>
    </div>
  )
}
