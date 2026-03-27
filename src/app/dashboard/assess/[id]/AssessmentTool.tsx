'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Assessment {
  id: string
  phase: string
  plant: { name: string; country: string; customer?: { name: string } }
  analyst: { full_name: string }
  date: string
  season: string
  answers: Record<string, unknown>
  scores: Record<string, unknown>
  overall: number | null
  bottleneck: string | null
  ebitda_monthly: number | null
  report: { executive?: string; diagnosis?: string; actions?: string } | null
}

export default function AssessmentTool({
  assessment,
  userId
}: {
  assessment: Assessment
  userId: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [phase, setPhase] = useState(assessment.phase || 'workshop')

  // Listen for messages from the iframe (assessment tool)
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'ALRMX_SAVE') {
        await saveAssessment(event.data.payload)
      }
      if (event.data?.type === 'ALRMX_GENERATE_REPORT') {
        await generateReport(event.data.payload)
      }
      if (event.data?.type === 'ALRMX_SAVE_REPORT') {
        await saveReport(event.data.payload)
      }
      if (event.data?.type === 'ALRMX_WORKSHOP_COMPLETE') {
        await transitionPhase('onsite')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Pass initial data to iframe once loaded
  function handleIframeLoad() {
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: 'ALRMX_INIT',
      payload: {
        assessmentId: assessment.id,
        phase,
        plant: assessment.plant?.name,
        country: assessment.plant?.country,
        company: assessment.plant?.customer?.name,
        analyst: assessment.analyst?.full_name,
        date: assessment.date,
        season: assessment.season,
        answers: assessment.answers || {},
        report: assessment.report || {},
      }
    }, '*')
  }

  async function transitionPhase(newPhase: string) {
    const { error } = await supabase.from('assessments').update({
      phase: newPhase
    }).eq('id', assessment.id)

    if (!error) {
      setPhase(newPhase)
      // Reload iframe with new phase
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: 'ALRMX_INIT',
          payload: {
            assessmentId: assessment.id,
            phase: newPhase,
            plant: assessment.plant?.name,
            country: assessment.plant?.country,
            company: assessment.plant?.customer?.name,
            analyst: assessment.analyst?.full_name,
            date: assessment.date,
            season: assessment.season,
            answers: assessment.answers || {},
            report: assessment.report || {},
          }
        }, '*')
      }
      router.refresh()
    }
  }

  async function saveAssessment(data: Record<string, unknown>) {
    setSaving(true)
    const { error } = await supabase.from('assessments').update({
      answers: data.answers,
      scores: data.scores,
      overall: data.overall,
      bottleneck: data.bottleneck,
      ebitda_monthly: data.ebitdaMonthly,
      hidden_rev_monthly: data.hiddenRevMonthly,
    }).eq('id', assessment.id)

    if (error) {
      console.error('Assessment save error:', error)
    }

    setLastSaved(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    setSaving(false)
  }

  async function saveReport(data: { report: Record<string, string> }) {
    const report = data.report || {}
    const { error } = await supabase.from('reports').upsert({
      assessment_id: assessment.id,
      executive: report.executive || null,
      diagnosis: report.diagnosis || null,
      actions: report.actions || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'assessment_id' })

    if (error) {
      console.error('Report save error:', error)
    }
  }

  async function generateReport(context: Record<string, unknown>) {
    for (const type of ['executive', 'diagnosis', 'actions']) {
      try {
        await fetch('/api/generate-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assessmentId: assessment.id,
            type,
            context: { ...context, assessmentId: assessment.id }
          })
        })
      } catch (e) {
        console.error('Report generation error:', e)
      }
    }

    iframeRef.current?.contentWindow?.postMessage({ type: 'ALRMX_REPORT_READY' }, '*')
    router.refresh()
  }

  const phaseLabel = phase === 'workshop' ? 'Phase 1: Workshop' : phase === 'onsite' ? 'Phase 2: On-site' : phase === 'complete' ? 'Complete' : ''
  const phaseColor = phase === 'workshop' ? '#2471A3' : phase === 'onsite' ? '#B7950B' : '#27ae60'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Save status bar */}
      <div style={{
        background: 'var(--white)', borderBottom: '1px solid var(--border)',
        padding: '6px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: '11px', color: 'var(--gray-500)',
        fontFamily: 'var(--mono)'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {assessment.plant?.name} — {assessment.plant?.country}
          {phaseLabel && (
            <span style={{
              padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
              background: phaseColor + '15', color: phaseColor, border: `1px solid ${phaseColor}30`
            }}>
              {phaseLabel}
            </span>
          )}
        </span>
        <span>
          {saving ? 'Saving…' : lastSaved ? `Saved ${lastSaved}` : 'Auto-saves to database'}
        </span>
      </div>

      {/* The assessment tool in an iframe */}
      <iframe
        ref={iframeRef}
        src="/assessment-tool.html"
        onLoad={handleIframeLoad}
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
          height: 'calc(100vh - 120px)',
        }}
        title="Assessment Tool"
      />
    </div>
  )
}
