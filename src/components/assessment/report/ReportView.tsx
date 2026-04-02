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
  return '$' + n.toLocaleString('en-US')
}
function fmtK(n: number): string {
  if (n >= 10000) return `$${Math.round(n / 1000)}k`
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n}`
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
          value={`${Math.round(calcResult.rejectPct)}%`}
          target="target <3%"
          isBottleneck={isRejectBn}
          isWarn={rejectWarn}
          size="small"
          bar={<KpiBarLower current={calcResult.rejectPct} target={3} max={Math.max(calcResult.rejectPct * 1.5, 6)} isBottleneck={isRejectBn} isWarn={rejectWarn} />}
          gap={rejectWarn ? `+${Math.round(calcResult.rejectPct - 3)} pp over target` : 'on target'}
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
          gap={delWarn && targetDelPerTruck > 0 ? `−${Math.round(targetDelPerTruck - delPerTruck)} per day` : ''}
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
    `Rejection rate: ${Math.round(calcResult.rejectPct)}%`,
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
        background: 'linear-gradient(135deg, #f0faf6 0%, #fff 60%)',
        border: '1.5px solid #b5dfc9',
        borderRadius: '10px', padding: '20px 24px', marginBottom: '10px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <span style={{ fontSize: '24px', lineHeight: 1 }}>✓</span>
        <div>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '4px' }}>Plant status</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#1f8a5e', lineHeight: 1, marginBottom: '4px' }}>Performing at benchmark</div>
          <div style={{ fontSize: '11px', color: '#9b9b9b' }}>No operational losses identified — all primary metrics at or above target</div>
        </div>
      </div>
    )
  }
  return (
    <div style={{
      background: 'linear-gradient(135deg, #fff8f8 0%, #fff 60%)',
      border: '1.5px solid #f5c6c6',
      borderRadius: '10px', padding: '20px 24px', marginBottom: '10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px',
    }}>
      <div>
        <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '4px' }}>
          {calcResult.demandSufficient === false ? 'Margin improvement potential' : 'Potential monthly loss'}
        </div>
        <div style={{ fontSize: '30px', fontWeight: 800, color: '#cc3333', lineHeight: 1 }}>
          {fmt(totalLoss)}{' '}
          <span style={{ fontSize: '16px', fontWeight: 500, color: '#e88' }}>/ month</span>
        </div>
        <div style={{ fontSize: '11px', color: '#9b9b9b', marginTop: '6px' }}>
          {calcResult.demandSufficient === false
            ? 'demand-constrained — operational cost saving only'
            : `${fmt(dailyLoss)} every working day — based on current operational data`}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '4px' }}>Per working day</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#cc3333' }}>{fmt(dailyLoss)}</div>
      </div>
    </div>
  )
}

// ── Impact Hook ────────────────────────────────────────────────────────────
function ImpactHook({ bnLoss, bnDailyLoss, calcResult, issues, financialBottleneck }: {
  bnLoss: number
  bnDailyLoss: number
  calcResult: CalcResult
  issues: Issue[]
  financialBottleneck: string | null
}) {
  if (calcResult.overall === null) {
    return (
      <div style={{
        border: '1px dashed var(--gray-200)', borderRadius: '10px',
        padding: '36px 24px', textAlign: 'center',
        color: '#9b9b9b', fontSize: '13px', marginBottom: '10px',
      }}>
        Answer the questions above to generate your performance analysis
      </div>
    )
  }

  if (bnLoss === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #f0faf6 0%, #fff 60%)',
        border: '1.5px solid #b5dfc9', borderRadius: '10px',
        padding: '24px 28px', marginBottom: '10px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <span style={{ fontSize: '28px', lineHeight: 1 }}>✓</span>
        <div>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '4px' }}>Plant status</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#1f8a5e', lineHeight: 1, marginBottom: '4px' }}>Performing at benchmark</div>
          <div style={{ fontSize: '11px', color: '#9b9b9b' }}>No operational losses identified — all primary metrics at or above target</div>
        </div>
      </div>
    )
  }

  // Primary driver label + metric
  const driverLabel = financialBottleneck === 'Fleet' ? 'Logistics' : financialBottleneck
  const driverMetric = (() => {
    switch (financialBottleneck) {
      case 'Fleet':
        return calcResult.ta > 0 ? `${calcResult.ta} min vs ${calcResult.TARGET_TA} min target` : null
      case 'Dispatch':
        return calcResult.dispatchMin ? `${calcResult.dispatchMin} min vs 15 min target` : null
      case 'Quality':
        return calcResult.rejectPct > 0 ? `${Math.round(calcResult.rejectPct)}% vs 1.5% target` : null
      case 'Production': {
        const up = Math.round(calcResult.util * 100)
        return up > 0 ? `${up}% vs ${calcResult.utilisationTarget}% target` : null
      }
      default: return null
    }
  })()

  // Right side mirrors left — bnLoss is both the leakage and the recoverable for this dimension

  return (
    <div style={{
      border: '1.5px solid #f0f0ee', borderRadius: '12px',
      overflow: 'hidden', marginBottom: '16px',
      display: 'grid', gridTemplateColumns: '3fr 2fr',
    }}>
      {/* Left — Estimated revenue leakage */}
      <div style={{ padding: '24px', background: '#ffe0e0', borderRight: '1px solid #f5c6c6' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#c0a0a0', marginBottom: '8px' }}>
          {calcResult.demandSufficient === false ? 'Margin improvement potential' : 'Estimated revenue leakage'}
        </div>
        <div style={{ fontSize: '48px', fontWeight: 800, color: '#cc3333', lineHeight: 1, letterSpacing: '-1px', marginBottom: '4px' }}>
          {fmtK(bnLoss)}<span style={{ fontSize: '20px', fontWeight: 500, color: '#e88', marginLeft: '8px' }}>/ month</span>
        </div>
        <div style={{ fontSize: '13px', color: '#c09090', marginBottom: '16px' }}>
          ≈ {fmtK(bnDailyLoss)} per day
        </div>
        {driverLabel && (
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '3px' }}>
            Primary driver: <strong style={{ color: '#cc3333' }}>{driverLabel}</strong>
          </div>
        )}
        {driverMetric && (
          <div style={{ fontSize: '12px', color: '#aaa' }}>{driverMetric}</div>
        )}
      </div>

      {/* Right — Recoverable revenue */}
      <div style={{ padding: '24px', background: '#f6fbf8' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#7ab89a', marginBottom: '8px' }}>
          Recoverable revenue
        </div>
        {bnLoss > 0 ? (
          <>
            <div style={{ fontSize: '40px', fontWeight: 800, color: '#1a6644', lineHeight: 1, letterSpacing: '-1px', marginBottom: '4px' }}>
              {fmtK(bnLoss)}<span style={{ fontSize: '17px', fontWeight: 500, color: '#5aaa82', marginLeft: '8px' }}>/ month</span>
            </div>
            <div style={{ fontSize: '13px', color: '#7ab89a', marginBottom: '20px' }}>
              ≈ {fmtK(bnDailyLoss)} per day
            </div>
            {driverLabel && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a6644', marginBottom: '4px' }}>
                  Driven by {driverLabel.toLowerCase()} improvement
                </div>
                {driverMetric && (
                  <div style={{ fontSize: '12px', color: '#7ab89a' }}>{driverMetric}</div>
                )}
              </div>
            )}
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a6644', marginBottom: '20px' }}>
              Up to {fmtK(bnLoss)} / month recoverable
            </div>
            <div style={{ fontSize: '11px', color: '#5aaa82', marginBottom: '6px' }}>
              + Additional upside discovered in other operational areas
            </div>
            <div style={{ fontSize: '11px', color: '#b0b0b0' }}>
              (Based on current operational data)
            </div>
          </>
        ) : (
          <div style={{ fontSize: '13px', color: '#aaa', marginTop: '8px' }}>
            No recoverable margin identified
          </div>
        )}
      </div>
    </div>
  )
}

// ── Score Overview ─────────────────────────────────────────────────────────
function ScoreOverview({ calcResult, meta, phase }: {
  calcResult: CalcResult
  meta?: { country?: string; plant?: string; date?: string }
  phase?: Phase
}) {
  if (calcResult.overall === null) return null
  const overall = Math.round(calcResult.overall)

  const dims = [
    { label: 'Production', score: calcResult.scores?.prod   ?? null },
    { label: 'Fleet',      score: calcResult.scores?.fleet  ?? null },
    { label: 'Dispatch',   score: calcResult.scores?.dispatch ?? null },
    { label: 'Quality',    score: calcResult.scores?.quality  ?? null },
  ].filter(d => d.score !== null) as { label: string; score: number }[]

  const belowBenchmark = dims.filter(d => Math.round(d.score) < 75).length
  const plantName = meta?.plant || 'Plant'
  const phaseLabel = phase === 'workshop' ? 'Pre-assessment' : phase === 'onsite' ? 'On-site Assessment' : 'Assessment'

  function chipStyle(score: number): React.CSSProperties {
    const s = Math.round(score)
    if (s < 60)  return { color: '#cc3333', borderColor: '#f5c6c6', background: '#fff8f8' }
    if (s < 75)  return { color: '#c96a00', borderColor: '#f5ddb5', background: '#fffaf2' }
    return               { color: '#1f8a5e', borderColor: '#b5dfc9', background: '#f0faf6' }
  }
  const overallStyle = chipStyle(overall)

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e6',
      borderRadius: '10px', padding: '24px', marginBottom: '10px',
      display: 'flex', alignItems: 'center', gap: '32px',
    }}>
      {/* Score circle */}
      <div style={{
        width: '80px', height: '80px', borderRadius: '50%',
        border: `4px solid ${overallStyle.color}`,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: '28px', fontWeight: 700, color: overallStyle.color, lineHeight: 1 }}>{overall}</span>
        <span style={{ fontSize: '11px', color: '#9b9b9b' }}>/100</span>
      </div>
      {/* Right side */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>
          {plantName} — {phaseLabel}
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '14px' }}>
          {belowBenchmark > 0
            ? `Performance below benchmark on ${belowBenchmark} of ${dims.length} dimension${dims.length !== 1 ? 's' : ''}`
            : 'All dimensions at or above benchmark'}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {dims.map(d => (
            <span key={d.label} style={{
              fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
              fontWeight: 600, border: '1.5px solid',
              ...chipStyle(d.score),
            }}>
              {d.label} {Math.round(d.score)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Dimension Summary (auto-generated diagnosis bullets) ───────────────────
function DimensionSummary({ calcResult, issues, answers }: {
  calcResult: CalcResult
  issues: Issue[]
  answers: Answers
}) {
  if (calcResult.overall === null) return null

  const dispTimeMap: Record<string, number> = {
    'Under 15 minutes — fast response': 12,
    '15 to 25 minutes — acceptable': 20,
    '25 to 40 minutes — slow': 32,
    'Over 40 minutes — critical bottleneck': 45,
  }
  const dispMin = dispTimeMap[answers.order_to_dispatch as string] ?? null
  const utilPct = Math.round(calcResult.util * 100)
  const taLeak = calcResult.demandSufficient === false
    ? calcResult.turnaroundLeakMonthlyCostOnly
    : calcResult.turnaroundLeakMonthly

  type DimEntry = { label: string; score: number | null; text: string; loss: number }
  const dims: DimEntry[] = []

  // Fleet / Logistics
  const taExcess = Math.round(calcResult.ta - calcResult.TARGET_TA)
  if (taExcess > 0) {
    const fleetIssue = issues.find(i => i.dimension === 'Fleet')
    const extra = fleetIssue?.rec ? ` ${fleetIssue.rec}.` : ''
    dims.push({
      label: 'Logistics',
      score: calcResult.scores?.fleet ?? null,
      text: `Turnaround at ${calcResult.ta} min — ${taExcess} min above the ${calcResult.TARGET_TA}-min benchmark.${extra} Costs ${fmt(Math.round(taLeak))}/month.`,
      loss: Math.round(taLeak),
    })
  }

  // Dispatch
  if (dispMin !== null && dispMin > 15) {
    const dispCoeff = Math.max(100, Math.round(taLeak * 0.22))
    const dispLoss = Math.round((dispMin - 15) * dispCoeff)
    const dispIssue = issues.find(i => i.dimension === 'Dispatch')
    const extra = dispIssue?.rec ? ` ${dispIssue.rec}.` : ''
    dims.push({
      label: 'Dispatch',
      score: calcResult.scores?.dispatch ?? null,
      text: `Order-to-dispatch averaging ${dispMin} min vs 15-min target.${extra} Costs ${fmt(dispLoss)}/month.`,
      loss: dispLoss,
    })
  }

  // Quality
  if (calcResult.rejectPct > 1.5 && calcResult.rejectLeakMonthly > 0) {
    const qualIssue = issues.find(i => i.dimension === 'Quality')
    const extra = qualIssue?.rec ? ` ${qualIssue.rec}.` : ''
    dims.push({
      label: 'Quality',
      score: calcResult.scores?.quality ?? null,
      text: `Rejection rate ${Math.round(calcResult.rejectPct)}%${extra} Costs ${fmt(Math.round(calcResult.rejectLeakMonthly))}/month.`,
      loss: Math.round(calcResult.rejectLeakMonthly),
    })
  }

  // Production
  if (utilPct > 0 && utilPct < calcResult.utilisationTarget && calcResult.capLeakMonthly > 0) {
    dims.push({
      label: 'Production',
      score: calcResult.scores?.prod ?? null,
      text: `Plant utilisation at ${utilPct}% vs ${calcResult.utilisationTarget}% target — capacity constrained by downstream fleet cycle time.`,
      loss: Math.round(calcResult.capLeakMonthly),
    })
  }

  if (dims.length === 0) return null

  function scoreChipStyle(score: number | null): React.CSSProperties {
    if (score === null) return { color: '#9b9b9b', background: '#f5f5f3', borderColor: '#e8e8e6' }
    const s = Math.round(score)
    if (s < 60) return { color: '#cc3333', background: '#fff0f0', borderColor: '#f5c6c6' }
    if (s < 75) return { color: '#c96a00', background: '#fffaf2', borderColor: '#f5ddb5' }
    return             { color: '#1a6644', background: '#f0faf6', borderColor: '#b5dfc9' }
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e6',
      borderRadius: '10px', padding: '20px 24px', marginBottom: '10px',
    }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '16px' }}>
        Operational diagnosis
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {dims.map((dim, i) => {
          const cs = scoreChipStyle(dim.score)
          return (
            <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, padding: '3px 10px', borderRadius: '20px',
                fontSize: '11px', fontWeight: 700,
                border: `1.5px solid ${cs.borderColor as string}`,
                color: cs.color as string, background: cs.background as string,
                whiteSpace: 'nowrap', marginTop: '1px',
              }}>
                {dim.label}{dim.score !== null ? ` ${Math.round(dim.score)}` : ''}
              </div>
              <div style={{ fontSize: '13px', color: '#444', lineHeight: 1.5 }}>
                {dim.text}
              </div>
            </div>
          )
        })}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a6644' }}>{label}</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: savings > 0 ? '#1a6644' : '#9b9b9b' }}>
          {atCurrent ? '' : savings > 0 ? `${fmt(savings)} / mo` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#5aaa82', marginBottom: '4px' }}>
        <span>Target: {targetVal.toFixed(decimals)}{unit}</span>
        <span id={`slider-cur-${label}`}>{currentVal.toFixed(decimals)}{unit} (baseline)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <input
          type="range"
          min={direction === 'down' ? targetVal : currentVal}
          max={direction === 'down' ? currentVal : targetVal}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#2a9d6e', cursor: 'pointer', height: '6px' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontSize: '13px', fontWeight: 700,
          color: savings > 0 ? '#1a6644' : '#9b9b9b',
        }}>
          {atCurrent ? 'Move slider to explore savings' : savings > 0 ? `${fmt(savings)} / mo` : '$0 / mo'}
        </span>
        {!atCurrent && improvement > 0 && (
          <span style={{ fontSize: '10px', color: '#5aaa82' }}>
            at {value.toFixed(decimals)}{unit}
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
  const maxSavings = (cfg: SliderConfig | null): number => {
    if (!cfg) return 0
    const imp = cfg.direction === 'down' ? cfg.currentVal - cfg.targetVal : cfg.targetVal - cfg.currentVal
    return Math.max(0, Math.round(imp * cfg.coefficient))
  }
  const totalMaxRecoverable = maxSavings(fleetConfig) + maxSavings(dispatchConfig) + maxSavings(qualityConfig)
  const totalSavings =
    calcSavings(fleetConfig, fleetVal) +
    calcSavings(dispatchConfig, dispatchVal) +
    calcSavings(qualityConfig, qualityVal)

  // Baselines for header
  const baselines: string[] = []
  if (fleetConfig) baselines.push(`Turnaround: ${fleetConfig.currentVal} min`)
  if (dispatchConfig) baselines.push(`Dispatch: ${dispatchConfig.currentVal} min`)
  if (qualityConfig) baselines.push(`Rejection: ${qualityConfig.currentVal}%`)

  return (
    <div style={{
      marginBottom: '16px',
      background: '#f6fbf8',
      border: '1px solid #c8e8da',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid #c8e8da',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#5aaa82', marginBottom: '6px' }}>
            Recovery simulator
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#1a6644', lineHeight: 1 }}>
            {fmt(totalMaxRecoverable)}
          </div>
          <div style={{ fontSize: '11px', color: '#5aaa82', marginTop: '4px' }}>max monthly recovery</div>
        </div>
        {baselines.length > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', color: '#5aaa82', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.5px' }}>Baselines</div>
            {baselines.map(b => (
              <div key={b} style={{ fontSize: '11px', color: '#2a6644', fontWeight: 500 }}>{b}</div>
            ))}
          </div>
        )}
      </div>

      {/* Sliders */}
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {fleetConfig && (
          <RecoverySliderRow config={fleetConfig} value={fleetVal} onChange={setFleetVal} />
        )}
        {dispatchConfig && (
          <RecoverySliderRow config={dispatchConfig} value={dispatchVal} onChange={setDispatchVal} />
        )}
        {qualityConfig && (
          <RecoverySliderRow config={qualityConfig} value={qualityVal} onChange={setQualityVal} />
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 24px',
        background: 'rgba(42,157,110,.06)',
        borderTop: '1px solid #c8e8da',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: '12px', color: '#2a6644' }}>Combined monthly saving</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: totalSavings > 0 ? '#1a6644' : '#b0b0b0' }}>
          {totalSavings > 0 ? `${fmt(totalSavings)} / mo` : '$0 / mo'}
        </div>
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
      case 'Fleet':      return 'Site wait time starts falling — first measurable reduction in turnaround'
      case 'Dispatch':   return 'Order-to-dispatch time drops below 20 min on first attempt'
      case 'Quality':    return 'Rejection pattern identified — dominant cause confirmed'
      case 'Production': return 'Hourly utilisation baseline established'
      default:           return 'First weekly data point captured and logged'
    }
  })()

  // Locked baselines for footer
  const baselines: string[] = []
  if (calcResult.ta > 0) baselines.push(`Turnaround ${calcResult.ta} min`)
  if (calcResult.dispatchMin) baselines.push(`Dispatch ${calcResult.dispatchMin} min`)
  if (calcResult.rejectPct > 0) baselines.push(`Rejection ${Math.round(calcResult.rejectPct)}%`)

  const rows = [
    { label: 'Biggest loss',       value: topIssue.t, bold: true },
    { label: 'Value at stake',     value: `${fmt(topIssue.loss)} / month`, bold: true },
    { label: 'First action',       value: topIssue.action || 'See action plan below', bold: false },
    { label: 'Expected in 7 days', value: sevenDay, bold: false },
  ]

  return (
    <div style={{
      marginBottom: '10px',
      background: '#fff',
      border: '1.5px solid #1a1a1a',
      borderRadius: '10px', overflow: 'hidden',
    }}>
      {/* Black eyebrow */}
      <div style={{
        padding: '10px 24px',
        background: '#1a1a1a',
        fontSize: '9px', fontWeight: 700, letterSpacing: '1.4px',
        textTransform: 'uppercase', color: '#fff',
      }}>
        Start tracking your improvements now
      </div>

      {/* Rows */}
      <div>
        {rows.map((row, i) => (
          <div key={row.label}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0', padding: '14px 24px' }}>
              <div style={{ width: '160px', flexShrink: 0, fontSize: '11px', fontWeight: 600, color: '#9b9b9b', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                {row.label}
              </div>
              <div style={{ flex: 1, fontSize: row.bold ? '15px' : '14px', fontWeight: row.bold ? 700 : 400, color: '#1a1a1a', lineHeight: 1.4 }}>
                {row.value}
              </div>
            </div>
            {i < rows.length - 1 && <div style={{ height: '1px', background: '#f0f0ee', margin: '0 24px' }} />}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px',
        padding: '16px 24px', background: '#fafaf9', borderTop: '1px solid #e8e8e6',
      }}>
        <span style={{ fontSize: '11px', color: '#9b9b9b', lineHeight: 1.5 }}>
          Lock in baselines and track recovery{baselines.length > 0 ? ` — ${baselines.join(' · ')}` : ''}
        </span>
        <button
          type="button"
          onClick={onSwitchToTracking}
          style={{
            background: '#1a1a1a', color: '#fff',
            border: 'none', borderRadius: '8px',
            padding: '11px 20px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            fontFamily: 'var(--font)',
          }}
        >
          Activate 90-day tracking →
        </button>
      </div>
    </div>
  )
}

// ── Start Here Card ────────────────────────────────────────────────────────
function StartHereCard({ calcResult, issues, totalLoss, financialBottleneck, onSwitchToTracking }: {
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
      case 'Fleet':      return 'Site wait time starts falling — first measurable reduction in turnaround'
      case 'Dispatch':   return 'Order-to-dispatch time drops below 20 min on first attempt'
      case 'Quality':    return 'Rejection pattern identified — dominant cause confirmed'
      case 'Production': return 'Hourly utilisation baseline established'
      default:           return 'First weekly data point captured and logged'
    }
  })()

  return (
    <div style={{
      background: '#fff', border: '1.5px solid #1a1a1a',
      borderRadius: '10px', overflow: 'hidden', marginBottom: '10px',
    }}>
      {/* Black eyebrow */}
      <div style={{
        padding: '10px 24px', background: '#1a1a1a',
        fontSize: '9px', fontWeight: 700, letterSpacing: '1.6px',
        textTransform: 'uppercase', color: '#fff',
      }}>
        Start here
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
          {topIssue.t}
        </div>
        <div style={{ fontSize: '13px', color: '#666', marginBottom: '20px', lineHeight: 1.5 }}>
          Costs <span style={{ fontWeight: 600, color: '#cc3333' }}>{fmt(topIssue.loss)}/month</span>
          {topIssue.rec ? ` — ${topIssue.rec}` : ''}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {topIssue.action && (
            <div>
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '5px' }}>
                This week
              </div>
              <div style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.5 }}>{topIssue.action}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '5px' }}>
              Expected in 7 days
            </div>
            <div style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.5 }}>{sevenDay}</div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div style={{
        padding: '14px 24px', background: '#fafaf9', borderTop: '1px solid #e8e8e6',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
      }}>
        <span style={{ fontSize: '11px', color: '#9b9b9b', lineHeight: 1.5 }}>
          Track your improvement week-by-week and prove the ROI
        </span>
        <button
          type="button"
          onClick={onSwitchToTracking}
          style={{
            background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '8px',
            padding: '11px 20px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'var(--font)',
          }}
        >
          Activate 90-day tracking →
        </button>
      </div>
    </div>
  )
}

// ── Recovery Breakdown ─────────────────────────────────────────────────────
function RecoveryBreakdown({ calcResult }: { calcResult: CalcResult }) {
  if (calcResult.overall === null) return null

  const taLeak = calcResult.demandSufficient === false
    ? calcResult.turnaroundLeakMonthlyCostOnly
    : calcResult.turnaroundLeakMonthly

  const turnaroundLoss = calcResult.ta > calcResult.TARGET_TA ? Math.round(taLeak) : 0
  const dispatchCoeff = Math.max(100, Math.round(taLeak * 0.22))
  const excessDispatch = Math.max(0, (calcResult.dispatchMin ?? 0) - 15)
  const dispatchLoss = excessDispatch > 0 ? Math.round(excessDispatch * dispatchCoeff) : 0
  const rejectionLoss = Math.round(calcResult.rejectLeakMonthly || 0)

  const items = [
    {
      label: 'Turnaround time',
      subLabel: calcResult.ta > calcResult.TARGET_TA
        ? `${calcResult.ta} min → ${calcResult.TARGET_TA} min target`
        : 'At benchmark',
      loss: turnaroundLoss,
      show: turnaroundLoss > 0,
    },
    {
      label: 'Dispatch time',
      subLabel: excessDispatch > 0
        ? `${calcResult.dispatchMin} min → 15 min target`
        : 'At benchmark',
      loss: dispatchLoss,
      show: dispatchLoss > 0,
    },
    {
      label: 'Rejection rate',
      subLabel: calcResult.rejectPct > 1.5
        ? `${Math.round(calcResult.rejectPct)}% → 1.5% target`
        : 'At benchmark',
      loss: rejectionLoss,
      show: rejectionLoss > 0,
    },
  ].filter(i => i.show)

  if (items.length === 0) return null
  const maxLoss = Math.max(...items.map(i => i.loss))

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e6',
      borderRadius: '10px', padding: '20px 24px', marginBottom: '10px',
    }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '16px' }}>
        Recovery breakdown
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: i < items.length - 1 ? '16px' : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{item.label}</span>
              <span style={{ fontSize: '11px', color: '#9b9b9b', marginLeft: '8px' }}>{item.subLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', flexShrink: 0 }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#1a6644' }}>{fmt(item.loss)}</span>
              <span style={{ fontSize: '10px', color: '#9b9b9b' }}>/mo</span>
            </div>
          </div>
          <div style={{ height: '4px', background: '#f0f0ee', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              height: '4px',
              width: `${Math.round((item.loss / maxLoss) * 100)}%`,
              background: '#2a9d6e', borderRadius: '2px',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Metrics Snapshot ───────────────────────────────────────────────────────
function MetricsSnapshot({ calcResult, answers }: { calcResult: CalcResult; answers: Answers }) {
  if (calcResult.overall === null) return null

  const dispTimeMap: Record<string, number> = {
    'Under 15 minutes — fast response': 12,
    '15 to 25 minutes — acceptable': 20,
    '25 to 40 minutes — slow': 32,
    'Over 40 minutes — critical bottleneck': 45,
  }
  const dispTime = dispTimeMap[answers.order_to_dispatch as string] ?? null
  const utilPct = Math.round(calcResult.util * 100)

  type Status = 'ok' | 'caution' | 'warn'
  const metrics: { label: string; value: string; target: string; status: Status }[] = [
    {
      label: 'Turnaround',
      value: calcResult.ta > 0 ? `${calcResult.ta} min` : '—',
      target: `Target ${calcResult.TARGET_TA} min`,
      status: calcResult.ta > calcResult.TARGET_TA ? 'warn' : 'ok',
    },
    {
      label: 'Dispatch',
      value: dispTime !== null ? `${dispTime} min` : '—',
      target: 'Target 15 min',
      status: dispTime === null ? 'ok' : dispTime > 25 ? 'warn' : dispTime > 15 ? 'caution' : 'ok',
    },
    {
      label: 'Rejection',
      value: calcResult.rejectPct > 0 ? `${Math.round(calcResult.rejectPct)}%` : '—',
      target: 'Target 1.5%',
      status: calcResult.rejectPct > 3 ? 'warn' : calcResult.rejectPct > 1.5 ? 'caution' : 'ok',
    },
    {
      label: 'Utilisation',
      value: utilPct > 0 ? `${utilPct}%` : '—',
      target: `Target ${calcResult.utilisationTarget}%`,
      status: utilPct > 0 && utilPct < 80 ? 'warn' : utilPct > 0 && utilPct < calcResult.utilisationTarget ? 'caution' : 'ok',
    },
  ]

  function metricStyle(status: Status) {
    if (status === 'warn')    return { bg: '#fff8f8', border: '#f5c6c6', valueColor: '#cc3333' }
    if (status === 'caution') return { bg: '#fffaf2', border: '#f5ddb5', valueColor: '#c96a00' }
    return                           { bg: '#f9faf9', border: '#e8e8e6', valueColor: '#1a1a1a' }
  }

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '8px', paddingLeft: '2px' }}>
        Metrics snapshot
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        {metrics.map(m => {
          const s = metricStyle(m.status)
          return (
            <div key={m.label} style={{
              background: s.bg, border: `1px solid ${s.border}`,
              borderRadius: '8px', padding: '12px 14px',
            }}>
              <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', color: '#9b9b9b', marginBottom: '4px' }}>
                {m.label}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: s.valueColor, lineHeight: 1, marginBottom: '3px' }}>
                {m.value}
              </div>
              <div style={{ fontSize: '9px', color: '#9b9b9b' }}>{m.target}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Next Improvements (collapsed by default) ───────────────────────────────
function NextImprovements({ issues }: { issues: Issue[] }) {
  const [expanded, setExpanded] = useState(false)

  const actionIssues = [...issues]
    .filter(i => i.loss > 0)
    .sort((a, b) => b.loss - a.loss)

  if (actionIssues.length === 0) return null

  function ActionRow({ issue, num, isLast }: { issue: Issue; num: number; isLast: boolean }) {
    const isUrgent = num <= 2
    const isNear = num === 3
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '14px',
        padding: '14px 20px',
        borderBottom: isLast ? 'none' : '1px solid #f0f0ee',
      }}>
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
          background: isUrgent ? '#fff0f0' : isNear ? '#fff7ed' : '#f5f5f3',
          border: `1.5px solid ${isUrgent ? '#f5c6c6' : isNear ? '#fdd8a0' : '#e8e8e6'}`,
          color: isUrgent ? '#cc3333' : isNear ? '#c96a00' : '#666',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700,
        }}>
          {num}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: issue.action ? '2px' : 0 }}>
            {issue.t}
          </div>
          {issue.action && (
            <div style={{ fontSize: '12px', color: '#666' }}>{issue.action}</div>
          )}
        </div>
        {issue.loss > 0 && (
          <div style={{
            fontSize: '11px', fontWeight: 600, color: '#2a9d6e',
            background: '#f0faf6', border: '1px solid #b5dfc9',
            borderRadius: '20px', padding: '1px 8px', flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            → {fmt(Math.round(issue.loss / 1000))}k/mo
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '10px', background: '#fff', border: '1px solid #e8e8e6', borderRadius: '10px', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', padding: '14px 20px',
          background: '#fafaf9', border: 'none',
          borderBottom: expanded ? '1px solid #f0f0ee' : 'none',
          fontSize: '12px', fontWeight: 600, color: '#1a1a1a',
          cursor: 'pointer', fontFamily: 'var(--font)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>Improvement opportunities ({actionIssues.length})</span>
        <span style={{ fontSize: '10px', color: '#9b9b9b' }}>{expanded ? '↑ Collapse' : '↓ Expand'}</span>
      </button>
      {expanded && actionIssues.map((issue, i) => (
        <ActionRow key={i} issue={issue} num={i + 1} isLast={i === actionIssues.length - 1} />
      ))}
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

  function ActionRow({ issue, num, isLast }: { issue: Issue; num: number; isLast: boolean }) {
    const isUrgent = num <= 2
    const isNear = num === 3
    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '14px',
        padding: '14px 20px',
        borderBottom: isLast ? 'none' : '1px solid #f0f0ee',
      }}>
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
          background: isUrgent ? '#fff0f0' : isNear ? '#fff7ed' : '#f5f5f3',
          border: `1.5px solid ${isUrgent ? '#f5c6c6' : isNear ? '#fdd8a0' : '#e8e8e6'}`,
          color: isUrgent ? '#cc3333' : isNear ? '#c96a00' : '#666',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700,
        }}>
          {num}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{issue.t}</span>
          </div>
          {issue.action && (
            <div style={{ fontSize: '12px', color: '#666' }}>{issue.action}</div>
          )}
        </div>
        {issue.loss > 0 && (
          <div style={{
            fontSize: '11px', fontWeight: 600, color: '#2a9d6e',
            background: '#f0faf6', border: '1px solid #b5dfc9',
            borderRadius: '20px', padding: '1px 8px', flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            → {fmt(Math.round(issue.loss / 1000))}k/mo
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '10px', background: '#fff', border: '1px solid #e8e8e6', borderRadius: '10px', overflow: 'hidden' }}>
      {/* Immediate actions group header */}
      <div style={{ padding: '10px 20px', background: '#fff0f0', borderBottom: '1px solid #f0f0ee', fontSize: '10px', fontWeight: 700, color: '#cc3333', letterSpacing: '.8px', textTransform: 'uppercase' }}>
        Week 1–2 — Immediate
      </div>
      {immediate.map((issue, i) => (
        <ActionRow key={i} issue={issue} num={i + 1} isLast={i === immediate.length - 1 && later.length === 0} />
      ))}
      {later.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setLaterExpanded(v => !v)}
            style={{
              width: '100%', padding: '10px 20px',
              background: '#fafaf9', borderTop: '1px solid #f0f0ee',
              border: 'none', borderBottom: laterExpanded ? '1px solid #f0f0ee' : 'none',
              fontSize: '11px', fontWeight: 600, color: '#9b9b9b',
              cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center',
            }}
          >
            {laterExpanded ? '↑ Collapse' : `Later actions (${later.length}) ↓`}
          </button>
          {laterExpanded && later.map((issue, i) => (
            <ActionRow key={i + 3} issue={issue} num={i + 4} isLast={i === later.length - 1} />
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
  phase?: Phase
  financialBottleneck: string | null
}

function FullReportDrawer({
  open, onClose,
  texts, generating, genError, onGenerate, onSave, onGenerateAll, hasAllSections, hasAnySections,
  calcResult, answers, meta, assessmentId,
  issues, primaryBottleneckLoss,
  logisticsText, gpsAvgTA,
  totalLoss, isAdmin, phase, financialBottleneck,
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

          {/* Executive Snapshot — static key figures */}
          {calcResult.overall !== null && (() => {
            const bnLossDrawer = financialBottleneck
              ? issues.filter(i => i.dimension === financialBottleneck).reduce((s, i) => s + (i.loss ?? 0), 0)
              : 0
            const bottleneckLabel = financialBottleneck === 'Fleet' ? 'Logistics' : (financialBottleneck ?? '—')
            const bullets: { label: string; value: string }[] = []
            if (calcResult.dispatchMin && calcResult.dispatchMin > 15)
              bullets.push({ label: 'Dispatch cycle', value: `${calcResult.dispatchMin} min vs 15 min target` })
            if (calcResult.ta > 0 && calcResult.TARGET_TA > 0 && calcResult.ta > calcResult.TARGET_TA)
              bullets.push({ label: 'Turnaround', value: `${calcResult.ta} min vs ${calcResult.TARGET_TA} min target` })
            if (calcResult.rejectPct > 3)
              bullets.push({ label: 'Reject rate', value: `${Math.round(calcResult.rejectPct * 10) / 10}%` })
            if (bullets.length < 3 && Math.round(calcResult.util * 100) < 80)
              bullets.push({ label: 'Utilisation', value: `${Math.round(calcResult.util * 100)}% vs ${calcResult.utilisationTarget}% target` })
            return (
              <div style={{ marginBottom: '24px' }}>
                {/* 3-col header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  border: '1.5px solid #e8e8e6', borderRadius: '10px 10px 0 0',
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '16px 20px', background: '#f6fbf8', borderRight: '1px solid #e8e8e6' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.3px', textTransform: 'uppercase', color: '#7ab89a', marginBottom: '4px' }}>Operational Score</div>
                    <div style={{ fontSize: '36px', fontWeight: 800, color: '#1a6644', lineHeight: 1, letterSpacing: '-1px' }}>{calcResult.overall}</div>
                    <div style={{ fontSize: '10px', color: '#9b9b9b', marginTop: '2px' }}>out of 100</div>
                  </div>
                  <div style={{ padding: '16px 20px', background: '#fff5f5', borderRight: '1px solid #e8e8e6' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.3px', textTransform: 'uppercase', color: '#c0a0a0', marginBottom: '4px' }}>Total recoverable</div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#cc3333', lineHeight: 1, letterSpacing: '-1px' }}>{fmtK(totalLoss)}</div>
                    <div style={{ fontSize: '10px', color: '#c09090', marginTop: '2px' }}>per month</div>
                  </div>
                  <div style={{ padding: '16px 20px', background: '#fafafa' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.3px', textTransform: 'uppercase', color: '#aaa', marginBottom: '4px' }}>Primary constraint</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#111', lineHeight: 1.1, letterSpacing: '-0.3px' }}>{bottleneckLabel}</div>
                    <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>{fmtK(bnLossDrawer)} / month</div>
                  </div>
                </div>
                {/* Snapshot bullets */}
                {bullets.length > 0 && (
                  <div style={{
                    border: '1px solid #e8e8e6', borderTop: 'none',
                    borderRadius: '0 0 10px 10px',
                    padding: '10px 20px',
                    background: '#fff',
                    display: 'flex', gap: '20px', flexWrap: 'wrap',
                  }}>
                    {bullets.slice(0, 3).map((b, i) => (
                      <div key={i} style={{ fontSize: '12px', color: '#444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#cc3333', flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ color: '#888', marginRight: '2px' }}>{b.label}:</span>
                        <strong style={{ fontWeight: 600 }}>{b.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Score Overview at top of drawer */}
          <ScoreOverview calcResult={calcResult} meta={meta} phase={phase} />

          {/* Findings */}
          {issues.filter(i => i.loss > 0 || i.category === 'bottleneck').length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '10px', paddingLeft: '2px' }}>
                Findings ({issues.filter(i => i.loss > 0 || i.category === 'bottleneck').length})
              </div>
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

          <Divider />

          <AISection
            title="Executive Explanation"
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
      value: `${Math.round(calcResult.rejectPct)}%`,
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
      why: `Rejection rate of ${Math.round(calcResult.rejectPct)}% is above the 3% threshold — root cause is rarely obvious from aggregate data.`,
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

// ── Recoverable Value Card ─────────────────────────────────────────────────
function RecoverableValueCard({ totalLoss, financialBottleneck }: {
  totalLoss: number
  financialBottleneck: string | null
}) {
  if (totalLoss === 0) return null
  const yearlyLoss = totalLoss * 12
  const bnLabel = financialBottleneck === 'Fleet' ? 'logistics' : (financialBottleneck?.toLowerCase() ?? null)

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e6',
      borderRadius: '12px', padding: '20px 24px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#b0b0b0', marginBottom: '8px' }}>
        Recoverable value
      </div>
      <div style={{ fontSize: '32px', fontWeight: 800, color: '#1a6644', lineHeight: 1, marginBottom: '16px' }}>
        {fmt(yearlyLoss)}<span style={{ fontSize: '16px', fontWeight: 500, color: '#5aaa82', marginLeft: '6px' }}>/ year</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '13px', color: '#2a6644', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#2a9d6e', fontWeight: 700, fontSize: '14px' }}>✓</span> No capital investment required
        </div>
        {bnLabel && (
          <div style={{ fontSize: '13px', color: '#2a6644', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#2a9d6e', fontWeight: 700, fontSize: '14px' }}>✓</span> Driven by {bnLabel} improvement
          </div>
        )}
      </div>
    </div>
  )
}

// ── Score Grid ─────────────────────────────────────────────────────────────
function ScoreGrid({ calcResult, financialBottleneck, issues, onSwitchToTracking }: {
  calcResult: CalcResult
  financialBottleneck: string | null
  issues: Issue[]
  onSwitchToTracking?: () => void
}) {
  if (calcResult.overall === null) return null

  const dims = [
    { label: 'Dispatch',   score: calcResult.scores?.dispatch ?? null, key: 'Dispatch'   },
    { label: 'Quality',    score: calcResult.scores?.quality  ?? null, key: 'Quality'    },
    { label: 'Logistics',  score: calcResult.scores?.fleet    ?? null, key: 'Fleet'      },
    { label: 'Production', score: calcResult.scores?.prod     ?? null, key: 'Production' },
  ]
    .filter(d => d.score !== null)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100)) as { label: string; score: number; key: string }[]

  if (dims.length === 0) return null

  const bnKey = financialBottleneck
  const bottleneck = dims.find(d => d.key === bnKey)
  const others = dims.filter(d => d.key !== bnKey)

  // Compute bottleneck-specific loss from issues (authoritative source)
  const bnLoss = bnKey
    ? issues.filter(i => i.dimension === bnKey).reduce((sum, i) => sum + (i.loss ?? 0), 0)
    : 0
  const bnDailyLoss = Math.round(bnLoss / (calcResult.workingDaysMonth || 22))

  // Dimension-specific detail config
  type BnDetail = {
    rootCauseLabel: string
    rootCauseMetric: string | null
    startHere: string[]
    outcome: string[]
  }
  const bnDetail: BnDetail | null = bnKey ? (() => {
    switch (bnKey) {
      case 'Dispatch': return {
        rootCauseLabel: 'Order-to-dispatch time too high',
        rootCauseMetric: calcResult.dispatchMin ? `${calcResult.dispatchMin} min vs 15 min target` : null,
        startHere: [
          'Measure order-to-dispatch time daily',
          'Target: <15 min from order confirmation to dispatch',
          'Only release trucks when site confirms readiness',
        ],
        outcome: [
          'Dispatch time reduced to <15 min',
          `Recovery of up to ${fmtK(bnLoss)} / month`,
        ],
      }
      case 'Fleet': return {
        rootCauseLabel: 'Fleet turnaround time above benchmark',
        rootCauseMetric: calcResult.ta ? `${calcResult.ta} min vs ${calcResult.TARGET_TA} min target` : null,
        startHere: [
          'Time-stamp 3 full truck cycles to map delay sources',
          `Target: <${calcResult.TARGET_TA} min turnaround`,
          'Enforce demurrage clause after 45 min on site',
        ],
        outcome: [
          `Turnaround reduced to ${calcResult.TARGET_TA} min`,
          `Recovery of up to ${fmtK(bnLoss)} / month`,
        ],
      }
      case 'Quality': return {
        rootCauseLabel: 'Rejection rate above benchmark',
        rootCauseMetric: calcResult.rejectPct > 0 ? `${Math.round(calcResult.rejectPct)}% vs 1.5% target` : null,
        startHere: [
          'Log all rejections with reason codes for 30 days',
          'Identify top 3 rejection causes',
          'Measure transit time on rejected loads',
        ],
        outcome: [
          'Rejection rate reduced below 3%',
          `Recovery of up to ${fmtK(bnLoss)} / month`,
        ],
      }
      case 'Production': return {
        rootCauseLabel: 'Plant utilisation below target',
        rootCauseMetric: calcResult.util ? `${Math.round(calcResult.util * 100)}% vs 92% target` : null,
        startHere: [
          'Audit downstream constraints limiting throughput',
          'Align production schedule with fleet availability',
          'Review preventive maintenance schedule',
        ],
        outcome: [
          'Utilisation increased to 92%+',
          `Recovery of up to ${fmtK(bnLoss)} / month`,
        ],
      }
      default: return null
    }
  })() : null

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e6',
      borderRadius: '12px', padding: '20px 24px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#b0b0b0', marginBottom: '16px' }}>
        Operational scores — lowest is the constraint
      </div>

      {/* Bottleneck card — expanded, single column */}
      {bottleneck && (
        <div style={{
          background: '#fff0f0', border: '2px solid #f5c6c6', borderRadius: '12px',
          padding: '24px 28px', marginBottom: '8px',
        }}>
          {/* Eyebrow */}
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#c09090', marginBottom: '4px' }}>
            {bottleneck.label}
          </div>
          {/* Subtitle */}
          <div style={{ fontSize: '13px', color: '#b08080', marginBottom: '20px' }}>
            Primary bottleneck across all operations
          </div>

          {/* Score row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ fontSize: '42px', fontWeight: 800, color: '#cc3333', lineHeight: 1, letterSpacing: '-2px' }}>
              {Math.round(bottleneck.score)}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#cc3333' }}>— {bottleneck.label}</div>
          </div>
          <div style={{ display: 'inline-block', fontSize: '9px', fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: '#fff', background: '#cc3333', borderRadius: '4px', padding: '3px 8px', marginBottom: '20px' }}>
            Fix this first
          </div>

          {/* Impact */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#cc3333', marginBottom: '2px' }}>
              Impact: up to {fmtK(bnLoss)} / month
            </div>
            <div style={{ fontSize: '13px', color: '#c09090' }}>≈ {fmtK(bnDailyLoss)} per day</div>
          </div>

          {bnDetail && (
            <>
              {/* Divider */}
              <div style={{ borderTop: '1px solid #f5c6c6', marginBottom: '20px' }} />

              {/* Root cause */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#c09090', marginBottom: '8px' }}>Root cause</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#333', marginBottom: '3px' }}>{bnDetail.rootCauseLabel}</div>
                {bnDetail.rootCauseMetric && (
                  <div style={{ fontSize: '12px', color: '#aaa' }}>{bnDetail.rootCauseMetric}</div>
                )}
              </div>

              {/* Start here */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#c09090', marginBottom: '8px' }}>Start here — next 7 days</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {bnDetail.startHere.map((bullet, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#cc3333', flexShrink: 0, marginTop: '6px' }} />
                      <span style={{ fontSize: '13px', color: '#444', lineHeight: 1.5 }}>{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expected outcome */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#c09090', marginBottom: '8px' }}>Expected outcome</div>
                <div style={{ fontSize: '14px', color: '#333', marginBottom: '3px' }}>{bnDetail.outcome[0]}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#cc3333' }}>Up to {fmtK(bnLoss)} / month recoverable</div>
              </div>

              {/* CTA */}
              {onSwitchToTracking && (
                <button onClick={onSwitchToTracking} style={{
                  background: 'none', border: 'none', padding: '0',
                  fontSize: '13px', fontWeight: 600, color: '#cc3333',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  Start 90-day tracking →
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Other scores — muted, 3 columns */}
      {others.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${others.length}, 1fr)`, gap: '8px', marginBottom: '8px' }}>
          {others.map(d => (
            <div key={d.key} style={{
              background: '#f9faf9', border: '1px solid #e8e8e6', borderRadius: '12px',
              padding: '14px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#888', lineHeight: 1, marginBottom: '4px' }}>{Math.round(d.score)}</div>
              <div style={{ fontSize: '12px', color: '#aaa', fontWeight: 500 }}>{d.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Why & Start Here ───────────────────────────────────────────────────────
function WhyAndStartHere({ issues, totalLoss, calcResult, onSwitchToTracking }: {
  issues: Issue[]
  totalLoss: number
  calcResult: CalcResult
  onSwitchToTracking?: () => void
}) {
  if (totalLoss === 0 || calcResult.overall === null) return null

  const actionIssues = [...issues].filter(i => i.loss > 0).sort((a, b) => b.loss - a.loss)
  if (actionIssues.length === 0) return null

  const whyBullets = actionIssues.slice(0, 3).map(i => i.rec).filter(Boolean) as string[]
  const actionItems = actionIssues.slice(0, 3).map(i => i.action).filter(Boolean) as string[]

  if (whyBullets.length === 0 && actionItems.length === 0) return null

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e6',
      borderRadius: '12px', overflow: 'hidden', marginBottom: '16px',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>

        {/* Left: WHY THIS HAPPENS */}
        <div style={{ padding: '20px 24px', borderRight: '1px solid #f0f0ee' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#b0b0b0', marginBottom: '16px' }}>
            Why this happens
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {whyBullets.slice(0, 3).map((bullet, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: '#e88', flexShrink: 0, marginTop: '6px',
                }} />
                <span style={{ fontSize: '13px', color: '#444', lineHeight: 1.5 }}>{bullet}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: START HERE */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#b0b0b0', marginBottom: '16px' }}>
            Start here — next 7 days
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            {actionItems.slice(0, 3).map((action, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: '#2a9d6e', flexShrink: 0, fontSize: '15px', lineHeight: 1.3, fontWeight: 700 }}>✓</span>
                <span style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.5 }}>{action}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '24px' }}>
            <button
              type="button"
              onClick={onSwitchToTracking}
              style={{
                width: '100%', background: '#1a1a1a', color: '#fff',
                border: 'none', borderRadius: '8px', padding: '13px 20px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Activate 90-day tracking →
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Simulator Drawer ───────────────────────────────────────────────────────
function SimulatorDrawer({ open, onClose, calcResult }: {
  open: boolean
  onClose: () => void
  calcResult: CalcResult
}) {
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 199 }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '420px',
        background: 'var(--white)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        zIndex: 200,
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(.22,.68,0,1.2)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)' }}>Recovery simulator</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '1px' }}>Explore what-if improvement scenarios</div>
          </div>
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
        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <RecoveryPanel calcResult={calcResult} />
        </div>
      </div>
    </>
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

  // Bottleneck-specific loss (single dimension) — used for ImpactHook headline
  const bnLoss = financialBottleneck
    ? issues.filter(i => i.dimension === financialBottleneck).reduce((sum, i) => sum + (i.loss ?? 0), 0)
    : 0
  const bnDailyLoss = Math.round(bnLoss / (calcResult.workingDaysMonth || 22))

  // ── AI section state ─────────────────────────────────────────────────────
  const [texts, setTexts] = useState({
    executive: stripMarkdown(report?.executive || ''),
    diagnosis: stripMarkdown(report?.diagnosis || ''),
    actions:   stripMarkdown(report?.actions || ''),
  })
  const [generating, setGenerating] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [simulatorOpen, setSimulatorOpen] = useState(false)

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
    bnLossMonthly: bnLoss,
    bnDailyLoss,
    dailyLoss,
    hiddenRevMonthly: calcResult.hiddenRevMonthly,
    utilPct: Math.round(calcResult.util * 100),
    turnaround: calcResult.ta,
    targetTA: calcResult.TARGET_TA,
    dispatchMin: calcResult.dispatchMin,
    rejectPct: Math.round(calcResult.rejectPct),
    trucks: calcResult.trucks,
    cap: calcResult.cap,
    performingWell: totalLoss === 0 && issues.length === 0 && calcResult.overall !== null,
    issues: issues.slice(0, 8).map(i => ({
      t: i.t, action: i.action, rec: i.rec,
      loss: i.loss, sev: i.sev, category: i.category, formula: i.formula, dimension: i.dimension,
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

  const hasSliders = !!(
    getSliderConfig(calcResult, 'Fleet') ||
    getSliderConfig(calcResult, 'Quality') ||
    (calcResult.dispatchMin ?? 0) > 15
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '60px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isAdmin && !reportReleased && (
            <span style={{ fontSize: '11px', color: 'var(--warning-dark)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: '4px', padding: '3px 8px', fontWeight: 500 }}>
              🔒 Draft
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {hasSliders && (
            <button
              type="button"
              onClick={() => setSimulatorOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 16px',
                background: 'var(--white)', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                color: 'var(--gray-700)', cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              ⟳ Simulate recovery
            </button>
          )}
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
      </div>

      {/* Banners */}
      {genError && (
        <div style={{
          background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px',
          padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: 'var(--red)',
        }}>
          ⚠ {genError}
        </div>
      )}
      {isAdmin && calcResult.marginIncomplete && (
        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '10px', fontStyle: 'italic' }}>
          Note: aggregate/admixture costs not entered — margin estimated at 35%. Enter material costs for precise figures.
        </div>
      )}
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

      {/* 1. IMPACT / HOOK */}
      <ImpactHook
        bnLoss={bnLoss}
        bnDailyLoss={bnDailyLoss}
        calcResult={calcResult}
        issues={issues}
        financialBottleneck={financialBottleneck}
      />

      {/* 3. SCORE GRID */}
      <ScoreGrid calcResult={calcResult} financialBottleneck={financialBottleneck} issues={issues} onSwitchToTracking={onSwitchToTracking} />

      {/* Full report CTA */}
      {calcResult.overall !== null && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              background: 'none', border: '1px solid #e8e8e6', borderRadius: '10px',
              padding: '14px 20px', width: '100%', textAlign: 'left', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '13px', color: '#555' }}>Want to understand the full operational picture?</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#111', textDecoration: 'underline', textUnderlineOffset: '3px', textDecorationColor: '#bbb' }}>See full operational breakdown →</span>
          </button>
        </div>
      )}

      {/* 4. WHY THIS HAPPENS + START HERE */}
      <WhyAndStartHere
        issues={issues}
        totalLoss={totalLoss}
        calcResult={calcResult}
        onSwitchToTracking={onSwitchToTracking}
      />

      {/* 5. NEXT IMPROVEMENTS (collapsed) */}
      <NextImprovements issues={issues} />

      {/* Pre-assessment cards (workshop phase) */}
      {phase === 'workshop' && totalLoss > 0 && (
        <>
          <BenchmarkPositioning calcResult={calcResult} answers={answers} />
          <StartThisWeek calcResult={calcResult} answers={answers} />
          <WhatWeWillMeasure calcResult={calcResult} answers={answers} />
        </>
      )}

      {/* Assumptions Panel (admin) */}
      {isAdmin && onOverrideChange && (
        <AssumptionsPanel overrides={overrides ?? {}} onChange={onOverrideChange} />
      )}

      {/* Simulator drawer (always in DOM for animation) */}
      <SimulatorDrawer
        open={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        calcResult={calcResult}
      />

      {/* Full report drawer */}
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
        phase={phase}
        financialBottleneck={financialBottleneck}
      />

    </div>
  )
}
