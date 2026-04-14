'use client'

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CalcResult, Answers, CalcOverrides } from '@/lib/calculations'
import type { Phase } from '@/lib/questions'
import { calcLossRange } from '@/lib/calculations'
import { buildIssues, type Issue } from '@/lib/issues'
import { buildValidatedDiagnosis, type ValidatedDiagnosis } from '@/lib/diagnosis-pipeline'
import { benchmarkTag, liveBenchmarkTag, gcQuartile, type LiveBenchmarkData } from '@/lib/benchmarks'
import { useBenchmarks } from '@/hooks/useBenchmarks'
import { useIsMobile } from '@/hooks/useIsMobile'
import ReactMarkdown from 'react-markdown'
import { calculateReport, mapToReportInput } from '@/lib/reportCalculations'
import FindingCard from './FindingCard'
import ExportWord from './ExportWord'
import PriorityMatrixView from './PriorityMatrixView'
import { buildPriorityMatrix } from '@/lib/priority-matrix'
import ActionBoard from './ActionBoard'
import type { DemoBannerProps } from '@/components/assessment/AssessmentShell'

function fmt(n: number): string {
  // Round to nearest $1,000 for all values >= $1k (avoids false precision from estimated inputs)
  const display = n >= 1000 ? Math.round(n / 1000) * 1000 : Math.round(n)
  return '$' + display.toLocaleString('en-US')
}
function fmtK(n: number): string {
  if (n >= 10000) return `$${Math.round(n / 1000).toLocaleString('en-US')}k`
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n}`
}

// Round to nearest $1,000 for display (pre-assessment credibility)
function fmtR(n: number): string {
  const rounded = Math.round(n / 1000) * 1000
  return '$' + rounded.toLocaleString('en-US')
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
          width: 'min(300px, calc(100vw - 32px))', maxWidth: '300px', boxShadow: '0 4px 16px rgba(0,0,0,.1)',
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
  title, text, generating, onGenerate, onSave, minHeight = 80, readOnly = false,
}: {
  title: string
  text: string
  generating: boolean
  onGenerate: () => void
  onSave: (text: string) => void
  minHeight?: number
  readOnly?: boolean
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
        {!readOnly && (
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
        )}
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
        <div className="ai-prose" style={{ fontSize: '13px', color: 'var(--gray-700)', lineHeight: 1.8, minHeight: `${minHeight}px` }}>
          <ReactMarkdown>{text}</ReactMarkdown>
          <span style={{ animation: 'blink 1s infinite', color: 'var(--green)' }}>▊</span>
        </div>
      ) : text ? (
        <div className="ai-prose" style={{ fontSize: '13px', color: 'var(--gray-700)', lineHeight: 1.8 }}>
          <ReactMarkdown>{text}</ReactMarkdown>
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
function KPIPyramid({ calcResult, answers, totalLoss, financialBottleneck, liveBenchmarks }: {
  calcResult: CalcResult
  answers: Answers
  totalLoss: number
  financialBottleneck: string | null
  liveBenchmarks?: LiveBenchmarkData | null
}) {
  const isMobile = useIsMobile()
  if (totalLoss === 0) return null

  const utilPct = Math.round(calcResult.util * 100)

  // Dispatch time midpoint from answer
  const dispTimeMap: Record<string, number> = {
    'Under 15 minutes, fast response': 12,
    '15 to 25 minutes, acceptable': 20,
    '25 to 40 minutes, slow': 32,
    'Over 40 minutes, critical bottleneck': 45,
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
  // the root cause is Fleet Turnaround, not Plant Utilisation.
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
          benchmark={liveBenchmarkTag('utilisation', liveBenchmarks ?? null)}
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
          benchmark={liveBenchmarkTag('turnaround', liveBenchmarks ?? null)}
        />
      </div>

      {connector}

      {/* Row 3: Supporting metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: '6px' }}>
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
          benchmark={liveBenchmarkTag('rejection', liveBenchmarks ?? null)}
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
            benchmark={liveBenchmarkTag('dispatch', liveBenchmarks ?? null)}
          />
        ) : (
          <KpiBox label="Dispatch Time" value="-" target="target 15 min" isBottleneck={false} isWarn={false} size="small" bar={null} gap="" gapColor="var(--gray-400)" />
        )}
        <KpiBox
          label="Deliveries / truck / day"
          value={delPerTruck > 0 ? String(delPerTruck) : '-'}
          target={targetDelPerTruck > 0 ? `target ${targetDelPerTruck}` : ''}
          isBottleneck={false}
          isWarn={delWarn}
          size="small"
          bar={delPerTruck > 0 && targetDelPerTruck > 0 ? <KpiBarHigher current={delPerTruck} target={targetDelPerTruck} max={targetDelPerTruck * 1.1} isBottleneck={false} isWarn={delWarn} /> : null}
          gap={delWarn && targetDelPerTruck > 0 ? `−${Math.round(targetDelPerTruck - delPerTruck)} per day` : ''}
          gapColor={kpiColor(false, delWarn)}
          benchmark={liveBenchmarkTag('deliveriesPerTruck', liveBenchmarks ?? null)}
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
              {/* GPS financial impact, injected into TURNAROUND PERFORMANCE card */}
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
                      ? `GPS-verified financial impact, ${gpsExcessMin} excess min × ${fmt(perMinTACoeff)}/min`
                      : 'GPS data: turnaround is within target, no financial leakage from fleet cycle time'}
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
    `Client: ${plantName}${country ? `, ${country}` : ''}`,
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
      // Use cost-only coefficient when demand-constrained, slider shows operational
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
              at {sliderVal.toFixed(decimals)}{unit}, {improvement.toFixed(decimals)}{unit} improvement
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
  const isMobile = useIsMobile()
  if (calcResult.overall === null) return null
  if (totalLoss === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #f0faf6 0%, #fff 60%)',
        border: '1.5px solid #b5dfc9',
        borderRadius: '10px', padding: isMobile ? '14px 16px' : '20px 24px', marginBottom: '10px',
        display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <span style={{ fontSize: '24px', lineHeight: 1 }}>✓</span>
        <div>
          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '4px' }}>Plant status</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#1f8a5e', lineHeight: 1, marginBottom: '4px' }}>Performing at benchmark</div>
          <div style={{ fontSize: '11px', color: '#9b9b9b' }}>No operational losses identified, all primary metrics at or above target</div>
        </div>
      </div>
    )
  }
  return (
    <div style={{
      background: 'linear-gradient(135deg, #fff8f8 0%, #fff 60%)',
      border: '1.5px solid #f5c6c6',
      borderRadius: '10px', padding: isMobile ? '14px 16px' : '20px 24px', marginBottom: '10px',
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
            ? 'demand-constrained, operational cost saving only'
            : `${fmt(dailyLoss)} every working day, based on current operational data`}
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
function ImpactHook({ bnLoss, bnDailyLoss, totalLoss, calcResult, issues, financialBottleneck, liveBenchmarks }: {
  bnLoss: number
  bnDailyLoss: number
  totalLoss: number
  calcResult: CalcResult
  issues: Issue[]
  financialBottleneck: string | null
  liveBenchmarks?: LiveBenchmarkData | null
}) {
  const isMobile = useIsMobile()
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
          <div style={{ fontSize: '11px', color: '#9b9b9b' }}>No operational losses identified, all primary metrics at or above target</div>
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

  // Right side mirrors left, bnLoss is both the leakage and the recoverable for this dimension

  return (
    <div style={{
      border: '1px solid #e2e2de', borderRadius: '12px',
      overflow: 'hidden', marginBottom: '16px',
      display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr',
    }}>
      {/* Left, Estimated revenue leakage */}
      <div style={{ padding: isMobile ? '16px' : '24px', background: '#fff', borderRight: isMobile ? 'none' : '1px solid #e2e2de', borderBottom: isMobile ? '1px solid #e2e2de' : 'none' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#999', marginBottom: '8px' }}>
          {driverLabel ? `${driverLabel}, ` : ''}{calcResult.demandSufficient === false ? 'Margin improvement potential' : 'Estimated revenue leakage'}
        </div>
        <div style={{ fontSize: isMobile ? '32px' : '48px', fontWeight: 800, color: '#1a1a1a', lineHeight: 1, letterSpacing: '-1px', marginBottom: '4px' }}>
          {fmtK(bnLoss)}<span style={{ fontSize: isMobile ? '15px' : '20px', fontWeight: 500, color: '#888', marginLeft: '8px' }}>/ month</span>
        </div>
        <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '16px' }}>
          ≈ {fmtK(bnDailyLoss)} per day
        </div>
        {driverLabel && (
          <div style={{ fontSize: '13px', color: '#555', marginBottom: '3px' }}>
            Primary driver: <strong style={{ color: '#1a1a1a' }}>{driverLabel}</strong>
          </div>
        )}
        {driverMetric && (
          <div style={{ fontSize: '12px', color: '#aaa' }}>{driverMetric}</div>
        )}
        {(financialBottleneck === 'Fleet' || financialBottleneck === 'Dispatch') && driverMetric && (
          <div style={{ fontSize: '11px', color: '#bbb', marginTop: '2px', fontStyle: 'italic' }}>
            Based on reported ranges, actual figures confirmed on-site
          </div>
        )}
        {liveBenchmarks && liveBenchmarks.n >= 3 && (() => {
          // Show relevant benchmark for the primary bottleneck
          const bTag = financialBottleneck === 'Fleet'
            ? `${liveBenchmarks.n} comparable plants, median: ${liveBenchmarks.turnaround.p50} min · top 25%: ${liveBenchmarks.turnaround.p25} min`
            : financialBottleneck === 'Dispatch'
            ? `${liveBenchmarks.n} comparable plants, median: ${liveBenchmarks.dispatch.p50} min · top 25%: ${liveBenchmarks.dispatch.p25} min`
            : financialBottleneck === 'Quality'
            ? `${liveBenchmarks.n} comparable plants, median: ${liveBenchmarks.reject.p50}% · top 25%: ${liveBenchmarks.reject.p25}%`
            : null
          if (!bTag) return null
          return (
            <div style={{ fontSize: '11px', color: '#bbb', marginTop: '6px', borderTop: '1px solid #e2e2de', paddingTop: '6px', fontStyle: 'italic' }}>
              {bTag}
            </div>
          )
        })()}
      </div>

      {/* Right, Recovery potential (main constraint only) */}
      <div style={{ padding: isMobile ? '16px' : '24px', background: '#f6fbf8' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#7ab89a', marginBottom: '8px' }}>
          {driverLabel ? `${driverLabel}, ` : ''}Recovery potential
        </div>
        {bnLoss > 0 ? (
          <>
            <div style={{ fontSize: isMobile ? '32px' : '40px', fontWeight: 800, color: '#1a6644', lineHeight: 1, letterSpacing: '-1px', marginBottom: '4px' }}>
              {fmtK(bnLoss)}<span style={{ fontSize: '17px', fontWeight: 500, color: '#5aaa82', marginLeft: '8px' }}>/ month</span>
            </div>
            <div style={{ fontSize: '13px', color: '#7ab89a', marginBottom: '20px' }}>
              ≈ {fmtK(bnDailyLoss)} per day
            </div>

            {driverLabel && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', color: '#4a9a72' }}>{driverLabel} constraint</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a6644', fontFamily: 'var(--mono)' }}>{fmtK(bnLoss)}</span>
              </div>
            )}

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
  const isMobile = useIsMobile()
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
  const bottleneck = calcResult.bottleneck

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
      borderRadius: '10px', padding: isMobile ? '16px' : '24px', marginBottom: '10px',
      display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
      flexDirection: isMobile ? 'row' : 'row', gap: isMobile ? '16px' : '32px',
      flexWrap: 'wrap',
    }}>
      {/* Constraint indicator */}
      {bottleneck && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px',
          background: '#fff3f3', border: '1px solid #fcc', flexShrink: 0,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '10px', color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '2px' }}>Constraint</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#cc3333' }}>{bottleneck}</div>
        </div>
      )}
      {/* Right side */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>
          {plantName}, {phaseLabel}
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '14px' }}>
          {belowBenchmark > 0
            ? `${belowBenchmark} of ${dims.length} dimension${dims.length !== 1 ? 's' : ''} below benchmark`
            : 'All dimensions at or above benchmark'}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {dims.map(d => (
            <span key={d.label} style={{
              fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
              fontWeight: 600, border: '1.5px solid',
              ...chipStyle(d.score),
            }}>
              {d.label}
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
  const isMobile = useIsMobile()
  if (calcResult.overall === null) return null

  const dispTimeMap: Record<string, number> = {
    'Under 15 minutes, fast response': 12,
    '15 to 25 minutes, acceptable': 20,
    '25 to 40 minutes, slow': 32,
    'Over 40 minutes, critical bottleneck': 45,
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
      text: `Turnaround at ${calcResult.ta} min, ${taExcess} min above the ${calcResult.TARGET_TA}-min benchmark.${extra} Costs ${fmt(Math.round(taLeak))}/month.`,
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
      text: `Plant utilisation at ${utilPct}% vs ${calcResult.utilisationTarget}% target, capacity constrained by downstream fleet cycle time.`,
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
      borderRadius: '10px', padding: isMobile ? '14px 16px' : '20px 24px', marginBottom: '10px',
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
      case 'Fleet':      return 'Site wait time starts falling, first measurable reduction in turnaround'
      case 'Dispatch':   return 'Order-to-dispatch time drops below 20 min on first attempt'
      case 'Quality':    return 'Rejection pattern identified, dominant cause confirmed'
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
          Lock in baselines and track recovery{baselines.length > 0 ? `, ${baselines.join(' · ')}` : ''}
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
  const isMobile = useIsMobile()
  if (totalLoss === 0 || calcResult.overall === null) return null
  const topIssue = [...issues].filter(i => i.loss > 0).sort((a, b) => b.loss - a.loss)[0]
  if (!topIssue) return null

  const dim = topIssue.dimension || financialBottleneck || ''
  const sevenDay = (() => {
    switch (dim) {
      case 'Fleet':      return 'Site wait time starts falling, first measurable reduction in turnaround'
      case 'Dispatch':   return 'Order-to-dispatch time drops below 20 min on first attempt'
      case 'Quality':    return 'Rejection pattern identified, dominant cause confirmed'
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
      <div style={{ padding: isMobile ? '14px 16px' : '20px 24px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '6px' }}>
          {topIssue.t}
        </div>
        <div style={{ fontSize: '13px', color: '#666', marginBottom: '20px', lineHeight: 1.5 }}>
          Costs <span style={{ fontWeight: 600, color: '#cc3333' }}>{fmt(topIssue.loss)}/month</span>
          {topIssue.rec ? `, ${topIssue.rec}` : ''}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
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
  const isMobile = useIsMobile()
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
      borderRadius: '10px', padding: isMobile ? '14px 16px' : '20px 24px', marginBottom: '10px',
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
  const isMobile = useIsMobile()
  if (calcResult.overall === null) return null

  const dispTimeMap: Record<string, number> = {
    'Under 15 minutes, fast response': 12,
    '15 to 25 minutes, acceptable': 20,
    '25 to 40 minutes, slow': 32,
    'Over 40 minutes, critical bottleneck': 45,
  }
  const dispTime = dispTimeMap[answers.order_to_dispatch as string] ?? null
  const utilPct = Math.round(calcResult.util * 100)

  type Status = 'ok' | 'caution' | 'warn'
  const metrics: { label: string; value: string; target: string; status: Status }[] = [
    {
      label: 'Turnaround',
      value: calcResult.ta > 0 ? `${calcResult.ta} min` : '-',
      target: `Target ${calcResult.TARGET_TA} min`,
      status: calcResult.ta > calcResult.TARGET_TA ? 'warn' : 'ok',
    },
    {
      label: 'Dispatch',
      value: dispTime !== null ? `${dispTime} min` : '-',
      target: 'Target 15 min',
      status: dispTime === null ? 'ok' : dispTime > 25 ? 'warn' : dispTime > 15 ? 'caution' : 'ok',
    },
    {
      label: 'Rejection',
      value: calcResult.rejectPct > 0 ? `${Math.round(calcResult.rejectPct)}%` : '-',
      target: 'Target 1.5%',
      status: calcResult.rejectPct > 3 ? 'warn' : calcResult.rejectPct > 1.5 ? 'caution' : 'ok',
    },
    {
      label: 'Utilisation',
      value: utilPct > 0 ? `${utilPct}%` : '-',
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '6px' }}>
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

// ── Indicative notice ─────────────────────────────────────────────────────
function IndicativeNotice() {
  const gaps = [
    {
      label: 'Dosing and batch variance',
      detail: 'Requires batcher computer log, uncalibrated scales drift ±3–8% on cement dosing, invisible without the raw data.',
    },
    {
      label: 'Actual truck idle and yard time',
      detail: 'Self-reported turnaround typically underestimates plant waiting time by 15–25%. Verified with GPS trace or timed observation.',
    },
    {
      label: 'Site wait time vs delivery ticket',
      detail: 'Reported site wait often differs from timestamped delivery receipts. Discrepancies reveal whether demurrage is enforceable.',
    },
    {
      label: 'Water additions at site',
      detail: 'Free water added by crews before discharge is the most common cause of strength failures and rejections, never captured in self-reporting.',
    },
    {
      label: 'Mix design cement content',
      detail: 'Whether current designs carry excess cement vs. optimised benchmarks, requires lab records and batcher log comparison.',
    },
    {
      label: 'Return mortar volume',
      detail: 'Actual waste per trip verified via weighbridge tare. Driver estimates typically run 30–50% below the true figure.',
    },
  ]

  return (
    <div style={{ marginBottom: '16px', border: '1px solid #e8e8e6', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{
        padding: '13px 20px', borderBottom: '1px solid #e8e8e6',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
            Indicative assessment, based on reported data
          </span>
          <span style={{ fontSize: '11px', color: '#999' }}>
            6 data points require physical verification
          </span>
        </div>
      </div>
      <div>
        {gaps.map((gap, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '10px 20px',
            borderBottom: i < gaps.length - 1 ? '1px solid #f5f5f3' : 'none',
          }}>
            <div style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: '#d1d1ce', flexShrink: 0, marginTop: '7px',
            }} />
            <div style={{ fontSize: '12px', lineHeight: 1.5, color: '#555' }}>
              <span style={{ fontWeight: 600, color: '#333' }}>{gap.label}, </span>
              {gap.detail}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        padding: '11px 20px', background: '#fafaf9',
        borderTop: '1px solid #e8e8e6',
        fontSize: '12px', color: '#888', lineHeight: 1.5,
      }}>
        A physical assessment verifies these figures directly, typically closing the gap between indicative and actual loss by 20–40%.
      </div>
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
        Week 1–2, Immediate
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
  readOnly?: boolean
  recoveryRange?: { lo: number; hi: number } | null
  tatSource?: 'measured' | 'validated' | 'reported'
  tatTripCount?: number
  dx?: ValidatedDiagnosis
  fieldLogContext?: import('@/lib/fieldlog/context').FieldLogContext | null
  rc?: import('@/lib/reportCalculations').ReportCalculations
  reportInput?: import('@/lib/reportCalculations').ReportInput
}

function FullReportDrawer({
  open, onClose,
  texts, generating, genError, onGenerate, onSave, onGenerateAll, hasAllSections, hasAnySections,
  calcResult, answers, meta, assessmentId,
  issues, primaryBottleneckLoss,
  logisticsText, gpsAvgTA,
  totalLoss, isAdmin, phase, financialBottleneck, readOnly, recoveryRange, tatSource, tatTripCount, dx, fieldLogContext, rc, reportInput,
}: FullReportDrawerProps) {
  const isMobile = useIsMobile()
  const isPre = phase === 'workshop'
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

      {/* Drawer panel, always in DOM, slides in/out */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: isMobile ? '100%' : '65%', maxWidth: isMobile ? '100%' : '900px',
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
            {!readOnly && !hasAllSections && (
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
            {dx && <ExportWord calcResult={calcResult} meta={meta} report={texts} dx={dx} issues={issues} matrix={issues.some(i => i.complexity) ? buildPriorityMatrix(issues, totalLoss, dx?.main_driver) : undefined} fieldLogContext={fieldLogContext} phase={phase} rc={rc} reportInput={reportInput} />}
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
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: isMobile ? '16px' : '24px 28px' }}>
          {genError && (
            <div style={{
              background: 'var(--error-bg)', border: '1px solid var(--error-border)',
              borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
              fontSize: '12px', color: 'var(--red)',
            }}>
              ⚠ {genError}
            </div>
          )}

          {/* Opening line for pre-assessment */}
          {isPre && meta?.plant && (
            <p style={{ fontSize: '13px', color: 'var(--gray-700)', marginBottom: '16px', lineHeight: 1.6 }}>
              Based on your reported data, here is where {meta.plant} stands today.
            </p>
          )}

          {/* Executive Snapshot, static key figures */}
          {calcResult.overall !== null && (() => {
            const bnLossDrawer = financialBottleneck
              ? issues.filter(i => i.dimension === financialBottleneck).reduce((s, i) => s + (i.loss ?? 0), 0)
              : 0
            const tatExcessPct = calcResult.TARGET_TA > 0 ? (calcResult.ta - calcResult.TARGET_TA) / calcResult.TARGET_TA : 0
            const ct = dx?.calc_trace
            const hasConflictingConstraints = isPre && tatExcessPct > 0.2 && ct != null && ct.plant_daily_m3 < ct.fleet_target_daily_m3
            const hasDispatchSignals = Math.round(calcResult.util * 100) < 80
            const isDispatchScenario = tatExcessPct <= 0.2 && hasDispatchSignals
            const effectiveConstraint = isPre
              ? (hasConflictingConstraints ? 'Conflicting'
                : tatExcessPct > 0.2 ? 'Fleet'
                : isDispatchScenario ? 'Dispatch'
                : financialBottleneck)
              : financialBottleneck
            const bottleneckLabel = effectiveConstraint === 'Conflicting'
              ? 'Fleet & capacity \u2014 verify on-site'
              : effectiveConstraint === 'Fleet' ? 'Fleet coordination'
              : effectiveConstraint === 'Dispatch' ? 'Dispatch timing'
              : (effectiveConstraint ?? '-')
            const bullets: { label: string; value: string }[] = []
            // Dispatch is a mechanism (explains WHY TAT is high), not a standalone metric
            if (calcResult.ta > 0 && calcResult.TARGET_TA > 0 && calcResult.ta > calcResult.TARGET_TA)
              bullets.push({ label: 'Turnaround', value: `${calcResult.ta} min vs ~${calcResult.TARGET_TA} min target` })
            if (calcResult.rejectPct > 0)
              bullets.push({ label: 'Reject rate', value: `${Math.round(calcResult.rejectPct * 10) / 10}%` })
            if (Math.round(calcResult.util * 100) < 85)
              bullets.push({ label: 'Utilisation', value: `${Math.round(calcResult.util * 100)}% vs ~${calcResult.utilisationTarget}% target` })
            return (
              <div style={{ marginBottom: '24px' }}>
                {/* 3-col header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr',
                  border: '1.5px solid #e8e8e6', borderRadius: '10px 10px 0 0',
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '16px 20px', background: '#f6fbf8', borderRight: isMobile ? 'none' : '1px solid #e8e8e6', borderBottom: isMobile ? '1px solid #e8e8e6' : 'none' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.3px', textTransform: 'uppercase', color: '#7ab89a', marginBottom: '4px' }}>Turnaround</div>
                    <div style={{ fontSize: '36px', fontWeight: 800, color: calcResult.ta > calcResult.TARGET_TA ? '#cc3333' : '#1a6644', lineHeight: 1, letterSpacing: '-1px' }}>{calcResult.ta} min</div>
                    <div style={{ fontSize: '10px', color: '#9b9b9b', marginTop: '2px' }}>target: ~{calcResult.TARGET_TA} min</div>
                    {tatSource === 'measured' && (tatTripCount ?? 0) > 0 && (
                      <div style={{ display: 'inline-block', fontSize: '9px', fontWeight: 600, color: '#1a6644', background: '#e8f5ee', border: '1px solid #b8dfc8', borderRadius: '4px', padding: '1px 6px', marginTop: '4px' }}>
                        Based on {tatTripCount} observed trips
                      </div>
                    )}
                    {tatSource === 'reported' && !isPre && calcResult.taBreakdownEntered && (
                      <div style={{ display: 'inline-block', fontSize: '9px', fontWeight: 600, color: '#1a6644', background: '#e8f5ee', border: '1px solid #b8dfc8', borderRadius: '4px', padding: '1px 6px', marginTop: '4px' }}>
                        On-site validated
                      </div>
                    )}
                    {tatSource === 'reported' && !isPre && !calcResult.taBreakdownEntered && (
                      <div style={{ display: 'inline-block', fontSize: '9px', fontWeight: 600, color: '#b8860b', background: '#fff8e1', border: '1px solid #f5cba0', borderRadius: '4px', padding: '1px 6px', marginTop: '4px' }}>
                        Self-reported estimate
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '16px 20px', background: '#fff5f5', borderRight: isMobile ? 'none' : '1px solid #e8e8e6', borderBottom: isMobile ? '1px solid #e8e8e6' : 'none' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.3px', textTransform: 'uppercase', color: '#c0a0a0', marginBottom: '4px' }}>{isPre ? 'Estimated range' : 'Recovery range'}</div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#cc3333', lineHeight: 1, letterSpacing: '-1px' }}>{recoveryRange ? `${fmtK(recoveryRange.lo)}-${fmtK(recoveryRange.hi)}` : fmtK(totalLoss)}</div>
                    <div style={{ fontSize: '10px', color: '#c09090', marginTop: '2px' }}>per month{isPre ? ' (directional)' : ''}</div>
                  </div>
                  <div style={{ padding: '16px 20px', background: '#fafafa' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.3px', textTransform: 'uppercase', color: '#aaa', marginBottom: '4px' }}>{isPre ? 'Likely constraint' : 'Primary constraint'}</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#111', lineHeight: 1.1, letterSpacing: '-0.3px' }}>{isPre ? bottleneckLabel : bottleneckLabel}</div>
                    <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>{isPre ? 'To be confirmed on-site' : `${fmtK(bnLossDrawer)} / month`}</div>
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
              {isPre && (
                <div style={{ fontSize: '9px', color: '#bbb', marginTop: '6px', fontStyle: 'italic' }}>
                  Figures rounded to nearest $1,000. Totals may vary by rounding.
                </div>
              )}
              </div>
            )
          })()}

          {/* 2. EXECUTIVE EXPLANATION */}
          <AISection
            title={isPre ? 'What the data suggests' : 'Why the operation is constrained'}
            text={texts.executive}
            generating={generating === 'executive'}
            onGenerate={() => onGenerate('executive')}
            onSave={t => onSave('executive', t)}
            minHeight={100}
            readOnly={readOnly}
          />

          <Divider />

          {/* 3. CONSTRAINT / PRELIMINARY ANALYSIS */}
          <AISection
            title={isPre ? 'Preliminary Analysis' : 'Constraint Analysis'}
            text={texts.diagnosis}
            generating={generating === 'diagnosis'}
            onGenerate={() => onGenerate('diagnosis')}
            onSave={t => onSave('diagnosis', t)}
            minHeight={120}
            readOnly={readOnly}
          />

          <Divider />

          {/* 4. ACTIONS / PREPARATION */}
          <AISection
            title={isPre ? 'Preparation & Next Steps' : 'Action Plan'}
            text={texts.actions}
            generating={generating === 'actions'}
            onGenerate={() => onGenerate('actions')}
            onSave={t => onSave('actions', t)}
            minHeight={80}
            readOnly={readOnly}
          />

          <Divider />

          {/* 4.5 PRIORITY MATRIX (on-site only, when issues have complexity) */}
          {!isPre && issues.some(i => i.complexity) && (() => {
            const matrix = buildPriorityMatrix(issues, totalLoss, dx?.main_driver)
            return matrix.rows.length > 0 ? (
              <div style={{ marginBottom: '24px' }}>
                <PriorityMatrixView matrix={matrix} assessmentId={assessmentId} isAdmin={isAdmin} />
                <Divider />
              </div>
            ) : null
          })()}

          {/* 5. SUPPORTING FINDINGS, evidence, not introduction */}
          {issues.filter(i => i.loss > 0 || i.category === 'bottleneck').length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#9b9b9b', marginBottom: '10px', paddingLeft: '2px' }}>
                Supporting Findings ({issues.filter(i => i.loss > 0 || i.category === 'bottleneck').length})
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
              Fraction of theoretical fleet capacity that is practically achievable, accounts for breaks, queuing and driver idle. Industry default: 85%.
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
  'Under 15 minutes, fast response': 12,
  '15 to 25 minutes, acceptable': 20,
  '25 to 40 minutes, slow': 32,
  'Over 40 minutes, critical bottleneck': 45,
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
            <span style={{ color: QUARTILE_COLOR[item.q], fontWeight: 500 }}>. {QUARTILE_LABEL[item.q]}</span>
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
      measurement: 'Truck cycle timestamps across 8–10 deliveries, plant departure, site arrival, pour start/end, return to plant.',
      why: `Your turnaround of ${calcResult.ta} min is ${calcResult.ta - calcResult.TARGET_TA} min above benchmark for your delivery radius (target ${calcResult.TARGET_TA} min).`,
    })
  }

  if (dispTime !== null && dispTime > 20) {
    items.push({
      area: 'Dispatch process',
      measurement: 'Order-to-truck-departure timing for 10 consecutive orders, plus a walkthrough of the dispatcher workflow and scheduling tools.',
      why: `Current dispatch averages ${dispTime} min, target is 15 min or less.`,
    })
  }

  if (calcResult.rejectPct > 3) {
    items.push({
      area: 'Rejection root cause',
      measurement: 'Rejection log review (last 30 days): reason codes, time in transit per rejected load, contractor breakdown.',
      why: `Rejection rate of ${Math.round(calcResult.rejectPct)}% is above the 3% threshold, root cause is rarely obvious from aggregate data.`,
    })
  }

  const utilPct = Math.round(calcResult.util * 100)
  if (calcResult.util > 0 && utilPct < 82) {
    items.push({
      area: 'Plant throughput',
      measurement: 'Hourly production log (2 representative days), downtime incident causes, and batch plant availability schedule.',
      why: `Utilisation at ${utilPct}%, we need to distinguish demand-constrained vs. operational bottleneck.`,
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
  'WhatsApp messages only, no spreadsheet',
  'Phone calls and a whiteboard or paper list',
])

function StartThisWeek({ calcResult, answers }: { calcResult: CalcResult; answers: Answers }) {
  const dispTime = DISP_TIME_MAP[answers.order_to_dispatch as string] ?? null
  const dispTool = answers.dispatch_tool as string | undefined

  const items: Array<{ tag: string; action: string; detail: string }> = []

  // Turnaround is the biggest lever, always first
  if (calcResult.ta > 0 && calcResult.ta > calcResult.TARGET_TA) {
    items.push({
      tag: 'Day 1',
      action: 'Time 5 full truck cycles this week',
      detail: `Record 4 timestamps per trip: plant departure → site arrival → pour complete → plant return. One person, one day. This tells you exactly where the ${calcResult.ta} minutes goes, site wait, transit, or washout, before the on-site visit.`,
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
      detail: `Four options: stiffening in transit / water added on site / contractor refusal / mix issue. Two minutes per event. After 5–7 rejections you will know which cause dominates, the fix is completely different for each one.`,
    })
  }

  // Manual dispatch tool (only if dispatch action not already shown)
  const dispatchActionShown = items.some(i => i.action.includes('Pre-load'))
  if (!dispatchActionShown && dispTool && MANUAL_DISPATCH_TOOLS.has(dispTool)) {
    items.push({
      tag: 'Day 2',
      action: 'Sketch a delivery zone map',
      detail: `Divide your delivery area into 2–3 zones by direction or distance. Route morning loads to one zone, afternoon to another. A hand-drawn A4 map is enough to start, cuts ad-hoc routing decisions and reduces empty return distance.`,
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
        Actions that require no diagnosis and no investment, start before the on-site visit:
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
  const isMobile = useIsMobile()
  if (totalLoss === 0) return null
  const yearlyLoss = totalLoss * 12
  const bnLabel = financialBottleneck === 'Fleet' ? 'logistics' : (financialBottleneck?.toLowerCase() ?? null)

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e6',
      borderRadius: '12px', padding: isMobile ? '14px 16px' : '20px 24px', marginBottom: '16px',
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
function ScoreGrid({ calcResult, financialBottleneck, issues, onSwitchToTracking, isPre }: {
  calcResult: CalcResult
  financialBottleneck: string | null
  issues: Issue[]
  onSwitchToTracking?: () => void
  isPre?: boolean
}) {
  const isMobile = useIsMobile()
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
        rootCauseLabel: 'Dispatch coordination inflating turnaround',
        rootCauseMetric: calcResult.ta ? `TAT ${calcResult.ta} min vs ${calcResult.TARGET_TA} min target` : null,
        startHere: [
          'Log truck departure and return times for one week',
          'Identify where in the cycle the time is lost',
          'Only release trucks when site confirms readiness',
        ],
        outcome: [
          `Turnaround reduced toward ${calcResult.TARGET_TA} min`,
          `Recovery of up to ${isPre ? `${fmtK(Math.round(bnLoss * 0.7))}-${fmtK(Math.round(bnLoss * 1.3))}` : fmtK(bnLoss)} / month`,
        ],
      }
      case 'Fleet': return {
        rootCauseLabel: 'Fleet turnaround time above benchmark',
        rootCauseMetric: calcResult.ta ? `${calcResult.ta} min vs ${calcResult.TARGET_TA} min target` : null,
        startHere: [
          'Time-stamp 3 full truck cycles to map delay sources',
          `Target: <${calcResult.TARGET_TA} min turnaround`,
          isPre ? 'Identify where in the cycle the time is lost' : 'Enforce demurrage clause after 45 min on site',
        ],
        outcome: [
          `Turnaround reduced to ${calcResult.TARGET_TA} min`,
          `Recovery of up to ${isPre ? `${fmtK(Math.round(bnLoss * 0.7))}-${fmtK(Math.round(bnLoss * 1.3))}` : fmtK(bnLoss)} / month`,
        ],
      }
      case 'Quality': return {
        rootCauseLabel: 'Rejection rate above benchmark',
        rootCauseMetric: calcResult.rejectPct > 0 ? `${Math.round(calcResult.rejectPct)}% vs 1.5% target` : null,
        startHere: [
          'Log all rejections with reason codes for 30 days',
          'Identify top 3 rejection causes',
          isPre ? 'Pull rejection records for the last 3 months' : 'Measure transit time on rejected loads',
        ],
        outcome: [
          'Rejection rate reduced below 3%',
          `Recovery of up to ${isPre ? `${fmtK(Math.round(bnLoss * 0.7))}-${fmtK(Math.round(bnLoss * 1.3))}` : fmtK(bnLoss)} / month`,
        ],
      }
      case 'Production': return {
        rootCauseLabel: isPre ? 'Utilisation below target (likely driven by turnaround)' : 'Plant utilisation below target',
        rootCauseMetric: calcResult.util ? `${Math.round(calcResult.util * 100)}% vs 85% target` : null,
        startHere: [
          isPre ? 'Log truck departure and return times for one week' : 'Audit downstream constraints limiting throughput',
          'Align production schedule with fleet availability',
          'Review preventive maintenance schedule',
        ],
        outcome: [
          'Utilisation increased to 85%+',
          `Recovery of up to ${isPre ? `${fmtK(Math.round(bnLoss * 0.7))}-${fmtK(Math.round(bnLoss * 1.3))}` : fmtK(bnLoss)} / month`,
        ],
      }
      default: return null
    }
  })() : null

  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e8e6',
      borderRadius: '12px', padding: isMobile ? '14px 16px' : '20px 24px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#b0b0b0', marginBottom: '16px' }}>
        {isPre ? 'Preliminary assessment' : 'Operational assessment'}
      </div>

      {/* Bottleneck card, compact single card */}
      {bottleneck && (
        <div style={{
          background: '#f8f9fa', border: '1px solid #e2e2de', borderLeft: '3px solid #1a6644', borderRadius: '12px',
          padding: '20px 24px', marginBottom: '8px',
        }}>
          {/* Header row: score + label + dollar */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.2 }}>{bottleneck.label === 'Dispatch' ? 'Fleet' : bottleneck.label}</div>
                <div style={{ display: 'inline-block', fontSize: '9px', fontWeight: 700, letterSpacing: '.8px', textTransform: 'uppercase', color: isPre ? '#b8860b' : '#1a6644', background: isPre ? '#fff8e1' : '#e8f5ee', border: `1px solid ${isPre ? '#f5cba0' : '#b8dfc8'}`, borderRadius: '4px', padding: '2px 7px', marginTop: '5px' }}>
                  {isPre ? 'Likely constraint area' : 'Primary constraint'}
                </div>
              </div>
            </div>
            {bnLoss > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#1a1a1a', lineHeight: 1, letterSpacing: '-1px' }}>{isPre ? `${fmtK(Math.round(bnLoss * 0.7))}-${fmtK(Math.round(bnLoss * 1.3))}` : fmtK(bnLoss)}<span style={{ fontSize: '13px', fontWeight: 500, color: '#888', marginLeft: '4px' }}>/mo</span></div>
                {!isPre && <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>≈ {fmtK(bnDailyLoss)} / day</div>}
                {isPre && <div style={{ fontSize: '11px', color: '#b8860b', marginTop: '2px' }}>directional estimate</div>}
              </div>
            )}
          </div>

          {bnDetail && (
            <>
              {/* Divider */}
              <div style={{ borderTop: '1px solid #e2e2de', margin: '14px 0' }} />

              {/* Root cause, single compact line */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#aaa', marginBottom: '5px' }}>{isPre ? 'Preliminary indicator' : 'Root cause'}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                  {bnDetail.rootCauseLabel}
                  {bnDetail.rootCauseMetric && (
                    <span style={{ fontSize: '12px', fontWeight: 400, color: '#aaa' }}>{bnDetail.rootCauseMetric}</span>
                  )}
                </div>
              </div>

              {/* Next 7 days */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#aaa', marginBottom: '8px' }}>{isPre ? 'Before the on-site visit' : 'Next 7 days'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {bnDetail.startHere.map((bullet, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#1a6644', flexShrink: 0, marginTop: '7px' }} />
                      <span style={{ fontSize: '13px', color: '#444', lineHeight: 1.5 }}>{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              {onSwitchToTracking && (
                <>
                  <div style={{ borderTop: '1px solid #e2e2de', marginBottom: '14px' }} />
                  <button onClick={onSwitchToTracking} style={{
                    background: 'none', border: 'none', padding: '0',
                    fontSize: '13px', fontWeight: 600, color: '#1a6644',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                    Start 90-day tracking →
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Other scores, muted, capped at 2 cols on mobile */}
      {others.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${Math.min(others.length, 3)}, 1fr)`, gap: '8px', marginBottom: '8px' }}>
          {others.map(d => {
            const s = Math.round(d.score)
            const status = s >= 80 ? 'On track' : s >= 60 ? 'Needs attention' : 'At risk'
            const statusColor = s >= 80 ? '#2a9d6e' : s >= 60 ? '#c96a00' : '#cc3333'
            const dotColor = s >= 80 ? '#2a9d6e' : s >= 60 ? '#e8a020' : '#cc3333'
            return (
              <div key={d.key} style={{
                background: '#f9faf9', border: '1px solid #e8e8e6', borderRadius: '12px',
                padding: '14px 12px', textAlign: 'center',
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor }} />
                  <div style={{ fontSize: '13px', color: '#555', fontWeight: 600 }}>{d.label === 'Dispatch' ? 'Fleet' : d.label}</div>
                </div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: statusColor }}>{status}</div>
              </div>
            )
          })}
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
  const isMobile = useIsMobile()
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>

        {/* Left: WHY THIS HAPPENS */}
        <div style={{ padding: isMobile ? '16px 18px' : '20px 24px', borderRight: isMobile ? 'none' : '1px solid #f0f0ee', borderBottom: isMobile ? '1px solid #f0f0ee' : 'none' }}>
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
        <div style={{ padding: isMobile ? '16px 18px' : '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#b0b0b0', marginBottom: '16px' }}>
            Start here
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            {actionItems.slice(0, 3).map((action, i) => {
              const timeframe = i === 0 ? 'Week 1' : i === 1 ? 'Weeks 2–3' : 'Month 2–3'
              return (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, color: '#2a9d6e',
                    background: '#f0faf6', border: '1px solid #b5dfc9',
                    borderRadius: '3px', padding: '2px 5px',
                    flexShrink: 0, marginTop: '2px', whiteSpace: 'nowrap',
                  }}>{timeframe}</span>
                  <span style={{ fontSize: '13px', color: '#1a1a1a', lineHeight: 1.5 }}>{action}</span>
                </div>
              )
            })}
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
  const isMobile = useIsMobile()
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
        width: isMobile ? '100%' : '420px',
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

