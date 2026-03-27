'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Assessment {
  id: string
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

  // Listen for messages from the iframe (assessment tool)
  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'ALRMX_SAVE') {
        await saveAssessment(event.data.payload)
      }
      if (event.data?.type === 'ALRMX_GENERATE_REPORT') {
        await generateReport(event.data.payload)
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

    // Notify iframe that report is ready
    iframeRef.current?.contentWindow?.postMessage({ type: 'ALRMX_REPORT_READY' }, '*')
    router.refresh()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Save status bar */}
      <div style={{
        background: 'var(--white)', borderBottom: '1px solid var(--border)',
        padding: '6px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', fontSize: '11px', color: 'var(--gray-500)',
        fontFamily: 'var(--mono)'
      }}>
        <span>
          {assessment.plant?.name} — {assessment.plant?.country}
        </span>
        <span>
          {saving ? '⏳ Saving…' : lastSaved ? `✓ Saved ${lastSaved}` : 'Auto-saves to database'}
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
