'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

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
  coeff_reject: number  // repurposed as coeffDispatch in v2 UI
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
  coeffDispatch: number
  baselineMonthlyLoss: number
  targetTA: number
}

interface ChartPoint {
  week: number
  baseline: number
  predicted: number
  actual?: number
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

function progressPct(baseline: number | null, latest: number | null, target: number | null): number {
  if (baseline == null || latest == null || target == null) return 0
  if (baseline <= target) return 100
  return Math.min(100, Math.max(0, Math.round((baseline - latest) / (baseline - target) * 100)))
}

function calcMonthlyRecovery(entry: TrackingEntry, cfg: TrackingConfig, coeffDispatch: number): number {
  let r = 0
  if (entry.turnaround_min != null && cfg.baseline_turnaround != null) {
    r += Math.max(0, cfg.baseline_turnaround - entry.turnaround_min) * cfg.coeff_turnaround
  }
  if (entry.dispatch_min != null && cfg.baseline_dispatch_min != null) {
    r += Math.max(0, cfg.baseline_dispatch_min - entry.dispatch_min) * coeffDispatch
  }
  return Math.round(r)
}

function buildChartPoints(
  entries: TrackingEntry[],
  baseline: number,
  target: number,
  key: 'turnaround_min' | 'dispatch_min'
): ChartPoint[] {
  const points: ChartPoint[] = []
  points.push({ week: 0, baseline, predicted: baseline, actual: baseline })
  for (let w = 1; w <= 12; w++) {
    const entry = entries.find(e => e.week_number === w)
    const predicted = Math.round(baseline - (baseline - target) * (w / 12))
    const val = entry?.[key]
    points.push({ week: w, baseline, predicted, actual: val != null ? val : undefined })
  }
  return points
}

// ── Basic sub-components ───────────────────────────────────────────────────

function ProgressBar({ pct, color = 'var(--green)' }: { pct: number; color?: string }) {
  return (
    <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: '3px', transition: 'width .3s' }} />
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

// ── ImpactSummary (Section A) ──────────────────────────────────────────────

function ImpactSummary({ config, entries, coeffDispatch, currentWeek }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  coeffDispatch: number
  currentWeek: number
}) {
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0] ?? null
  const currentMonthlyRecovery = latest ? calcMonthlyRecovery(latest, config, coeffDispatch) : 0

  const predictedTotal = Math.round(
    Math.max(0, (config.baseline_turnaround ?? 0) - (config.target_turnaround ?? 0)) * config.coeff_turnaround
    + Math.max(0, (config.baseline_dispatch_min ?? 0) - (config.target_dispatch_min ?? 15)) * coeffDispatch
  )

  const pct = predictedTotal > 0 ? Math.min(100, Math.round(currentMonthlyRecovery / predictedTotal * 100)) : 0
  const onTrack = pct >= 40

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
            Current monthly savings
          </div>
          <div style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'var(--mono)', color: currentMonthlyRecovery > 0 ? 'var(--phase-complete)' : 'var(--gray-300)', lineHeight: 1 }}>
            {currentMonthlyRecovery > 0 ? fmt(currentMonthlyRecovery) : '—'}
          </div>
          {predictedTotal > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '5px' }}>
              of {fmt(predictedTotal)}/mo predicted when targets hit
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '6px' }}>
            Week {currentWeek} of 12
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
            <StatusBadge pct={pct} />
            {onTrack && <span style={{ fontSize: '12px', color: 'var(--phase-complete)' }}>✓</span>}
          </div>
        </div>
      </div>
      {predictedTotal > 0 && currentMonthlyRecovery > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '10px', color: 'var(--gray-400)' }}>Progress toward predicted improvement</span>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-600)' }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={onTrack ? 'var(--phase-complete)' : 'var(--warning)'} />
        </div>
      )}
    </div>
  )
}

// ── Monthly Milestones ─────────────────────────────────────────────────────

