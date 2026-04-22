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
      .select('id, generated_at, model_version, plan_content, status, notes')
      .eq('assessment_id', assessmentId)
      .order('generated_at', { ascending: false })
      .limit(20)
    setSavedPlans((data ?? []) as SavedPlan[])
  }, [assessmentId, supabase])

  useEffect(() => { loadSaved() }, [loadSaved])

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
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setStreamText('')
                    setOpenPlanId(isOpen ? null : p.id)
                  }}
                  style={{
                    textAlign: 'left',
                    background: isOpen ? '#E1F5EE' : '#fff',
                    border: `1px solid ${isOpen ? '#A8D9C5' : '#e5e5e5'}`,
                    borderRadius: '8px', padding: '10px 14px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '13px', color: isOpen ? '#0F6E56' : '#333',
                  }}
                >
                  <span>
                    {d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    <span style={{ color: '#888', marginLeft: '8px', fontSize: '11px' }}>
                      · {p.status} · {p.model_version ?? 'unknown model'}
                    </span>
                  </span>
                  <span>{isOpen ? '▲ open' : '▼ view'}</span>
                </button>
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
const linkBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: '#0F6E56',
  fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: '4px 0',
}
