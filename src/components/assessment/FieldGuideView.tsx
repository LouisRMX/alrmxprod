'use client'

/**
 * Field guide view — the on-site execution manuscript.
 *
 * Renders OMIX_FIELD_GUIDE as interactive day tabs + hypothesis cards with
 * persistent checkbox gates and free-text notes. Mobile-first: the consultant
 * uses this from their phone at the dispatch desk.
 *
 * State is per-user per-assessment, stored in field_guide_progress via
 * /api/field-guide/progress. Offline save is best-effort — if the network
 * drops mid-save, the local optimistic update stays on screen and the user
 * can retry by editing again.
 *
 * Content is hardcoded in src/data/omix-field-guide.ts. Future AI-generated
 * version will share this rendering layer and swap the data source.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  OMIX_FIELD_GUIDE,
  type FieldGuide,
  type FieldGuideHypothesis,
  type FieldGuideDay,
  type FieldGuideGate,
  type FieldGuideInterview,
  type FieldGuidePreArrival,
  type MeasurementType,
} from '@/data/omix-field-guide'
import { useIsMobile } from '@/hooks/useIsMobile'

interface Props {
  assessmentId: string
}

type ProgressStatus =
  | 'todo'
  | 'in_progress'
  | 'confirmed'
  | 'invalidated'
  | 'partial'
  | 'failed'
  | 'skipped'
  | 'triggered'

interface ProgressRow {
  id: string
  item_type: string
  item_id: string
  status: ProgressStatus
  note: string | null
  usd_adjusted: number | null
  completed_at: string | null
  updated_at: string
}

type ProgressMap = Map<string, ProgressRow>

const progressKey = (type: string, id: string) => `${type}:${id}`

export default function FieldGuideView({ assessmentId }: Props) {
  const guide: FieldGuide = OMIX_FIELD_GUIDE
  const isMobile = useIsMobile()
  const [progress, setProgress] = useState<ProgressMap>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  type Section = 'hypotheses' | 'pre_arrival' | 'day' | 'interviews' | 'abort'
  const [section, setSection] = useState<Section>('hypotheses')
  const [activeDayId, setActiveDayId] = useState<string>(guide.days[0].id)

  // Load progress on mount
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/field-guide/progress?assessmentId=${encodeURIComponent(assessmentId)}`)
        const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
        if (!res.ok) {
          const msg = isJson ? ((await res.json()).error ?? 'Load failed') : `Load failed (${res.status})`
          throw new Error(msg)
        }
        if (!isJson) throw new Error('Session expired, please reload')
        const { rows } = (await res.json()) as { rows: ProgressRow[] }
        const m: ProgressMap = new Map()
        for (const row of rows) m.set(progressKey(row.item_type, row.item_id), row)
        setProgress(m)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Load failed')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [assessmentId])

  const saveProgress = useCallback(async (
    itemType: string,
    itemId: string,
    patch: { status?: ProgressStatus; note?: string | null; usd_adjusted?: number | null },
  ) => {
    const key = progressKey(itemType, itemId)
    const current = progress.get(key)
    const optimistic: ProgressRow = {
      id: current?.id ?? 'pending',
      item_type: itemType,
      item_id: itemId,
      status: patch.status ?? current?.status ?? 'todo',
      note: patch.note ?? current?.note ?? null,
      usd_adjusted: patch.usd_adjusted ?? current?.usd_adjusted ?? null,
      completed_at: current?.completed_at ?? null,
      updated_at: new Date().toISOString(),
    }
    setProgress(prev => {
      const next = new Map(prev)
      next.set(key, optimistic)
      return next
    })

    try {
      const res = await fetch('/api/field-guide/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          itemType,
          itemId,
          status: optimistic.status,
          note: optimistic.note,
          usdAdjusted: optimistic.usd_adjusted,
        }),
      })
      const isJson = (res.headers.get('content-type') ?? '').includes('application/json')
      if (!res.ok) {
        const msg = isJson ? ((await res.json()).error ?? 'Save failed') : `Save failed (${res.status})`
        throw new Error(msg)
      }
      if (!isJson) throw new Error('Session expired, please reload')
      const { row } = (await res.json()) as { row: ProgressRow }
      setProgress(prev => {
        const next = new Map(prev)
        next.set(key, row)
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }, [assessmentId, progress])

  const activeDay = useMemo(() => guide.days.find(d => d.id === activeDayId) ?? guide.days[0], [guide.days, activeDayId])

  // Summary counts for top bar
  const summary = useMemo(() => {
    let total = 0
    let done = 0
    progress.forEach((v, k) => {
      if (k.startsWith('hypothesis:') || k.startsWith('slot_gate:') || k.startsWith('eod_gate:') || k.startsWith('pre_arrival:')) {
        total += 1
        if (['confirmed', 'invalidated', 'partial', 'skipped', 'failed'].includes(v.status)) done += 1
      }
    })
    return { total, done }
  }, [progress])

  return (
    <div style={{
      padding: 'clamp(12px, 3vw, 20px)', maxWidth: '900px', margin: '0 auto',
      paddingBottom: '80px', minWidth: 0, overflowX: 'hidden',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#1a1a1a' }}>Field guide</h2>
          <span style={{ fontSize: '12px', color: '#888' }}>{guide.engagement.customer} · {guide.engagement.plant_region} · {guide.engagement.trip_start_label}</span>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888', lineHeight: 1.4 }}>
          On-site execution manuscript. Prioritise measurements by invalidation speed × impact. State persists as you check gates and take notes.
        </p>
      </div>

      {error && (
        <div style={{
          background: '#FDEDEC', border: '1px solid #E8A39B', color: '#8B3A2E',
          padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
        }}>{error}</div>
      )}

      {/* Section tabs. On mobile they render as a 2-column grid so they always fit
          on a 320px+ viewport without any horizontal scroll. */}
      {isMobile ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '6px', marginBottom: '8px', width: '100%', minWidth: 0,
        }}>
          {[
            { id: 'hypotheses' as const, label: 'Hypotheses' },
            { id: 'day' as const, label: 'Day-by-day' },
            { id: 'pre_arrival' as const, label: 'Pre-arrival' },
            { id: 'interviews' as const, label: 'Interviews' },
            { id: 'abort' as const, label: 'Abort' },
          ].map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              style={sectionTabBtnMobile(section === s.id)}
            >{s.label}</button>
          ))}
        </div>
      ) : (
        <div style={{
          display: 'flex', gap: '4px', marginBottom: '16px',
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          {[
            { id: 'hypotheses' as const, label: 'Hypotheses' },
            { id: 'day' as const, label: 'Day-by-day' },
            { id: 'pre_arrival' as const, label: 'Pre-arrival' },
            { id: 'interviews' as const, label: 'Interviews' },
            { id: 'abort' as const, label: 'Abort scenarios' },
          ].map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              style={sectionTabBtn(section === s.id)}
            >{s.label}</button>
          ))}
          <div style={{ marginInlineStart: 'auto', fontSize: '11px', color: '#888', alignSelf: 'center' }}>
            {summary.done} / {summary.total} items marked
          </div>
        </div>
      )}
      {isMobile && (
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
          {summary.done} / {summary.total} items marked
        </div>
      )}

      {loading ? (
        <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>Loading progress…</div>
      ) : (
        <>
          {section === 'hypotheses' && (
            <HypothesesList
              hypotheses={guide.hypotheses}
              progress={progress}
              onUpdate={(id, patch) => saveProgress('hypothesis', id, patch)}
            />
          )}
          {section === 'day' && (
            <>
              <DayPicker days={guide.days} activeId={activeDayId} onChange={setActiveDayId} progress={progress} />
              <DayView day={activeDay} progress={progress} onUpdate={(type, id, patch) => saveProgress(type, id, patch)} />
            </>
          )}
          {section === 'pre_arrival' && (
            <PreArrivalList
              items={guide.pre_arrival}
              progress={progress}
              onUpdate={(id, patch) => saveProgress('pre_arrival', id, patch)}
            />
          )}
          {section === 'interviews' && (
            <InterviewsList
              interviews={guide.interviews}
              progress={progress}
              onUpdate={(id, patch) => saveProgress('interview', id, patch)}
            />
          )}
          {section === 'abort' && (
            <AbortList
              scenarios={guide.abort_scenarios}
              progress={progress}
              onUpdate={(id, patch) => saveProgress('abort', id, patch)}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Section: Hypotheses ──

function HypothesesList({
  hypotheses,
  progress,
  onUpdate,
}: {
  hypotheses: FieldGuideHypothesis[]
  progress: ProgressMap
  onUpdate: (id: string, patch: { status?: ProgressStatus; note?: string | null; usd_adjusted?: number | null }) => void
}) {
  const isMobile = useIsMobile()
  // Sort by field_priority
  const sorted = [...hypotheses].sort((a, b) => a.field_priority - b.field_priority)

  return (
    <div>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '10px', lineHeight: 1.4 }}>
        Ordered by field priority: invalidation speed × $ impact ÷ measurement cost. Read top-down and work the easy-to-kill hypotheses first.
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '10px',
      }}>
        {sorted.map(h => (
          <HypothesisCard
            key={h.id}
            hypothesis={h}
            progress={progress.get(progressKey('hypothesis', h.id))}
            onUpdate={(patch) => onUpdate(h.id, patch)}
          />
        ))}
      </div>
    </div>
  )
}

