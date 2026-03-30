'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────────────────

interface TrackingConfig {
  id: string
  assessment_id: string
  started_at: string
  baseline_turnaround: number | null
  baseline_reject_pct: number | null
  baseline_dispatch_min: number | null
  target_turnaround: number | null
  target_reject_pct: number | null
  target_dispatch_min: number | null
  track_turnaround: boolean
  track_reject: boolean
  track_dispatch: boolean
  coeff_turnaround: number
  coeff_reject: number
  baseline_monthly_loss: number | null
  consent_case_study: boolean
}

interface TrackingEntry {
  id: string
  config_id: string
  week_number: number
  logged_at: string
  turnaround_min: number | null
  reject_pct: number | null
  dispatch_min: number | null
  notes: string | null
}

export interface TrackingProps {
  assessmentId: string
  isAdmin: boolean
  baselineTurnaround: number | null
  baselineRejectPct: number | null
  baselineDispatchMin: number | null
  coeffTurnaround: number
  coeffReject: number
  baselineMonthlyLoss: number
  targetTA: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k'
  return '$' + Math.round(n)
}

function getWeekNumber(startedAt: string): number {
  const start = new Date(startedAt)
  const today = new Date()
  const days = Math.floor((today.getTime() - start.getTime()) / 86_400_000)
  return Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
}

function calcRecovery(entry: TrackingEntry, cfg: TrackingConfig): number {
  let r = 0
  if (cfg.track_turnaround && entry.turnaround_min != null && cfg.baseline_turnaround != null) {
    r += Math.max(0, cfg.baseline_turnaround - entry.turnaround_min) * cfg.coeff_turnaround
  }
  if (cfg.track_reject && entry.reject_pct != null && cfg.baseline_reject_pct != null) {
    r += Math.max(0, cfg.baseline_reject_pct - entry.reject_pct) * cfg.coeff_reject
  }
  return Math.round(r)
}

function progressPct(baseline: number | null, latest: number | null, target: number | null): number {
  if (baseline == null || latest == null || target == null) return 0
  if (baseline <= target) return 100
  return Math.min(100, Math.max(0, Math.round((baseline - latest) / (baseline - target) * 100)))
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ProgressBar({ pct, color = 'var(--green)' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width .3s' }} />
    </div>
  )
}

function StatusBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'var(--phase-complete)' : pct >= 40 ? 'var(--warning)' : 'var(--gray-400)'
  const bg = pct >= 80 ? 'var(--phase-complete-bg)' : pct >= 40 ? 'var(--warning-bg, #fef9c3)' : 'var(--gray-50)'
  return (
    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: bg, color }}>
      {pct >= 80 ? 'On track' : pct >= 40 ? 'Improving' : 'Early'}
    </span>
  )
}

// ── Setup Form (Louis, no config yet) ─────────────────────────────────────

