'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import type { PlantCardData } from '@/components/plants/PlantOverviewView'
import { DemoSizeToggle } from '@/components/plants/PlantOverviewView'
import { useIsMobile } from '@/hooks/useIsMobile'
import { createClient } from '@/lib/supabase/client'

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

// ── Dimension mapping: DIMS key → action_items.dimension ──────────────────

const DIM_TO_ACTION_DIM: Record<string, string> = {
  dispatch:   'Dispatch',
  turnaround: 'Fleet',
  util:       'Fleet',
  quality:    'Quality',
}

// ── Slide-in action panel ──────────────────────────────────────────────────

interface PanelAction { id: string; text: string; status: string; dimension: string | null }

interface PanelState {
  assessmentId: string
  plantName:    string
  plantHref:    string
  dimension:    string       // action_items dimension value e.g. 'Dispatch'
  dimLabel:     string       // display label e.g. 'Dispatch'
  kpiVal:       number
  unit:         string
  peerReview?:  { bestPlant: string; bestVal: string; currentVal: string }
}

const DEMO_PANEL_ACTIONS: Record<string, PanelAction[]> = {
  Dispatch: [
    { id: 'd1', text: 'Assign a dedicated dispatcher for peak hours', status: 'todo', dimension: 'Dispatch' },
    { id: 'd2', text: 'Implement order-to-dispatch SOP — target 15 min', status: 'in_progress', dimension: 'Dispatch' },
    { id: 'd3', text: 'Lock dispatch slots during peak concrete demand hours', status: 'todo', dimension: 'Dispatch' },
  ],
  Fleet: [
    { id: 'f1', text: 'Implement zone routing — split delivery area into 4 quadrants', status: 'in_progress', dimension: 'Fleet' },
    { id: 'f2', text: 'Enforce demurrage clause with top 3 contractors', status: 'done', dimension: 'Fleet' },
    { id: 'f3', text: 'Reduce fleet idle time at plant — pre-load 2 trucks before shift start', status: 'todo', dimension: 'Fleet' },
  ],
  Quality: [
    { id: 'q1', text: 'Add retarder protocol for loads dispatched after 09:00 in summer', status: 'todo', dimension: 'Quality' },
    { id: 'q2', text: 'Log rejection reasons per truck — identify top 3 causes', status: 'todo', dimension: 'Quality' },
  ],
  Production: [
    { id: 'p1', text: 'Map monthly volume by strength class: C20, C25, C30, C35+', status: 'todo', dimension: 'Production' },
  ],
}

const STATUS_CFG = {
  todo:        { label: 'To do',       bg: '#fff3f3', color: '#cc3333', border: '#fcc' },
  in_progress: { label: 'In progress', bg: '#fff8ed', color: '#c96a00', border: '#f5cba0' },
  done:        { label: 'Done',        bg: '#f0faf5', color: '#1a6644', border: '#b6e2ce' },
} as const

