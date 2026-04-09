'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useIsMobile } from '@/hooks/useIsMobile'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlantAssessmentData {
  id: string
  phase: string
  overall: number | null
  scores: {
    prod: number | null
    dispatch: number | null
    logistics: number | null   // field name used by CalcResult (also stored as 'fleet' in older rows)
    fleet: number | null       // fallback
    quality: number | null
  } | null
  bottleneck: string | null
  constraintDetail?: string | null
  ebitda_monthly: number | null
  report_released: boolean
  trackingWeek: number | null
  recoveredMonthly?: number | null
  trackingImprovement?: {
    turnaroundDelta: number
    dispatchDelta: number
    weekOf: number
    weekTotal: number
  } | null
  kpi?: Record<string, number | null> | null
  primaryActionStatus?: 'todo' | 'in_progress' | 'done' | null
  topAction?: string | null
}

export interface PlantCardData {
  id: string
  name: string
  country: string
  assessment: PlantAssessmentData | null
  assessmentHref?: string   // override link (used by demo to point all cards to /demo)
}

type SortKey = 'risk' | 'gap' | 'name'

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreColor(s: number | null): string {
  if (s === null) return 'var(--gray-300)'
  if (s >= 80) return 'var(--phase-complete)'
  if (s >= 60) return '#d97706'
  return 'var(--red)'
}

function scoreBg(s: number | null): string {
  if (s === null) return 'var(--gray-50)'
  if (s >= 80) return 'var(--phase-complete-bg)'
  if (s >= 60) return '#fffaf2'
  return 'var(--error-bg)'
}

function fmt(n: number | null): string {
  if (!n) return '-'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k'
  return '$' + Math.round(n)
}

// ── TrackBar ───────────────────────────────────────────────────────────────

function TrackBar({ week, total }: { week: number; total: number }) {
  const pct = Math.min(1, week / total)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '4px', background: 'var(--gray-100)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: 'var(--phase-complete)', borderRadius: '2px', transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--gray-400)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
        Wk {week}/{total}
      </span>
    </div>
  )
}

// ── PhaseBadge ─────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    workshop:          { label: 'Workshop',       bg: 'var(--phase-workshop-bg)',  color: 'var(--phase-workshop)' },
    workshop_complete: { label: 'Pre-assessment', bg: 'var(--phase-workshop-bg)',  color: 'var(--phase-workshop)' },
    onsite:            { label: 'On-site',        bg: 'var(--phase-onsite-bg)',    color: 'var(--phase-onsite)' },
    complete:          { label: 'Complete',       bg: 'var(--phase-complete-bg)', color: 'var(--phase-complete)' },
  }
  const c = cfg[phase] || cfg.workshop
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 7px',
      borderRadius: '4px', background: c.bg, color: c.color,
    }}>
      {c.label}
    </span>
  )
}

// ── PlantCard ──────────────────────────────────────────────────────────────