function SetupForm({
  assessmentId, baselineTurnaround, baselineRejectPct, baselineDispatchMin,
  coeffTurnaround, coeffReject, baselineMonthlyLoss, targetTA, onCreated,
}: TrackingProps & { onCreated: (cfg: TrackingConfig) => void }) {
  const supabase = createClient()
  const [ta, setTa] = useState(String(targetTA))
  const [rj, setRj] = useState('1.5')
  const [di, setDi] = useState('15')
  const [trackDispatch, setTrackDispatch] = useState(baselineDispatchMin != null)
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)

  const predictedRecovery = Math.round(
    (baselineTurnaround != null && +ta > 0 ? Math.max(0, baselineTurnaround - +ta) * coeffTurnaround : 0) +
    (baselineRejectPct != null && +rj >= 0 ? Math.max(0, baselineRejectPct - +rj) * coeffReject : 0)
  )

  async function handleStart() {
    setSaving(true)
    const { data, error } = await supabase.from('tracking_configs').insert({
      assessment_id: assessmentId,
      baseline_turnaround: baselineTurnaround,
      baseline_reject_pct: baselineRejectPct,
      baseline_dispatch_min: baselineDispatchMin,
      target_turnaround: +ta || null,
      target_reject_pct: +rj || null,
      target_dispatch_min: trackDispatch ? (+di || null) : null,
      track_turnaround: true,
      track_reject: true,
      track_dispatch: trackDispatch,
      coeff_turnaround: coeffTurnaround,
      coeff_reject: coeffReject,
      baseline_monthly_loss: baselineMonthlyLoss,
      consent_case_study: consent,
    }).select().single()
    setSaving(false)
    if (!error && data) onCreated(data as TrackingConfig)
  }

  const row = (label: string, baseline: number | null, unit: string, val: string, setVal: (v: string) => void, note?: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 120px 1fr', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '13px', color: 'var(--gray-700)' }}>{label}</div>
      <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
        {baseline != null ? `${baseline} ${unit}` : '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          style={{
            width: '80px', padding: '6px 10px', border: '1px solid var(--border)',
            borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--mono)',
            background: 'var(--white)', color: 'var(--gray-900)',
          }}
        />
        <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{unit}</span>
        {note && <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 500 }}>{note}</span>}
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '4px' }}>
          Start 90-day tracking
        </div>
        <div style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Set targets for each metric. The client will log weekly numbers. You'll see actual vs predicted recovery in real time.
        </div>
      </div>

      {/* Metric targets */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0 20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 120px 1fr', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Metric</div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Baseline</div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px' }}>90-day target</div>
        </div>
        {row('Truck turnaround', baselineTurnaround, 'min', ta, setTa, 'GCC target')}
        {row('Rejection rate', baselineRejectPct, '%', rj, setRj, 'Best practice')}
        {baselineDispatchMin != null && (
          <div style={{ padding: '10px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--gray-600)' }}>
              <input type="checkbox" checked={trackDispatch} onChange={e => setTrackDispatch(e.target.checked)} />
              Also track dispatch time (baseline: {baselineDispatchMin} min)
              {trackDispatch && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                  → target:
                  <input
                    type="number"
                    value={di}
                    onChange={e => setDi(e.target.value)}
                    style={{ width: '60px', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '13px', fontFamily: 'var(--mono)' }}
                  />
                  min
                </span>
              )}
            </label>
          </div>
        )}
      </div>

      {/* Predicted recovery */}
      {predictedRecovery > 0 && (
        <div style={{ background: 'var(--phase-complete-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--gray-700)' }}>Predicted monthly recovery if targets hit</span>
          <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--phase-complete)' }}>{fmt(predictedRecovery)}/mo</span>
        </div>
      )}

      {/* Consent */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '24px', fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.5 }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: '2px', flexShrink: 0 }} />
        Client consents to anonymised before/after results being used as a case study
      </label>

      <button
        onClick={handleStart}
        disabled={saving}
        style={{
          width: '100%', padding: '12px', background: 'var(--green)', color: '#fff',
          border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Starting…' : 'Start 90-day tracking'}
      </button>
    </div>
  )
}

// ── Progress View (Louis, active tracking) ─────────────────────────────────

