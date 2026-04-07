'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { PlantCardData } from '@/components/plants/PlantOverviewView'
import { DemoSizeToggle } from '@/components/plants/PlantOverviewView'
import { useIsMobile } from '@/hooks/useIsMobile'

// ── Types ──────────────────────────────────────────────────────────────────

type SortCol = 'dispatch' | 'turnaround' | 'util' | 'quality' | 'atRisk'

interface Dim {
  key:           SortCol
  label:         string
  kpiKey:        'dispatchMin' | 'turnaroundMin' | 'utilPct' | 'rejectPct'
  unit:          string
  lowerIsBetter: boolean
}

const DIMS: Dim[] = [
  { key: 'dispatch',   label: 'Dispatch',    kpiKey: 'dispatchMin',   unit: 'min', lowerIsBetter: true  },
  { key: 'turnaround', label: 'Turnaround',  kpiKey: 'turnaroundMin', unit: 'min', lowerIsBetter: true  },
  { key: 'util',       label: 'Utilization', kpiKey: 'utilPct',       unit: '%',   lowerIsBetter: false },
  { key: 'quality',    label: 'Quality',     kpiKey: 'rejectPct',     unit: '%',   lowerIsBetter: true  },
]

const ACTION_CFG = {
  todo:        { label: 'No actions',  bg: '#fff3f3', color: '#cc3333', border: '#fcc' },
  in_progress: { label: 'In progress', bg: '#fff8ed', color: '#c96a00', border: '#f5cba0' },
  done:        { label: 'Done',        bg: '#f0faf5', color: '#1a6644', border: '#b6e2ce' },
} as const

// ── Helpers ────────────────────────────────────────────────────────────────

function getKpi(plant: PlantCardData, key: string): number | null {
  return (plant.assessment?.kpi as Record<string, number | null> | null | undefined)?.[key] ?? null
}

// Gap relative to portfolio best. 0 = IS the best, positive = worse.
function relGap(val: number, best: number, lowerIsBetter: boolean): number {
  return lowerIsBetter ? (val - best) / best : (best - val) / best
}

function kpiColor(gap: number): string {
  if (gap <= 0.05) return '#1a6644'
  if (gap <= 0.25) return '#c96a00'
  return '#cc3333'
}

function kpiBg(gap: number): string {
  if (gap <= 0.05) return 'transparent'
  if (gap <= 0.25) return '#fff8ed'
  return '#fff3f3'
}

function fmtVal(val: number, unit: string): string {
  return unit === '%' ? `${val.toFixed(1)}%` : `${Math.round(val)} min`
}

function fmtGapLabel(val: number, best: number, unit: string): string {
  const diff = Math.abs(val - best)
  return unit === '%' ? `+${diff.toFixed(1)}pp` : `+${Math.round(diff)} min`
}

function fmtMoney(n: number | null): string {
  if (!n || n <= 0) return '—'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  return '$' + Math.round(n / 1_000) + 'k'
}

function thStyle(sortable = false, active = false): React.CSSProperties {
  return {
    padding: '10px 16px',
    fontSize: '11px',
    fontWeight: 500,
    color: active ? 'var(--green)' : 'var(--gray-500)',
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: '.4px',
    cursor: sortable ? 'pointer' : 'default',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    transition: 'color .1s',
  }
}

// ── CompareView ────────────────────────────────────────────────────────────