function MonthlyMilestones({ config, entries, coeffDispatch }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  coeffDispatch: number
}) {
  const CHECKPOINTS = [
    { label: 'Month 1', week: 4 },
    { label: 'Month 2', week: 8 },
    { label: 'Month 3', week: 13 },
  ]
  const currentWeek = getWeekNumber(config.started_at)

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '14px' }}>
        Milestones
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {CHECKPOINTS.map(({ label, week }) => {
          const entry = entries.find(e => e.week_number === week)
            ?? [...entries].sort((a, b) => Math.abs(a.week_number - week) - Math.abs(b.week_number - week))[0]
          const reached = currentWeek >= week
          const taBaseline = config.baseline_turnaround ?? 0
          const taTarget = config.target_turnaround ?? taBaseline
          const diBaseline = config.baseline_dispatch_min ?? 0
          const diTarget = config.target_dispatch_min ?? diBaseline
          // Predicted at this checkpoint
          const predictedTA = Math.round(taBaseline - (taBaseline - taTarget) * (week / 12))
          const predictedDI = Math.round(diBaseline - (diBaseline - diTarget) * (week / 12))
          // Actual recovery at this checkpoint
          const actualEntry = entries.find(e => e.week_number === week)
          const taActual = actualEntry?.turnaround_min ?? null
          const diActual = actualEntry?.dispatch_min ?? null
          const predictedRecovery = Math.round(
            Math.max(0, taBaseline - predictedTA) * config.coeff_turnaround
            + Math.max(0, diBaseline - predictedDI) * coeffDispatch
          )
          const actualRecovery = reached && (taActual != null || diActual != null) ? Math.round(
            Math.max(0, taBaseline - (taActual ?? predictedTA)) * config.coeff_turnaround
            + Math.max(0, diBaseline - (diActual ?? predictedDI)) * coeffDispatch
          ) : null

          const ahead = actualRecovery != null && predictedRecovery > 0 && actualRecovery >= predictedRecovery
          const behind = actualRecovery != null && predictedRecovery > 0 && actualRecovery < predictedRecovery

          return (
            <div
              key={label}
              style={{
                padding: '12px', borderRadius: '8px',
                background: !reached ? 'var(--gray-50)' : ahead ? 'var(--phase-complete-bg)' : behind ? 'var(--warning-bg)' : 'var(--gray-50)',
                border: `1px solid ${!reached ? 'var(--border)' : ahead ? 'var(--tooltip-border)' : behind ? 'var(--warning-border)' : 'var(--border)'}`,
                opacity: !reached ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-700)' }}>{label}</div>
                <div style={{ fontSize: '9px', color: 'var(--gray-400)' }}>wk {week}</div>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <div style={{ fontSize: '9px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '2px' }}>Predicted</div>
                <div style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
                  {predictedRecovery > 0 ? fmt(predictedRecovery) + '/mo' : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '2px' }}>Actual</div>
                <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--mono)', color: !reached ? 'var(--gray-300)' : ahead ? 'var(--phase-complete)' : behind ? '#d97706' : 'var(--gray-900)' }}>
                  {actualRecovery != null ? fmt(actualRecovery) + '/mo' : reached ? '— not logged' : '—'}
                </div>
              </div>
              {actualRecovery != null && predictedRecovery > 0 && (
                <div style={{ marginTop: '6px', fontSize: '9px', fontWeight: 600, color: ahead ? 'var(--phase-complete)' : '#d97706' }}>
                  {ahead ? `✓ +${fmt(actualRecovery - predictedRecovery)} ahead` : `▼ ${fmt(predictedRecovery - actualRecovery)} behind`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ImpactChart (Section B) ────────────────────────────────────────────────

function ImpactChart({ config, entries }: { config: TrackingConfig; entries: TrackingEntry[] }) {
  const [mounted, setMounted] = useState(false)
  const [metric, setMetric] = useState<'turnaround' | 'dispatch'>('turnaround')
  useEffect(() => setMounted(true), [])

  const showDispatch = config.baseline_dispatch_min != null && config.target_dispatch_min != null

  const points = metric === 'turnaround'
    ? buildChartPoints(entries, config.baseline_turnaround ?? 95, config.target_turnaround ?? 78, 'turnaround_min')
    : buildChartPoints(entries, config.baseline_dispatch_min ?? 32, config.target_dispatch_min ?? 15, 'dispatch_min')

  const label = metric === 'turnaround' ? 'Turnaround' : 'Dispatch Time'

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: '16px' }}>
      {/* Header + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-700)' }}>{label} — 12-week trajectory</div>
        {showDispatch && (
          <div style={{ display: 'flex', gap: '2px', background: 'var(--gray-100)', borderRadius: '6px', padding: '2px' }}>
            {(['turnaround', 'dispatch'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                style={{
                  padding: '4px 10px', fontSize: '11px', fontWeight: 500, border: 'none',
                  borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--font)',
                  background: metric === m ? 'var(--white)' : 'transparent',
                  color: metric === m ? 'var(--gray-900)' : 'var(--gray-400)',
                  boxShadow: metric === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                  transition: 'all .15s',
                }}
              >
                {m === 'turnaround' ? 'Turnaround' : 'Dispatch'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
        {[
          { color: '#C0392B', dash: true, label: 'Baseline' },
          { color: '#b0b0b0', dash: true, label: 'Predicted' },
          { color: '#0F6E56', dash: false, label: 'Actual' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="20" height="10">
              <line x1="0" y1="5" x2="20" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash ? '4 3' : '0'} />
            </svg>
            <span style={{ fontSize: '10px', color: 'var(--gray-500)' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      {mounted ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
            <XAxis
              dataKey="week"
              tickFormatter={(w: number) => w === 0 ? 'Start' : `W${w}`}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) => `${v}m`}
              width={38}
              domain={['auto', 'auto']}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                `${value} min`,
                name === 'baseline' ? 'Baseline' : name === 'predicted' ? 'Predicted' : 'Actual'
              ]}
              labelFormatter={(w: unknown) => w === 0 ? 'Start' : `Week ${w}`}
              contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Line dataKey="baseline" stroke="#C0392B" strokeDasharray="5 4" dot={false} strokeWidth={1.5} name="baseline" connectNulls />
            <Line dataKey="predicted" stroke="#b0b0b0" strokeDasharray="5 4" dot={false} strokeWidth={1.5} name="predicted" connectNulls />
            <Line dataKey="actual" stroke="#0F6E56" strokeWidth={2.5} dot={{ r: 3.5, fill: '#0F6E56', strokeWidth: 0 }} connectNulls={false} name="actual" />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 220 }} />
      )}
    </div>
  )
}

// ── KpiCard (Section C) ────────────────────────────────────────────────────

function KpiCard({ label, baseline, target, latest, coeff, unit = 'min' }: {
  label: string
  baseline: number | null
  target: number | null
  latest: number | null
  coeff: number
  unit?: string
}) {
  const delta = baseline != null && latest != null ? Math.max(0, baseline - latest) : null
  const monthlySaving = delta != null && delta > 0 ? Math.round(delta * coeff) : null
  const pct = progressPct(baseline, latest, target)
  const improved = delta != null && delta > 0

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', flex: 1, minWidth: '180px' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '12px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: '20px', marginBottom: '14px' }}>
        {[
          { lbl: 'Before', val: baseline != null ? `${baseline}` : '—', faded: true },
          { lbl: 'Now', val: latest != null ? `${latest}` : '—', faded: false },
          { lbl: 'Target', val: target != null ? `${target}` : '—', faded: true },
        ].map(({ lbl, val, faded }) => (
          <div key={lbl}>
            <div style={{ fontSize: '9px', color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '3px' }}>{lbl}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: faded ? 'var(--gray-300)' : 'var(--gray-900)', lineHeight: 1 }}>{val}</span>
              <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '10px' }}>
        <ProgressBar pct={pct} color={pct >= 60 ? 'var(--phase-complete)' : pct >= 20 ? 'var(--warning)' : 'var(--gray-200)'} />
      </div>
      {improved && monthlySaving != null && monthlySaving > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: 'var(--phase-complete)', fontWeight: 600 }}>▼ {delta} {unit} saved</span>
          <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--phase-complete)', fontWeight: 700 }}>{fmt(monthlySaving)}/mo</span>
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--gray-300)' }}>No improvement logged yet</div>
      )}
    </div>
  )
}

// ── WeeklyInput (Section D) ────────────────────────────────────────────────

function WeeklyInput({ config, entries, currentWeek, isAdmin, onLogged }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  currentWeek: number
  isAdmin: boolean
  onLogged: () => void
}) {
  const supabase = createClient()
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [ta, setTa] = useState('')
  const [di, setDi] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const weekEntry = entries.find(e => e.week_number === selectedWeek)

  async function handleSubmit() {
    if (!ta && !di) return
    setSaving(true)
    if (weekEntry) {
      await supabase.from('tracking_entries').update({
        turnaround_min: ta ? +ta : weekEntry.turnaround_min,
        dispatch_min: di ? +di : weekEntry.dispatch_min,
      }).eq('id', weekEntry.id)
    } else {
      await supabase.from('tracking_entries').insert({
        config_id: config.id,
        week_number: selectedWeek,
        turnaround_min: ta ? +ta : null,
        dispatch_min: di ? +di : null,
        reject_pct: null,
        notes: null,
      })
    }
    setSaving(false)
    setSaved(true)
    setTa(''); setDi('')
    setTimeout(() => setSaved(false), 3000)
    onLogged()
  }

  const inputStyle: React.CSSProperties = {
    width: '90px', padding: '10px 12px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '18px', fontFamily: 'var(--mono)',
    background: 'var(--white)', color: 'var(--gray-900)',
  }

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: saved ? 'var(--phase-complete)' : 'var(--gray-700)' }}>
          {saved ? '✓ Saved' : `Log week ${selectedWeek}`}
        </div>
        {isAdmin && (
          <select
            value={selectedWeek}
            onChange={e => {
              const wk = +e.target.value
              setSelectedWeek(wk)
              const ex = entries.find(en => en.week_number === wk)
              setTa(ex?.turnaround_min != null ? String(ex.turnaround_min) : '')
              setDi(ex?.dispatch_min != null ? String(ex.dispatch_min) : '')
              setSaved(false)
            }}
            style={{
              fontSize: '12px', color: 'var(--gray-600)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '4px 8px', background: 'var(--white)',
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            {Array.from({ length: currentWeek }, (_, i) => i + 1).map(w => (
              <option key={w} value={w}>
                Week {w}{entries.some(e => e.week_number === w) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>
            Turnaround time
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number" value={ta}
              onChange={e => setTa(e.target.value)}
              placeholder={weekEntry?.turnaround_min != null ? String(weekEntry.turnaround_min) : 'e.g. 88'}
              style={inputStyle}
            />
            <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>min</span>
          </div>
        </div>
        {config.baseline_dispatch_min != null && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>
              Dispatch time
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="number" value={di}
                onChange={e => setDi(e.target.value)}
                placeholder={weekEntry?.dispatch_min != null ? String(weekEntry.dispatch_min) : 'e.g. 20'}
                style={inputStyle}
              />
              <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>min</span>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || (!ta && !di)}
        style={{
          padding: '10px 24px',
          background: saved ? 'var(--phase-complete)' : 'var(--green)',
          color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          cursor: saving || (!ta && !di) ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font)', opacity: (!ta && !di) ? 0.5 : 1, transition: 'background .2s',
        }}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : weekEntry ? `Update week ${selectedWeek}` : `Submit week ${selectedWeek}`}
      </button>
    </div>
  )
}

// ── Setup Form ─────────────────────────────────────────────────────────────

function SetupForm({
  assessmentId, baselineTurnaround, baselineDispatchMin,
  coeffTurnaround, coeffDispatch, baselineMonthlyLoss, targetTA, onCreated,
}: TrackingProps & { onCreated: (cfg: TrackingConfig) => void }) {
  const supabase = createClient()
  const [ta, setTa] = useState(String(targetTA))
  const [di, setDi] = useState('15')
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)

  const predictedRecovery = Math.round(
    Math.max(0, (baselineTurnaround ?? 0) - +ta) * coeffTurnaround
    + Math.max(0, (baselineDispatchMin ?? 0) - +di) * coeffDispatch
  )

  async function handleStart() {
    setSaving(true)
    const { data, error } = await supabase.from('tracking_configs').insert({
      assessment_id: assessmentId,
      baseline_turnaround: baselineTurnaround,
      baseline_reject_pct: null,
      baseline_dispatch_min: baselineDispatchMin,
      target_turnaround: +ta || null,
      target_reject_pct: null,
      target_dispatch_min: +di || null,
      track_turnaround: true,
      track_reject: false,
      track_dispatch: baselineDispatchMin != null,
      coeff_turnaround: coeffTurnaround,
      coeff_reject: coeffDispatch,  // repurposed column
      baseline_monthly_loss: baselineMonthlyLoss,
      consent_case_study: consent,
    }).select().single()
    setSaving(false)
    if (!error && data) onCreated(data as TrackingConfig)
  }

  const row = (label: string, baseline: number | null, unit: string, val: string, setVal: (v: string) => void) => (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 120px 1fr', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '13px', color: 'var(--gray-700)' }}>{label}</div>
      <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
        {baseline != null ? `${baseline} ${unit}` : '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="number" value={val} onChange={e => setVal(e.target.value)}
          style={{ width: '80px', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontFamily: 'var(--mono)', background: 'var(--white)', color: 'var(--gray-900)' }}
        />
        <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{unit}</span>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '4px' }}>Start 90-day tracking</div>
        <div style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Set targets for the 2 KPIs. The plant logs weekly numbers — you see actual vs predicted in real time.
        </div>
      </div>

      {/* Early-start callout */}
      <div style={{
        background: 'var(--info-bg)', border: '1px solid var(--info-border)',
        borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '20px',
        display: 'flex', gap: '10px', alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: '16px', flexShrink: 0 }}>⏱</span>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--phase-workshop)', marginBottom: '2px' }}>
            Start now — before the on-site visit
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-600)', lineHeight: 1.55 }}>
            Logging starts immediately so the plant records baseline weeks before interventions begin.
            By the time of the on-site visit you already have 2–4 weeks of real data — making the before/after comparison far stronger.
          </div>
        </div>
      </div>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0 20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 120px 1fr', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          {['Metric', 'Baseline', '90-day target'].map(h => (
            <div key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</div>
          ))}
        </div>
        {row('Turnaround', baselineTurnaround, 'min', ta, setTa)}
        {baselineDispatchMin != null && row('Dispatch Time', baselineDispatchMin, 'min', di, setDi)}
      </div>
      {predictedRecovery > 0 && (
        <div style={{ background: 'var(--phase-complete-bg)', border: '1px solid var(--tooltip-border)', borderRadius: 'var(--radius)', padding: '14px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--gray-700)' }}>Predicted monthly recovery if targets hit</span>
          <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--phase-complete)' }}>{fmt(predictedRecovery)}/mo</span>
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '24px', fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.5 }}>
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: '2px', flexShrink: 0 }} />
        Client consents to anonymised before/after results being used as a case study
      </label>
      <button
        onClick={handleStart} disabled={saving}
        style={{ width: '100%', padding: '12px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)', opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Starting…' : 'Start 90-day tracking'}
      </button>
    </div>
  )
}