function HypothesisCard({
  hypothesis,
  progress,
  onUpdate,
}: {
  hypothesis: FieldGuideHypothesis
  progress: ProgressRow | undefined
  onUpdate: (patch: { status?: ProgressStatus; note?: string | null; usd_adjusted?: number | null }) => void
}) {
  const [noteDraft, setNoteDraft] = useState(progress?.note ?? '')
  const [usdDraft, setUsdDraft] = useState<string>(
    progress?.usd_adjusted != null ? String(progress.usd_adjusted) : ''
  )
  useEffect(() => { setNoteDraft(progress?.note ?? '') }, [progress?.note])
  useEffect(() => { setUsdDraft(progress?.usd_adjusted != null ? String(progress.usd_adjusted) : '') }, [progress?.usd_adjusted])

  const status = progress?.status ?? 'todo'
  const typeColor = hypothesis.measurement_type === 'A' ? '#0F6E56' : hypothesis.measurement_type === 'B' ? '#D68910' : '#8B3A2E'
  const typeBg = hypothesis.measurement_type === 'A' ? '#E1F5EE' : hypothesis.measurement_type === 'B' ? '#FFF4D6' : '#FDEDEC'
  const typeLabel = hypothesis.measurement_type === 'A' ? 'A · live-log' : hypothesis.measurement_type === 'B' ? 'B · hybrid' : 'C · manual'

  return (
    <div style={{
      background: '#fff', border: `1px solid ${statusBorderColor(status)}`, borderRadius: '12px',
      padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px',
      minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word',
    }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <span style={{
          padding: '2px 8px', borderRadius: '999px',
          background: typeBg, color: typeColor, fontSize: '11px', fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>{typeLabel}</span>
        <span style={{
          padding: '2px 8px', borderRadius: '999px',
          background: '#f4f4f4', color: '#333', fontSize: '11px', fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>#{hypothesis.field_priority}</span>
        <span style={{
          marginInlineStart: 'auto',
          fontSize: '14px', fontWeight: 700, color: '#0F6E56',
          whiteSpace: 'nowrap',
        }}>${Math.round(hypothesis.usd_per_month / 1000)}k/mo</span>
      </div>

      <div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{hypothesis.name}</div>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', overflowWrap: 'anywhere' }}>
          {hypothesis.related_plan_hypothesis} · invalidation: {hypothesis.invalidation_time_label}
        </div>
      </div>

      <details style={{ fontSize: '12px', color: '#555', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#333', padding: '6px 0', minHeight: '32px' }}>Method + criteria</summary>
        <div style={{ marginTop: '6px' }}>
          <div><strong>Method:</strong> {hypothesis.measurement_method}</div>
          <div style={{ marginTop: '4px' }}><strong>Validate if:</strong> {hypothesis.validate_if}</div>
          <div><strong>Invalidate if:</strong> {hypothesis.invalidate_if}</div>
          <div style={{ marginTop: '4px' }}><strong>Data:</strong> {hypothesis.data_dependencies.join(', ')}</div>
        </div>
      </details>

      <StatusPicker
        status={status}
        options={['todo', 'in_progress', 'confirmed', 'invalidated', 'partial']}
        onChange={(s) => onUpdate({ status: s })}
      />

      <div>
        <label style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
          Notes · {hypothesis.notes_prompt}
        </label>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if ((progress?.note ?? '') !== noteDraft) onUpdate({ note: noteDraft })
          }}
          rows={3}
          placeholder="What did you find? What surprised you?"
          style={{
            width: '100%', padding: '8px', border: '1px solid #e5e5e5',
            borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      </div>

      <div>
        <label style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
          Revised USD (leave blank to keep ${hypothesis.usd_per_month.toLocaleString()})
        </label>
        <input
          type="number"
          value={usdDraft}
          onChange={(e) => setUsdDraft(e.target.value)}
          onBlur={() => {
            const parsed = usdDraft === '' ? null : Number(usdDraft)
            const current = progress?.usd_adjusted ?? null
            if (parsed !== current) onUpdate({ usd_adjusted: parsed })
          }}
          placeholder={String(hypothesis.usd_per_month)}
          style={{
            width: '100%', padding: '8px 10px', border: '1px solid #e5e5e5',
            borderRadius: '8px', fontSize: '13px',
          }}
        />
      </div>
    </div>
  )
}

// ── Section: Day-by-day ──

// Shorten day labels on mobile: "Day 1 AM — Data onboarding + sanity check" → "Day 1 AM".
function shortDayLabel(label: string): string {
  const emDash = label.indexOf('—')
  if (emDash > 0) return label.slice(0, emDash).trim()
  const hyphen = label.indexOf(' - ')
  if (hyphen > 0) return label.slice(0, hyphen).trim()
  return label
}

function DayPicker({
  days, activeId, onChange, progress,
}: {
  days: FieldGuideDay[]
  activeId: string
  onChange: (id: string) => void
  progress: ProgressMap
}) {
  const isMobile = useIsMobile()
  return (
    <>
      <div style={{
        display: 'flex', gap: '4px', marginBottom: isMobile ? '4px' : '12px', overflowX: 'auto',
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        minWidth: 0, maxWidth: '100%',
      }}>
        {days.map(d => {
          const active = d.id === activeId
          // Count completed gates in this day
          const gateIds = [
            ...d.slots.map(s => s.gate?.id).filter(Boolean) as string[],
            ...d.end_of_day_gates.map(g => g.id),
          ]
          const done = gateIds.filter(id => {
            const r = progress.get(progressKey('slot_gate', id)) ?? progress.get(progressKey('eod_gate', id))
            return r && ['confirmed', 'partial', 'skipped'].includes(r.status)
          }).length
          const label = isMobile ? shortDayLabel(d.label) : d.label
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange(d.id)}
              style={{
                padding: isMobile ? '10px 10px' : '8px 14px', minHeight: '44px',
                background: active ? '#0F6E56' : '#fff',
                color: active ? '#fff' : '#333',
                border: `1.5px solid ${active ? '#0F6E56' : '#e5e5e5'}`,
                borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {label}
              {gateIds.length > 0 && (
                <span style={{ marginInlineStart: '6px', fontSize: '10px', opacity: 0.8 }}>
                  {done}/{gateIds.length}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {isMobile && days.length > 1 && (
        <div style={{
          fontSize: '10px', color: '#aaa', textAlign: 'center',
          marginBottom: '10px', letterSpacing: '.3px',
        }}>
          ← Scroll sideways →
        </div>
      )}
    </>
  )
}

function DayView({
  day, progress, onUpdate,
}: {
  day: FieldGuideDay
  progress: ProgressMap
  onUpdate: (itemType: string, itemId: string, patch: { status?: ProgressStatus; note?: string | null }) => void
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: '#888' }}>{day.date_placeholder}</div>
        <div style={{ fontSize: '14px', color: '#333', lineHeight: 1.5, marginTop: '4px', overflowWrap: 'anywhere' }}>{day.focus}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {day.slots.map((s, i) => (
          <div key={i} style={{
            background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
            minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word',
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 700, color: '#555', letterSpacing: '.3px',
                background: '#f4f4f4', padding: '2px 8px', borderRadius: '4px',
                whiteSpace: 'nowrap',
              }}>
                {s.start === s.end ? s.start : `${s.start} – ${s.end}`}
              </span>
              {s.refs && s.refs.length > 0 && (
                <span style={{ fontSize: '11px', color: '#888', overflowWrap: 'anywhere' }}>
                  → {s.refs.join(', ')}
                </span>
              )}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px', overflowWrap: 'anywhere' }}>{s.activity}</div>
            <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{s.purpose}</div>
            {s.gate && (
              <GateControl
                gate={s.gate}
                itemType="slot_gate"
                progress={progress.get(progressKey('slot_gate', s.gate.id))}
                onUpdate={(patch) => s.gate && onUpdate('slot_gate', s.gate.id, patch)}
              />
            )}
          </div>
        ))}
      </div>

      {day.end_of_day_gates.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#555', marginBottom: '6px' }}>
            End-of-day gates
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {day.end_of_day_gates.map(g => (
              <GateControl
                key={g.id}
                gate={g}
                itemType="eod_gate"
                progress={progress.get(progressKey('eod_gate', g.id))}
                onUpdate={(patch) => onUpdate('eod_gate', g.id, patch)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GateControl({
  gate, itemType, progress, onUpdate,
}: {
  gate: FieldGuideGate
  itemType: 'slot_gate' | 'eod_gate'
  progress: ProgressRow | undefined
  onUpdate: (patch: { status?: ProgressStatus; note?: string | null }) => void
}) {
  void itemType
  const [noteDraft, setNoteDraft] = useState(progress?.note ?? '')
  useEffect(() => { setNoteDraft(progress?.note ?? '') }, [progress?.note])
  const status = progress?.status ?? 'todo'

  return (
    <div style={{
      marginTop: '10px',
      background: status === 'confirmed' ? '#E1F5EE' : status === 'failed' ? '#FDEDEC' : '#f8f8f8',
      border: `1px solid ${statusBorderColor(status)}`,
      borderRadius: '8px', padding: '10px',
      minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.3px' }}>
        Gate
      </div>
      <div style={{ fontSize: '13px', color: '#333', lineHeight: 1.4, marginTop: '2px', overflowWrap: 'anywhere' }}>{gate.criterion}</div>
      <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.4, marginTop: '4px', fontStyle: 'italic', overflowWrap: 'anywhere' }}>
        If fail: {gate.fail_action}
      </div>

      <StatusPicker
        status={status}
        options={['todo', 'in_progress', 'confirmed', 'failed', 'skipped']}
        onChange={(s) => onUpdate({ status: s })}
      />

      {['in_progress', 'failed', 'skipped'].includes(status) && (
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => { if ((progress?.note ?? '') !== noteDraft) onUpdate({ note: noteDraft }) }}
          rows={2}
          placeholder={status === 'failed' ? 'What happened, what are you doing about it?' : 'Note'}
          style={{
            width: '100%', marginTop: '8px', padding: '8px',
            border: '1px solid #e5e5e5', borderRadius: '6px',
            fontSize: '12px', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      )}
    </div>
  )
}

// ── Section: Pre-arrival ──

function PreArrivalList({
  items, progress, onUpdate,
}: {
  items: FieldGuidePreArrival[]
  progress: ProgressMap
  onUpdate: (id: string, patch: { status?: ProgressStatus; note?: string | null }) => void
}) {
  const categories = ['data_request', 'logistics', 'packing', 'pre_reading'] as const
  const labels: Record<typeof categories[number], string> = {
    data_request: 'Data requests (sent to OMIX before arrival)',
    logistics: 'Travel logistics',
    packing: 'Packing',
    pre_reading: 'Pre-reading',
  }
  return (
    <div>
      {categories.map(cat => {
        const inCat = items.filter(i => i.category === cat)
        if (inCat.length === 0) return null
        return (
          <div key={cat} style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#555', marginBottom: '8px' }}>
              {labels[cat]}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {inCat.map(item => {
                const row = progress.get(progressKey('pre_arrival', item.id))
                const done = row?.status === 'confirmed' || row?.status === 'skipped'
                return (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      background: done ? '#E1F5EE' : '#fff',
                      border: `1px solid ${done ? '#A8D9C5' : '#e5e5e5'}`,
                      borderRadius: '8px', padding: '10px 12px', cursor: 'pointer',
                      minWidth: 0, minHeight: '44px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(e) => onUpdate(item.id, { status: e.target.checked ? 'confirmed' : 'todo' })}
                      style={{ width: '20px', height: '20px', marginTop: '2px', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: done ? '#0F6E56' : '#1a1a1a', overflowWrap: 'anywhere' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                        {item.detail}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Section: Interviews ──

function InterviewsList({
  interviews, progress, onUpdate,
}: {
  interviews: FieldGuideInterview[]
  progress: ProgressMap
  onUpdate: (id: string, patch: { status?: ProgressStatus; note?: string | null }) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {interviews.map(int => (
        <InterviewCard
          key={int.id}
          interview={int}
          progress={progress.get(progressKey('interview', int.id))}
          onUpdate={(patch) => onUpdate(int.id, patch)}
        />
      ))}
    </div>
  )
}

function InterviewCard({
  interview, progress, onUpdate,
}: {
  interview: FieldGuideInterview
  progress: ProgressRow | undefined
  onUpdate: (patch: { status?: ProgressStatus; note?: string | null }) => void
}) {
  const [noteDraft, setNoteDraft] = useState(progress?.note ?? '')
  useEffect(() => { setNoteDraft(progress?.note ?? '') }, [progress?.note])
  const status = progress?.status ?? 'todo'

  return (
    <div style={{
      background: '#fff', border: `1px solid ${statusBorderColor(status)}`, borderRadius: '12px', padding: '14px',
      minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word',
    }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a1a', overflowWrap: 'anywhere' }}>{interview.role}</div>
        <div style={{ fontSize: '11px', color: '#888' }}>{interview.when} · {interview.duration_min} min</div>
      </div>
      <div style={{ fontSize: '12px', color: '#555', marginTop: '6px', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
        <strong>Objective:</strong> {interview.objective}
      </div>
      <details style={{ marginTop: '8px', fontSize: '12px', overflowWrap: 'anywhere' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#333', padding: '6px 0', minHeight: '32px' }}>
          Questions ({interview.questions.length})
        </summary>
        <ol style={{ marginTop: '6px', paddingInlineStart: '18px', color: '#555', lineHeight: 1.5 }}>
          {interview.questions.map((q, i) => <li key={i} style={{ marginBottom: '4px' }}>{q}</li>)}
        </ol>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '6px', fontStyle: 'italic' }}>
          <strong>Hand-off:</strong> {interview.hand_off}
        </div>
      </details>

      <StatusPicker
        status={status}
        options={['todo', 'in_progress', 'confirmed', 'skipped']}
        onChange={(s) => onUpdate({ status: s })}
      />

      <textarea
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => { if ((progress?.note ?? '') !== noteDraft) onUpdate({ note: noteDraft }) }}
        rows={3}
        placeholder="Key quotes, insights, and things to follow up"
        style={{
          width: '100%', marginTop: '10px', padding: '8px',
          border: '1px solid #e5e5e5', borderRadius: '8px',
          fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
        }}
      />
    </div>
  )
}

// ── Section: Abort scenarios ──

function AbortList({
  scenarios, progress, onUpdate,
}: {
  scenarios: FieldGuide['abort_scenarios']
  progress: ProgressMap
  onUpdate: (id: string, patch: { status?: ProgressStatus; note?: string | null }) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px', lineHeight: 1.45 }}>
        Each scenario describes a failure mode and the recovery action. Mark a scenario as "triggered" if it happens on-site. Your note captures what you did about it.
      </div>
      {scenarios.map(s => (
        <AbortCard
          key={s.id}
          scenario={s}
          progress={progress.get(progressKey('abort', s.id))}
          onUpdate={(patch) => onUpdate(s.id, patch)}
        />
      ))}
    </div>
  )
}

function AbortCard({
  scenario, progress, onUpdate,
}: {
  scenario: FieldGuide['abort_scenarios'][number]
  progress: ProgressRow | undefined
  onUpdate: (patch: { status?: ProgressStatus; note?: string | null }) => void
}) {
  const [noteDraft, setNoteDraft] = useState(progress?.note ?? '')
  useEffect(() => { setNoteDraft(progress?.note ?? '') }, [progress?.note])
  const triggered = progress?.status === 'triggered'
  return (
    <div style={{
      background: triggered ? '#FDEDEC' : '#fff',
      border: `1px solid ${triggered ? '#E8A39B' : '#e5e5e5'}`,
      borderRadius: '12px', padding: '12px',
      minWidth: 0, overflowWrap: 'anywhere', wordBreak: 'break-word',
    }}>
      <div style={{ fontSize: '14px', fontWeight: 700, color: triggered ? '#8B3A2E' : '#1a1a1a', overflowWrap: 'anywhere' }}>
        {scenario.scenario}
      </div>
      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', overflowWrap: 'anywhere' }}>
        Check at: {scenario.if_triggered}
      </div>
      <div style={{ fontSize: '12px', color: '#555', marginTop: '6px', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
        <strong>Action:</strong> {scenario.action}
      </div>
      <StatusPicker
        status={progress?.status ?? 'todo'}
        options={['todo', 'triggered', 'skipped']}
        onChange={(st) => onUpdate({ status: st })}
      />
      {triggered && (
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => { if ((progress?.note ?? '') !== noteDraft) onUpdate({ note: noteDraft }) }}
          rows={2}
          placeholder="What happened, how you adapted"
          style={{
            width: '100%', marginTop: '8px', padding: '8px',
            border: '1px solid #e8a39b', borderRadius: '6px',
            fontSize: '12px', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
      )}
    </div>
  )
}

// ── Shared bits ──

function StatusPicker({
  status,
  options,
  onChange,
}: {
  status: ProgressStatus
  options: ProgressStatus[]
  onChange: (s: ProgressStatus) => void
}) {
  // Grid layout: responsive columns that pack evenly on narrow mobile viewports.
  // Avoids the ragged wrap of flex-wrap with variable-width buttons.
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
      gap: '6px', marginTop: '8px', minWidth: 0,
    }}>
      {options.map(opt => {
        const active = status === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              padding: '10px 8px', minHeight: '44px', minWidth: 0,
              background: active ? statusBgColor(opt) : '#fff',
              color: active ? statusFgColor(opt) : '#555',
              border: `1px solid ${active ? statusBorderColor(opt) : '#e5e5e5'}`,
              borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >{opt.replace('_', ' ')}</button>
        )
      })}
    </div>
  )
}

function statusBorderColor(status: ProgressStatus): string {
  if (status === 'confirmed') return '#A8D9C5'
  if (status === 'invalidated') return '#999'
  if (status === 'partial') return '#F1D79A'
  if (status === 'failed' || status === 'triggered') return '#E8A39B'
  if (status === 'in_progress') return '#0F6E56'
  if (status === 'skipped') return '#ddd'
  return '#e5e5e5'
}
function statusBgColor(status: ProgressStatus): string {
  if (status === 'confirmed') return '#E1F5EE'
  if (status === 'invalidated') return '#f4f4f4'
  if (status === 'partial') return '#FFF4D6'
  if (status === 'failed' || status === 'triggered') return '#FDEDEC'
  if (status === 'in_progress') return '#E1F5EE'
  if (status === 'skipped') return '#f4f4f4'
  return '#fff'
}
function statusFgColor(status: ProgressStatus): string {
  if (status === 'confirmed') return '#0F6E56'
  if (status === 'invalidated') return '#333'
  if (status === 'partial') return '#7a5a00'
  if (status === 'failed' || status === 'triggered') return '#8B3A2E'
  if (status === 'in_progress') return '#0F6E56'
  if (status === 'skipped') return '#555'
  return '#555'
}

function sectionTabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '10px 14px', minHeight: '44px',
    background: active ? '#0F6E56' : '#fff',
    color: active ? '#fff' : '#333',
    border: `1.5px solid ${active ? '#0F6E56' : '#e5e5e5'}`,
    borderRadius: '8px', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  }
}

function sectionTabBtnMobile(active: boolean): React.CSSProperties {
  return {
    padding: '10px 8px', minHeight: '44px', minWidth: 0,
    background: active ? '#0F6E56' : '#fff',
    color: active ? '#fff' : '#333',
    border: `1.5px solid ${active ? '#0F6E56' : '#e5e5e5'}`,
    borderRadius: '8px', fontSize: '13px', fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  }
}
