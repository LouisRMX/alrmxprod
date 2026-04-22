'use client'

/**
 * Intervention plan tab — AI-generated, plant-specific operational
 * improvement plans. Streams markdown from /api/generate-intervention-plan
 * with progressive rendering so the observer sees the plan build section
 * by section (wow moment for live demos).
 *
 * Saved plans are listed below the active pane so consultants can review
 * history, re-open a past plan, or regenerate with feedback.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  assessmentId: string
  plantId: string
}

interface SavedPlan {
  id: string
  generated_at: string
  model_version: string | null
  plan_content: { markdown?: string } | null
  status: string
  notes: string | null
  input_snapshot?: {
    eval_result?: {
      overall_score: number
      publishable: boolean
      dimension_scores: Array<{ dimension: string; score: number; rationale: string; violations?: string[] }>
      top_fixes: string[]
      evaluated_at: string
    }
  } | null
}

interface EvalResult {
  overall_score: number
  publishable: boolean
  dimension_scores: Array<{ dimension: string; score: number; rationale: string; violations?: string[] }>
  top_fixes: string[]
}

export default function InterventionPlanView({ assessmentId, plantId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [revising, setRevising] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([])
  const [openPlanId, setOpenPlanId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Server-side control markers. Must match src/app/api/generate-intervention-plan/route.ts.
  const RESET_MARKER = '\u0001ALRMX_PLAN_RESET\u0001'
  const DONE_MARKER = '\u0001ALRMX_PLAN_DONE\u0001'

  const loadSaved = useCallback(async () => {
    const { data } = await supabase
      .from('intervention_plans')
      .select('id, generated_at, model_version, plan_content, status, notes, input_snapshot')
      .eq('assessment_id', assessmentId)
      .order('generated_at', { ascending: false })
      .limit(20)
    setSavedPlans((data ?? []) as SavedPlan[])
  }, [assessmentId, supabase])

  const [evalLoading, setEvalLoading] = useState(false)
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null)

  const deletePlan = useCallback(async (planId: string) => {
    const plan = savedPlans.find(p => p.id === planId)
    const label = plan ? new Date(plan.generated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'this plan'
    if (!window.confirm(`Delete plan from ${label}? This cannot be undone.`)) return
    setError(null)
    try {
      const { error: delErr } = await supabase
        .from('intervention_plans')
        .delete()
        .eq('id', planId)
      if (delErr) throw new Error(delErr.message)
      // If we deleted the currently-open plan, clear the view
      if (openPlanId === planId) {
        setOpenPlanId(null)
        setStreamText('')
        setEvalResult(null)
      }
      await loadSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }, [savedPlans, supabase, openPlanId, loadSaved])

  const runEval = useCallback(async (planId: string) => {
    setEvalLoading(true)
    setEvalResult(null)
    try {
      const res = await fetch('/api/evaluate-intervention-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as EvalResult
      setEvalResult(data)
      await loadSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluation failed')
    } finally {
      setEvalLoading(false)
    }
  }, [loadSaved])

  useEffect(() => { loadSaved() }, [loadSaved])

  const generateWithExplicitFeedback = useCallback(async (explicitFeedback: string) => {
    // Skip the feedback-box dance: fire regeneration immediately with the
    // provided feedback string. Used by the "Apply these polish fixes"
    // button on the eval scorecard.
    setError(null)
    setStreaming(true)
    setStreamText('')
    setRevising(false)
    setOpenPlanId(null)
    setCopied(false)
    setEvalResult(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    try {
      const res = await fetch('/api/generate-intervention-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          plantId,
          regenerationFeedback: explicitFeedback,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')
      const decoder = new TextDecoder()
      let acc = ''
      let localRevising = false
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        acc += chunk
        let processed = acc
        let changed = true
        while (changed) {
          changed = false
          const resetIdx = processed.indexOf(RESET_MARKER)
          if (resetIdx >= 0) {
            processed = processed.slice(resetIdx + RESET_MARKER.length)
            localRevising = true
            setRevising(true)
            changed = true
            continue
          }
          const doneIdx = processed.indexOf(DONE_MARKER)
          if (doneIdx >= 0) {
            processed = processed.slice(0, doneIdx)
          }
        }
        if (localRevising && processed.length > 0) {
          localRevising = false
          setRevising(false)
        }
        acc = processed
        setStreamText(processed)
      }
      await loadSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plan generation failed')
    } finally {
      setStreaming(false)
      setRevising(false)
    }
  }, [assessmentId, plantId, loadSaved, RESET_MARKER, DONE_MARKER])

  const generate = useCallback(async (regen = false) => {
    setError(null)
    setStreaming(true)
    setStreamText('')
    setRevising(false)
    setOpenPlanId(null)
    setCopied(false)
    try {
      const res = await fetch('/api/generate-intervention-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          plantId,
          regenerationFeedback: regen ? feedback.trim() || undefined : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        acc += chunk

        // Scan for control markers: reset (revision starting) and done.
        // We process markers in order, keeping the tail after each.
        let processed = acc
        let changed = true
        while (changed) {
          changed = false
          const resetIdx = processed.indexOf(RESET_MARKER)
          if (resetIdx >= 0) {
            processed = processed.slice(resetIdx + RESET_MARKER.length)
            setRevising(true)
            changed = true
            continue
          }
          const doneIdx = processed.indexOf(DONE_MARKER)
          if (doneIdx >= 0) {
            processed = processed.slice(0, doneIdx)
            // done marker means no more text follows; stop looking
          }
        }
        // Once we get any post-reset text, flip revising off and render it
        if (revising && processed.length > 0) setRevising(false)
        acc = processed
        setStreamText(processed)
      }
      await loadSaved()
      if (regen) { setFeedback(''); setShowFeedback(false) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Plan generation failed')
    } finally {
      setStreaming(false)
      setRevising(false)
    }
  }, [assessmentId, plantId, feedback, loadSaved, revising, RESET_MARKER, DONE_MARKER])

  const activeMarkdown = streamText
    || (openPlanId ? savedPlans.find(p => p.id === openPlanId)?.plan_content?.markdown ?? '' : '')
    || ''

  // Plan-id tied to whatever we are currently rendering: either an
  // explicitly opened history item, or the just-generated plan (most
  // recent saved plan after stream ends).
  const activePlanId = openPlanId ?? (streamText && !streaming ? savedPlans[0]?.id ?? null : null)

  const handleCopy = useCallback(async () => {
    if (!activeMarkdown) return
    try {
      await navigator.clipboard.writeText(activeMarkdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }, [activeMarkdown])

  const handlePrint = useCallback(() => {
    if (!activeMarkdown) return
    const win = window.open('', '_blank')
    if (!win) return
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Intervention plan</title>
      <style>
        body { font: 14px/1.6 -apple-system, Segoe UI, system-ui, sans-serif; max-width: 780px; margin: 32px auto; padding: 0 24px; color: #222; }
        h1, h2, h3 { line-height: 1.3; }
        h2 { margin-top: 36px; border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; }
        h3 { color: #0F6E56; margin-top: 22px; }
        code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
        pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
        blockquote { border-left: 3px solid #0F6E56; margin: 12px 0; padding: 4px 12px; background: #f8f8f8; color: #555; }
        ul, ol { margin: 8px 0; padding-left: 22px; }
        li { margin: 4px 0; }
        @media print { h2 { page-break-after: avoid; } }
      </style>
    </head><body>${markdownToHtml(activeMarkdown)}</body></html>`
    win.document.write(html)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }, [activeMarkdown])

  return (
    <div style={{ padding: '20px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>
            Intervention plan
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888', lineHeight: 1.4, maxWidth: '520px' }}>
            AI-generated plan grounded in the plant&apos;s pre-assessment and field-log data. Review + edit before sharing with the owner. All USD figures are either traceable to input data or library ranges.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {activeMarkdown && !streaming && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                style={secondaryBtn}
              >{copied ? '✓ Copied' : 'Copy markdown'}</button>
              <button
                type="button"
                onClick={handlePrint}
                style={secondaryBtn}
              >Print / PDF</button>
              {activePlanId && (
                <button
                  type="button"
                  onClick={() => runEval(activePlanId)}
                  disabled={evalLoading}
                  style={evalLoading ? secondaryBtnDisabled : secondaryBtn}
                >{evalLoading ? 'Evaluating…' : 'Evaluate quality'}</button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={streaming}
            style={streaming ? primaryBtnDisabled : primaryBtn}
          >
            {streaming ? 'Generating…' : savedPlans.length === 0 ? 'Generate plan' : 'Generate new plan'}
          </button>
        </div>
      </div>

      {/* Regeneration feedback input, shown on demand */}
      {!streaming && activeMarkdown && (
        <div style={{ marginBottom: '16px' }}>
          {!showFeedback ? (
            <button
              type="button"
              onClick={() => setShowFeedback(true)}
              style={linkBtn}
            >Regenerate with feedback →</button>
          ) : (
            <div style={{
              background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px',
              padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#555' }}>
                What to change
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={'e.g., "exclude the dispatcher-app intervention, they already use Command Alkon"\nor "focus phase 1 entirely on partial-load reduction"'}
                rows={3}
                style={{
                  width: '100%', padding: '10px', border: '1px solid #ddd',
                  borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setShowFeedback(false); setFeedback('') }}
                  style={secondaryBtn}
                >Cancel</button>
                <button
                  type="button"
                  onClick={() => generate(true)}
                  disabled={!feedback.trim() || streaming}
                  style={!feedback.trim() || streaming ? primaryBtnDisabled : primaryBtn}
                >Regenerate</button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          background: '#FDEDEC', border: '1px solid #E8A39B', color: '#8B3A2E',
          padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
        }}>{error}</div>
      )}

      {revising && (
        <div style={{
          background: '#FFF4D6', border: '1px solid #F1D79A', color: '#7a5a00',
          padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{
            display: 'inline-block', width: '10px', height: '10px',
            borderRadius: '50%', background: '#D68910',
            animation: 'blink 1s step-end infinite',
          }} />
          Draft failed validation, regenerating with corrections...
        </div>
      )}

      {/* Eval scorecard (when just-run or loaded from a saved plan) */}
      {(evalResult || (activePlanId && savedPlans.find(p => p.id === activePlanId)?.input_snapshot?.eval_result)) && (
        <EvalScorecard
          result={evalResult ?? (savedPlans.find(p => p.id === activePlanId)?.input_snapshot?.eval_result as EvalResult)}
          onRegenerateWithFeedback={generateWithExplicitFeedback}
          streaming={streaming}
        />
      )}

      {/* Plan rendering area */}
      {activeMarkdown && (
        <div style={{
          background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
          padding: '24px', fontSize: '14px', lineHeight: 1.65, color: '#222',
        }}>
          <MarkdownView markdown={activeMarkdown} />
          {streaming && (
            <div style={{
              display: 'inline-block', width: '8px', height: '16px',
              background: '#0F6E56', verticalAlign: 'middle',
              animation: 'blink 1s step-end infinite', marginLeft: '2px',
            }} />
          )}
        </div>
      )}

      {!activeMarkdown && !streaming && (
        <div style={{
          background: '#fff', border: '1px dashed #ccc', borderRadius: '10px',
          padding: '28px', textAlign: 'center', color: '#888', fontSize: '13px',
        }}>
          No plan yet. Tap <strong>Generate plan</strong> to produce a plant-specific intervention playbook.
        </div>
      )}

      {/* Saved plans timeline */}
      {savedPlans.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '10px' }}>
            History ({savedPlans.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {savedPlans.map(p => {
              const isOpen = p.id === openPlanId
              const d = new Date(p.generated_at)
              const evalScore = p.input_snapshot?.eval_result?.overall_score
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'stretch', gap: '4px',
                    background: isOpen ? '#E1F5EE' : '#fff',
                    border: `1px solid ${isOpen ? '#A8D9C5' : '#e5e5e5'}`,
                    borderRadius: '8px', overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setStreamText('')
                      setOpenPlanId(isOpen ? null : p.id)
                    }}
                    style={{
                      flex: 1, textAlign: 'left',
                      background: 'transparent', border: 'none',
                      padding: '10px 14px', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: '13px', color: isOpen ? '#0F6E56' : '#333',
                    }}
                  >
                    <span>
                      {d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      <span style={{ color: '#888', marginLeft: '8px', fontSize: '11px' }}>
                        · {p.status} · {p.model_version ?? 'unknown model'}
                        {typeof evalScore === 'number' && (
                          <span style={{
                            marginInlineStart: '8px', padding: '1px 6px',
                            background: evalScore >= 4 ? '#E1F5EE' : evalScore >= 3 ? '#FFF4D6' : '#FDEDEC',
                            color: evalScore >= 4 ? '#0F6E56' : evalScore >= 3 ? '#7a5a00' : '#8B3A2E',
                            borderRadius: '3px', fontWeight: 600,
                          }}>{evalScore.toFixed(1)}/5</span>
                        )}
                      </span>
                    </span>
                    <span>{isOpen ? '▲ open' : '▼ view'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePlan(p.id)}
                    aria-label="Delete plan"
                    title="Delete this plan"
                    style={{
                      background: 'transparent', border: 'none',
                      borderInlineStart: '1px solid #eee',
                      padding: '0 12px', cursor: 'pointer',
                      color: '#C0392B', fontSize: '14px', fontWeight: 600,
                    }}
                  >✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  )
}

// ── Eval scorecard ──────────────────────────────────────────────────────

function EvalScorecard({ result, onRegenerateWithFeedback, streaming }: {
  result: EvalResult
  onRegenerateWithFeedback?: (feedback: string) => void
  streaming?: boolean
}) {
  const overall = result.overall_score
  const band = overall >= 4 ? '#0F6E56' : overall >= 3 ? '#D68910' : '#C0392B'
  const bandBg = overall >= 4 ? '#E1F5EE' : overall >= 3 ? '#FFF4D6' : '#FDEDEC'
  // Conservative flag instructs the revision prompt to apply fixes as
  // wording refinements only, without restructuring the plan. Used on
  // publishable plans where a full regeneration risks balance regression.
  const feedbackStr = result.top_fixes.length > 0
    ? (result.publishable
        ? `CONSERVATIVE POLISH ONLY. The plan is already publishable; apply these evaluator refinements as WORDING changes only. Do NOT restructure sections, add or remove interventions, or change USD totals. Refine clarity only:\n${result.top_fixes.map(f => `- ${f}`).join('\n')}`
        : `Apply these fixes from the last quality evaluation:\n${result.top_fixes.map(f => `- ${f}`).join('\n')}`)
    : ''
  const buttonLabel = result.publishable
    ? 'Apply polish fixes (wording only)'
    : 'Regenerate using these fixes →'
  return (
    <div style={{
      background: bandBg, border: `1px solid ${band}`, color: band,
      borderRadius: '12px', padding: '16px', marginBottom: '16px',
      fontSize: '13px', lineHeight: 1.5,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '22px', fontWeight: 700 }}>{overall.toFixed(1)}/5</span>
        <span style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>
          {result.publishable ? 'Publishable' : 'Needs fixes before sharing'}
        </span>
        {onRegenerateWithFeedback && feedbackStr && (
          <button
            type="button"
            onClick={() => onRegenerateWithFeedback(feedbackStr)}
            disabled={streaming}
            style={{
              marginInlineStart: 'auto',
              padding: '6px 12px', minHeight: '32px',
              background: streaming ? '#999' : band, color: '#fff', border: 'none',
              borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              cursor: streaming ? 'not-allowed' : 'pointer',
              opacity: streaming ? 0.7 : 1,
            }}
          >{streaming ? 'Regenerating…' : buttonLabel}</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px 14px' }}>
        {result.dimension_scores.map(d => (
          <div key={d.dimension} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ textTransform: 'capitalize' }}>{d.dimension.replace(/_/g, ' ')}</span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{d.score}/5</strong>
          </div>
        ))}
      </div>
      {result.top_fixes.length > 0 && (
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${band}33` }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
            Top fixes
          </div>
          <ul style={{ margin: 0, paddingInlineStart: '18px' }}>
            {result.top_fixes.map((f, i) => <li key={i} style={{ margin: '2px 0' }}>{f}</li>)}
          </ul>
          {result.publishable && (
            <div style={{
              marginTop: '10px', padding: '8px 10px',
              background: '#fff', border: `1px dashed ${band}66`, borderRadius: '6px',
              fontSize: '11px', color: band, lineHeight: 1.4,
            }}>
              <strong>Regression risk note</strong>: this plan is already publishable.
              Using the button above runs a conservative regen that keeps interventions + USD intact
              and only refines wording. For maximum control, copy the markdown and apply these fixes
              manually in your editor instead.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Minimal markdown renderer (no deps) ─────────────────────────────────
// Supports: H2/H3, bold, italic, code, inline code, bullet/numbered lists,
// blockquotes. Good enough for the plan output format. Escapes HTML.

function MarkdownView({ markdown }: { markdown: string }) {
  return <div dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }} />
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let inCode = false

  const flushList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null }
  }

  for (const raw of lines) {
    const line = raw
    if (line.trim().startsWith('```')) {
      flushList()
      if (inCode) { out.push('</pre>'); inCode = false } else { out.push('<pre>'); inCode = true }
      continue
    }
    if (inCode) { out.push(escapeHtml(line)); continue }

    if (/^##\s+/.test(line)) {
      flushList()
      out.push(`<h2>${renderInline(line.replace(/^##\s+/, ''))}</h2>`)
      continue
    }
    if (/^###\s+/.test(line)) {
      flushList()
      out.push(`<h3>${renderInline(line.replace(/^###\s+/, ''))}</h3>`)
      continue
    }
    if (/^>\s?/.test(line)) {
      flushList()
      out.push(`<blockquote>${renderInline(line.replace(/^>\s?/, ''))}</blockquote>`)
      continue
    }
    const olMatch = line.match(/^(\d+)\.\s+(.*)/)
    const ulMatch = line.match(/^[-*]\s+(.*)/)
    if (olMatch) {
      if (listType !== 'ol') { flushList(); out.push('<ol>'); listType = 'ol' }
      out.push(`<li>${renderInline(olMatch[2])}</li>`)
      continue
    }
    if (ulMatch) {
      if (listType !== 'ul') { flushList(); out.push('<ul>'); listType = 'ul' }
      out.push(`<li>${renderInline(ulMatch[1])}</li>`)
      continue
    }
    if (line.trim() === '') { flushList(); out.push(''); continue }
    flushList()
    out.push(`<p>${renderInline(line)}</p>`)
  }
  flushList()
  if (inCode) out.push('</pre>')
  return out.join('\n')
}

function renderInline(text: string): string {
  let s = escapeHtml(text)
  // code `...`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  // bold **...**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // italic *...* (simple, after bold)
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
  return s
}

// ── Styles ──────────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  padding: '10px 18px', minHeight: '40px',
  background: '#0F6E56', color: '#fff', border: 'none',
  borderRadius: '10px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(15, 110, 86, 0.2)',
}
const primaryBtnDisabled: React.CSSProperties = { ...primaryBtn, background: '#bbb', cursor: 'not-allowed', boxShadow: 'none' }
const secondaryBtn: React.CSSProperties = {
  padding: '10px 14px', minHeight: '40px',
  background: '#fff', color: '#0F6E56',
  border: '1px solid #A8D9C5', borderRadius: '10px',
  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
const secondaryBtnDisabled: React.CSSProperties = { ...secondaryBtn, color: '#999', borderColor: '#ddd', cursor: 'not-allowed' }
const linkBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#0F6E56',
  fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: '4px 0',
}
