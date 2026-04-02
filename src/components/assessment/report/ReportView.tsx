'use client'

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CalcResult, Answers, CalcOverrides } from '@/lib/calculations'
import type { Phase } from '@/lib/questions'
import { calcLossRange } from '@/lib/calculations'
import { buildIssues, getFinancialBottleneck, type Issue } from '@/lib/issues'
import { benchmarkTag, gcQuartile } from '@/lib/benchmarks'
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
function KPIPyramid({ calcResult, answers, totalLoss, financialBottleneck }: {
  calcResult: CalcResult
  answers: Answers
  totalLoss: number
  financialBottleneck: string | null
}) {
  if (totalLoss === 0) return null

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

// ── Logistics Intelligence Section ────────────────────────────────────────
const SECTION_HEADERS = ['TURNAROUND PERFORMANCE', 'SITE WAITING TIME', 'RETURN LOAD SIGNALS', 'DATA NOTE']

function LogisticsSection({ text, gpsAvgTA, perMinTACoeff, TARGET_TA, selfReportedTA }: {
  text: string
  gpsAvgTA: number | null
  perMinTACoeff: number
  TARGET_TA: number
  selfReportedTA: number
}) {
  const rawLines = text.split('\n')

  // Split into [{ header, lines[] }] blocks
  type Block = { header: string | null; lines: string[] }
  const blocks: Block[] = []
  let current: Block = { header: null, lines: [] }

  for (const line of rawLines) {
    if (SECTION_HEADERS.includes(line.trim())) {
      if (current.lines.length > 0 || current.header) blocks.push(current)
      current = { header: line.trim(), lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.lines.length > 0 || current.header) blocks.push(current)

  const headerColor: Record<string, string> = {
    'TURNAROUND PERFORMANCE': 'var(--phase-onsite)',
    'SITE WAITING TIME':      'var(--phase-onsite)',
    'RETURN LOAD SIGNALS':    'var(--phase-workshop)',
    'DATA NOTE':              'var(--gray-400)',
  }

  // GPS-based financial impact calculation
  const gpsExcessMin = gpsAvgTA !== null ? Math.max(0, gpsAvgTA - TARGET_TA) : null
  const gpsTurnaroundLoss = gpsExcessMin !== null && perMinTACoeff > 0
    ? Math.round(gpsExcessMin * perMinTACoeff)
    : null
  // Flag divergence: GPS differs from self-reported by >15%
  const gpsDivergent = gpsAvgTA !== null && selfReportedTA > 0
    && Math.abs(gpsAvgTA - selfReportedTA) / selfReportedTA > 0.15

  return (
    <div>
      {/* Section label */}
      <div style={{
        fontSize: '11px', fontWeight: 600, letterSpacing: '.08em',
        color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '12px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        Logistics Intelligence
        <span style={{
          fontSize: '10px', padding: '2px 7px', borderRadius: '4px',
          background: 'var(--info-bg)', border: '1px solid var(--info-border)',
          color: 'var(--phase-workshop)', fontWeight: 500,
          letterSpacing: 0, textTransform: 'none',
        }}>
          GPS data
        </span>
      </div>

      {/* Metadata line (first block, no header) */}
      {blocks[0]?.header === null && (
        <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '16px', lineHeight: '1.5' }}>
          {blocks[0].lines.filter(l => l.trim()).map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {/* GPS divergence notice */}
      {gpsDivergent && gpsAvgTA !== null && (
        <div style={{
          fontSize: '12px', color: 'var(--warning, #b45309)',
          background: 'var(--warning-bg, #fffbeb)', border: '1px solid var(--warning-border, #fde68a)',
          borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', lineHeight: '1.5',
        }}>
          ⚠ GPS-measured turnaround ({gpsAvgTA} min) differs significantly from self-reported ({selfReportedTA} min).
          {' '}Consider updating your assessment data to reflect GPS-verified figures.
        </div>
      )}

      {/* Metric blocks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {blocks.filter(b => b.header !== null).map((block, i) => {
          const isDataNote = block.header === 'DATA NOTE'
          const isTurnaround = block.header === 'TURNAROUND PERFORMANCE'
          const bodyLines = block.lines.filter(l => l.trim())
          return (
            <div key={i} style={{
              padding: '14px 16px',
              border: '1px solid var(--border)',
              borderLeft: isDataNote ? '1px solid var(--border)' : `3px solid ${headerColor[block.header!] ?? 'var(--border)'}`,
              borderRadius: '8px',
              background: isDataNote ? 'transparent' : 'var(--white)',
            }}>
              <div style={{
                fontSize: '10px', fontWeight: 700, letterSpacing: '.07em',
                color: isDataNote ? 'var(--gray-400)' : (headerColor[block.header!] ?? 'var(--gray-600)'),
                textTransform: 'uppercase', marginBottom: '8px',
              }}>
                {block.header}
              </div>
              {bodyLines.map((line, j) => (
                <div key={j} style={{
                  fontSize: '13px', lineHeight: '1.65',
                  color: isDataNote ? 'var(--gray-400)' : 'var(--gray-700)',
                  marginBottom: j < bodyLines.length - 1 ? '4px' : 0,
                }}>
                  {line}
                </div>
              ))}
              {/* GPS financial impact — injected into TURNAROUND PERFORMANCE card */}
              {isTurnaround && gpsTurnaroundLoss !== null && gpsExcessMin !== null && (
                <div style={{
                  marginTop: '10px', paddingTop: '10px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                  <div style={{
                    fontSize: '18px', fontWeight: 700,
                    color: gpsExcessMin > 0 ? 'var(--phase-onsite)' : 'var(--phase-complete)',
                  }}>
                    {gpsExcessMin > 0 ? fmt(gpsTurnaroundLoss) : '$0'}
                    <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--gray-400)', marginLeft: '4px' }}>/month</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--gray-500)', lineHeight: '1.4' }}>
                    {gpsExcessMin > 0
                      ? `GPS-verified financial impact — ${gpsExcessMin} excess min × ${fmt(perMinTACoeff)}/min`
                      : 'GPS data: turnaround is within target — no financial leakage from fleet cycle time'}
                  </div>
                </div>
              )}
            </div>
          )
        })}
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

// ── Bottleneck Slider ──────────────────────────────────────────────────────

type SliderConfig = {
  label: string
  currentVal: number
  targetVal: number
  unit: string
  coefficient: number   // $/month per 1-unit improvement
  direction: 'down' | 'up'   // down = lower is better, up = higher is better
  step: number
  decimals: number
}

function getSliderConfig(calcResult: CalcResult, dimension: string): SliderConfig | null {
  switch (dimension) {
    case 'Fleet': {
      const gap = calcResult.ta - calcResult.TARGET_TA
      if (gap <= 0) return null
      // Use cost-only coefficient when demand-constrained — slider shows operational
      // savings only, not revenue recovery
      const taLeak = calcResult.demandSufficient === false
        ? calcResult.turnaroundLeakMonthlyCostOnly
        : calcResult.turnaroundLeakMonthly
      const coeff = gap > 0 ? Math.round(taLeak / gap) : 0
      if (coeff <= 0) return null
      return {
        label: calcResult.demandSufficient === false
          ? 'What if turnaround improves? (cost saving)'
          : 'What if turnaround improves?',
        currentVal: calcResult.ta,
        targetVal: calcResult.TARGET_TA,
        unit: 'min',
        coefficient: coeff,
        direction: 'down',
        step: 1,
        decimals: 0,
      }
    }
    case 'Production': {
      const currentPct = Math.round(calcResult.util * 100)
      const gap = calcResult.utilisationTarget - currentPct
      if (gap <= 0 || calcResult.capLeakMonthly <= 0) return null
      return {
        label: 'What if utilisation improves?',
        currentVal: currentPct,
        targetVal: calcResult.utilisationTarget,
        unit: '%',
        coefficient: Math.round(calcResult.capLeakMonthly / gap),
        direction: 'up',
        step: 1,
        decimals: 0,
      }
    }
    case 'Quality': {
      const rejectGap = calcResult.rejectPct - 1.5
      if (rejectGap <= 0 || calcResult.rejectLeakMonthly <= 0) return null
      return {
        label: 'What if rejection rate improves?',
        currentVal: calcResult.rejectPct,
        targetVal: 1.5,
        unit: '%',
        coefficient: Math.round(calcResult.rejectLeakMonthly / calcResult.rejectPct),
        direction: 'down',
        step: 0.1,
        decimals: 1,
      }
    }
    default:
      return null
  }
}

function BottleneckSlider({ calcResult, dimension }: {
  calcResult: CalcResult
  dimension: string
}) {
  const config = getSliderConfig(calcResult, dimension)
  const [sliderVal, setSliderVal] = useState<number>(config?.currentVal ?? 0)

  if (!config) return null

  const { label, currentVal, targetVal, unit, coefficient, direction, step, decimals } = config
  const improvement = direction === 'down' ? currentVal - sliderVal : sliderVal - currentVal
  const savings = Math.round(improvement * coefficient)
  const atCurrent = Math.abs(sliderVal - currentVal) < step

  return (
    <div style={{
      margin: '4px 0 8px',
      padding: '14px 18px',
      background: '#f0faf6',
      border: '1px solid #a8dcc8',
      borderRadius: 'var(--radius)',
      borderLeft: '3px solid var(--green)',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 600, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        {label}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', color: 'var(--gray-500)', minWidth: '58px' }}>
          Now: {currentVal.toFixed(decimals)}{unit}
        </span>
        <input
          type="range"
          min={direction === 'down' ? targetVal : currentVal}
          max={direction === 'down' ? currentVal : targetVal}
          step={step}
          value={sliderVal}
          onChange={e => setSliderVal(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--green)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: '11px', color: 'var(--gray-500)', minWidth: '62px', textAlign: 'right' }}>
          Target: {targetVal.toFixed(decimals)}{unit}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span style={{
            fontSize: '20px', fontWeight: 700, fontFamily: 'var(--mono)',
            color: savings > 0 ? 'var(--green)' : 'var(--gray-300)',
          }}>
            {atCurrent ? 'Move slider to see recovery' : savings > 0 ? `+$${savings.toLocaleString()}/mo` : '$0/mo'}
          </span>
          {!atCurrent && improvement > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--gray-500)', marginLeft: '8px' }}>
              at {sliderVal.toFixed(decimals)}{unit} — {improvement.toFixed(decimals)}{unit} improvement
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-400)', textAlign: 'right' }}>
          ${coefficient.toLocaleString()}/mo per {unit}
        </div>
      </div>
    </div>
  )
}

// ── Financial Headline ─────────────────────────────────────────────────────
function FinancialHeadline({ totalLoss, dailyLoss, calcResult }: {
  totalLoss: number
  dailyLoss: number
  calcResult: CalcResult
}) {
  if (calcResult.overall === null) return null
  if (totalLoss === 0) {
    return (
      <div style={{
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '20px',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <span style={{ fontSize: '20px' }}>✓</span>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--green)' }}>Performing at benchmark on all metrics</div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
            No operational issues detected — this plant is at or above GCC industry benchmarks.
          </div>
        </div>
      </div>
    )
  }
  const lossRange = calcLossRange(totalLoss)
  return (
    <div style={{
      background: 'var(--error-bg)', border: '1px solid var(--error-border)',
      borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '20px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div>
        <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
          {calcResult.demandSufficient === false ? 'Margin Improvement Potential' : 'Estimated Monthly Loss'}
        </div>
        <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)', lineHeight: 1.1 }}>
          {fmt(lossRange.low)}–{fmt(lossRange.high)}
          <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--gray-400)', marginLeft: '4px' }}>/month</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px' }}>
          {calcResult.demandSufficient === false
            ? 'demand-constrained — operational cost saving only'
            : `${fmt(Math.round(totalLoss * 12 * 0.7))}–${fmt(Math.round(totalLoss * 12 * 1.3))}/year`}
        </div>
      </div>
      <div style={{ textAlign: 'right', paddingLeft: '20px', borderLeft: '1px solid var(--error-border)' }}>
        <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Per Working Day</div>
        <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)', lineHeight: 1.1 }}>
          {fmt(Math.round(dailyLoss * 0.7))}–{fmt(Math.round(dailyLoss * 1.3))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px' }}>
          based on {calcResult.workingDaysMonth || 22} working days/mo
        </div>
      </div>
    </div>
  )
}

