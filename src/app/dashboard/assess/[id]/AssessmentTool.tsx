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
  userId,
  isAdmin = false
}: {
  assessment: Assessment
  userId: string
  isAdmin?: boolean
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
        if (isAdmin) {
          await transitionPhase('onsite')
        } else {
          // Customer completed pre-assessment — mark as ready for review
          await supabase.from('assessments').update({
            phase: 'workshop_complete'
          }).eq('id', assessment.id)
          setPhase('workshop_complete')
          router.refresh()
        }
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

    // Save previous version before overwriting
    const { data: existing } = await supabase
      .from('reports')
      .select('id, executive, diagnosis, actions')
      .eq('assessment_id', assessment.id)
      .single()

    if (existing && (existing.executive || existing.diagnosis || existing.actions)) {
      await supabase.from('report_versions').insert({
        report_id: existing.id,
        executive: existing.executive,
        diagnosis: existing.diagnosis,
        actions: existing.actions,
      })
    }

    // Save new report
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

  const phaseLabel = phase === 'workshop' ? 'Phase 1: Pre-assessment' : phase === 'workshop_complete' ? 'Pre-assessment complete — awaiting on-site visit' : phase === 'onsite' ? 'Phase 2: On-site diagnostic' : phase === 'complete' ? 'Complete' : ''
  const phaseColor = phase === 'workshop' ? '#2471A3' : phase === 'workshop_complete' ? '#27ae60' : phase === 'onsite' ? '#B7950B' : '#27ae60'

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

      {/* Admin: Start on-site diagnostic button when pre-assessment is complete */}
      {isAdmin && phase === 'workshop_complete' && (
        <div style={{
          padding: '12px 16px', background: '#EBF5FB', borderBottom: '1px solid #AED6F1',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '13px', color: '#2471A3' }}>
            ✅ Pre-assessment completed by customer. Ready for on-site diagnostic.
          </span>
          <button
            onClick={() => transitionPhase('onsite')}
            style={{
              padding: '8px 20px', background: '#0F6E56', color: 'white', border: 'none',
              borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              fontFamily: 'var(--font)'
            }}
          >
            Start on-site diagnostic →
          </button>
        </div>
      )}

      {/* Customer: Thank you message when pre-assessment is complete */}
      {!isAdmin && phase === 'workshop_complete' && (
        <div style={{
          padding: '60px 16px', textAlign: 'center', flex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
            Pre-assessment complete
          </h2>
          <p style={{ fontSize: '15px', color: '#4b5563', maxWidth: '520px', lineHeight: '1.7', marginBottom: '24px' }}>
            Thank you for submitting your plant data.
          </p>
          <div style={{
            maxWidth: '520px', textAlign: 'left', background: '#F9FAFB', border: '1px solid #E5E7EB',
            borderRadius: '12px', padding: '24px 28px', lineHeight: '1.7', fontSize: '14px', color: '#374151'
          }}>
            <p style={{ marginBottom: '16px' }}>
              Your responses are now being reviewed by our team. Based on the information provided, we will
              prepare a <strong>preliminary diagnostic summary</strong> including:
            </p>
            <ul style={{ margin: '0 0 16px 20px', padding: 0 }}>
              <li style={{ marginBottom: '6px' }}>Operational performance scores across four key areas</li>
              <li style={{ marginBottom: '6px' }}>An estimate of hidden capacity and unrealised revenue</li>
              <li style={{ marginBottom: '6px' }}>Identification of your plant&apos;s primary operational constraint</li>
            </ul>
            <p style={{ marginBottom: '16px' }}>
              This summary will be presented to you in a <strong>dedicated review session</strong> before
              the on-site visit, giving you an early view of where the biggest improvement opportunities lie.
            </p>
            <p style={{
              marginBottom: 0, paddingTop: '12px', borderTop: '1px solid #E5E7EB',
              fontSize: '13px', color: '#6B7280', fontWeight: '500'
            }}>
              <strong style={{ color: '#374151' }}>Next steps:</strong> We will be in touch to schedule the diagnostic review.
            </p>
          </div>
        </div>
      )}

      {/* The assessment tool in an iframe — hide when customer completed workshop */}
      {!((!isAdmin) && phase === 'workshop_complete') && (
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
      )}
    </div>
  )
}
