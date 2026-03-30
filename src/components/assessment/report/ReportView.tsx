'use client'

import { useState, useRef, useEffect } from 'react'
import type { CalcResult, Answers } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import ScoreChips from './ScoreChips'
import FindingCard from './FindingCard'
import AICopilot from './AICopilot'
import ExportPDF from './ExportPDF'

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

// ── Inline info tooltip (reuses InfoPanel pattern) ─────────────────────
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
      >
        i
      </button>
      {open && (
        <div style={{
          background: 'var(--tooltip-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '8px',
          padding: '10px 12px', marginTop: '6px', fontSize: '11px', color: 'var(--gray-700)',
          lineHeight: 1.6, position: 'absolute', left: 0, top: '100%', zIndex: 100,
          width: '300px', boxShadow: '0 4px 16px rgba(0,0,0,.1)',
        }}>
          <div style={{ fontWeight: 600, color: 'var(--gray-900)', marginBottom: '4px', fontSize: '11px' }}>
            {title}
          </div>
          <div>{text}</div>
        </div>
      )}
    </div>
  )
}

interface ReportViewProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  assessmentId: string
}

export default function ReportView({ calcResult, answers, meta, report, assessmentId }: ReportViewProps) {
  const issues = buildIssues(calcResult, answers, meta)

  // Waterfall: only count the largest bottleneck finding, not the sum of overlapping ones
  const bottleneckIssues = issues.filter(i => i.category === 'bottleneck' && i.loss > 0)
  const bottleneckLoss = bottleneckIssues.length > 0 ? Math.max(...bottleneckIssues.map(i => i.loss)) : 0
  const independentLoss = issues.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
  const totalLoss = bottleneckLoss + independentLoss

  // Track which bottleneck finding is the primary (largest)
  const primaryBottleneckLoss = bottleneckLoss

  // Build context for AI generation
  const aiContext = {
    plant: meta?.plant || '',
    country: meta?.country || '',
    date: meta?.date || '',
    scores: calcResult.scores,
    overall: calcResult.overall,
    bottleneck: calcResult.bottleneck,
    ebitdaMonthly: calcResult.capLeakMonthly + calcResult.turnaroundLeakMonthly + calcResult.rejectLeakMonthly,
    utilPct: Math.round(calcResult.util * 100),
    turnaround: calcResult.ta,
    issues: issues.slice(0, 8).map(i => ({ t: i.t, loss: i.loss, sev: i.sev })),
    answers,
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '60px' }}>
      {/* Export button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <ExportPDF
          calcResult={calcResult}
          answers={answers}
          meta={meta}
          report={report}
        />
      </div>

      {/* Score overview */}
      <ScoreChips
        scores={calcResult.scores}
        overall={calcResult.overall}
        bottleneck={calcResult.bottleneck}
      />

      {/* Data warnings */}
      {calcResult.warnings && calcResult.warnings.length > 0 && (
        <div style={{
          background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '12px',
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

      {/* Headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        <div style={{
          background: totalLoss > 0 ? 'var(--error-bg)' : 'var(--gray-100)',
          border: `1px solid ${totalLoss > 0 ? 'var(--error-border)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', padding: '14px 16px',
        }}>
          <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px' }}>
            Cost of inaction
            <ReportInfoTip
              title="How this is calculated"
              text="Primary bottleneck loss (largest overlapping constraint) plus independent losses (rejects, waste, breakdowns). Overlapping issues like capacity gap, turnaround, and fleet utilisation describe the same constraint from different angles — only the largest is counted to avoid double-counting."
            />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--mono)', color: totalLoss > 0 ? 'var(--red)' : 'var(--gray-500)', marginTop: '2px' }}>
            {totalLoss > 0 ? fmt(totalLoss) + '/mo' : '—'}
          </div>
        </div>
        <div style={{
          background: calcResult.hiddenRevMonthly > 0 ? 'var(--green-light)' : 'var(--gray-100)',
          border: `1px solid ${calcResult.hiddenRevMonthly > 0 ? 'var(--tooltip-border)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', padding: '14px 16px',
        }}>
          <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px' }}>
            Hidden revenue
            <ReportInfoTip
              title="How this is calculated"
              text="Additional monthly revenue if your fleet delivered at realistic maximum capacity. Formula: (realistic max deliveries − actual) × mixer capacity × contribution margin × operating days. This is a component of the bottleneck — not additional to Cost of Inaction."
            />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--mono)', color: calcResult.hiddenRevMonthly > 0 ? 'var(--green)' : 'var(--gray-500)', marginTop: '2px' }}>
            {calcResult.hiddenRevMonthly > 0 ? fmt(calcResult.hiddenRevMonthly) + '/mo' : '—'}
          </div>
        </div>
      </div>

      {/* AI Report sections */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px', color: 'var(--gray-900)' }}>
          AI Report
        </h3>
        <AICopilot
          report={report}
          assessmentId={assessmentId}
          context={aiContext}
        />
      </div>

      {/* Findings */}
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px', color: 'var(--gray-900)' }}>
          Findings ({issues.length})
        </h3>
        {issues.length > 0 ? (
          issues.map((issue, i) => (
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
    </div>
  )
}