// ── Recovery Slider Row (controlled) ──────────────────────────────────────
function RecoverySliderRow({ config, value, onChange }: {
  config: SliderConfig
  value: number
  onChange: (v: number) => void
}) {
  const { label, currentVal, targetVal, unit, coefficient, direction, step, decimals } = config
  const improvement = direction === 'down' ? currentVal - value : value - currentVal
  const savings = Math.round(improvement * coefficient)
  const atCurrent = Math.abs(value - currentVal) < step * 0.5

  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gray-600)', marginBottom: '6px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color: 'var(--gray-500)', minWidth: '52px' }}>
          Now: {currentVal.toFixed(decimals)}{unit}
        </span>
        <input
          type="range"
          min={direction === 'down' ? targetVal : currentVal}
          max={direction === 'down' ? currentVal : targetVal}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--green)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: '10px', color: 'var(--gray-500)', minWidth: '56px', textAlign: 'right' }}>
          Target: {targetVal.toFixed(decimals)}{unit}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)',
          color: savings > 0 ? 'var(--green)' : 'var(--gray-300)',
        }}>
          {atCurrent ? 'move slider →' : savings > 0 ? `+${fmt(savings)}/mo` : '$0/mo'}
        </span>
        {!atCurrent && improvement > 0 && (
          <span style={{ fontSize: '10px', color: 'var(--gray-500)' }}>
            at {value.toFixed(decimals)}{unit} · ${coefficient.toLocaleString()}/mo per {unit}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Recovery Panel (3 sliders with combined total) ─────────────────────────
function RecoveryPanel({ calcResult }: { calcResult: CalcResult }) {
  const fleetConfig = getSliderConfig(calcResult, 'Fleet')
  const taLeak = calcResult.demandSufficient === false
    ? calcResult.turnaroundLeakMonthlyCostOnly
    : calcResult.turnaroundLeakMonthly
  const dispatchConfig: SliderConfig | null = (calcResult.dispatchMin ?? 0) > 15
    ? {
        label: calcResult.demandSufficient === false
          ? 'What if dispatch time improves? (cost saving)'
          : 'What if dispatch time improves?',
        currentVal: calcResult.dispatchMin!,
        targetVal: 15,
        unit: 'min',
        coefficient: Math.max(100, Math.round(taLeak * 0.22)),
        direction: 'down',
        step: 1,
        decimals: 0,
      }
    : null
  const qualityConfig = getSliderConfig(calcResult, 'Quality')

  const [fleetVal, setFleetVal] = useState<number>(fleetConfig?.currentVal ?? 0)
  const [dispatchVal, setDispatchVal] = useState<number>(dispatchConfig?.currentVal ?? 0)
  const [qualityVal, setQualityVal] = useState<number>(qualityConfig?.currentVal ?? 0)

  if (!fleetConfig && !dispatchConfig && !qualityConfig) return null

  const calcSavings = (cfg: SliderConfig | null, val: number): number => {
    if (!cfg) return 0
    const imp = cfg.direction === 'down' ? cfg.currentVal - val : val - cfg.currentVal
    return Math.max(0, Math.round(imp * cfg.coefficient))
  }
  const totalSavings =
    calcSavings(fleetConfig, fleetVal) +
    calcSavings(dispatchConfig, dispatchVal) +
    calcSavings(qualityConfig, qualityVal)

  return (
    <div style={{
      marginBottom: '24px',
      background: '#f0faf6', border: '1px solid #a8dcc8',
      borderRadius: 'var(--radius)', padding: '18px 20px',
      borderLeft: '3px solid var(--green)',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '16px' }}>
        Recovery Simulator
      </div>
      {fleetConfig && (
        <RecoverySliderRow config={fleetConfig} value={fleetVal} onChange={setFleetVal} />
      )}
      {dispatchConfig && (
        <RecoverySliderRow config={dispatchConfig} value={dispatchVal} onChange={setDispatchVal} />
      )}
      {qualityConfig && (
        <RecoverySliderRow config={qualityConfig} value={qualityVal} onChange={setQualityVal} />
      )}
      <div style={{
        borderTop: '1px solid #a8dcc8', paddingTop: '12px', marginTop: '8px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--gray-500)' }}>Combined recovery at these settings</span>
        <span style={{
          fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)',
          color: totalSavings > 0 ? 'var(--green)' : 'var(--gray-300)',
        }}>
          {totalSavings > 0 ? `+${fmt(totalSavings)}/mo` : 'Move sliders'}
        </span>
      </div>
    </div>
  )
}

// ── Start Tracking Card ────────────────────────────────────────────────────
function StartTrackingCard({ calcResult, issues, totalLoss, financialBottleneck, onSwitchToTracking }: {
  calcResult: CalcResult
  issues: Issue[]
  totalLoss: number
  financialBottleneck: string | null
  onSwitchToTracking?: () => void
}) {
  if (totalLoss === 0 || calcResult.overall === null) return null
  const topIssue = [...issues].filter(i => i.loss > 0).sort((a, b) => b.loss - a.loss)[0]
  if (!topIssue) return null

  const dim = topIssue.dimension || financialBottleneck || ''
  const sevenDay = (() => {
    switch (dim) {
      case 'Fleet':      return 'First turnaround timestamps logged'
      case 'Dispatch':   return 'Average dispatch time captured'
      case 'Quality':    return 'Rejection reason codes logged'
      case 'Production': return 'Hourly utilisation baseline set'
      default:           return 'First weekly data point captured'
    }
  })()

  return (
    <div style={{
      marginBottom: '24px',
      background: '#0f172a', borderRadius: 'var(--radius)',
      padding: '20px 24px',
    }}>
      <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '14px' }}>
        START TRACKING YOUR IMPROVEMENTS NOW
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
        {[
          { label: 'Biggest loss',       value: topIssue.t },
          { label: 'Monthly value',      value: `${fmt(topIssue.loss)}/mo recoverable` },
          { label: 'First action',       value: topIssue.action || 'See action plan below' },
          { label: 'Expected in 7 days', value: sevenDay },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', minWidth: '130px', flexShrink: 0 }}>{row.label}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{row.value}</div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onSwitchToTracking}
        disabled={!onSwitchToTracking}
        style={{
          padding: '10px 20px',
          background: 'var(--green)', color: '#fff',
          border: 'none', borderRadius: '8px',
          fontSize: '13px', fontWeight: 600,
          cursor: onSwitchToTracking ? 'pointer' : 'default',
          fontFamily: 'var(--font)',
          opacity: onSwitchToTracking ? 1 : 0.6,
        }}
      >
        Start 90-day tracking →
      </button>
    </div>
  )
}

// ── Actions Panel ──────────────────────────────────────────────────────────
function ActionsPanel({ issues }: { issues: Issue[] }) {
  const [laterExpanded, setLaterExpanded] = useState(false)

  const actionIssues = [...issues]
    .filter(i => i.loss > 0)
    .sort((a, b) => b.loss - a.loss)

  if (actionIssues.length === 0) return null

  const immediate = actionIssues.slice(0, 3)
  const later = actionIssues.slice(3)

  function ActionRow({ issue, num }: { issue: Issue; num: number }) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', background: 'var(--white)',
        border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '6px',
      }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
          background: num <= 3 ? 'var(--green)' : 'var(--gray-200)',
          color: num <= 3 ? '#fff' : 'var(--gray-500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700,
        }}>
          {num}
        </div>
        <div style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--gray-900)', lineHeight: 1.35 }}>
          {issue.t}
        </div>
        {issue.loss > 0 && (
          <div style={{
            fontSize: '11px', fontWeight: 600, color: 'var(--red)',
            background: 'var(--error-bg)', border: '1px solid var(--error-border)',
            borderRadius: '4px', padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            ${Math.round(issue.loss / 1000)}k/mo
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '12px' }}>
        Action Plan
      </div>
      {immediate.map((issue, i) => (
        <ActionRow key={i} issue={issue} num={i + 1} />
      ))}
      {later.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setLaterExpanded(v => !v)}
            style={{
              width: '100%', padding: '8px 14px', background: 'var(--gray-50)',
              border: '1px solid var(--border)', borderRadius: '8px',
              fontSize: '11px', color: 'var(--gray-500)',
              cursor: 'pointer', fontFamily: 'var(--font)',
              marginBottom: laterExpanded ? '6px' : 0,
            }}
          >
            {laterExpanded ? '↑ Collapse' : `Later actions (${later.length}) ↓`}
          </button>
          {laterExpanded && later.map((issue, i) => (
            <ActionRow key={i + 3} issue={issue} num={i + 4} />
          ))}
        </>
      )}
    </div>
  )
}

