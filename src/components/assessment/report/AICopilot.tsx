'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { stripMarkdown } from '@/lib/stripMarkdown'

interface AICopilotProps {
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  assessmentId: string
  context: Record<string, unknown>
}

type ReportSection = 'executive' | 'diagnosis' | 'actions'

const SECTION_LABELS: Record<ReportSection, string> = {
  executive: 'Executive Summary',
  diagnosis: 'Operational Diagnosis',
  actions: 'Next Step',
}

export default function AICopilot({ report, assessmentId, context }: AICopilotProps) {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<ReportSection>('executive')
  const [texts, setTexts] = useState<Record<string, string>>({
    executive: report?.executive || '',
    diagnosis: report?.diagnosis || '',
    actions: report?.actions || '',
  })
  const [generating, setGenerating] = useState<ReportSection | null>(null)
  const [editing, setEditing] = useState<ReportSection | null>(null)
  const [saving, setSaving] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  // Keep previous text as fallback if regeneration fails
  const previousText = useRef<string>('')

  const saveSection = useCallback(async (section: ReportSection, text: string) => {
    setSaving(true)
    const { error } = await supabase.from('reports').upsert({
      assessment_id: assessmentId,
      [section]: stripMarkdown(text),
      edited: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'assessment_id' })
    if (error) {
      console.error('Report save error:', error)
      setGenError('Failed to save, please try again.')
      setTimeout(() => setGenError(null), 4000)
    }
    setSaving(false)
  }, [assessmentId, supabase])

  const generate = useCallback(async (section: ReportSection) => {
    setGenerating(section)
    setGenError(null)
    // Save previous text so we can restore on failure
    previousText.current = texts[section] || ''
    setTexts(prev => ({ ...prev, [section]: '' }))

    try {
      const resp = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, type: section, context }),
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
        // Strip markdown during streaming so user sees clean text as it arrives
        setTexts(prev => ({ ...prev, [section]: stripMarkdown(accumulated) }))
      }
    } catch (e) {
      console.error('Report generation error:', e)
      setGenError('Generation failed, click Generate to retry.')
      // Restore previous text on failure
      if (!texts[section]) {
        setTexts(prev => ({ ...prev, [section]: previousText.current }))
      }
    }

    setGenerating(null)
  }, [assessmentId, context, texts])

  const generateAll = useCallback(async () => {
    for (const section of ['executive', 'diagnosis', 'actions'] as ReportSection[]) {
      await generate(section)
    }
  }, [generate])

  const text = texts[activeTab] || ''
  const hasAnyContent = texts.executive || texts.diagnosis || texts.actions

  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['executive', 'diagnosis', 'actions'] as ReportSection[]).map(section => {
          const active = activeTab === section
          const hasText = !!texts[section]
          return (
            <button
              key={section}
              type="button"
              onClick={() => { setActiveTab(section); setEditing(null) }}
              style={{
                flex: 1, padding: '10px 12px', fontSize: '12px',
                fontWeight: active ? 500 : 400, fontFamily: 'var(--font)',
                color: active ? 'var(--green)' : hasText ? 'var(--gray-700)' : 'var(--gray-500)',
                background: active ? 'var(--green-pale)' : 'transparent',
                border: 'none', borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {SECTION_LABELS[section]}
              {hasText && <span style={{ marginLeft: '4px', fontSize: '9px', color: 'var(--green)' }}>●</span>}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        {generating === activeTab ? (
          <div style={{ minHeight: '120px' }}>
            <div style={{ fontSize: '11px', color: 'var(--green)', marginBottom: '8px', fontWeight: 500 }}>
              Generating {SECTION_LABELS[activeTab]}…
            </div>
            <div style={{ fontSize: '13px', color: 'var(--gray-700)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {text}
              <span style={{ animation: 'blink 1s infinite' }}>▊</span>
            </div>
          </div>
        ) : text ? (
          editing === activeTab ? (
            <textarea
              value={text}
              onChange={e => setTexts(prev => ({ ...prev, [activeTab]: e.target.value }))}
              style={{
                width: '100%', minHeight: '200px', padding: '10px 12px',
                border: '1px solid var(--green-mid)', borderRadius: '8px',
                fontSize: '13px', fontFamily: 'var(--font)', color: 'var(--gray-900)',
                lineHeight: 1.7, resize: 'vertical', outline: 'none',
              }}
            />
          ) : (
            <div
              style={{ fontSize: '13px', color: 'var(--gray-700)', lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: '80px' }}
            >
              {text}
            </div>
          )
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--gray-500)', fontSize: '13px' }}>
            No content yet. Click &quot;Generate&quot; to create this section with AI.
          </div>
        )}

        {/* Error feedback */}
        {genError && (
          <div style={{
            background: 'var(--error-bg)', border: '1px solid var(--error-border)',
            borderRadius: '6px', padding: '8px 12px', marginTop: '8px',
            fontSize: '12px', color: 'var(--red)',
          }}>
            {genError}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
          {text && editing !== activeTab && (
            <button
              type="button"
              onClick={() => setEditing(activeTab)}
              style={{
                padding: '6px 14px', border: '1px solid var(--gray-300)', borderRadius: '6px',
                fontSize: '11px', color: 'var(--gray-500)', background: 'var(--white)',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Edit
            </button>
          )}
          {editing === activeTab && (
            <button
              type="button"
              onClick={async () => {
                await saveSection(activeTab, texts[activeTab] || '')
                setEditing(null)
              }}
              disabled={saving}
              style={{
                padding: '6px 14px', border: '1px solid var(--green-mid)', borderRadius: '6px',
                fontSize: '11px', color: 'var(--green)', background: 'var(--green-light)',
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
              }}
            >
              {saving ? 'Saving…' : 'Save & done'}
            </button>
          )}
          <button
            type="button"
            onClick={() => generate(activeTab)}
            disabled={generating !== null}
            style={{
              padding: '6px 14px', border: 'none', borderRadius: '6px',
              fontSize: '11px', color: 'white', background: generating ? 'var(--gray-300)' : 'var(--green)',
              cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
            }}
          >
            {generating ? 'Generating…' : text ? 'Regenerate' : 'Generate'}
          </button>
          {!hasAnyContent && (
            <button
              type="button"
              onClick={generateAll}
              disabled={generating !== null}
              style={{
                padding: '6px 14px', border: 'none', borderRadius: '6px',
                fontSize: '11px', color: 'white', background: generating ? 'var(--gray-300)' : 'var(--green)',
                cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', fontWeight: 500,
              }}
            >
              Generate all sections
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