function ActionPanel({ panel, isDemo, onClose }: { panel: PanelState; isDemo?: boolean; onClose: () => void }) {
  const supabase = createClient()
  const [actions, setActions] = useState<PanelAction[]>([])
  const [peerAction, setPeerAction] = useState<PanelAction | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isDemo) {
      if (panel.peerReview) {
        setPeerAction({
          id: 'demo-peer',
          text: `Schedule a process review with ${panel.peerReview.bestPlant} — they run ${panel.peerReview.bestVal} ${panel.dimLabel.toLowerCase()} vs your ${panel.peerReview.currentVal}. Ask what changed.`,
          status: 'todo',
          dimension: panel.dimension,
        })
      }
      setActions(DEMO_PANEL_ACTIONS[panel.dimension] ?? [])
      setLoading(false)
      return
    }

    async function load() {
      // Fetch regular actions (exclude peer_review source)
      const { data: regularData } = await supabase
        .from('action_items')
        .select('id, text, status, dimension')
        .eq('assessment_id', panel.assessmentId)
        .eq('dimension', panel.dimension)
        .neq('source', 'peer_review')
        .order('created_at', { ascending: true })
      setActions((regularData ?? []) as PanelAction[])

      // Handle peer review action if there's a qualifying gap
      if (panel.peerReview) {
        const newText = `Schedule a process review with ${panel.peerReview.bestPlant} — they run ${panel.peerReview.bestVal} ${panel.dimLabel.toLowerCase()} vs your ${panel.peerReview.currentVal}. Ask what changed.`

        const { data: existing } = await supabase
          .from('action_items')
          .select('id, text, status, dimension, value')
          .eq('assessment_id', panel.assessmentId)
          .eq('dimension', panel.dimension)
          .eq('source', 'peer_review')
          .maybeSingle()

        if (!existing) {
          // Insert for the first time
          const { data: inserted } = await supabase
            .from('action_items')
            .insert({
              assessment_id: panel.assessmentId,
              dimension:     panel.dimension,
              text:          newText,
              status:        'todo',
              source:        'peer_review',
              value:         panel.peerReview.bestPlant,
              checklist:     [],
            })
            .select('id, text, status, dimension')
            .single()
          if (inserted) setPeerAction(inserted as PanelAction)
        } else {
          // Update text if best plant has changed (value stores best plant name)
          if (existing.value !== panel.peerReview.bestPlant) {
            await supabase
              .from('action_items')
              .update({ text: newText, value: panel.peerReview.bestPlant })
              .eq('id', existing.id)
          }
          // Always show live text, preserve DB status
          setPeerAction({ id: existing.id, text: newText, status: existing.status, dimension: existing.dimension })
        }
      }

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.assessmentId, panel.dimension])

  const kpiDisplay = panel.unit === '%'
    ? `${panel.kpiVal.toFixed(1)}%`
    : `${Math.round(panel.kpiVal)} min`

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)',
          zIndex: 200, cursor: 'pointer',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '340px',
        background: 'var(--white)', borderLeft: '1px solid var(--border)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '3px' }}>
                {panel.plantName}
              </div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--gray-900)' }}>
                {panel.dimLabel}
              </div>
              <div style={{ fontSize: '12px', color: '#cc3333', fontWeight: 600, marginTop: '3px', fontFamily: 'var(--mono)' }}>
                {kpiDisplay} — needs improvement
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--gray-400)', fontSize: '18px', padding: '2px 4px',
                lineHeight: 1, flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Actions list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '12px' }}>
            Actions
          </div>

          {loading ? (
            <div style={{ fontSize: '13px', color: 'var(--gray-400)', padding: '20px 0' }}>Loading…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {actions.length === 0 && !peerAction && (
                <div style={{ fontSize: '13px', color: 'var(--gray-400)', lineHeight: 1.6, padding: '4px 0' }}>
                  No {panel.dimLabel.toLowerCase()} actions yet.{' '}
                  <Link href={panel.plantHref} style={{ color: 'var(--green)', fontWeight: 500, textDecoration: 'none' }}>
                    Open report →
                  </Link>
                </div>
              )}
              {/* Peer review always first */}
              {peerAction && (() => {
                const cfg = STATUS_CFG[peerAction.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.todo
                const done = peerAction.status === 'done'
                return (
                  <div key={peerAction.id} style={{
                    border: '1px solid var(--border)', borderRadius: '8px',
                    padding: '10px 12px', background: 'var(--white)',
                    opacity: done ? 0.6 : 1,
                  }}>
                    <div style={{
                      fontSize: '13px', color: 'var(--gray-800)', lineHeight: 1.4, marginBottom: '6px',
                      textDecoration: done ? 'line-through' : 'none',
                    }}>
                      {peerAction.text}
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
                      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })()}
              {/* Regular actions */}
              {actions.map(a => {
                const cfg = STATUS_CFG[a.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.todo
                return (
                  <div key={a.id} style={{
                    border: '1px solid var(--border)', borderRadius: '8px',
                    padding: '10px 12px', background: 'var(--white)',
                  }}>
                    <div style={{ fontSize: '13px', color: 'var(--gray-800)', lineHeight: 1.4, marginBottom: '6px' }}>
                      {a.text}
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
                      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <Link
            href={panel.plantHref}
            style={{
              display: 'block', textAlign: 'center',
              fontSize: '13px', fontWeight: 600, color: 'var(--green)',
              textDecoration: 'none', padding: '8px',
              border: '1px solid var(--success-border)', borderRadius: '7px',
              background: 'var(--success-bg)',
            }}
          >
            Open full report →
          </Link>
        </div>
      </div>
    </>
  )
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
  const [panel, setPanel] = useState<PanelState | null>(null)
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
          <DemoSizeToggle current={demoPlantCount ?? 3} onChange={onDemoPlantCountChange} minValue={3} />
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
                      const gap       = relGap(val, best.value, dim.lowerIsBetter)
                      const color     = kpiColor(gap)
                      const bg        = isBest ? 'transparent' : kpiBg(gap)
                      const isBestDim = best.name === plant.name
                      const clickable = !isBestDim && gap > 0.05

                      return (
                        <td key={dim.key} style={{ padding: '10px 16px' }}>
                          <div
                            onClick={clickable ? () => {
                              const hasPeer = best && gap > 0.15
                              setPanel({
                                assessmentId: a.id,
                                plantName:    plant.name,
                                plantHref:    href,
                                dimension:    DIM_TO_ACTION_DIM[dim.key],
                                dimLabel:     dim.label,
                                kpiVal:       val,
                                unit:         dim.unit,
                                peerReview: hasPeer ? {
                                  bestPlant:   best.name,
                                  bestVal:     fmtVal(best.value, dim.unit),
                                  currentVal:  fmtVal(val, dim.unit),
                                } : undefined,
                              })
                            } : undefined}
                            style={{
                              display: 'inline-block',
                              background: bg, borderRadius: '6px',
                              padding: bg !== 'transparent' ? '5px 9px' : '5px 0',
                              cursor: clickable ? 'pointer' : 'default',
                              transition: 'opacity .1s',
                            }}
                            title={clickable ? `See ${dim.label} actions for ${plant.name}` : undefined}
                          >
                            <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)', color, lineHeight: 1 }}>
                              {fmtVal(val, dim.unit)}
                              {clickable && <span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.7 }}>↗</span>}
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

      {panel && (
        <ActionPanel
          panel={panel}
          isDemo={isDemo}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  )
}