// ── CaseStudyCard ──────────────────────────────────────────────────────────

function CaseStudyStat({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '12px', background: highlight ? 'var(--phase-complete-bg)' : 'var(--gray-50)', borderRadius: '8px' }}>
      <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: highlight ? 'var(--phase-complete)' : 'var(--gray-900)', marginBottom: '2px' }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{sub}</div>
    </div>
  )
}

function CaseStudyCard({ config, entries, coeffDispatch }: { config: TrackingConfig; entries: TrackingEntry[]; coeffDispatch: number }) {
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0]
  if (!latest) return null

  const taImprovement = config.baseline_turnaround != null && latest.turnaround_min != null
    ? Math.max(0, config.baseline_turnaround - latest.turnaround_min) : 0
  const diImprovement = config.baseline_dispatch_min != null && latest.dispatch_min != null
    ? Math.max(0, config.baseline_dispatch_min - latest.dispatch_min) : 0
  const monthlyRecovery = calcMonthlyRecovery(latest, config, coeffDispatch)

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
        {diImprovement > 0 && (
          <CaseStudyStat label="Dispatch Time reduced" value={`▼ ${diImprovement} min`} sub={`${config.baseline_dispatch_min} → ${latest.dispatch_min} min`} />
        )}
        {monthlyRecovery > 0 && (
          <CaseStudyStat label="Monthly recovery" value={fmt(monthlyRecovery)} sub={`${fmt(monthlyRecovery * 12)}/year`} highlight />
        )}
        <CaseStudyStat label="Weeks tracked" value={`${entries.length} / 13`} sub={`${entries.length * 7} days of data`} />
      </div>
    </div>
  )
}