export default function CompareView({
  plants,
  isDemo,
  demoPlantCount,
  onDemoPlantCountChange,
}: {
  plants: PlantCardData[]
  isDemo?: boolean
  demoPlantCount?: 1 | 3 | 10 | 20
  onDemoPlantCountChange?: (n: 1 | 3 | 10 | 20) => void
}) {
  const [sortCol, setSortCol] = useState<SortCol>('atRisk')
  const isMobile = useIsMobile()

  const scored = useMemo(
    () => plants.filter(p => p.assessment?.overall != null),
    [plants]
  )

  // Best performer per dimension
  const bests = useMemo(() => {
    const result: Record<string, { name: string; value: number }> = {}
    for (const dim of DIMS) {
      const pts = scored
        .map(p => ({ name: p.name, value: getKpi(p, dim.kpiKey) }))
        .filter((x): x is { name: string; value: number } => x.value != null)
      if (pts.length < 1) continue
      result[dim.key] = [...pts].sort((a, b) =>
        dim.lowerIsBetter ? a.value - b.value : b.value - a.value
      )[0]
    }
    return result
  }, [scored])

  function getSortGap(p: PlantCardData): number {
    if (sortCol === 'atRisk') return -(p.assessment?.ebitda_monthly ?? 0)
    const dim = DIMS.find(d => d.key === sortCol)
    if (!dim) return 0
    const val = getKpi(p, dim.kpiKey)
    if (val == null) return Infinity
    const best = bests[dim.key]
    if (!best) return 0
    return relGap(val, best.value, dim.lowerIsBetter)
  }

  // Best first → worst → 2nd worst → ... → 2nd best
  const sorted = useMemo(() => {
    const ranked = [...scored].sort((a, b) => getSortGap(a) - getSortGap(b))
    if (ranked.length <= 1) return ranked
    return [ranked[0], ...ranked.slice(1).reverse()]
  }, [scored, sortCol, bests])

  // Summary stats
  const totalGap = scored.reduce((s, p) => s + (p.assessment?.ebitda_monthly ?? 0), 0)

  const primaryBottleneck = useMemo(() => {
    let maxCount = 0
    let primary = DIMS[0]
    for (const dim of DIMS) {
      const best = bests[dim.key]
      if (!best) continue
      const count = scored.filter(p => {
        const v = getKpi(p, dim.kpiKey)
        return v != null && relGap(v, best.value, dim.lowerIsBetter) > 0.25
      }).length
      if (count > maxCount) { maxCount = count; primary = dim }
    }
    return primary
  }, [scored, bests])

  const improvingCount = scored.filter(
    p => (p.assessment?.trackingImprovement?.turnaroundDelta ?? 0) < -3
  ).length

  const urgentPlants = scored.filter(p => {
    const a = p.assessment
    return (a?.ebitda_monthly ?? 0) > 0 &&
      (a?.primaryActionStatus === 'todo' || !a?.primaryActionStatus)
  })
  const urgentGap = urgentPlants.reduce((s, p) => s + (p.assessment?.ebitda_monthly ?? 0), 0)

  // ── Empty state ───────────────────────────────────────────────────────────

  if (scored.length < 2) {
    return (
      <div style={{
        padding: '60px 32px', textAlign: 'center',
        color: 'var(--gray-500)', maxWidth: '480px', margin: '0 auto',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '8px' }}>
          Comparison available with 2+ assessed plants
        </div>
        <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
          Complete at least two plant assessments to see cross-plant performance benchmarks.
        </div>
      </div>
    )
  }

  // ── Main view ──────────────────────────────────────────────────────────────

  return (
    <div style={{
      padding: isMobile ? '16px 14px' : '28px 32px',
      maxWidth: '1100px', margin: '0 auto',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '18px' : '22px', fontWeight: 700,
            color: 'var(--gray-900)', marginBottom: '3px',
          }}>
            Portfolio Comparison
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            {scored.length} plants — click any column header to sort
          </p>
        </div>
        {isDemo && onDemoPlantCountChange && (
          <DemoSizeToggle current={demoPlantCount ?? 3} onChange={onDemoPlantCountChange} />
        )}
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{
          background: '#fff8ed', border: '1px solid #f5cba0',
          borderRadius: '10px', padding: '14px 20px', flex: '1', minWidth: '140px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#c96a00', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '5px' }}>
            Total recoverable
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: isMobile ? '22px' : '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#c96a00', lineHeight: 1 }}>
              {fmtMoney(totalGap)}
            </span>
            <span style={{ fontSize: '12px', color: '#c96a00', fontWeight: 500 }}>/month</span>
          </div>
        </div>

        <div style={{
          background: 'var(--gray-50)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '14px 20px', flex: '1', minWidth: '140px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '5px' }}>
            Primary bottleneck
          </div>
          <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: 800, color: '#c96a00', lineHeight: 1.2, paddingTop: '2px' }}>
            {primaryBottleneck.label}
          </div>
        </div>

        <div style={{
          background: 'var(--gray-50)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '14px 20px', flex: '1', minWidth: '140px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '5px' }}>
            Plants improving
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{
              fontSize: isMobile ? '22px' : '26px', fontWeight: 800,
              fontFamily: 'var(--mono)', lineHeight: 1,
              color: improvingCount > 0 ? '#1a6644' : 'var(--gray-400)',
            }}>
              {improvingCount}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--gray-400)' }}>of {scored.length}</span>
          </div>
        </div>
      </div>

      {/* Urgency banner */}
      {urgentPlants.length > 0 && urgentGap > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '10px',
          background: '#fff8ed', border: '1px solid #f5cba0',
          borderLeft: '4px solid #c96a00',
          borderRadius: '8px', padding: '12px 16px',
          marginBottom: '20px',
        }}>
          <span style={{ color: '#c96a00', flexShrink: 0, lineHeight: 1.5 }}>⚠</span>
          <span style={{ fontSize: '13px', color: '#7a3e00' }}>
            <strong>{fmtMoney(urgentGap)}/month at risk</strong>
            {' '}across {urgentPlants.length} plant{urgentPlants.length > 1 ? 's' : ''}. No active improvement actions.
          </span>
        </div>
      )}

      {/* Sort info */}
      <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '8px' }}>
        Sorted by:{' '}
        <strong style={{ color: 'var(--gray-600)' }}>
          {sortCol === 'atRisk' ? 'Monthly gap' : DIMS.find(d => d.key === sortCol)?.label}
        </strong>
        {' '}— best plant first
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '16px',
      }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle()}>Plant</th>
                {DIMS.map(dim => (
                  <th
                    key={dim.key}
                    onClick={() => setSortCol(dim.key)}
                    style={thStyle(true, sortCol === dim.key)}
                  >
                    {dim.label}
                    {sortCol === dim.key && <span style={{ marginLeft: '4px' }}>↑</span>}
                  </th>
                ))}
                <th onClick={() => setSortCol('atRisk')} style={thStyle(true, sortCol === 'atRisk')}>
                  At risk /mo
                  {sortCol === 'atRisk' && <span style={{ marginLeft: '4px' }}>↑</span>}
                </th>
                <th style={thStyle()}>Actions</th>
                <th style={thStyle()}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((plant, i) => {
                const a = plant.assessment!
                const isBest = i === 0
                const href = `/dashboard/assess/${a.id}`
                const actionCfg = a.primaryActionStatus ? ACTION_CFG[a.primaryActionStatus] : null

                return (
                  <tr
                    key={plant.id}
                    style={{
                      borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isBest ? '#f6fdf9' : 'var(--white)',
                      transition: 'background .1s',
                    }}
                    className="compare-row"
                  >
                    {/* Plant name */}
                    <td style={{ padding: '14px 16px', minWidth: '160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)' }}>
                          {plant.name}
                        </span>
                        {isBest && (
                          <span style={{
                            fontSize: '9px', fontWeight: 700, padding: '2px 6px',
                            borderRadius: '4px', background: '#dcfce7', color: '#1a6644',
                            border: '1px solid #bbf7d0', letterSpacing: '.04em',
                            textTransform: 'uppercase',
                          }}>
                            Best
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{plant.country}</div>
                    </td>

                    {/* KPI columns */}
                    {DIMS.map(dim => {
                      const val = getKpi(plant, dim.kpiKey)
                      const best = bests[dim.key]
                      if (val == null || !best) {
                        return (
                          <td key={dim.key} style={{ padding: '14px 16px', color: 'var(--gray-300)', fontSize: '13px' }}>
                            —
                          </td>
                        )
                      }
                      const gap      = relGap(val, best.value, dim.lowerIsBetter)
                      const color    = kpiColor(gap)
                      const bg       = isBest ? 'transparent' : kpiBg(gap)
                      const isBestDim = best.name === plant.name

                      return (
                        <td key={dim.key} style={{ padding: '10px 16px' }}>
                          <div style={{
                            display: 'inline-block',
                            background: bg, borderRadius: '6px',
                            padding: bg !== 'transparent' ? '5px 9px' : '5px 0',
                          }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)', color, lineHeight: 1 }}>
                              {fmtVal(val, dim.unit)}
                            </div>
                            <div style={{ fontSize: '10px', marginTop: '2px', fontWeight: 500 }}>
                              {isBestDim ? (
                                <span style={{ color: '#1a6644' }}>portfolio best</span>
                              ) : gap > 0.02 ? (
                                <span style={{ color }}>{fmtGapLabel(val, best.value, dim.unit)} vs best</span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      )
                    })}

                    {/* At risk */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        fontSize: '15px', fontWeight: 700, fontFamily: 'var(--mono)',
                        color: (a.ebitda_monthly ?? 0) > 0 ? '#cc3333' : '#1a6644',
                      }}>
                        {fmtMoney(a.ebitda_monthly)}
                      </span>
                    </td>

                    {/* Action status */}
                    <td style={{ padding: '14px 16px' }}>
                      {actionCfg ? (
                        <span style={{
                          fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px',
                          background: actionCfg.bg, color: actionCfg.color,
                          border: `1px solid ${actionCfg.border}`, whiteSpace: 'nowrap',
                        }}>
                          {actionCfg.label}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--gray-300)', fontSize: '12px' }}>—</span>
                      )}
                    </td>

                    {/* View link */}
                    <td style={{ padding: '14px 16px' }}>
                      <Link href={href} style={{
                        fontSize: '12px', fontWeight: 600, color: 'var(--green)',
                        textDecoration: 'none', whiteSpace: 'nowrap',
                      }}>
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .compare-row:hover { background: var(--gray-50) !important; }
      `}</style>
    </div>
  )
}