// ── Focus Actions Editor (admin) ────────────────────────────────────────────

function FocusActionsEditor({ assessmentId, initial, issues }: {
  assessmentId: string
  initial: string[] | null | undefined
  issues: Issue[]
}) {
  const supabase = createClient()
  const topActions = [...issues]
    .filter(i => i.action && i.loss > 0)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .map(i => i.action!)

  const [actions, setActions] = useState<[string, string, string]>(() => {
    const src = initial && initial.length > 0 ? initial : topActions
    return [src[0] ?? '', src[1] ?? '', src[2] ?? '']
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    const vals = actions.filter(a => a.trim())
    await supabase.from('assessments').update({ focus_actions: vals.length ? vals : null }).eq('id', assessmentId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
          Manager focus board
        </div>
        <div style={{ fontSize: '10px', color: 'var(--gray-400)' }}>Visible to manager after report release</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
        {([0, 1, 2] as const).map(i => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#0F6E56', background: '#f0faf6', border: '1px solid #b5dfc9', borderRadius: '3px', padding: '3px 6px', flexShrink: 0, marginTop: '8px', whiteSpace: 'nowrap' }}>
              {i === 0 ? 'Week 1' : i === 1 ? 'Weeks 2–3' : 'Month 2–3'}
            </span>
            <input
              value={actions[i]}
              onChange={e => setActions(prev => { const n = [...prev] as [string,string,string]; n[i] = e.target.value; return n })}
              placeholder={topActions[i] ?? `Action ${i + 1}`}
              style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', fontFamily: 'var(--font)', color: 'var(--gray-800)', background: 'var(--white)' }}
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ padding: '6px 16px', background: saved ? 'var(--phase-complete)' : 'var(--green)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', transition: 'background .2s' }}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save focus board'}
      </button>
    </div>
  )
}

// ── Manager Next Steps Banner ───────────────────────────────────────────────

function ManagerNextSteps({ issues, focusActions, onSwitchToTracking }: {
  issues: Issue[]
  focusActions?: string[] | null
  onSwitchToTracking?: () => void
}) {
  // Prefer Louis's curated focus actions; fall back to auto-generated from issues
  const hasFocusActions = focusActions && focusActions.length > 0
  const actionIssues = hasFocusActions ? [] : [...issues]
    .filter(i => i.action && i.loss > 0)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)

  const displayActions: string[] = hasFocusActions
    ? focusActions!
    : actionIssues.map(i => i.action!)

  if (displayActions.length === 0) return null

  const TIMEFRAMES = ['Week 1', 'Weeks 2–3', 'Month 2–3']

  return (
    <div style={{
      background: '#0F6E56', borderRadius: 'var(--radius)',
      padding: '20px 24px', marginBottom: '20px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '14px' }}>
        Your next steps
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {displayActions.map((action, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, color: '#0F6E56',
              background: 'rgba(255,255,255,0.9)', borderRadius: '3px',
              padding: '2px 6px', flexShrink: 0, marginTop: '1px', whiteSpace: 'nowrap',
            }}>
              {TIMEFRAMES[i]}
            </span>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>
              {action}
            </span>
          </div>
        ))}
      </div>
      {onSwitchToTracking && (
        <button
          type="button"
          onClick={onSwitchToTracking}
          style={{
            padding: '8px 18px', background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '7px', fontSize: '12px', fontWeight: 600,
            color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          Set up 90-day tracking →
        </button>
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
  customerId?: string
  reportReleased?: boolean
  isAdmin?: boolean
  overrides?: CalcOverrides
  onOverrideChange?: (o: CalcOverrides) => void
  phase?: Phase
  onSwitchToTracking?: () => void
  demoBanner?: DemoBannerProps
  userRole?: 'owner' | 'manager' | 'operator' | null
  focusActions?: string[] | null
  baselineData?: { answers: Answers; calcResult: CalcResult; date: string }
  fieldLogContext?: import('@/lib/fieldlog/context').FieldLogContext | null
}

export default function ReportView({ calcResult, answers, meta, report, assessmentId, customerId, reportReleased, isAdmin, overrides, onOverrideChange, phase, onSwitchToTracking, demoBanner, userRole, focusActions, fieldLogContext }: ReportViewProps) {
  const isMobile = useIsMobile()
  const isPre = phase === 'workshop'
  const supabase = createClient()
  const issues = buildIssues(calcResult, answers, meta)
  // Build ValidatedDiagnosis early: needed for authoritative constraint identification
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dx = useMemo(() => buildValidatedDiagnosis(calcResult, answers, meta, overrides ? { measuredTA: overrides.measuredTA, measuredTripCount: overrides.measuredTripCount } : undefined), [assessmentId, calcResult, answers, meta, overrides])

  // Pure calculation system (rc) — parallel to dx.calc_trace, used by ExportWord
  const reportInput = useMemo(() => dx ? mapToReportInput(dx, answers) : undefined, [dx, answers])
  const rc = useMemo(() => reportInput ? calculateReport(reportInput) : undefined, [reportInput])

  // Constraint is ALWAYS from calcResult.bottleneck via dx.primary_constraint.
  // getFinancialBottleneck() is no longer used for constraint identification.
  const financialBottleneck = dx.primary_constraint

  const bottleneckIssues = issues.filter(i => i.category === 'bottleneck' && i.loss > 0)
  const bottleneckLoss = bottleneckIssues.length > 0 ? Math.max(...bottleneckIssues.map(i => i.loss)) : 0
  const independentLoss = issues.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
  const totalLoss = bottleneckLoss + independentLoss
  const primaryBottleneckLoss = bottleneckLoss

  const dailyLoss = Math.round(totalLoss / (calcResult.workingDaysMonth || 22))

  // Bottleneck-specific loss (single dimension), used for ImpactHook headline
  const bnLoss = financialBottleneck
    ? issues.filter(i => i.dimension === financialBottleneck).reduce((sum, i) => sum + (i.loss ?? 0), 0)
    : 0
  const bnDailyLoss = Math.round(bnLoss / (calcResult.workingDaysMonth || 22))

  // ── Live benchmark data ──────────────────────────────────────────────────
  const liveBenchmarks = useBenchmarks(calcResult, assessmentId)

  // ── AI section state ─────────────────────────────────────────────────────
  const [texts, setTexts] = useState({
    executive: report?.executive || '',
    diagnosis: report?.diagnosis || '',
    actions:   report?.actions || '',
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

  const hasAllSections = isPre ? !!texts.executive : !!(texts.executive && texts.diagnosis && texts.actions)
  const hasAnySections = !!(texts.executive || texts.diagnosis || texts.actions)

  // Context sent to API: dx + raw answers (for fields not yet on VD) + phase + benchmark buckets
  const aiContext = useMemo(() => ({
    dx,
    answers,
    phase: phase ?? 'onsite',
    radiusBucket: calcResult.radius < 10 ? 'short' : calcResult.radius <= 20 ? 'medium' : 'long',
    fleetBucket:  calcResult.trucks <= 5 ? 'small' : calcResult.trucks <= 15 ? 'medium' : 'large',
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dx, answers, phase, calcResult])

  const saveSection = useCallback(async (section: string, text: string) => {
    setTexts(prev => ({ ...prev, [section]: text }))
    await supabase.from('reports').upsert({
      assessment_id: assessmentId,
      [section]: text,
      edited: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'assessment_id' })
  }, [assessmentId, supabase])

  const generate = useCallback(async (section: string): Promise<boolean> => {
    setGenerating(section)
    setGenError(null)
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
        setTexts(prev => ({ ...prev, [section]: accumulated }))
      }

      if (!accumulated.trim()) throw new Error('Empty response, AI returned no content')
      setGenerating(null)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg.startsWith('HTTP 5')) {
        setGenError('Report generation is temporarily unavailable. Please try again in a few minutes. If the issue persists, contact support.')
      } else {
        setGenError(`Failed to generate ${section}: ${msg}`)
      }
      setGenerating(null)
      return false
    }
  }, [assessmentId, aiContext])

  const generateAll = useCallback(async () => {
    setGenError(null)
    const failed: string[] = []
    const sectionLabels: Record<string, string> = { executive: 'Executive', diagnosis: 'Analysis', actions: 'Actions' }
    // Pre-assessment: only executive is AI-generated. Diagnosis and actions sections removed from Word export.
    const sections = phase === 'workshop' ? ['executive'] : ['executive', 'diagnosis', 'actions']
    for (const section of sections) {
      // Skip sections that already have content ("Generate missing")
      if (texts[section as keyof typeof texts]?.trim()) continue
      const ok = await generate(section)
      if (!ok) failed.push(sectionLabels[section] || section)
    }
    if (failed.length > 0) {
      setGenError(`Report generation is temporarily unavailable. Please try again in a few minutes. If the issue persists, contact support.`)
    }
  }, [generate, texts])

  const hasSliders = !!(
    getSliderConfig(calcResult, 'Fleet') ||
    getSliderConfig(calcResult, 'Quality') ||
    (calcResult.dispatchMin ?? 0) > 15
  )

  const showBoard = userRole !== 'operator'

  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateColumns: (!isMobile && showBoard) ? '1fr 300px' : '1fr',
      overflow: isMobile ? 'auto' : 'hidden',
    }}>
    <div style={{ overflowY: 'auto', padding: isMobile ? '12px' : '20px', paddingBottom: '60px' }}>

      {/* Demo regenerate banner, shown when user edits answers away from defaults */}
      {demoBanner?.show && (
        <div style={{
          marginBottom: '16px',
          border: '1px solid #fcd34d',
          background: '#fffbeb',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
              You&apos;ve updated the plant data.
            </div>
            <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
              Regenerate the report to see findings based on your inputs.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={demoBanner.onReset}
              style={{
                fontSize: '12px', color: '#92400e', background: 'none', border: 'none',
                cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font)',
                textDecorationColor: '#fbbf24',
              }}
            >
              Reset answers
            </button>
            {demoBanner.regenCount < demoBanner.maxRegen ? (
              <button
                type="button"
                disabled={generating !== null}
                onClick={async () => {
                  await generateAll()
                  demoBanner.onRegenerate()
                }}
                style={{
                  fontSize: '12px', fontWeight: 600,
                  color: generating !== null ? '#92400e' : '#fff',
                  background: generating !== null ? 'transparent' : '#d97706',
                  border: generating !== null ? '1px solid #fcd34d' : 'none',
                  borderRadius: '7px', padding: '7px 14px',
                  cursor: generating !== null ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font)',
                  transition: 'background 0.15s',
                }}
              >
                {generating !== null ? 'Generating…' : 'Regenerate report →'}
              </button>
            ) : (
              <button
                type="button"
                disabled
                style={{
                  fontSize: '12px', fontWeight: 500,
                  color: '#9ca3af', background: '#f3f4f6',
                  border: '1px solid #e5e7eb', borderRadius: '7px',
                  padding: '7px 14px', cursor: 'not-allowed', fontFamily: 'var(--font)',
                }}
              >
                Regenerate limit reached for this session
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isAdmin && !reportReleased && (
            <span style={{ fontSize: '11px', color: 'var(--warning-dark)', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: '4px', padding: '3px 8px', fontWeight: 500 }}>
              🔒 Draft
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
          Note: aggregate/admixture costs not entered, margin estimated at 35%. Enter material costs for precise figures.
        </div>
      )}
      {isAdmin && calcResult.warnings && calcResult.warnings.length > 0 && (
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

      {/* 0a. ADMIN: Focus board editor */}
      {isAdmin && calcResult.overall !== null && (
        <FocusActionsEditor assessmentId={assessmentId} initial={focusActions} issues={issues} />
      )}

      {/* 0b. MANAGER NEXT STEPS, removed; content merged into Action Board */}

      {/* 1. SCORE GRID (ImpactHook merged in) */}
      <ScoreGrid calcResult={calcResult} financialBottleneck={financialBottleneck} issues={issues} onSwitchToTracking={onSwitchToTracking} isPre={isPre} />

      {/* 4. WHY THIS HAPPENS + START HERE */}
      <WhyAndStartHere
        issues={issues}
        totalLoss={totalLoss}
        calcResult={calcResult}
        onSwitchToTracking={onSwitchToTracking}
      />

      {/* 5. NEXT IMPROVEMENTS (collapsed) */}
      <NextImprovements issues={issues} />

      {/* 6. GCC PEER COMPARISON */}
      {totalLoss > 0 && <BenchmarkPositioning calcResult={calcResult} answers={answers} />}

      {/* 7. INDICATIVE NOTICE */}
      <IndicativeNotice />

      {/* Full report CTA */}
      {calcResult.overall !== null && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
              border: 'none', borderRadius: '10px',
              padding: '18px 24px', width: '100%', textAlign: 'left', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{isPre ? 'Pre-assessment report' : 'Full operational report'}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{isPre ? 'Directional analysis · Preparation plan · On-site scope →' : 'AI diagnosis · Root cause analysis · Action plan →'}</div>
            </div>
            <span style={{ fontSize: '20px', color: 'rgba(255,255,255,0.6)' }}>›</span>
          </button>
        </div>
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
        readOnly={!isAdmin}
        recoveryRange={dx.combined_recovery_range}
        tatSource={dx.tat_source}
        tatTripCount={dx.tat_trip_count}
        dx={dx}
        fieldLogContext={fieldLogContext}
        rc={rc}
        reportInput={reportInput}
      />

    </div>

    {/* Right panel: Action Board */}
    {showBoard && !isMobile && (
      <div style={{
        borderLeft: '1px solid var(--border)',
        overflowY: 'auto',
        background: 'var(--gray-50)',
        padding: '20px 16px',
      }}>
        <ActionBoard
          assessmentId={assessmentId}
          customerId={customerId ?? ''}
          focusActions={focusActions?.filter(Boolean) ?? []}
          canEdit={userRole !== 'owner'}
          financialBottleneck={financialBottleneck}
          recoverable={primaryBottleneckLoss}
        />
      </div>
    )}

    {/* Mobile: Action Board stacked below */}
    {showBoard && isMobile && (
      <div style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--gray-50)',
        padding: '16px',
      }}>
        <ActionBoard
          assessmentId={assessmentId}
          customerId={customerId ?? ''}
          focusActions={focusActions?.filter(Boolean) ?? []}
          canEdit={userRole !== 'owner'}
          financialBottleneck={financialBottleneck}
          recoverable={primaryBottleneckLoss}
        />
      </div>
    )}

    </div>
  )
}
