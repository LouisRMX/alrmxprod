'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AssessmentShell from '@/components/assessment/AssessmentShell'
import type { AssessmentMode } from '@/components/assessment/ModeTabs'
import type { Phase } from '@/lib/questions'
import type { Answers, CalcScores } from '@/lib/calculations'
import { useIsMobile } from '@/hooks/useIsMobile'

interface Assessment {
  id: string
  plant_id: string
  phase: string
  plant: { name: string; country: string; customer_id?: string; customer?: { name: string } }
  analyst: { full_name: string }
  date: string
  season: string
  answers: Record<string, unknown>
  scores: Record<string, unknown>
  overall: number | null
  bottleneck: string | null
  ebitda_monthly: number | null
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  report_released?: boolean
  focus_actions?: string[] | null
  validated_diagnosis?: Record<string, unknown> | null
}

export default function AssessmentTool({
  assessment,
  userId,
  isAdmin = false,
  userRole = null,
  baselineAssessment = null,
}: {
  assessment: Assessment
  userId: string
  isAdmin?: boolean
  userRole?: 'owner' | 'manager' | 'operator' | null
  baselineAssessment?: { id: string; date: string; answers: Record<string, unknown> } | null
}) {
  const supabase = createClient()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [reportReleased, setReportReleased] = useState(assessment.report_released ?? false)
  const [releasing, setReleasing] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [phase, setPhase] = useState(assessment.phase || 'workshop')
  const [requestedMode, setRequestedMode] = useState<AssessmentMode | undefined>()

  // Pre-select mode tab from URL query param, e.g. ?mode=fieldlog
  useEffect(() => {
    if (typeof window === 'undefined') return
    const param = new URLSearchParams(window.location.search).get('mode')
    const valid: AssessmentMode[] = ['questions', 'report', 'decision', 'simulator', 'track', 'gps', 'fieldlog', 'submit']
    if (param && (valid as string[]).includes(param)) {
      setRequestedMode(param as AssessmentMode)
    }
  }, [])
  const savingRef = useRef(false)
  const pendingSaveRef = useRef<Parameters<typeof handleSave>[0] | null>(null)
  const isMobile = useIsMobile()

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

      // Notify admin when customer submits pre-assessment
      if (newPhase === 'workshop_complete') {
        try {
          await fetch('/api/webhook/assessment-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assessmentId: assessment.id,
              plantName: assessment.plant?.name || 'Unknown plant',
              country: assessment.plant?.country || '',
            }),
          })
        } catch {
          // Non-fatal, don't block the UI
        }
      }

      router.refresh()
    }
  }

  async function deleteAssessment() {
    setDeleting(true)
    await supabase.from('assessments').delete().eq('id', assessment.id)
    router.push('/dashboard/customers')
  }

  async function toggleReportRelease() {
    setReleasing(true)
    const resp = await fetch('/api/admin/release-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId: assessment.id, released: !reportReleased }),
    })
    if (resp.ok) {
      setReportReleased(!reportReleased)
    }
    setReleasing(false)
  }

  const handleSave = useCallback(async (data: {
    answers: Answers
    scores: CalcScores
    overall: number | null
    bottleneck: string | null
    ebitdaMonthly: number
    hiddenRevMonthly: number
    benchmark?: {
      radius: number
      trucks: number
      turnaroundMin: number
      dispatchMin: number | null
      rejectPct: number
      delDay: number
      utilPct: number
      truckUtilAnnual: number | null
      m3PerDriverHour: number | null
      avgLoadM3: number | null
    }
    validatedDiagnosis?: Record<string, unknown> | null
  }) => {
    // Queue if already saving, latest data will be saved when current save completes
    if (savingRef.current) {
      pendingSaveRef.current = data
      return
    }

    savingRef.current = true
    setSaving(true)
    setSaveError(false)

    const { error } = await supabase.from('assessments').update({
      answers: data.answers,
      scores: data.scores,
      overall: data.overall,
      bottleneck: data.bottleneck,
      ebitda_monthly: data.ebitdaMonthly,
      validated_diagnosis: data.validatedDiagnosis ?? null,
      diagnosis_generated_at: data.validatedDiagnosis ? new Date().toISOString() : null,
      diagnosis_schema_version: data.validatedDiagnosis ? 1 : null,
      hidden_rev_monthly: data.hiddenRevMonthly,
    }).eq('id', assessment.id)

    if (error) {
      console.error('Assessment save error:', error)
      setSaveError(true)
      // Show error briefly, no auto-retry to avoid infinite loops
      setTimeout(() => setSaveError(false), 4000)
    } else {
      setLastSaved(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))

      // Write anonymized benchmark data when we have a valid score
      if (data.overall !== null && data.benchmark) {
        const b = data.benchmark
        const rb = b.radius < 10 ? 'short' : b.radius <= 20 ? 'medium' : 'long'
        const fb = b.trucks <= 5 ? 'small' : b.trucks <= 15 ? 'medium' : 'large'
        // Fire-and-forget, non-fatal if this fails
        supabase.from('plant_benchmarks').upsert({
          assessment_id:            assessment.id,
          radius_bucket:            rb,
          fleet_bucket:             fb,
          country:                  assessment.plant?.country ?? null,
          turnaround_min:           b.turnaroundMin,
          dispatch_min:             b.dispatchMin,
          reject_pct:               b.rejectPct,
          deliveries_per_truck_day: b.delDay,
          util_pct:                 b.utilPct,
          overall_score:            data.overall,
          bottleneck:               data.bottleneck ?? null,
          truck_util_annual:        b.truckUtilAnnual ?? null,
          m3_per_driver_hour:       b.m3PerDriverHour ?? null,
          avg_load_m3:              b.avgLoadM3 ?? null,
        }, { onConflict: 'assessment_id' }).then(({ error: bErr }) => {
          if (bErr) console.warn('[benchmark] upsert failed:', bErr.message)
        })
      }
    }

    savingRef.current = false
    setSaving(false)

    // Process queued save with latest data
    if (pendingSaveRef.current) {
      const pending = pendingSaveRef.current
      pendingSaveRef.current = null
      handleSave(pending)
    }
  }, [assessment.id, supabase])

  const phaseLabel = phase === 'workshop' ? 'Phase 1: Pre-assessment'
    : phase === 'workshop_complete' ? 'Pre-assessment complete, awaiting on-site visit'
    : phase === 'onsite' ? 'Phase 2: On-site diagnostic'
    : phase === 'complete' ? 'Complete' : ''
  const phaseStyle = phase === 'workshop'
    ? { color: 'var(--phase-workshop)', bg: 'var(--phase-workshop-bg)', border: 'var(--info-border)' }
    : phase === 'workshop_complete'
    ? { color: 'var(--phase-complete)', bg: 'var(--phase-complete-bg)', border: 'var(--tooltip-border)' }
    : phase === 'onsite'
    ? { color: 'var(--phase-onsite)', bg: 'var(--phase-onsite-bg)', border: 'var(--warning-border)' }
    : { color: 'var(--phase-complete)', bg: 'var(--phase-complete-bg)', border: 'var(--tooltip-border)' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
      {/* Save status bar */}
      <div style={{
        background: 'var(--white)', borderBottom: '1px solid var(--border)',
        padding: isMobile ? '5px 12px' : '6px 16px',
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between', gap: isMobile ? '4px' : 0,
        fontSize: '11px', color: 'var(--gray-500)', fontFamily: 'var(--mono)',
      }}>
        {/* Row 1: plant name + phase badge */}
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--gray-700)', fontWeight: 500 }}>
            {assessment.plant?.name}{!isMobile && `, ${assessment.plant?.country}`}
          </span>
          {phaseLabel && (
            <span style={{
              padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
              background: phaseStyle.bg, color: phaseStyle.color, border: `1px solid ${phaseStyle.border}`
            }}>
              {phaseLabel}
            </span>
          )}
        </span>
        {/* Row 2 (mobile) / right side (desktop): save state + admin actions */}
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Admin buttons, hidden on mobile to keep bar clean */}
          {isAdmin && !isMobile && (
            <>
              <button
                onClick={toggleReportRelease}
                disabled={releasing}
                style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                  border: '1px solid', cursor: 'pointer', fontFamily: 'var(--mono)',
                  background: reportReleased ? 'var(--phase-complete-bg)' : 'var(--error-bg)',
                  color: reportReleased ? 'var(--phase-complete)' : 'var(--red)',
                  borderColor: reportReleased ? 'var(--tooltip-border)' : 'var(--error-border)',
                }}
              >
                {releasing ? '…' : reportReleased ? 'Report released' : 'Report draft, not visible to customer'}
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                  border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--mono)',
                  background: 'var(--white)', color: 'var(--gray-400)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--error-border)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--gray-400)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                Delete
              </button>
            </>
          )}
          {saveError ? (
            <span style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '13px' }}>⚠</span> Save failed, please try again
            </span>
          ) : saving ? (
            <span style={{ color: 'var(--phase-onsite)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '13px', animation: 'pulse 1s infinite' }}>●</span> Saving…
            </span>
          ) : lastSaved ? (
            <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '4px', transition: 'opacity .3s' }}>
              <span style={{ fontSize: '13px' }}>✓</span> Saved {lastSaved}
            </span>
          ) : (
            <span style={{ color: 'var(--gray-300)' }}>Auto-saves</span>
          )}
        </span>
      </div>

      {/* Admin: Start on-site diagnostic button when pre-assessment is complete */}
      {isAdmin && phase === 'workshop_complete' && (
        <div style={{
          padding: '12px 16px', background: 'var(--info-bg)', borderBottom: '1px solid var(--info-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--phase-workshop)', fontWeight: 500 }}>
              Pre-assessment completed by customer.
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '2px' }}>
              Set up 90-day tracking now so the customer starts logging baseline data before the on-site visit.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => setRequestedMode('track')}
              style={{
                padding: '8px 16px', background: 'var(--white)', color: 'var(--phase-workshop)',
                border: '1px solid var(--info-border)', borderRadius: '8px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Set up tracking →
            </button>
            <button
              onClick={() => transitionPhase('onsite')}
              style={{
                padding: '8px 20px', background: 'var(--green)', color: 'white', border: 'none',
                borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
            >
              Start on-site diagnostic
            </button>
          </div>
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

      {/* Native React assessment tool, replaces iframe */}
      {!((!isAdmin) && phase === 'workshop_complete') && (
        <AssessmentShell
          initialAnswers={(assessment.answers || {}) as Answers}
          phase={assessmentPhase}
          season={assessment.season}
          country={assessment.plant?.country}
          plant={assessment.plant?.name}
          date={assessment.date}
          assessmentId={assessment.id}
          customerId={assessment.plant?.customer_id ?? ''}
          report={assessment.report}
          reportReleased={reportReleased}
          isAdmin={isAdmin}
          userRole={userRole}
          onSave={handleSave}
          requestMode={requestedMode}
          focusActions={assessment.focus_actions}
          baselineData={baselineAssessment ? { answers: baselineAssessment.answers as Answers, date: baselineAssessment.date } : undefined}
          savedDiagnosis={assessment.validated_diagnosis}
          plantId={assessment.plant_id}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: '12px', padding: '28px 32px',
            maxWidth: '420px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,.2)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '10px' }}>
              Delete assessment?
            </div>
            <div style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: '24px' }}>
              This will permanently delete the assessment for <strong>{assessment.plant?.name}</strong> including all answers, scores and the generated report. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  padding: '8px 18px', background: 'var(--white)', color: 'var(--gray-700)',
                  border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={deleteAssessment}
                disabled={deleting}
                style={{
                  padding: '8px 18px', background: 'var(--red)', color: '#fff',
                  border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