// ── Full Report Drawer ─────────────────────────────────────────────────────
interface FullReportDrawerProps {
  open: boolean
  onClose: () => void
  texts: { executive: string; diagnosis: string; actions: string }
  generating: string | null
  genError: string | null
  onGenerate: (section: string) => void
  onSave: (section: string, text: string) => void
  onGenerateAll: () => void
  hasAllSections: boolean
  hasAnySections: boolean
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  assessmentId: string
  issues: Issue[]
  primaryBottleneckLoss: number
  logisticsText: string | null
  gpsAvgTA: number | null
  totalLoss: number
  isAdmin?: boolean
}

function FullReportDrawer({
  open, onClose,
  texts, generating, genError, onGenerate, onSave, onGenerateAll, hasAllSections, hasAnySections,
  calcResult, answers, meta, assessmentId,
  issues, primaryBottleneckLoss,
  logisticsText, gpsAvgTA,
  totalLoss, isAdmin,
}: FullReportDrawerProps) {
  const plantName = meta?.plant || 'Full Report'
  const dateStr = meta?.date || ''

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 199,
          }}
        />
      )}

      {/* Drawer panel — always in DOM, slides in/out */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '65%', maxWidth: '900px',
        background: 'var(--white)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
        zIndex: 200,
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(.22,.68,0,1.2)',
      }}>
        {/* Header (non-scrolling) */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--white)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)' }}>
              {plantName}{dateStr ? ` · ${dateStr}` : ''}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '1px' }}>Full diagnostic report</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!hasAllSections && (
              <button
                type="button"
                onClick={onGenerateAll}
                disabled={generating !== null}
                style={{
                  padding: '6px 14px',
                  background: generating ? 'var(--gray-300)' : 'var(--green)',
                  color: '#fff', border: 'none', borderRadius: '6px',
                  fontSize: '11px', fontWeight: 600,
                  cursor: generating ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font)',
                }}
              >
                {generating ? 'Generating…' : hasAnySections ? 'Generate missing' : 'Generate report'}
              </button>
            )}
            <ExportPDF calcResult={calcResult} answers={answers} meta={meta} report={texts} />
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 12px', background: 'var(--gray-100)',
                border: '1px solid var(--border)', borderRadius: '6px',
                fontSize: '12px', color: 'var(--gray-500)',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >✕</button>
          </div>
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {genError && (
            <div style={{
              background: 'var(--error-bg)', border: '1px solid var(--error-border)',
              borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
              fontSize: '12px', color: 'var(--red)',
            }}>
              ⚠ {genError}
            </div>
          )}

          <AISection
            title="Executive Summary"
            text={texts.executive}
            generating={generating === 'executive'}
            onGenerate={() => onGenerate('executive')}
            onSave={t => onSave('executive', t)}
            minHeight={100}
          />
          <Divider />
          <AISection
            title="Operational Diagnosis"
            text={texts.diagnosis}
            generating={generating === 'diagnosis'}
            onGenerate={() => onGenerate('diagnosis')}
            onSave={t => onSave('diagnosis', t)}
            minHeight={120}
          />
          <Divider />

          {/* Findings (no inline slider in drawer) */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.4px' }}>
              Findings ({issues.filter(i => i.loss > 0 || i.category === 'bottleneck').length})
            </h3>
            {issues
              .filter(issue => issue.loss > 0 || issue.category === 'bottleneck')
              .map((issue, i) => (
                <FindingCard
                  key={i}
                  issue={issue}
                  index={i}
                  isOverlap={issue.category === 'bottleneck' && issue.loss > 0 && issue.loss < primaryBottleneckLoss}
                />
              ))}
          </div>
          <Divider />

          <AISection
            title="Next Step"
            text={texts.actions}
            generating={generating === 'actions'}
            onGenerate={() => onGenerate('actions')}
            onSave={t => onSave('actions', t)}
            minHeight={80}
          />

          {logisticsText && (
            <>
              <Divider />
              <LogisticsSection
                text={logisticsText}
                gpsAvgTA={gpsAvgTA}
                perMinTACoeff={calcResult.perMinTACoeff}
                TARGET_TA={calcResult.TARGET_TA}
                selfReportedTA={calcResult.ta}
              />
            </>
          )}

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
      </div>
    </>
  )
}

