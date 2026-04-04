'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/hooks/useIsMobile'

interface TrackingEntry {
  id: string
  week_number: number
  turnaround_min: number | null
  dispatch_min: number | null
  reject_pct: number | null
  notes: string | null
  created_at: string
}

interface TrackingConfig {
  id: string
  baseline_turnaround: number | null
  target_turnaround: number | null
  baseline_dispatch_min: number | null
  target_dispatch_min: number | null
  track_turnaround: boolean
  track_dispatch: boolean
  coeff_turnaround: number
  started_at: string
}

export interface AssessmentInfo {
  id: string
  phase: string
  plant?: { name: string; country: string }
}

interface Props {
  assessmentId: string | null
  assessment: AssessmentInfo | null
  userId: string
}

function getWeekNumber(startedAt: string): number {
  const start = new Date(startedAt)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  return Math.min(13, Math.max(1, Math.ceil(diffMs / (7 * 86400000))))
}

export default function OperatorTrackView({ assessmentId, assessment, userId }: Props) {
  const supabase = createClient()
  const isMobile = useIsMobile()

  const [config, setConfig] = useState<TrackingConfig | null>(null)
  const [entries, setEntries] = useState<TrackingEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [tMin, setTMin] = useState('')
  const [dMin, setDMin] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')

  useEffect(() => {
    if (!assessmentId) { setLoading(false); return }
    async function load() {
      const [{ data: cfg }, { data: ents }] = await Promise.all([
        supabase.from('tracking_configs').select('*').eq('assessment_id', assessmentId).single(),
        supabase.from('tracking_entries').select('*').eq('assessment_id', assessmentId).order('week_number'),
      ])
      setConfig(cfg ?? null)
      setEntries(ents ?? [])
      setLoading(false)
    }
    load()
  }, [assessmentId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!config || !assessmentId) return
    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')

    const currentWeek = getWeekNumber(config.started_at)

    // Check if week already logged
    const alreadyLogged = entries.some(e => e.week_number === currentWeek)
    if (alreadyLogged) {
      setSubmitError(`Week ${currentWeek} is already logged.`)
      setSubmitting(false)
      return
    }

    const entry = {
      assessment_id: assessmentId,
      week_number: currentWeek,
      turnaround_min: tMin ? Number(tMin) : null,
      dispatch_min: dMin ? Number(dMin) : null,
      reject_pct: null,
      notes: notes || null,
      logged_by: userId,
    }

    const { data, error } = await supabase.from('tracking_entries').insert(entry).select().single()
    if (error || !data) {
      setSubmitError('Failed to save — please try again.')
      setSubmitting(false)
      return
    }

    setEntries(prev => [...prev, data as TrackingEntry])
    setTMin('')
    setDMin('')
    setNotes('')
    setSubmitSuccess(`Week ${currentWeek} logged ✓`)
    setTimeout(() => setSubmitSuccess(''), 4000)
    setSubmitting(false)
  }

  const inp: React.CSSProperties = {
    padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px',
    fontSize: '14px', fontFamily: 'var(--font)', background: 'var(--white)',
    color: 'var(--gray-900)', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
        Loading…
      </div>
    )
  }

  if (!assessmentId || !assessment) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>📋</div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '8px' }}>
          No assessment assigned yet
        </div>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
          Your manager will assign you to a plant assessment shortly.
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>📊</div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '8px' }}>
          Tracking not started yet
        </div>
        <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
          Your manager will activate 90-day tracking after the initial assessment.
        </div>
      </div>
    )
  }

  const currentWeek = getWeekNumber(config.started_at)
  const thisWeekLogged = entries.some(e => e.week_number === currentWeek)
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--gray-50)' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: isMobile ? '16px' : '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
            {assessment.plant?.name}
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
            Weekly Tracking
          </h1>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '4px' }}>
            Week {currentWeek} of 13 · {thisWeekLogged ? '✓ This week logged' : 'Not yet logged'}
          </div>
        </div>

        {/* Week progress */}
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '16px', marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Progress</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)' }}>
              {entries.length} / 13 weeks logged
            </span>
          </div>
          <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '3px' }}>
            <div style={{
              height: '100%', borderRadius: '3px', background: 'var(--green)',
              width: `${Math.round((entries.length / 13) * 100)}%`,
              transition: 'width .3s',
            }} />
          </div>
        </div>

        {/* Baseline reference */}
        <div style={{
          background: 'var(--info-bg)', border: '1px solid var(--info-border)',
          borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--phase-workshop)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.4px' }}>
            Your targets
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {config.track_turnaround && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Turnaround</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-800)' }}>
                  {config.baseline_turnaround} → <span style={{ color: 'var(--green)' }}>{config.target_turnaround} min</span>
                </div>
              </div>
            )}
            {config.track_dispatch && config.baseline_dispatch_min != null && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Dispatch Time</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-800)' }}>
                  {config.baseline_dispatch_min} → <span style={{ color: 'var(--green)' }}>{config.target_dispatch_min ?? 15} min</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Log form */}
        {!thisWeekLogged ? (
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '20px', marginBottom: '20px',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '16px' }}>
              Log Week {currentWeek}
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                {config.track_turnaround && (
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                      Avg turnaround time (min)
                    </label>
                    <input
                      style={inp}
                      type="number"
                      min="30" max="240"
                      value={tMin}
                      onChange={e => setTMin(e.target.value)}
                      placeholder={String(config.baseline_turnaround ?? 95)}
                    />
                  </div>
                )}
                {config.track_dispatch && config.baseline_dispatch_min != null && (
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                      Avg dispatch time (min)
                    </label>
                    <input
                      style={inp}
                      type="number"
                      min="5" max="120"
                      value={dMin}
                      onChange={e => setDMin(e.target.value)}
                      placeholder={String(config.baseline_dispatch_min)}
                    />
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gray-700)', display: 'block', marginBottom: '5px' }}>
                  Notes (optional)
                </label>
                <input
                  style={inp}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any notable events this week?"
                />
              </div>
              {submitError && (
                <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '6px', padding: '8px 12px', marginBottom: '10px', fontSize: '12px', color: 'var(--red)' }}>
                  {submitError}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || (!tMin && !dMin)}
                style={{
                  width: '100%', padding: '12px', background: 'var(--green)', color: '#fff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                  cursor: submitting ? 'wait' : 'pointer', fontFamily: 'var(--font)',
                  opacity: submitting || (!tMin && !dMin) ? 0.6 : 1,
                }}
              >
                {submitting ? 'Saving…' : `Submit week ${currentWeek}`}
              </button>
            </form>
          </div>
        ) : (
          <div style={{
            background: '#F0FBF5', border: '1px solid #A8E6C3',
            borderRadius: '10px', padding: '16px 20px', marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '12px',
          }}>
            <span style={{ fontSize: '24px' }}>✓</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1A7A45' }}>Week {currentWeek} logged</div>
              <div style={{ fontSize: '12px', color: '#2E9E5C', marginTop: '2px' }}>Come back next week to log week {currentWeek + 1}</div>
            </div>
          </div>
        )}

        {submitSuccess && (
          <div style={{ background: '#F0FBF5', border: '1px solid #A8E6C3', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#1A7A45', fontWeight: 500 }}>
            {submitSuccess}
          </div>
        )}

        {/* Previous entries */}
        {sortedEntries.length > 0 && (
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '10px', overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)' }}>
              Previous entries
            </div>
            {sortedEntries.map((entry, i) => (
              <div
                key={entry.id}
                style={{
                  padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                  borderBottom: i < sortedEntries.length - 1 ? '1px solid var(--gray-100)' : 'none',
                  fontSize: '13px',
                }}
              >
                <span style={{ fontWeight: 500, color: 'var(--gray-700)' }}>Week {entry.week_number}</span>
                <div style={{ display: 'flex', gap: '16px', color: 'var(--gray-500)' }}>
                  {entry.turnaround_min != null && (
                    <span>TA: <strong style={{ color: 'var(--gray-800)' }}>{entry.turnaround_min} min</strong></span>
                  )}
                  {entry.dispatch_min != null && (
                    <span>DT: <strong style={{ color: 'var(--gray-800)' }}>{entry.dispatch_min} min</strong></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