// ── Progress View (admin) ──────────────────────────────────────────────────

function ProgressView({ config, entries, onEntryLogged, coeffDispatch }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  onEntryLogged: () => void
  coeffDispatch: number
}) {
  const currentWeek = getWeekNumber(config.started_at)
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0] ?? null
  const weeksWithNoData = currentWeek > 2 && entries.filter(e => e.week_number <= currentWeek - 1).length < currentWeek - 2
  const canExport = config.consent_case_study && entries.length >= 8

  return (
    <div style={{ padding: '24px', maxWidth: '760px', margin: '0 auto' }}>
      {weeksWithNoData && (
        <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: '8px', padding: '10px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--red)' }}>
          ⚠ No data logged in the last 2+ weeks — follow up with the plant
        </div>
      )}

      {/* A: Impact Summary */}
      <ImpactSummary config={config} entries={entries} coeffDispatch={coeffDispatch} currentWeek={currentWeek} />

      {/* A2: Monthly milestones */}
      <MonthlyMilestones config={config} entries={entries} coeffDispatch={coeffDispatch} />

      {/* B: Chart */}
      <ImpactChart config={config} entries={entries} />

      {/* C: KPI Cards */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <KpiCard
          label="Turnaround"
          baseline={config.baseline_turnaround}
          target={config.target_turnaround}
          latest={latest?.turnaround_min ?? null}
          coeff={config.coeff_turnaround}
          unit="min"
        />
        {config.baseline_dispatch_min != null && (
          <KpiCard
            label="Dispatch Time"
            baseline={config.baseline_dispatch_min}
            target={config.target_dispatch_min}
            latest={latest?.dispatch_min ?? null}
            coeff={coeffDispatch}
            unit="min"
          />
        )}
      </div>

      {/* D: Weekly Input */}
      <WeeklyInput
        config={config}
        entries={entries}
        currentWeek={currentWeek}
        isAdmin={true}
        onLogged={onEntryLogged}
      />

      {/* Case study */}
      <div style={{ marginTop: '16px' }}>
        {canExport ? (
          <CaseStudyCard config={config} entries={entries} coeffDispatch={coeffDispatch} />
        ) : (
          <div style={{ padding: '12px 16px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: 'var(--gray-400)' }}>
            {!config.consent_case_study
              ? 'Case study export requires client consent (update in setup).'
              : `Case study export available after 8 weeks of data (${Math.max(0, 8 - entries.length)} more week${entries.length === 7 ? '' : 's'} needed).`}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Customer Log ───────────────────────────────────────────────────────────

function CustomerLog({ config, entries, onLogged, coeffDispatch }: {
  config: TrackingConfig
  entries: TrackingEntry[]
  onLogged: () => void
  coeffDispatch: number
}) {
  const currentWeek = getWeekNumber(config.started_at)
  const sortedEntries = [...entries].sort((a, b) => b.week_number - a.week_number)
  const latest = sortedEntries[0] ?? null

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '24px 16px' }}>
      <ImpactSummary config={config} entries={entries} coeffDispatch={coeffDispatch} currentWeek={currentWeek} />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <KpiCard
          label="Turnaround"
          baseline={config.baseline_turnaround}
          target={config.target_turnaround}
          latest={latest?.turnaround_min ?? null}
          coeff={config.coeff_turnaround}
          unit="min"
        />
        {config.baseline_dispatch_min != null && (
          <KpiCard
            label="Dispatch Time"
            baseline={config.baseline_dispatch_min}
            target={config.target_dispatch_min}
            latest={latest?.dispatch_min ?? null}
            coeff={coeffDispatch}
            unit="min"
          />
        )}
      </div>
      <WeeklyInput
        config={config}
        entries={entries}
        currentWeek={currentWeek}
        isAdmin={false}
        onLogged={onLogged}
      />
    </div>
  )
}

// ── Main TrackingTab ───────────────────────────────────────────────────────

export default function TrackingTab(props: TrackingProps) {
  const {
    assessmentId, isAdmin, coeffDispatch,
    baselineTurnaround, baselineRejectPct, baselineDispatchMin,
    coeffTurnaround, baselineMonthlyLoss, targetTA,
  } = props
  const supabase = createClient()
  const [config, setConfig] = useState<TrackingConfig | null | undefined>(undefined)
  const [entries, setEntries] = useState<TrackingEntry[]>([])

  const fetchData = useCallback(async () => {
    if (assessmentId === 'demo') {
      const startedAt = new Date(Date.now() - 49 * 86_400_000).toISOString()
      const mockConfig: TrackingConfig = {
        id: 'demo-cfg',
        assessment_id: 'demo',
        started_at: startedAt,
        // Baselines come from props — same data as Assessment, Report, Simulator tabs
        baseline_turnaround: baselineTurnaround,
        baseline_reject_pct: baselineRejectPct,
        baseline_dispatch_min: baselineDispatchMin,
        target_turnaround: targetTA,
        target_reject_pct: null,
        target_dispatch_min: 15,
        track_turnaround: true,
        track_reject: false,
        track_dispatch: true,
        coeff_turnaround: coeffTurnaround,
        coeff_reject: coeffDispatch,  // repurposed column
        baseline_monthly_loss: baselineMonthlyLoss,
        consent_case_study: true,
      }
      const now = Date.now()
      const mockEntries: TrackingEntry[] = [
        { id: 'e1', config_id: 'demo-cfg', week_number: 1, logged_at: new Date(now - 42 * 86_400_000).toISOString(), turnaround_min: 112, reject_pct: null, dispatch_min: 32, notes: null },
        { id: 'e2', config_id: 'demo-cfg', week_number: 2, logged_at: new Date(now - 35 * 86_400_000).toISOString(), turnaround_min: 108, reject_pct: null, dispatch_min: 29, notes: 'Demurrage clause enforced with top 3 contractors' },
        { id: 'e3', config_id: 'demo-cfg', week_number: 3, logged_at: new Date(now - 28 * 86_400_000).toISOString(), turnaround_min: 105, reject_pct: null, dispatch_min: 26, notes: null },
        { id: 'e4', config_id: 'demo-cfg', week_number: 4, logged_at: new Date(now - 21 * 86_400_000).toISOString(), turnaround_min: 101, reject_pct: null, dispatch_min: 24, notes: 'Dispatch SOP implemented — dedicated dispatcher' },
        { id: 'e5', config_id: 'demo-cfg', week_number: 5, logged_at: new Date(now - 14 * 86_400_000).toISOString(), turnaround_min: 97, reject_pct: null, dispatch_min: 21, notes: null },
        { id: 'e6', config_id: 'demo-cfg', week_number: 6, logged_at: new Date(now - 7 * 86_400_000).toISOString(), turnaround_min: 93, reject_pct: null, dispatch_min: 19, notes: 'Zone routing implemented — 4 delivery quadrants' },
        { id: 'e7', config_id: 'demo-cfg', week_number: 7, logged_at: new Date(now - 1 * 86_400_000).toISOString(), turnaround_min: 89, reject_pct: null, dispatch_min: 17, notes: null },
      ]
      setConfig(mockConfig)
      setEntries(mockEntries)
      return
    }

    // Normal Supabase path
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
  }, [assessmentId, supabase, baselineTurnaround, baselineRejectPct, baselineDispatchMin, targetTA, coeffTurnaround, coeffDispatch, baselineMonthlyLoss])

  useEffect(() => { fetchData() }, [fetchData])

  if (config === undefined) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-400)', fontSize: '13px' }}>
        Loading tracking data…
      </div>
    )
  }

  if (config === null) {
    if (isAdmin) return <SetupForm {...props} onCreated={cfg => setConfig(cfg)} />
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--gray-400)' }}>
        <div style={{ fontSize: '32px', marginBottom: '16px' }}>📊</div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--gray-600)', marginBottom: '8px' }}>90-day tracking not started yet</div>
        <div style={{ fontSize: '13px' }}>Your consultant will activate tracking after the engagement.</div>
      </div>
    )
  }

  if (isAdmin) {
    return <ProgressView config={config} entries={entries} onEntryLogged={fetchData} coeffDispatch={coeffDispatch} />
  }

  return <CustomerLog config={config} entries={entries} onLogged={fetchData} coeffDispatch={coeffDispatch} />
}