function ProgressView({ config, entries, onEntryLogged }: { config: TrackingConfig; entries: TrackingEntry[]; onEntryLogged: () => void }) {
  const supabase = createClient()
  const currentWeek = getWeekNumber(config.started_at)
  const pctComplete = Math.round(currentWeek / 13 * 100)
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0] || null

  const latestTA = latest?.turnaround_min ?? null
  const latestRj = latest?.reject_pct ?? null
  const latestDi = latest?.dispatch_min ?? null

  const estimatedRecovery = latest ? calcRecovery(latest, config) : 0
  const taProgress = progressPct(config.baseline_turnaround, latestTA, config.target_turnaround)
  const rjProgress = progressPct(config.baseline_reject_pct, latestRj, config.target_reject_pct)
  const overallProgress = Math.round((taProgress + rjProgress) / 2)

  // Admin quick-log for a specific week
  const [adminLogWeek, setAdminLogWeek] = useState<number | null>(null)
  const [adminTA, setAdminTA] = useState('')
  const [adminRj, setAdminRj] = useState('')
  const [adminDi, setAdminDi] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [adminSaving, setAdminSaving] = useState(false)

  async function handleAdminLog(weekNum: number) {
    setAdminSaving(true)
    const existing = entries.find(e => e.week_number === weekNum)
    if (existing) {
      await supabase.from('tracking_entries').update({
        turnaround_min: adminTA ? +adminTA : null,
        reject_pct: adminRj ? +adminRj : null,
        dispatch_min: adminDi ? +adminDi : null,
        notes: adminNotes || null,
      }).eq('id', existing.id)
    } else {
      await supabase.from('tracking_entries').insert({
        config_id: config.id,
        week_number: weekNum,
        turnaround_min: adminTA ? +adminTA : null,
        reject_pct: adminRj ? +adminRj : null,
        dispatch_min: adminDi ? +adminDi : null,
        notes: adminNotes || null,
      })
    }
    setAdminSaving(false)
    setAdminLogWeek(null)
    setAdminTA(''); setAdminRj(''); setAdminDi(''); setAdminNotes('')
    onEntryLogged()
  }

  function openAdminLog(weekNum: number) {
    const existing = entries.find(e => e.week_number === weekNum)
    setAdminTA(existing?.turnaround_min != null ? String(existing.turnaround_min) : '')
    setAdminRj(existing?.reject_pct != null ? String(existing.reject_pct) : '')
    setAdminDi(existing?.dispatch_min != null ? String(existing.dispatch_min) : '')
    setAdminNotes(existing?.notes ?? '')
    setAdminLogWeek(weekNum)
  }

  const canExport = config.consent_case_study && entries.length >= 8
  const weeksWithNoData = currentWeek > 2 && entries.filter(e => e.week_number <= currentWeek - 1).length < currentWeek - 2

  return (
    <div style={{ padding: '24px', maxWidth: '720px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '4px' }}>
            Week {currentWeek} of 13 · Started {new Date(config.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div style={{ width: '220px', marginBottom: '6px' }}>
            <ProgressBar pct={pctComplete} />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{pctComplete}% of 90 days complete</div>
        </div>
        {estimatedRecovery > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '2px' }}>Est. recovery this month</div>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--phase-complete)' }}>{fmt(estimatedRecovery)}</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>vs {fmt(config.baseline_monthly_loss ?? 0)} baseline</div>
          </div>
        )}
      </div>

      {/* Alert: no recent data */}
      {weeksWithNoData && (
        <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--red)' }}>
          ⚠ No data logged in the last 2+ weeks — follow up with the plant
        </div>
      )}

      {/* Metrics table */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 80px', gap: '0', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)', padding: '8px 16px' }}>
          {['Metric', 'Baseline', 'Target', 'Latest', 'Change', 'Progress'].map(h => (
            <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</div>
          ))}
        </div>
        {config.track_turnaround && config.baseline_turnaround != null && (
          <MetricRow
            label="Turnaround" unit="min"
            baseline={config.baseline_turnaround} target={config.target_turnaround}
            latest={latestTA} progress={taProgress}
            lowerIsBetter
          />
        )}
        {config.track_reject && config.baseline_reject_pct != null && (
          <MetricRow
            label="Reject rate" unit="%"
            baseline={config.baseline_reject_pct} target={config.target_reject_pct}
            latest={latestRj} progress={rjProgress}
            lowerIsBetter decimals={1}
          />
        )}
        {config.track_dispatch && config.baseline_dispatch_min != null && (
          <MetricRow
            label="Dispatch time" unit="min"
            baseline={config.baseline_dispatch_min} target={config.target_dispatch_min}
            latest={latestDi} progress={progressPct(config.baseline_dispatch_min, latestDi, config.target_dispatch_min)}
            lowerIsBetter
          />
        )}
      </div>

      {/* Overall progress */}
      {latest && (
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Overall progress toward targets</span>
          <div style={{ flex: 1 }}><ProgressBar pct={overallProgress} /></div>
          <StatusBadge pct={overallProgress} />
        </div>
      )}

      {/* Weekly log table */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-700)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Weekly log</span>
          <button
            onClick={() => openAdminLog(currentWeek)}
            style={{ fontSize: '11px', color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            + Log week {currentWeek}
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                {['Week', 'Date', 'Turnaround', 'Reject %', 'Dispatch', 'Notes', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: '10px', color: 'var(--gray-400)', fontWeight: 600, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.3px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: currentWeek }, (_, i) => i + 1).reverse().map(wk => {
                const entry = entries.find(e => e.week_number === wk)
                const recovery = entry ? calcRecovery(entry, config) : null
                return (
                  <tr key={wk} style={{ borderBottom: '1px solid var(--border)', opacity: entry ? 1 : 0.4 }}>
                    <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>W{wk}</td>
                    <td style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--gray-400)', fontFamily: 'var(--mono)' }}>
                      {entry ? new Date(entry.logged_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', fontFamily: 'var(--mono)', color: entry?.turnaround_min != null ? 'var(--gray-900)' : 'var(--gray-300)' }}>
                      {entry?.turnaround_min != null ? `${entry.turnaround_min} min` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', fontFamily: 'var(--mono)', color: entry?.reject_pct != null ? 'var(--gray-900)' : 'var(--gray-300)' }}>
                      {entry?.reject_pct != null ? `${entry.reject_pct}%` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', fontFamily: 'var(--mono)', color: entry?.dispatch_min != null ? 'var(--gray-900)' : 'var(--gray-300)' }}>
                      {entry?.dispatch_min != null ? `${entry.dispatch_min} min` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--gray-500)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry?.notes || ''}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {recovery != null && recovery > 0 && (
                          <span style={{ fontSize: '10px', color: 'var(--phase-complete)', fontFamily: 'var(--mono)', fontWeight: 600 }}>+{fmt(recovery)}</span>
                        )}
                        <button
                          onClick={() => openAdminLog(wk)}
                          style={{ fontSize: '11px', color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          {entry ? 'Edit' : 'Add'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Case study export */}
      {canExport ? (
        <CaseStudyCard config={config} entries={entries} />
      ) : (
        <div style={{ padding: '12px 16px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--gray-400)' }}>
          {!config.consent_case_study
            ? 'Case study export requires client consent (update in setup).'
            : `Case study export available after 8 weeks of data (${8 - entries.length} more week${entries.length === 7 ? '' : 's'} needed).`}
        </div>
      )}

      {/* Admin log modal */}
      {adminLogWeek !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: '12px', padding: '28px 32px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '20px', color: 'var(--gray-900)' }}>Log week {adminLogWeek}</div>
            <LogFields
              ta={adminTA} setTa={setAdminTA}
              rj={adminRj} setRj={setAdminRj}
              di={config.track_dispatch ? adminDi : null} setDi={setAdminDi}
              notes={adminNotes} setNotes={setAdminNotes}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button onClick={() => setAdminLogWeek(null)} style={{ padding: '8px 18px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
              <button
                onClick={() => handleAdminLog(adminLogWeek)}
                disabled={adminSaving}
                style={{ padding: '8px 18px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
              >
                {adminSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MetricRow ─────────────────────────────────────────────────────────────

function MetricRow({ label, unit, baseline, target, latest, progress, lowerIsBetter, decimals = 0 }: {
  label: string; unit: string; baseline: number; target: number | null; latest: number | null;
  progress: number; lowerIsBetter: boolean; decimals?: number
}) {
  const improved = latest != null && (lowerIsBetter ? latest < baseline : latest > baseline)
  const change = latest != null ? (lowerIsBetter ? baseline - latest : latest - baseline) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 80px', gap: '0', padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
      <div style={{ fontSize: '13px', color: 'var(--gray-700)' }}>{label}</div>
      <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>{baseline.toFixed(decimals)} {unit}</div>
      <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>{target != null ? `${target.toFixed(decimals)} ${unit}` : '—'}</div>
      <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 600, color: latest != null ? 'var(--gray-900)' : 'var(--gray-300)' }}>
        {latest != null ? `${latest.toFixed(decimals)} ${unit}` : '—'}
      </div>
      <div style={{ fontSize: '12px', fontFamily: 'var(--mono)', color: improved ? 'var(--phase-complete)' : 'var(--gray-400)' }}>
        {change != null ? (improved ? '▼ ' : '▲ ') + Math.abs(change).toFixed(decimals) : '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ flex: 1 }}><ProgressBar pct={progress} color={progress >= 60 ? 'var(--phase-complete)' : 'var(--warning)'} /></div>
      </div>
    </div>
  )
}

// ── LogFields (shared input fields) ──────────────────────────────────────

function LogFields({ ta, setTa, rj, setRj, di, setDi, notes, setNotes }: {
  ta: string; setTa: (v: string) => void
  rj: string; setRj: (v: string) => void
  di: string | null; setDi: (v: string) => void
  notes: string; setNotes: (v: string) => void
}) {
  const field = (label: string, val: string, setter: (v: string) => void, unit: string, placeholder: string) => (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.3px' }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="number"
          value={val}
          onChange={e => setter(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100px', padding: '10px 14px', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '16px', fontFamily: 'var(--mono)',
            background: 'var(--white)', color: 'var(--gray-900)',
          }}
        />
        <span style={{ fontSize: '13px', color: 'var(--gray-400)' }}>{unit}</span>
      </div>
    </div>
  )

  return (
    <div>
      {field('Truck turnaround', ta, setTa, 'minutes', 'e.g. 88')}
      {field('Rejection rate', rj, setRj, '%', 'e.g. 2.1')}
      {di !== null && field('Dispatch time', di, setDi, 'minutes', 'e.g. 18')}
      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.3px' }}>
          Notes (optional)
        </label>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Eid week, lower volume"
          style={{
            width: '100%', padding: '10px 14px', border: '1px solid var(--border)',
            borderRadius: '8px', fontSize: '13px', background: 'var(--white)', color: 'var(--gray-900)',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  )
}

// ── Customer Weekly Log ────────────────────────────────────────────────────

function CustomerLog({ config, entries, onLogged }: { config: TrackingConfig; entries: TrackingEntry[]; onLogged: () => void }) {
  const supabase = createClient()
  const currentWeek = getWeekNumber(config.started_at)
  const alreadyLogged = entries.some(e => e.week_number === currentWeek)
  const [ta, setTa] = useState('')
  const [rj, setRj] = useState('')
  const [di, setDi] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleLog() {
    if (!ta && !rj) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('tracking_entries').upsert({
      config_id: config.id,
      week_number: currentWeek,
      turnaround_min: ta ? +ta : null,
      reject_pct: rj ? +rj : null,
      dispatch_min: config.track_dispatch && di ? +di : null,
      notes: notes || null,
      logged_by: user?.id,
    }, { onConflict: 'config_id,week_number' })
    setSaving(false)
    setSaved(true)
    onLogged()
  }

  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0]
  const taProgress = progressPct(config.baseline_turnaround, latest?.turnaround_min ?? null, config.target_turnaround)
  const rjProgress = progressPct(config.baseline_reject_pct, latest?.reject_pct ?? null, config.target_reject_pct)

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '24px 16px' }}>

      {/* Log form or already-logged state */}
      {saved || alreadyLogged ? (
        <div style={{ background: 'var(--phase-complete-bg)', border: '1px solid var(--tooltip-border)', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>✓</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--phase-complete)', marginBottom: '4px' }}>Week {currentWeek} logged</div>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>Next entry: next week</div>
        </div>
      ) : (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Week {currentWeek} of 13</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '2px' }}>Log this week&apos;s numbers</div>
            <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Takes about 60 seconds</div>
          </div>
          <LogFields
            ta={ta} setTa={setTa}
            rj={rj} setRj={setRj}
            di={config.track_dispatch ? di : null} setDi={setDi}
            notes={notes} setNotes={setNotes}
          />
          <button
            onClick={handleLog}
            disabled={saving || (!ta && !rj)}
            style={{
              width: '100%', padding: '14px', background: 'var(--green)', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600,
              cursor: saving || (!ta && !rj) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)', opacity: saving || (!ta && !rj) ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save this week'}
          </button>
        </div>
      )}

      {/* Mini progress */}
      {entries.length > 0 && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-600)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '16px' }}>
            Your progress
          </div>
          {config.track_turnaround && config.baseline_turnaround != null && (
            <MiniProgressRow label="Turnaround" baseline={config.baseline_turnaround} target={config.target_turnaround} latest={latest?.turnaround_min ?? null} unit="min" pct={taProgress} />
          )}
          {config.track_reject && config.baseline_reject_pct != null && (
            <MiniProgressRow label="Reject rate" baseline={config.baseline_reject_pct} target={config.target_reject_pct} latest={latest?.reject_pct ?? null} unit="%" pct={rjProgress} decimals={1} />
          )}
          <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--gray-400)' }}>
            Week {currentWeek} of 13 · {13 - currentWeek} weeks remaining
          </div>
        </div>
      )}
    </div>
  )
}

function MiniProgressRow({ label, baseline, target, latest, unit, pct, decimals = 0 }: {
  label: string; baseline: number; target: number | null; latest: number | null;
  unit: string; pct: number; decimals?: number
}) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--gray-700)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
          {latest != null ? `${latest.toFixed(decimals)} ${unit}` : '—'} → target {target != null ? `${target.toFixed(decimals)}` : '?'} {unit}
        </span>
      </div>
      <ProgressBar pct={pct} color={pct >= 60 ? 'var(--phase-complete)' : 'var(--warning)'} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{baseline.toFixed(decimals)} {unit} (start)</span>
        <span style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{pct}% of target reached</span>
      </div>
    </div>
  )
}

// ── Case Study Card ────────────────────────────────────────────────────────

function CaseStudyCard({ config, entries }: { config: TrackingConfig; entries: TrackingEntry[] }) {
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0]
  if (!latest) return null

  const taImprovement = config.baseline_turnaround != null && latest.turnaround_min != null
    ? Math.max(0, config.baseline_turnaround - latest.turnaround_min) : 0
  const rjImprovement = config.baseline_reject_pct != null && latest.reject_pct != null
    ? Math.max(0, config.baseline_reject_pct - latest.reject_pct) : 0
  const monthlyRecovery = calcRecovery(latest, config)

  return (
    <div style={{ background: 'var(--white)', border: '2px solid var(--phase-complete)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--phase-complete)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>Case study ready</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)' }}>90-day before / after</div>
        </div>
        <button
          onClick={() => window.print()}
          style={{ padding: '6px 14px', background: 'var(--phase-complete)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
        >
          Export PDF
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {taImprovement > 0 && (
          <CaseStudyStat label="Turnaround reduced" value={`▼ ${taImprovement} min`} sub={`${config.baseline_turnaround} → ${latest.turnaround_min} min`} />
        )}
        {rjImprovement > 0 && (
          <CaseStudyStat label="Reject rate reduced" value={`▼ ${rjImprovement.toFixed(1)}%`} sub={`${config.baseline_reject_pct} → ${latest.reject_pct}%`} />
        )}
        {monthlyRecovery > 0 && (
          <CaseStudyStat label="Monthly recovery" value={fmt(monthlyRecovery)} sub={`${fmt(monthlyRecovery * 12)}/year`} highlight />
        )}
        <CaseStudyStat label="Weeks tracked" value={`${entries.length} / 13`} sub={`${entries.length * 7} days of data`} />
      </div>
    </div>
  )
}

function CaseStudyStat({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '12px', background: highlight ? 'var(--phase-complete-bg)' : 'var(--gray-50)', borderRadius: '8px' }}>
      <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: highlight ? 'var(--phase-complete)' : 'var(--gray-900)', marginBottom: '2px' }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{sub}</div>
    </div>
  )
}

