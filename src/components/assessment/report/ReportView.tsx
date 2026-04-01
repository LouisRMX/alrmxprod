'use client'

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CalcResult, Answers, CalcOverrides } from '@/lib/calculations'
import { calcLossRange } from '@/lib/calculations'
import { buildIssues, getFinancialBottleneck } from '@/lib/issues'
import { benchmarkTag } from '@/lib/benchmarks'
import { stripMarkdown } from '@/lib/stripMarkdown'
import FindingCard from './FindingCard'
import ExportPDF from './ExportPDF'

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

// ── Inline info tooltip ────────────────────────────────────────────────────
function ReportInfoTip({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block', marginLeft: '6px' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '16px', height: '16px', borderRadius: '50%',
          border: '1px solid var(--gray-300)', background: 'var(--white)',
          fontSize: '9px', fontWeight: 600, color: 'var(--gray-400)',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          verticalAlign: 'middle',
        }}
      >i</button>
      {open && (
        <div style={{
          background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '8px',
          padding: '10px 12px', marginTop: '6px', fontSize: '11px', color: 'var(--gray-700)',
          lineHeight: 1.6, position: 'absolute', left: 0, top: '100%', zIndex: 100,
          width: '300px', boxShadow: '0 4px 16px rgba(0,0,0,.1)',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--gray-900)', marginBottom: '4px', fontSize: '11px' }}>{title}</div>
          <div>{text}</div>
        </div>
      )}
    </div>
  )
}

