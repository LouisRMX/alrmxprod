'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CalcResult, Answers } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import { stripMarkdown } from '@/lib/stripMarkdown'
import ScoreChips from './ScoreChips'
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

// ── Main component ─────────────────────────────────────────────────────────
interface ReportViewProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  assessmentId: string
  reportReleased?: boolean
  isAdmin?: boolean
}

export default function ReportView({ calcResult, answers, meta, report, assessmentId, reportReleased, isAdmin }: ReportViewProps) {
  const supabase = createClient()
  const issues = buildIssues(calcResult, answers, meta)

  const bottleneckIssues = issues.filter(i => i.category === 'bottleneck' && i.loss > 0)
  const bottleneckLoss = bottleneckIssues.length > 0 ? Math.max(...bottleneckIssues.map(i => i.loss)) : 0
  const independentLoss = issues.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
  const totalLoss = bottleneckLoss + independentLoss
  const primaryBottleneckLoss = bottleneckLoss
  const dailyLoss = Math.round(totalLoss / 22)

  // ── AI section state ─────────────────────────────────────────────────────
  const [texts, setTexts] = useState({
    executive: stripMarkdown(report?.executive || ''),
    diagnosis: stripMarkdown(report?.diagnosis || ''),
    actions:   stripMarkdown(report?.actions || ''),
  })
  const [generating, setGenerating] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const hasAllSections = !!(texts.executive && texts.diagnosis && texts.actions)
  const hasAnySections = !!(texts.executive || texts.diagnosis || texts.actions)

  // Build context for AI generation
  const ebitdaMonthly = calcResult.capLeakMonthly + calcResult.turnaroundLeakMonthly + calcResult.rejectLeakMonthly
  const aiContext = useMemo(() => ({
    plant: meta?.plant || '',
    country: meta?.country || '',
    date: meta?.date || '',
    scores: calcResult.scores,
    overall: calcResult.overall,
    bottleneck: calcResult.bottleneck,
    ebitdaMonthly,
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
    setGenError(null)
    setTexts(prev => ({ ...prev, [section]: '' }))

    try {
      const resp = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, type: section, context: aiContext }),
      })
      if (!resp.ok) throw new Error('Generation failed')

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No reader')
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setTexts(prev => ({ ...prev, [section]: stripMarkdown(accumulated) }))
      }
    } catch {
      setGenError(`Failed to generate ${section} — click to retry.`)
      setTimeout(() => setGenError(null), 5000)
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

      {/* ── SECTION 1: Opening hook ───────────────────────────────────────── */}
      {totalLoss > 0 && (
        <div style={{
          background: 'var(--error-bg)', border: '1px solid var(--error-border)',
          borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '24px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '13px', color: 'var(--red)', fontWeight: 600, lineHeight: 1.5 }}>
            This plant is leaving an estimated{' '}
            <span style={{ fontFamily: 'var(--mono)', fontSize: '15px' }}>{fmt(dailyLoss)}</span>
            {' '}on the table every working day.
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px' }}>
            {fmt(totalLoss)}/month · {fmt(totalLoss * 12)}/year
          </div>
        </div>
      )}

      {/* ── SECTION 2: Plant Snapshot (AI) ───────────────────────────────── */}
      <AISection
        title="Executive Summary"
        text={texts.executive}
        generating={generating === 'executive'}
        onGenerate={() => generate('executive')}
        onSave={t => saveSection('executive', t)}
        minHeight={100}
      />

      <Divider />

      {/* ── SECTION 3: Performance scores ────────────────────────────────── */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Performance Scores
        </h3>
        <ScoreChips
          scores={calcResult.scores}
          overall={calcResult.overall}
          bottleneck={calcResult.bottleneck}
        />
      </div>

      {/* ── SECTION 4: What this is costing ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
        <div style={{
          background: totalLoss > 0 ? 'var(--error-bg)' : 'var(--gray-100)',
          border: `1px solid ${totalLoss > 0 ? 'var(--error-border)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', padding: '14px 16px',
        }}>
          <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px' }}>
            Cost of inaction
            <ReportInfoTip
              title="How this is calculated"
              text="Primary bottleneck loss (largest overlapping constraint) plus independent losses (rejects, waste, breakdowns). Overlapping issues describe the same constraint from different angles — only the largest is counted to avoid double-counting."
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
              text="Additional monthly revenue if your fleet delivered at realistic maximum capacity. This is a component of the bottleneck — not additional to Cost of Inaction."
            />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--mono)', color: calcResult.hiddenRevMonthly > 0 ? 'var(--green)' : 'var(--gray-500)', marginTop: '2px' }}>
            {calcResult.hiddenRevMonthly > 0 ? fmt(calcResult.hiddenRevMonthly) + '/mo' : '—'}
          </div>
        </div>
      </div>

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

    </div>
  )
}