// ── Main TrackingTab ───────────────────────────────────────────────────────

export default function TrackingTab(props: TrackingProps) {
  const { assessmentId, isAdmin } = props
  const supabase = createClient()
  const [config, setConfig] = useState<TrackingConfig | null | undefined>(undefined) // undefined = loading
  const [entries, setEntries] = useState<TrackingEntry[]>([])

  const fetchData = useCallback(async () => {
    const { data: cfg } = await supabase
      .from('tracking_configs')
      .select('*')
      .eq('assessment_id', assessmentId)
      .maybeSingle()

    setConfig(cfg ?? null)

    if (cfg) {
      const { data: ents } = await supabase
        .from('tracking_entries')
        .select('*')
        .eq('config_id', cfg.id)
        .order('week_number', { ascending: true })
      setEntries(ents ?? [])
    }
  }, [assessmentId, supabase])

  useEffect(() => { fetchData() }, [fetchData])

  // Loading
  if (config === undefined) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>
        Loading tracking data…
      </div>
    )
  }

  // No config yet
  if (config === null) {
    if (isAdmin) {
      return <SetupForm {...props} onCreated={cfg => setConfig(cfg)} />
    }
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--gray-400)' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>📊</div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gray-600)', marginBottom: '8px' }}>90-day tracking not started yet</div>
        <div style={{ fontSize: '13px' }}>Your consultant will activate tracking after the engagement.</div>
      </div>
    )
  }

  // Config exists
  if (isAdmin) {
    return <ProgressView config={config} entries={entries} onEntryLogged={fetchData} />
  }

  return <CustomerLog config={config} entries={entries} onLogged={fetchData} />
}
