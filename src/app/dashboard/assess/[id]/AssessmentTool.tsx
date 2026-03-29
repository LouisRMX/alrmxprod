'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AssessmentShell from '@/components/assessment/AssessmentShell'
import type { Phase } from '@/lib/questions'
import type { Answers, CalcScores } from '@/lib/calculations'

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
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [phase, setPhase] = useState(assessment.phase || 'workshop')

  const assessmentPhase: Phase = phase === 'workshop' ? 'workshop'
    : phase === 'onsite' ? 'onsite'
    : phase === 'complete' ? 'complete'
    : 'full'

  async function transitionPhase(newPhase: string) {
    const { error } = await supabase.from('assessments').update({
      phase: newPhase
    }).eq('id', assessment.id)

    if (!error) {
      setPhase(newPhase)
      router.refresh()
    }
  }

  const handleSave = useCallback(async (data: {
    answers: Answers
    scores: CalcScores
    overall: number | null
    bottleneck: string | null
    ebitdaMonthly: number
    hiddenRevMonthly: number
  }) => {
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
  }, [assessment.id, supabase])

  const phaseLabel = phase === 'workshop' ? 'Phase 1: Pre-assessment'
    : phase === 'workshop_complete' ? 'Pre-assessment complete — awaiting on-site visit'
    : phase === 'onsite' ? 'Phase 2: On-site diagnostic'
    : phase === 'complete' ? 'Complete' : ''
  const phaseColor = phase === 'workshop' ? '#2471A3'
    : phase === 'workshop_complete' ? '#27ae60'
    : phase === 'onsite' ? '#B7950B' : '#27ae60'

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
            Pre-assessment completed by customer. Ready for on-site diagnostic.
          </span>
          <button
            onClick={() => transitionPhase('onsite')}
            style={{
              padding: '8px 20px', background: '#0F6E56', color: 'white', border: 'none',
              borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              fontFamily: 'var(--font)'
            }}
          >
            Start on-site diagnostic
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

      {/* Native React assessment tool — replaces iframe */}
      {!((!isAdmin) && phase === 'workshop_complete') && (
        <AssessmentShell
          initialAnswers={(assessment.answers || {}) as Answers}
          phase={assessmentPhase}
          season={assessment.season}
          country={assessment.plant?.country}
          plant={assessment.plant?.name}
          date={assessment.date}
          assessmentId={assessment.id}
          report={assessment.report}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