// ── Assumptions Panel ──────────────────────────────────────────────────────
function AssumptionsPanel({ overrides, onChange }: {
  overrides: CalcOverrides
  onChange: (o: CalcOverrides) => void
}) {
  const [open, setOpen] = useState(false)
  const utilTarget = overrides.utilisationTarget ?? 85
  const fleetFactor = overrides.fleetUtilFactor ?? 85
  const isModified = (overrides.utilisationTarget !== undefined && overrides.utilisationTarget !== 85)
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
              Plant target utilisation rate. Used to benchmark actual production and compute utilisation score. Industry default: 85%.
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

// ── Benchmark Positioning (pre-assessment) ─────────────────────────────────
const DISP_TIME_MAP: Record<string, number> = {
  'Under 15 minutes — fast response': 12,
  '15 to 25 minutes — acceptable': 20,
  '25 to 40 minutes — slow': 32,
  'Over 40 minutes — critical bottleneck': 45,
}

const QUARTILE_LABEL: Record<string, string> = {
  top:    'top 25% of GCC plants',
  mid:    'top half of GCC plants',
  low:    'bottom half of GCC plants',
  bottom: 'bottom 25% of GCC plants',
}
const QUARTILE_COLOR: Record<string, string> = {
  top:    'var(--green)',
  mid:    '#16a34a',
  low:    '#d97706',
  bottom: 'var(--red)',
}

function BenchmarkPositioning({ calcResult, answers }: { calcResult: CalcResult; answers: Answers }) {
  const dispTime = DISP_TIME_MAP[answers.order_to_dispatch as string] ?? null

  const items: Array<{ label: string; value: string; q: string; p50: string; p75: string }> = []

  if (calcResult.ta > 0) {
    items.push({
      label: 'Turnaround',
      value: `${calcResult.ta} min`,
      q: gcQuartile('turnaround', calcResult.ta),
      p50: '90 min', p75: '72 min',
    })
  }
  if (calcResult.rejectPct > 0) {
    items.push({
      label: 'Rejection rate',
      value: `${calcResult.rejectPct}%`,
      q: gcQuartile('rejection', calcResult.rejectPct),
      p50: '3.2%', p75: '1.4%',
    })
  }
  if (dispTime !== null) {
    items.push({
      label: 'Dispatch time',
      value: `${dispTime} min`,
      q: gcQuartile('dispatch', dispTime),
      p50: '22 min', p75: '12 min',
    })
  }

  if (items.length === 0) return null

  return (
    <div style={{
      background: 'var(--gray-50)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>
        GCC Peer Comparison
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {items.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontSize: '12px' }}>
            <span style={{ fontWeight: 600, color: 'var(--gray-600)', minWidth: '110px' }}>{item.label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: QUARTILE_COLOR[item.q] }}>{item.value}</span>
            <span style={{ color: QUARTILE_COLOR[item.q], fontWeight: 500 }}>— {QUARTILE_LABEL[item.q]}</span>
            <span style={{ color: 'var(--gray-400)', fontSize: '11px' }}>· Median {item.p50} · Best {item.p75}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── What we'll measure on-site (pre-assessment) ────────────────────────────
function WhatWeWillMeasure({ calcResult, answers }: { calcResult: CalcResult; answers: Answers }) {
  const dispTime = DISP_TIME_MAP[answers.order_to_dispatch as string] ?? null

  const items: Array<{ area: string; measurement: string; why: string }> = []

  if (calcResult.ta > 0 && calcResult.ta > calcResult.TARGET_TA) {
    items.push({
      area: 'Fleet turnaround',
      measurement: 'Truck cycle timestamps across 8–10 deliveries — plant departure, site arrival, pour start/end, return to plant.',
      why: `Your turnaround of ${calcResult.ta} min is ${calcResult.ta - calcResult.TARGET_TA} min above benchmark for your delivery radius (target ${calcResult.TARGET_TA} min).`,
    })
  }

  if (dispTime !== null && dispTime > 20) {
    items.push({
      area: 'Dispatch process',
      measurement: 'Order-to-truck-departure timing for 10 consecutive orders, plus a walkthrough of the dispatcher workflow and scheduling tools.',
      why: `Current dispatch averages ${dispTime} min — target is 15 min or less.`,
    })
  }

  if (calcResult.rejectPct > 3) {
    items.push({
      area: 'Rejection root cause',
      measurement: 'Rejection log review (last 30 days): reason codes, time in transit per rejected load, contractor breakdown.',
      why: `Rejection rate of ${calcResult.rejectPct}% is above the 3% threshold — root cause is rarely obvious from aggregate data.`,
    })
  }

  const utilPct = Math.round(calcResult.util * 100)
  if (calcResult.util > 0 && utilPct < 82) {
    items.push({
      area: 'Plant throughput',
      measurement: 'Hourly production log (2 representative days), downtime incident causes, and batch plant availability schedule.',
      why: `Utilisation at ${utilPct}% — we need to distinguish demand-constrained vs. operational bottleneck.`,
    })
  }

  if (items.length === 0) return null

  return (
    <div style={{
      background: 'var(--info-bg)', border: '1px solid var(--info-border)',
      borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--phase-workshop)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
        What we'll verify on-site
      </div>
      <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '12px', lineHeight: 1.5 }}>
        Based on your pre-assessment data, the on-site visit will focus on:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {items.map((item, i) => (
          <div key={i} style={{
            background: 'var(--white)', border: '1px solid var(--info-border)',
            borderRadius: '6px', padding: '10px 14px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '3px' }}>
              {item.area}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-700)', lineHeight: 1.55, marginBottom: '4px' }}>
              {item.measurement}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--phase-workshop)', fontStyle: 'italic' }}>
              Why: {item.why}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Start This Week (pre-assessment) ──────────────────────────────────────
const MANUAL_DISPATCH_TOOLS = new Set([
  'Spreadsheet combined with WhatsApp',
  'WhatsApp messages only — no spreadsheet',
  'Phone calls and a whiteboard or paper list',
])

function StartThisWeek({ calcResult, answers }: { calcResult: CalcResult; answers: Answers }) {
  const dispTime = DISP_TIME_MAP[answers.order_to_dispatch as string] ?? null
  const dispTool = answers.dispatch_tool as string | undefined

  const items: Array<{ tag: string; action: string; detail: string }> = []

  // Turnaround is the biggest lever — always first
  if (calcResult.ta > 0 && calcResult.ta > calcResult.TARGET_TA) {
    items.push({
      tag: 'Day 1',
      action: 'Time 5 full truck cycles this week',
      detail: `Record 4 timestamps per trip: plant departure → site arrival → pour complete → plant return. One person, one day. This tells you exactly where the ${calcResult.ta} minutes goes — site wait, transit, or washout — before the on-site visit.`,
    })
  }

  // Dispatch slow
  if (dispTime !== null && dispTime > 20) {
    items.push({
      tag: 'Day 1',
      action: 'Pre-load 3 trucks before first orders',
      detail: `30 minutes before your first expected delivery, have 3 trucks batched and ready. Assign one person as dedicated dispatcher for the 07:00–09:00 window. Brings dispatch time under 20 minutes with zero investment.`,
    })
  }

  // Rejection above threshold
  if (calcResult.rejectPct > 3) {
    items.push({
      tag: 'This week',
      action: 'Log a reason code on every rejected load',
      detail: `Four options: stiffening in transit / water added on site / contractor refusal / mix issue. Two minutes per event. After 5–7 rejections you will know which cause dominates — the fix is completely different for each one.`,
    })
  }

  // Manual dispatch tool (only if dispatch action not already shown)
  const dispatchActionShown = items.some(i => i.action.includes('Pre-load'))
  if (!dispatchActionShown && dispTool && MANUAL_DISPATCH_TOOLS.has(dispTool)) {
    items.push({
      tag: 'Day 2',
      action: 'Sketch a delivery zone map',
      detail: `Divide your delivery area into 2–3 zones by direction or distance. Route morning loads to one zone, afternoon to another. A hand-drawn A4 map is enough to start — cuts ad-hoc routing decisions and reduces empty return distance.`,
    })
  }

  if (items.length === 0) return null

  return (
    <div style={{
      background: '#F0FDF4', border: '1px solid #BBF7D0',
      borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
        Start this week
      </div>
      <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginBottom: '12px', lineHeight: 1.5 }}>
        Actions that require no diagnosis and no investment — start before the on-site visit:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.slice(0, 3).map((item, i) => (
          <div key={i} style={{
            background: 'var(--white)', border: '1px solid #BBF7D0',
            borderRadius: '6px', padding: '10px 14px',
            display: 'flex', gap: '12px', alignItems: 'flex-start',
          }}>
            <div style={{
              background: 'var(--green)', color: 'white',
              borderRadius: '4px', padding: '2px 8px', marginTop: '1px',
              fontSize: '9px', fontWeight: 700, flexShrink: 0,
              textTransform: 'uppercase', letterSpacing: '.3px', whiteSpace: 'nowrap',
            }}>
              {item.tag}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '3px' }}>
                {item.action}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-600)', lineHeight: 1.6 }}>
                {item.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
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
  phase?: Phase
  onSwitchToTracking?: () => void
}

export default function ReportView({ calcResult, answers, meta, report, assessmentId, reportReleased, isAdmin, overrides, onOverrideChange, phase, onSwitchToTracking }: ReportViewProps) {
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
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ── Logistics Intelligence (GPS) ─────────────────────────────────────────
  const [logisticsText, setLogisticsText] = useState<string | null>(null)
  const [gpsAvgTA, setGpsAvgTA] = useState<number | null>(null)

  useEffect(() => {
    if (assessmentId === 'demo') return
    supabase
      .from('logistics_analysis_results')
      .select('generated_section_text, confidence_score, avg_turnaround_minutes')
      .eq('assessment_id', assessmentId)
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.generated_section_text) {
          setLogisticsText(data.generated_section_text)
        }
        if (data?.avg_turnaround_minutes != null) {
          setGpsAvgTA(data.avg_turnaround_minutes)
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
    performingWell: totalLoss === 0 && issues.length === 0 && calcResult.overall !== null,
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

      {/* Top bar: "View full report" + admin controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Draft/release status */}
          {isAdmin && !reportReleased && (
            <span style={{ fontSize: '11px', color: 'var(--warning-dark)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: '4px', padding: '3px 8px', fontWeight: 500 }}>
              🔒 Draft
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 16px',
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            color: 'var(--gray-700)', cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          View full report →
        </button>
      </div>

      {/* Error banner */}
      {genError && (
        <div style={{
          background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px',
          padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: 'var(--red)',
        }}>
          ⚠ {genError}
        </div>
      )}

      {/* Incomplete margin — admin footnote only */}
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

      {/* ── Financial Headline ────────────────────────────────────────────── */}
      <FinancialHeadline totalLoss={totalLoss} dailyLoss={dailyLoss} calcResult={calcResult} />

      {/* ── KPI Pyramid ───────────────────────────────────────────────────── */}
      <KPIPyramid
        calcResult={calcResult}
        answers={answers}
        totalLoss={totalLoss}
        financialBottleneck={financialBottleneck}
      />

      {/* ── Pre-assessment: Benchmark Positioning + Quick Wins + On-site Preview ── */}
      {phase === 'workshop' && totalLoss > 0 && (
        <>
          <BenchmarkPositioning calcResult={calcResult} answers={answers} />
          <StartThisWeek calcResult={calcResult} answers={answers} />
          <WhatWeWillMeasure calcResult={calcResult} answers={answers} />
        </>
      )}

      {/* ── Assumptions Panel (admin) ─────────────────────────────────────── */}
      {isAdmin && onOverrideChange && (
        <AssumptionsPanel overrides={overrides ?? {}} onChange={onOverrideChange} />
      )}

      {/* ── Findings ─────────────────────────────────────────────────────── */}
      {issues.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.4px' }}>
            Findings ({issues.filter(i => i.loss > 0 || i.category === 'bottleneck').length})
          </h3>
          {issues
            .filter(issue => issue.loss > 0 || issue.category === 'bottleneck')
            .map((issue, i) => (
              <FindingCard
                key={i}
                issue={issue}
                index={i}
                isOverlap={issue.category === 'bottleneck' && issue.loss > 0 && issue.loss < primaryBottleneckLoss}
              />
            ))}
        </div>
      )}

      {calcResult.overall !== null && issues.length === 0 && (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px', marginBottom: '24px' }}>
          No operational issues identified — this plant is performing at or above benchmark on all primary metrics.
        </div>
      )}

      {calcResult.overall === null && (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px', marginBottom: '24px' }}>
          Answer the questions above to generate operational findings.
        </div>
      )}

      {/* ── Recovery Simulator (3 sliders) ──────────────────────────────── */}
      <RecoveryPanel calcResult={calcResult} />

      {/* ── Start Tracking Card ──────────────────────────────────────────── */}
      <StartTrackingCard
        calcResult={calcResult}
        issues={issues}
        totalLoss={totalLoss}
        financialBottleneck={financialBottleneck}
        onSwitchToTracking={onSwitchToTracking}
      />

      {/* ── Action Plan ──────────────────────────────────────────────────── */}
      <ActionsPanel issues={issues} />

      {/* ── Full Report Drawer (always in DOM) ───────────────────────────── */}
      <FullReportDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        texts={texts}
        generating={generating}
        genError={genError}
        onGenerate={generate}
        onSave={saveSection}
        onGenerateAll={generateAll}
        hasAllSections={hasAllSections}
        hasAnySections={hasAnySections}
        calcResult={calcResult}
        answers={answers}
        meta={meta}
        assessmentId={assessmentId}
        issues={issues}
        primaryBottleneckLoss={primaryBottleneckLoss}
        logisticsText={logisticsText}
        gpsAvgTA={gpsAvgTA}
        totalLoss={totalLoss}
        isAdmin={isAdmin}
      />

    </div>
  )
}