function PlantCard({ plant, isMobile }: { plant: PlantCardData; isMobile: boolean }) {
  const [hovered, setHovered] = useState(false)
  const a = plant.assessment

  // Compute href: override → explicit assessment link
  const href = plant.assessmentHref
    ?? (a ? `/dashboard/assess/${a.id}` : undefined)

  const cardStyle: React.CSSProperties = {
    background: 'var(--white)',
    border: `1px solid ${hovered && href ? 'var(--green)' : 'var(--border)'}`,
    borderRadius: '12px',
    padding: isMobile ? '14px 16px' : '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    boxShadow: hovered && href ? '0 2px 12px rgba(15,110,86,0.09)' : 'none',
    transition: 'border-color .15s, box-shadow .15s',
    cursor: href ? 'pointer' : 'default',
    textDecoration: 'none',
    color: 'inherit',
  }

  const imp = a?.trackingImprovement ?? null
  const isImproving = imp && ((imp.turnaroundDelta ?? 0) > 0 || (imp.dispatchDelta ?? 0) > 0)

  const inner = (
    <div
      style={cardStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header: name · country · score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ fontSize: isMobile ? '13px' : '14px', fontWeight: 600, color: 'var(--gray-900)', lineHeight: 1.3, flex: 1 }}>
          {plant.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {isImproving && (
            <span style={{ fontSize: '12px', color: 'var(--phase-complete)', fontWeight: 700 }}>↑ Improving</span>
          )}
          <span style={{ fontSize: '10px', color: 'var(--gray-400)', fontFamily: 'var(--mono)', background: 'var(--gray-50)', padding: '2px 6px', borderRadius: '4px' }}>
            {plant.country}
          </span>
        </div>
      </div>

      {/* Body */}
      {!a || (a.overall === null && a.ebitda_monthly === null) ? (
        <div style={{ padding: '10px 0' }}>
          <PhaseBadge phase={a?.phase || 'workshop'} />
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '8px' }}>
            {a ? 'Assessment in progress, data being collected' : 'No assessment yet'}
          </div>
        </div>
      ) : (
        <>
          {/* Financial hero, no box, just the number */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{
              fontSize: isMobile ? '28px' : '32px', fontWeight: 800,
              fontFamily: 'var(--mono)', lineHeight: 1,
              color: a.ebitda_monthly ? 'var(--red)' : 'var(--gray-300)',
            }}>
              {fmt(a.ebitda_monthly)}
            </span>
            {a.ebitda_monthly
              ? <span style={{ fontSize: '12px', color: '#e06060', fontWeight: 500 }}>/mo revenue at risk</span>
              : <span style={{ fontSize: '12px', color: 'var(--gray-300)' }}>no gap identified</span>
            }
          </div>

          {/* Constraint chip */}
          {a.bottleneck && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '2px 7px',
                borderRadius: '4px', background: 'var(--error-bg)', color: 'var(--red)', flexShrink: 0,
              }}>
                ⚡ {a.bottleneck === 'Fleet' ? 'logistics' : a.bottleneck.toLowerCase()}
              </span>
              {a.constraintDetail && (
                <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{a.constraintDetail}</span>
              )}
            </div>
          )}

          {/* KPI row */}
          {a.kpi && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {a.kpi.dispatchMin != null && (
                <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: (a.kpi.dispatchMin ?? 0) > 25 ? 'var(--red)' : 'var(--gray-700)' }}>{a.kpi.dispatchMin} min</span> dispatch
                </div>
              )}
              {a.kpi.turnaroundMin != null && (
                <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: (a.kpi.turnaroundMin ?? 0) > 100 ? 'var(--red)' : 'var(--gray-700)' }}>{a.kpi.turnaroundMin} min</span> turnaround
                </div>
              )}
              {a.kpi.utilPct != null && (
                <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: (a.kpi.utilPct ?? 0) < 70 ? 'var(--red)' : 'var(--gray-700)' }}>{a.kpi.utilPct}%</span> utilization
                </div>
              )}
              {a.kpi.rejectPct != null && (
                <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: (a.kpi.rejectPct ?? 0) > 3 ? 'var(--red)' : 'var(--gray-700)' }}>{a.kpi.rejectPct}%</span> rejection
                </div>
              )}
            </div>
          )}

          {/* Tracking, bar + improvement on one line */}
          {a.trackingWeek !== null && a.trackingWeek > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <TrackBar week={a.trackingWeek} total={imp?.weekTotal ?? 12} />
              {imp && (imp.turnaroundDelta || imp.dispatchDelta) && (
                <div style={{ fontSize: '11px', color: 'var(--phase-complete)', display: 'flex', gap: '8px' }}>
                  {imp.turnaroundDelta ? <span>▼{imp.turnaroundDelta} min turnaround</span> : null}
                  {imp.dispatchDelta   ? <span>▼{imp.dispatchDelta} min dispatch</span>   : null}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginTop: 'auto', paddingTop: '2px' }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <PhaseBadge phase={a.phase} />
              {a.report_released && (
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
                  background: 'var(--phase-complete-bg)', color: 'var(--phase-complete)',
                }}>
                  ✓ Report
                </span>
              )}
            </div>
            {href && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: hovered ? 'var(--green)' : 'var(--gray-400)', transition: 'color .15s' }}>
                View →
              </span>
            )}
          </div>
        </>
      )}

      {/* Pending footer */}
      {(!a || (a.overall === null && a.ebitda_monthly === null)) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '11px', color: 'var(--gray-300)' }}>Pending</span>
        </div>
      )}
    </div>
  )

  if (!href) return inner
  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      {inner}
    </Link>
  )
}