// ── Inline AI text section ─────────────────────────────────────────────────
function AISection({
  title, text, generating, onGenerate, onSave, minHeight = 80,
}: {
  title: string
  text: string
  generating: boolean
  onGenerate: () => void
  onSave: (text: string) => void
  minHeight?: number
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)

  // Keep draft in sync when text changes from outside (streaming)
  useEffect(() => { if (!editing) setDraft(text) }, [text, editing])

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)', margin: 0, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          {title}
        </h3>
        <div style={{ display: 'flex', gap: '6px' }}>
          {text && !editing && (
            <button
              type="button"
              onClick={() => { setDraft(text); setEditing(true) }}
              style={{
                padding: '4px 10px', border: '1px solid var(--gray-300)', borderRadius: '6px',
                fontSize: '11px', color: 'var(--gray-500)', background: 'var(--white)',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >Edit</button>
          )}
          {editing && (
            <button
              type="button"
              onClick={() => { onSave(draft); setEditing(false) }}
              style={{
                padding: '4px 10px', border: '1px solid var(--green-mid)', borderRadius: '6px',
                fontSize: '11px', color: 'var(--green)', background: 'var(--green-light)',
                cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
              }}
            >Save</button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            style={{
              padding: '4px 10px', border: 'none', borderRadius: '6px',
              fontSize: '11px', color: 'white',
              background: generating ? 'var(--gray-300)' : 'var(--green)',
              cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
            }}
          >
            {generating ? 'Generating…' : text ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Content */}
      {editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          style={{
            width: '100%', minHeight: `${minHeight + 60}px`, padding: '12px 14px',
            border: '1px solid var(--green-mid)', borderRadius: '8px',
            fontSize: '13px', fontFamily: 'var(--font)', color: 'var(--gray-900)',
            lineHeight: 1.7, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
        />
      ) : generating ? (
        <div style={{ fontSize: '13px', color: 'var(--gray-700)', lineHeight: 1.8, whiteSpace: 'pre-wrap', minHeight: `${minHeight}px` }}>
          {text}<span style={{ animation: 'blink 1s infinite', color: 'var(--green)' }}>▊</span>
        </div>
      ) : text ? (
        <div style={{ fontSize: '13px', color: 'var(--gray-700)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {text}
        </div>
      ) : (
        <div style={{
          padding: '20px', border: '1px dashed var(--gray-200)', borderRadius: '8px',
          textAlign: 'center', color: 'var(--gray-400)', fontSize: '12px', minHeight: `${minHeight}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          Click Generate to write this section with AI
        </div>
      )}
    </div>
  )
}

// ── Divider ────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ borderTop: '1px solid var(--gray-100)', margin: '24px 0' }} />
}

// ── KPI Pyramid helpers ────────────────────────────────────────────────────

interface KpiBoxProps {
  label: string
  value: string
  target: string
  isBottleneck: boolean
  isWarn: boolean
  size?: 'normal' | 'small'
  bar: ReactNode
  gap: string
  gapColor: string
  benchmark?: string
}

function KpiBox({ label, value, target, isBottleneck, isWarn, size = 'normal', bar, gap, gapColor, benchmark }: KpiBoxProps) {
  const bg = isBottleneck ? 'var(--error-bg)' : isWarn ? 'var(--warning-bg)' : 'var(--gray-100)'
  const border = isBottleneck ? 'var(--error-border)' : isWarn ? 'var(--warning-border)' : 'var(--border)'
  return (
    <div style={{ position: 'relative', background: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius)', padding: size === 'small' ? '10px 12px' : '12px 14px' }}>
      {isBottleneck && (
        <div style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '8px', fontWeight: 700, color: '#fff', background: 'var(--red)', borderRadius: '3px', padding: '2px 5px', letterSpacing: '.3px' }}>
          ▼ Bottleneck
        </div>
      )}
      <div style={{ fontSize: '9px', color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: size === 'small' ? '17px' : '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: gapColor, marginTop: '2px' }}>{value}</div>
      {target && <div style={{ fontSize: '9px', color: 'var(--gray-400)', marginTop: '1px' }}>{target}</div>}
      {bar && <div style={{ marginTop: '7px' }}>{bar}</div>}
      {gap && <div style={{ fontSize: '9px', fontWeight: 600, color: gapColor, marginTop: '3px' }}>{gap}</div>}
      {benchmark && <div style={{ fontSize: '8px', color: 'var(--gray-400)', marginTop: '5px', borderTop: '1px solid var(--border)', paddingTop: '4px', fontStyle: 'italic' }}>{benchmark}</div>}
    </div>
  )
}

// Bar: higher is better (utilisation, deliveries/truck)
function KpiBarHigher({ current, target, max, isBottleneck, isWarn }: { current: number; target: number; max: number; isBottleneck: boolean; isWarn: boolean }) {
  const fillPct = max > 0 ? Math.min((current / max) * 100, 100) : 0
  const targetPct = max > 0 ? Math.min((target / max) * 100, 100) : 85
  const color = isBottleneck ? '#ef4444' : isWarn ? '#f59e0b' : 'var(--green)'
  return (
    <div style={{ position: 'relative', height: '5px', background: 'var(--gray-200)', borderRadius: '3px' }}>
      <div style={{ position: 'absolute', height: '5px', width: `${fillPct}%`, background: color, borderRadius: '3px', opacity: 0.75 }} />
      <div style={{ position: 'absolute', top: '-2px', left: `${targetPct}%`, width: '2px', height: '9px', background: 'var(--gray-500)', transform: 'translateX(-50%)' }} />
    </div>
  )
}

// Bar: lower is better with two-tone overlay (good portion green, excess amber/red)
function KpiBarLowerOverlay({ current, target, isBottleneck }: { current: number; target: number; isBottleneck: boolean }) {
  if (current <= 0) return null
  const goodPct = Math.min((target / current) * 100, 100)
  const badPct = 100 - goodPct
  const badColor = isBottleneck ? '#ef4444' : '#d97706'
  return (
    <div style={{ display: 'flex', height: '5px', borderRadius: '3px', overflow: 'hidden' }}>
      <div style={{ width: `${goodPct}%`, background: 'var(--green)', opacity: 0.55 }} />
      {badPct > 0 && <div style={{ width: `${badPct}%`, background: badColor, opacity: 0.8 }} />}
    </div>
  )
}

// Bar: lower is better with target marker
function KpiBarLower({ current, target, max, isBottleneck, isWarn }: { current: number; target: number; max: number; isBottleneck: boolean; isWarn: boolean }) {
  const fillPct = max > 0 ? Math.min((current / max) * 100, 100) : 0
  const targetPct = max > 0 ? Math.min((target / max) * 100, 100) : 60
  const color = isBottleneck ? '#ef4444' : isWarn ? '#f59e0b' : 'var(--green)'
  return (
    <div style={{ position: 'relative', height: '5px', background: 'var(--gray-200)', borderRadius: '3px' }}>
      <div style={{ position: 'absolute', height: '5px', width: `${fillPct}%`, background: color, borderRadius: '3px', opacity: 0.75 }} />
      <div style={{ position: 'absolute', top: '-2px', left: `${targetPct}%`, width: '2px', height: '9px', background: 'var(--gray-500)', transform: 'translateX(-50%)' }} />
    </div>
  )
}

// ── KPI Pyramid ────────────────────────────────────────────────────────────
function KPIPyramid({ calcResult, answers, totalLoss, dailyLoss, financialBottleneck }: {
  calcResult: CalcResult
  answers: Answers
  totalLoss: number
  dailyLoss: number
  financialBottleneck: string | null
}) {
  if (totalLoss === 0) return null
  const lossRange = calcLossRange(totalLoss)

  const utilPct = Math.round(calcResult.util * 100)

  // Dispatch time midpoint from answer
  const dispTimeMap: Record<string, number> = {
    'Under 15 minutes — fast response': 12,
    '15 to 25 minutes — acceptable': 20,
    '25 to 40 minutes — slow': 32,
    'Over 40 minutes — critical bottleneck': 45,
  }
  const dispTime = dispTimeMap[answers.order_to_dispatch as string] ?? null

  // Deliveries per truck per day
  const effTrucks = calcResult.operativeTrucks || calcResult.trucks
  const delPerTruck = effTrucks > 0 ? Math.round((calcResult.delDay / effTrucks) * 10) / 10 : 0
  const targetDelPerTruck = calcResult.trucks > 0
    ? Math.round((calcResult.realisticMaxDel / calcResult.trucks) * 10) / 10
    : 0

  // Which boxes get bottleneck tag.
  // If Production is the financial bottleneck but turnaround is over target,
  // the root cause is Fleet Turnaround — not Plant Utilisation.
  // Plant Utilisation is a symptom; turnaround is the lever.
  const taIsRootCause = financialBottleneck === 'Production' && calcResult.ta > calcResult.TARGET_TA
  const isUtilBn = financialBottleneck === 'Production' && !taIsRootCause
  const isTaBn = financialBottleneck === 'Fleet' || taIsRootCause
  const isRejectBn = financialBottleneck === 'Quality'
  const isDispBn = financialBottleneck === 'Dispatch'

  // Warning thresholds
  const utilWarn = utilPct < 82
  const taWarn = calcResult.ta > calcResult.TARGET_TA
  const rejectWarn = calcResult.rejectPct > 3
  const dispWarn = dispTime !== null && dispTime > 15
  const delWarn = targetDelPerTruck > 0 && delPerTruck < targetDelPerTruck * 0.9

  function kpiColor(isBn: boolean, isW: boolean): string {
    if (isBn) return 'var(--red)'
    if (isW) return '#d97706'
    return 'var(--gray-500)'
  }

  const connector = (
    <div style={{ display: 'flex', justifyContent: 'center', height: '14px' }}>
      <div style={{ width: '1px', background: 'var(--gray-200)', height: '100%' }} />
    </div>
  )

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
        Key Metrics
      </div>

      {/* Row 1: Financial */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--error-bg)', border: '1px solid var(--error-border)',
        borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: '0',
      }}>
        <div>
          <div style={{ fontSize: '9px', color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>
            {calcResult.demandSufficient === false ? 'Margin Improvement Potential' : 'Potential Monthly Loss'}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)', marginTop: '2px', lineHeight: 1.15 }}>
            {fmt(lossRange.low)} – {fmt(lossRange.high)}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--gray-500)', marginTop: '3px' }}>
            {calcResult.demandSufficient === false
              ? 'demand-constrained — focus on margin, not throughput'
              : `${fmt(Math.round(totalLoss * 12 * 0.7))} – ${fmt(Math.round(totalLoss * 12 * 1.3))}/year · requires sufficient demand`}
          </div>
        </div>
        <div style={{ textAlign: 'right', paddingLeft: '20px', borderLeft: '1px solid var(--error-border)' }}>
          <div style={{ fontSize: '9px', color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Per Working Day</div>
          <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)', marginTop: '2px', lineHeight: 1.15 }}>
            {fmt(Math.round(dailyLoss * 0.70))} – {fmt(Math.round(dailyLoss * 1.30))}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--gray-500)', marginTop: '3px' }}>based on {calcResult.workingDaysMonth || 22} working days/mo</div>
        </div>
      </div>

      {connector}

      {/* Row 2: Primary drivers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <KpiBox
          label="Plant Utilisation"
          value={`${utilPct}%`}
          target="target 85%"
          isBottleneck={isUtilBn}
          isWarn={utilWarn}
          bar={<KpiBarHigher current={utilPct} target={85} max={100} isBottleneck={isUtilBn} isWarn={utilWarn} />}
          gap={utilWarn ? `−${85 - utilPct} pp below target` : 'on target'}
          gapColor={kpiColor(isUtilBn, utilWarn)}
          benchmark={benchmarkTag('utilisation')}
        />
        <KpiBox
          label="Turnaround Time"
          value={`${calcResult.ta} min`}
          target={`target ${calcResult.TARGET_TA} min`}
          isBottleneck={isTaBn}
          isWarn={taWarn}
          bar={<KpiBarLowerOverlay current={calcResult.ta} target={calcResult.TARGET_TA} isBottleneck={isTaBn} />}
          gap={taWarn ? `+${calcResult.ta - calcResult.TARGET_TA} min over target` : 'on target'}
          gapColor={kpiColor(isTaBn, taWarn)}
          benchmark={benchmarkTag('turnaround')}
        />
      </div>

      {connector}

      {/* Row 3: Supporting metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
        <KpiBox
          label="Rejection Rate"
          value={`${calcResult.rejectPct}%`}
          target="target <3%"
          isBottleneck={isRejectBn}
          isWarn={rejectWarn}
          size="small"
          bar={<KpiBarLower current={calcResult.rejectPct} target={3} max={Math.max(calcResult.rejectPct * 1.5, 6)} isBottleneck={isRejectBn} isWarn={rejectWarn} />}
          gap={rejectWarn ? `+${(calcResult.rejectPct - 3).toFixed(1)} pp over target` : 'on target'}
          gapColor={kpiColor(isRejectBn, rejectWarn)}
          benchmark={benchmarkTag('rejection')}
        />
        {dispTime !== null ? (
          <KpiBox
            label="Dispatch Time"
            value={`${dispTime} min`}
            target="target 15 min"
            isBottleneck={isDispBn}
            isWarn={dispWarn}
            size="small"
            bar={<KpiBarLowerOverlay current={dispTime} target={15} isBottleneck={isDispBn} />}
            gap={dispWarn ? `+${dispTime - 15} min over target` : 'on target'}
            gapColor={kpiColor(isDispBn, dispWarn)}
            benchmark={benchmarkTag('dispatch')}
          />
        ) : (
          <KpiBox label="Dispatch Time" value="—" target="target 15 min" isBottleneck={false} isWarn={false} size="small" bar={null} gap="" gapColor="var(--gray-400)" />
        )}
        <KpiBox
          label="Deliveries / truck / day"
          value={delPerTruck > 0 ? String(delPerTruck) : '—'}
          target={targetDelPerTruck > 0 ? `target ${targetDelPerTruck}` : ''}
          isBottleneck={false}
          isWarn={delWarn}
          size="small"
          bar={delPerTruck > 0 && targetDelPerTruck > 0 ? <KpiBarHigher current={delPerTruck} target={targetDelPerTruck} max={targetDelPerTruck * 1.1} isBottleneck={false} isWarn={delWarn} /> : null}
          gap={delWarn && targetDelPerTruck > 0 ? `−${(targetDelPerTruck - delPerTruck).toFixed(1)} per day` : ''}
          gapColor={kpiColor(false, delWarn)}
          benchmark={benchmarkTag('deliveriesPerTruck')}
        />
      </div>
    </div>
  )
}

// ── Case Study Section ─────────────────────────────────────────────────────
function CaseStudySection({ calcResult, meta, totalLoss, assessmentId }: {
  calcResult: CalcResult
  meta?: { country?: string; plant?: string; date?: string }
  totalLoss: number
  assessmentId: string
}) {
  const [open, setOpen] = useState(false)
  const [consent, setConsent] = useState(false)
  const [outcome, setOutcome] = useState('')
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  const plantName = meta?.plant || 'Plant'
  const country = meta?.country || ''
  const date = meta?.date || new Date().toISOString().slice(0, 10)

  // Pre-filled template derived from calcResult
  const template = [
    `Client: ${plantName}${country ? ` — ${country}` : ''}`,
    `Assessment date: ${date}`,
    ``,
    `BEFORE`,
    `Turnaround: ${calcResult.ta} min (benchmark ${calcResult.TARGET_TA} min)`,
    `Rejection rate: ${calcResult.rejectPct}%`,
    calcResult.dispatchMin ? `Dispatch time: ${calcResult.dispatchMin} min` : null,
    `Estimated monthly loss: $${totalLoss.toLocaleString()}`,
    ``,
    `AFTER (to complete at 90-day review)`,
    `Turnaround: ___ min`,
    `Rejection rate: ___%`,
    calcResult.dispatchMin ? `Dispatch time: ___ min` : null,
    `Monthly margin recovered: $___`,
    ``,
    `KEY ACTIONS THAT DROVE RESULTS`,
    `1. `,
    `2. `,
    `3. `,
  ].filter(Boolean).join('\n')

  async function handleSave() {
    if (!outcome.trim()) return
    await supabase.from('reports').upsert({
      assessment_id: assessmentId,
      case_study_consent: consent,
      case_study_notes: outcome,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'assessment_id' })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)', margin: 0, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Case Study Framework
        </h3>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            padding: '4px 10px', border: '1px solid var(--border)', borderRadius: '6px',
            fontSize: '11px', color: 'var(--gray-500)', background: 'var(--white)',
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          {open ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {!open && (
        <div style={{ fontSize: '12px', color: 'var(--gray-400)', lineHeight: 1.5 }}>
          Pre-filled before/after template. Complete after 90-day tracking to create a publishable case study.
        </div>
      )}

      {open && (
        <div>
          {/* Template */}
          <div style={{
            background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '14px 16px', marginBottom: '14px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>
              Pre-filled template (from assessment data)
            </div>
            <pre style={{
              fontSize: '11px', color: 'var(--gray-600)', fontFamily: 'var(--mono)',
              lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap',
            }}>
              {template}
            </pre>
          </div>

          {/* Outcome notes */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '6px' }}>
              Outcome notes (complete at 90-day review)
            </label>
            <textarea
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              placeholder="Describe the actual results, key actions taken, and any context useful for a case study…"
              style={{
                width: '100%', minHeight: '100px', padding: '10px 12px',
                border: '1px solid var(--border)', borderRadius: '8px',
                fontSize: '13px', fontFamily: 'var(--font)', color: 'var(--gray-900)',
                lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Consent */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '14px', fontSize: '12px', color: 'var(--gray-600)', lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
              style={{ marginTop: '2px', flexShrink: 0 }}
            />
            Client consents to anonymised before/after results being used as a case study (no plant name or location will be published without separate written consent)
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={!outcome.trim()}
            style={{
              padding: '8px 18px',
              background: saved ? 'var(--phase-complete)' : 'var(--green)',
              color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              cursor: !outcome.trim() ? 'not-allowed' : 'pointer',
              opacity: !outcome.trim() ? 0.5 : 1,
              fontFamily: 'var(--font)', transition: 'background .2s',
            }}
          >
            {saved ? '✓ Saved' : 'Save case study notes'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Assumptions Panel ──────────────────────────────────────────────────────
function AssumptionsPanel({ overrides, onChange }: {
  overrides: CalcOverrides
  onChange: (o: CalcOverrides) => void
}) {
  const [open, setOpen] = useState(false)
  const utilTarget = overrides.utilisationTarget ?? 92
  const fleetFactor = overrides.fleetUtilFactor ?? 85
  const isModified = (overrides.utilisationTarget !== undefined && overrides.utilisationTarget !== 92)
    || (overrides.fleetUtilFactor !== undefined && overrides.fleetUtilFactor !== 85)

  return (
    <div style={{ marginBottom: '16px' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: '11px', color: isModified ? 'var(--green)' : 'var(--gray-400)',
          fontFamily: 'var(--font)', fontWeight: 500,
        }}
      >
        <span style={{ fontSize: '9px' }}>{open ? '▲' : '▼'}</span>
        Model assumptions
        {isModified && <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 600 }}>● modified</span>}
      </button>

      {open && (
        <div style={{
          marginTop: '10px', padding: '14px 16px',
          background: 'var(--gray-50)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', display: 'flex', flexWrap: 'wrap', gap: '16px',
          alignItems: 'flex-end',
        }}>
          {/* Utilisation target */}
          <div>
            <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>
              Utilisation target %
            </div>
            <div style={{ fontSize: '9px', color: 'var(--gray-400)', marginBottom: '6px', lineHeight: 1.4, maxWidth: '180px' }}>
              Plant target utilisation rate. Used to benchmark actual production and compute utilisation score. Industry default: 92%.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number" min={70} max={99} step={1}
                value={utilTarget}
                onChange={e => {
                  const v = Number(e.target.value)
                  if (v >= 70 && v <= 99) onChange({ ...overrides, utilisationTarget: v })
                }}
                style={{
                  width: '64px', padding: '5px 8px', border: '1px solid var(--border)',
                  borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--mono)',
                  color: 'var(--gray-900)', background: 'var(--white)',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>% (default 92)</span>
            </div>
          </div>

          {/* Fleet utilisation factor */}
          <div>
            <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>
              Fleet utilisation factor %
            </div>
            <div style={{ fontSize: '9px', color: 'var(--gray-400)', marginBottom: '6px', lineHeight: 1.4, maxWidth: '180px' }}>
              Fraction of theoretical fleet capacity that is practically achievable — accounts for breaks, queuing and driver idle. Industry default: 85%.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number" min={60} max={98} step={1}
                value={fleetFactor}
                onChange={e => {
                  const v = Number(e.target.value)
                  if (v >= 60 && v <= 98) onChange({ ...overrides, fleetUtilFactor: v })
                }}
                style={{
                  width: '64px', padding: '5px 8px', border: '1px solid var(--border)',
                  borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--mono)',
                  color: 'var(--gray-900)', background: 'var(--white)',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>% (default 85)</span>
            </div>
          </div>

          {/* Reset */}
          {isModified && (
            <div style={{ alignSelf: 'flex-end' }}>
              <button
                type="button"
                onClick={() => onChange({})}
                style={{
                  padding: '5px 12px', border: '1px solid var(--border)', borderRadius: '6px',
                  fontSize: '11px', color: 'var(--gray-500)', background: 'var(--white)',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
interface ReportViewProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  assessmentId: string
  reportReleased?: boolean
  isAdmin?: boolean
  overrides?: CalcOverrides
  onOverrideChange?: (o: CalcOverrides) => void
}

export default function ReportView({ calcResult, answers, meta, report, assessmentId, reportReleased, isAdmin, overrides, onOverrideChange }: ReportViewProps) {
  const supabase = createClient()
  const issues = buildIssues(calcResult, answers, meta)
  const financialBottleneck = getFinancialBottleneck(issues)

  const bottleneckIssues = issues.filter(i => i.category === 'bottleneck' && i.loss > 0)
  const bottleneckLoss = bottleneckIssues.length > 0 ? Math.max(...bottleneckIssues.map(i => i.loss)) : 0
  const independentLoss = issues.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
  const totalLoss = bottleneckLoss + independentLoss
  const primaryBottleneckLoss = bottleneckLoss
  const dailyLoss = Math.round(totalLoss / (calcResult.workingDaysMonth || 22))

  // ── AI section state ─────────────────────────────────────────────────────
  const [texts, setTexts] = useState({
    executive: stripMarkdown(report?.executive || ''),
    diagnosis: stripMarkdown(report?.diagnosis || ''),
    actions:   stripMarkdown(report?.actions || ''),
  })
  const [generating, setGenerating] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  // ── Logistics Intelligence (GPS) ─────────────────────────────────────────
  const [logisticsText, setLogisticsText] = useState<string | null>(null)

  useEffect(() => {
    if (assessmentId === 'demo') return
    supabase
      .from('logistics_analysis_results')
      .select('generated_section_text, confidence_score')
      .eq('assessment_id', assessmentId)
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.generated_section_text) {
          setLogisticsText(data.generated_section_text)
        }
      })
  }, [assessmentId, supabase])

  const hasAllSections = !!(texts.executive && texts.diagnosis && texts.actions)
  const hasAnySections = !!(texts.executive || texts.diagnosis || texts.actions)

  // Build context for AI generation
  // totalLoss already applies bottleneck logic (max of overlapping, not sum) — use this, not raw sum
  const aiContext = useMemo(() => ({
    plant: meta?.plant || '',
    country: meta?.country || '',
    date: meta?.date || '',
    scores: calcResult.scores,
    overall: calcResult.overall,
    bottleneck: financialBottleneck,
    totalLossMonthly: totalLoss,
    dailyLoss,
    hiddenRevMonthly: calcResult.hiddenRevMonthly,
    utilPct: Math.round(calcResult.util * 100),
    turnaround: calcResult.ta,
    targetTA: calcResult.TARGET_TA,
    trucks: calcResult.trucks,
    cap: calcResult.cap,
    issues: issues.slice(0, 8).map(i => ({
      t: i.t, action: i.action, rec: i.rec,
      loss: i.loss, sev: i.sev, category: i.category, formula: i.formula,
    })),
    answers,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [assessmentId, calcResult, answers, meta])

  const saveSection = useCallback(async (section: string, text: string) => {
    const clean = stripMarkdown(text)
    setTexts(prev => ({ ...prev, [section]: clean }))
    await supabase.from('reports').upsert({
      assessment_id: assessmentId,
      [section]: clean,
      edited: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'assessment_id' })
  }, [assessmentId, supabase])

  const generate = useCallback(async (section: string) => {
    setGenerating(section)
    setGenError(null)  // clear previous error
    setTexts(prev => ({ ...prev, [section]: '' }))

    try {
      const resp = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, type: section, context: aiContext }),
      })
      if (!resp.ok) {
        let detail = ''
        try { const body = await resp.json(); detail = body?.error || '' } catch { /* ignore */ }
        throw new Error(`HTTP ${resp.status}${detail ? ': ' + detail : ''}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No stream reader')
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setTexts(prev => ({ ...prev, [section]: stripMarkdown(accumulated) }))
      }

      if (!accumulated.trim()) throw new Error('Empty response — AI returned no content')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setGenError(`Failed to generate ${section}: ${msg}`)
      // Don't auto-dismiss — keep visible until next attempt
    }

    setGenerating(null)
  }, [assessmentId, aiContext])

  const generateAll = useCallback(async () => {
    for (const section of ['executive', 'diagnosis', 'actions']) {
      await generate(section)
    }
  }, [generate])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '60px' }}>

      {/* Top bar: Export + Generate all */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        {!hasAllSections ? (
          <button
            type="button"
            onClick={generateAll}
            disabled={generating !== null}
            style={{
              padding: '8px 18px', background: generating ? 'var(--gray-300)' : 'var(--green)',
              color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
            }}
          >
            {generating ? 'Generating…' : hasAnySections ? 'Generate missing sections' : 'Generate full report'}
          </button>
        ) : <div />}
        <ExportPDF calcResult={calcResult} answers={answers} meta={meta} report={texts} />
      </div>

      {/* Error */}
      {genError && (
        <div style={{
          background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px',
          padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: 'var(--red)',
        }}>
          ⚠ {genError}
        </div>
      )}

      {/* Draft banner */}
      {isAdmin && !reportReleased && (
        <div style={{
          background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
          borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '13px' }}>🔒</span>
          <span style={{ fontSize: '12px', color: 'var(--warning-dark)', fontWeight: 500 }}>
            Report is in draft — not visible to the customer. Release it from the assessment header when ready.
          </span>
        </div>
      )}

      {/* Incomplete margin — admin footnote only, not visible to customer */}
      {isAdmin && calcResult.marginIncomplete && (
        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '10px', fontStyle: 'italic' }}>
          Note: aggregate/admixture costs not entered — margin estimated at 35%. Enter material costs for precise figures.
        </div>
      )}

      {/* Data warnings */}
      {calcResult.warnings && calcResult.warnings.length > 0 && (
        <div style={{
          background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '16px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--warning-dark)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.3px' }}>
            Data consistency warnings
          </div>
          {calcResult.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: '12px', color: 'var(--warning-dark)', lineHeight: 1.5, marginBottom: i < calcResult.warnings.length - 1 ? '4px' : 0 }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {/* ── KPI Pyramid ───────────────────────────────────────────────────── */}
      <KPIPyramid
        calcResult={calcResult}
        answers={answers}
        totalLoss={totalLoss}
        dailyLoss={dailyLoss}
        financialBottleneck={financialBottleneck}
      />

      {/* ── Assumptions Panel ─────────────────────────────────────────────── */}
      {isAdmin && onOverrideChange && (
        <AssumptionsPanel overrides={overrides ?? {}} onChange={onOverrideChange} />
      )}

      <Divider />

      {/* ── SECTION 2: Executive Summary (AI) ────────────────────────────── */}
      <AISection
        title="Executive Summary"
        text={texts.executive}
        generating={generating === 'executive'}
        onGenerate={() => generate('executive')}
        onSave={t => saveSection('executive', t)}
        minHeight={100}
      />

      <Divider />

      {/* ── SECTION 5: Operational Diagnosis (AI) ────────────────────────── */}
      <AISection
        title="Operational Diagnosis"
        text={texts.diagnosis}
        generating={generating === 'diagnosis'}
        onGenerate={() => generate('diagnosis')}
        onSave={t => saveSection('diagnosis', t)}
        minHeight={120}
      />

      <Divider />

      {/* ── Findings ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Findings ({issues.filter(i => i.loss > 0 || i.category === 'bottleneck').length})
        </h3>
        {issues.length > 0 ? (
          issues
            // Zero-loss informational issues (e.g. fleet headroom) are removed from
            // the findings list — they confuse the CFO ("what does this cost me?")
            // and are covered in the simulator and KPI pyramid instead.
            .filter(issue => issue.loss > 0 || issue.category === 'bottleneck')
            .map((issue, i) => (
            <FindingCard
              key={i}
              issue={issue}
              index={i}
              isOverlap={issue.category === 'bottleneck' && issue.loss > 0 && issue.loss < primaryBottleneckLoss}
            />
          ))
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
            No findings yet — complete the assessment questions to generate operational insights.
          </div>
        )}
      </div>

      <Divider />

      {/* ── SECTION 6: Next Step (AI) ─────────────────────────────────────── */}
      <AISection
        title="Next Step"
        text={texts.actions}
        generating={generating === 'actions'}
        onGenerate={() => generate('actions')}
        onSave={t => saveSection('actions', t)}
        minHeight={80}
      />

      {/* ── SECTION 7: Logistics Intelligence (GPS) ──────────────────────── */}
      {logisticsText && (
        <>
          <Divider />
          <div>
            <div style={{
              fontSize: '11px', fontWeight: 600, letterSpacing: '.08em',
              color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '10px',
            }}>
              Logistics Intelligence
              <span style={{
                marginLeft: '8px', fontSize: '10px', padding: '2px 7px',
                borderRadius: '4px', background: 'var(--info-bg)',
                border: '1px solid var(--info-border)', color: 'var(--phase-workshop)',
                fontWeight: 500, letterSpacing: 0, textTransform: 'none',
              }}>
                GPS data
              </span>
            </div>
            <div style={{
              whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.7',
              color: 'var(--gray-700)', fontFamily: 'var(--font)',
              padding: '16px', background: 'var(--gray-50)',
              border: '1px solid var(--border)', borderRadius: '8px',
            }}>
              {logisticsText}
            </div>
          </div>
        </>
      )}

      {/* ── Case Study Framework ──────────────────────────────────────────── */}
      {isAdmin && totalLoss > 0 && (
        <>
          <Divider />
          <CaseStudySection
            calcResult={calcResult}
            meta={meta}
            totalLoss={totalLoss}
            assessmentId={assessmentId}
          />
        </>
      )}

    </div>
  )
}