// ── DemoSizeToggle ─────────────────────────────────────────────────────────

const DEMO_SIZES: (1 | 3 | 10 | 20)[] = [1, 3, 10, 20]

export function DemoSizeToggle({ current, onChange, minValue = 1 }: {
  current: 1 | 3 | 10 | 20
  onChange?: (n: 1 | 3 | 10 | 20) => void
  minValue?: number
}) {
  const options = DEMO_SIZES.filter(n => n >= minValue)
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {options.map(n => (
        <button
          key={n}
          onClick={() => onChange?.(n)}
          style={{
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
            fontWeight: current === n ? 700 : 400,
            background: current === n ? '#0369a1' : 'transparent',
            color: current === n ? '#fff' : '#0369a1',
            border: `1px solid ${current === n ? '#0369a1' : '#7dd3fc'}`,
            fontFamily: 'var(--font)',
          }}
        >
          {n}
        </button>
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
  const [sort, setSort] = useState<SortKey>('risk')

  // ── Sort ──
  const sorted = useMemo(() => {
    return [...plants].sort((a, b) => {
      if (sort === 'risk') {
        return (b.assessment?.ebitda_monthly ?? 0) - (a.assessment?.ebitda_monthly ?? 0)
      }
      if (sort === 'gap') {
        return (b.assessment?.ebitda_monthly ?? 0) - (a.assessment?.ebitda_monthly ?? 0)
      }
      return a.name.localeCompare(b.name)
    })
  }, [plants, sort])

  // ── Summary stats ──
  const totalGap = plants.reduce((s, p) => s + (p.assessment?.ebitda_monthly ?? 0), 0)
  const totalRecovered = plants.reduce((s, p) => s + (p.assessment?.recoveredMonthly ?? 0), 0)
  const atRisk = plants.filter(p => {
    const gap = p.assessment?.ebitda_monthly
    return gap !== null && gap !== undefined && gap > 50000
  }).length

  const SORT_OPTS: { key: SortKey; label: string }[] = [
    { key: 'risk', label: 'Risk first' },
    { key: 'gap',  label: 'Biggest gap' },
    { key: 'name', label: 'A–Z' },
  ]

  return (
    <div style={{
      padding: isMobile ? '16px 14px' : '28px 32px',
      maxWidth: '1100px', margin: '0 auto',
    }}>

      {/* Demo banner */}
      {isDemo && (
        <div style={{
          background: '#f0f9ff', border: '1px solid #bae6fd',
          borderRadius: '8px', padding: '10px 16px', marginBottom: '20px',
          fontSize: '12px', color: '#0369a1',
          display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ flexShrink: 0 }}>🎯</span>
            <span>
              Demo, Al-Noor RMX Group · {plants.length} plant{plants.length !== 1 ? 's' : ''} across Saudi Arabia.
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
          {plants.length} plant{plants.length !== 1 ? 's' : ''} · Performance overview
        </p>
      </div>

      {/* Summary chips */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '10px', marginBottom: '20px',
      }}>
        {/* Total gap chip, visually dominant */}
        <div style={{
          background: totalGap > 0 ? '#fff3f3' : 'var(--white)',
          border: `1px solid ${totalGap > 0 ? '#fcc' : 'var(--border)'}`,
          borderRadius: '10px', padding: isMobile ? '12px 14px' : '14px 18px',
        }}>
          <div style={{ fontSize: '10px', color: totalGap > 0 ? '#e06060' : 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px', fontWeight: 600 }}>
            Total gap
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: isMobile ? '24px' : '30px', fontWeight: 800, fontFamily: 'var(--mono)', color: totalGap > 0 ? 'var(--red)' : 'var(--gray-300)', lineHeight: 1 }}>
              {totalGap > 0 ? fmt(totalGap) : '-'}
            </span>
            {totalGap > 0 && <span style={{ fontSize: '13px', color: '#e06060', fontWeight: 500 }}>/mo</span>}
          </div>
        </div>

        {/* Recovered chip */}
        <div style={{
          background: totalRecovered > 0 ? 'var(--phase-complete-bg)' : 'var(--white)',
          border: `1px solid ${totalRecovered > 0 ? 'var(--phase-complete)' : 'var(--border)'}`,
          borderRadius: '10px', padding: isMobile ? '12px 14px' : '14px 18px',
        }}>
          <div style={{ fontSize: '10px', color: totalRecovered > 0 ? 'var(--phase-complete)' : 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px', fontWeight: 600 }}>
            Recovered
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px' }}>
            <span style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 800, fontFamily: 'var(--mono)', color: totalRecovered > 0 ? 'var(--phase-complete)' : 'var(--gray-300)', lineHeight: 1 }}>
              {totalRecovered > 0 ? fmt(totalRecovered) : '-'}
            </span>
            {totalRecovered > 0 && <span style={{ fontSize: '12px', color: 'var(--phase-complete)', fontWeight: 500 }}>/mo</span>}
          </div>
        </div>

        {/* Primary bottleneck chip */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '10px', padding: isMobile ? '12px 14px' : '14px 18px' }}>
          <div style={{ fontSize: '10px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '5px', fontWeight: 600 }}>Primary bottleneck</div>
          {(() => {
            const bottlenecks = plants.map(p => p.assessment?.bottleneck).filter(Boolean)
            const most = bottlenecks.length > 0 ? bottlenecks.sort((a, b) =>
              bottlenecks.filter(v => v === b).length - bottlenecks.filter(v => v === a).length
            )[0] : null
            return <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 700, color: most ? '#c96a00' : 'var(--gray-300)', lineHeight: 1 }}>
              {most ? (most === 'Fleet' ? 'Logistics' : most) : '-'}
            </div>
          })()}
        </div>

        {/* At-risk chip */}
        <div style={{
          background: atRisk > 0 ? '#fff8ed' : 'var(--white)',
          border: `1px solid ${atRisk > 0 ? '#f5c842' : 'var(--border)'}`,
          borderRadius: '10px', padding: isMobile ? '12px 14px' : '14px 18px',
        }}>
          <div style={{ fontSize: '10px', color: atRisk > 0 ? '#b07a00' : 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '5px', fontWeight: 600 }}>
            Alerts
          </div>
          {atRisk > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: isMobile ? '24px' : '30px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#c07000', lineHeight: 1 }}>{atRisk}</span>
              <span style={{ fontSize: '11px', color: '#b07a00', fontWeight: 500, lineHeight: 1.3 }}>plant{atRisk !== 1 ? 's' : ''}<br />need action</span>
            </div>
          ) : (
            <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--phase-complete)', lineHeight: 1 }}>✓ None</div>
          )}
        </div>
      </div>

      {/* At-risk alert */}
      {atRisk > 0 && (
        <div style={{
          background: 'var(--error-bg)', border: '1px solid var(--error-border)',
          borderRadius: '8px', padding: '10px 16px', marginBottom: '20px',
          fontSize: '13px', color: 'var(--red)',
          display: 'flex', gap: '8px', alignItems: 'center',
        }}>
          <span>⚠</span>
          <span>
            <strong>{atRisk} plant{atRisk !== 1 ? 's' : ''}</strong> with significant revenue at risk.
            Prioritise these first. Click to see the full diagnosis.
          </span>
        </div>
      )}

      {/* Sort controls */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '20px',
        flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--gray-400)', marginRight: '2px' }}>
          Sort:
        </span>
        {SORT_OPTS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSort(opt.key)}
            type="button"
            style={{
              padding: '5px 12px', borderRadius: '20px',
              fontSize: '11px', fontWeight: 500,
              border: `1px solid ${sort === opt.key ? 'var(--green)' : 'var(--border)'}`,
              background: sort === opt.key ? 'var(--green-light)' : 'var(--white)',
              color: sort === opt.key ? 'var(--green)' : 'var(--gray-500)',
              cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all .1s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Cards grid */}
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? '1fr'
            : 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: isMobile ? '10px' : '14px',
          alignItems: 'start',
        }}>
          {sorted.map(plant => (
            <PlantCard key={plant.id} plant={plant} isMobile={isMobile} />
          ))}
        </div>
      )}
    </div>
  )
}
