'use client'

/**
 * Interventions UI.
 *
 * Exports two components:
 *   - InterventionsEditor: full CRUD (list + add/edit form). Used as a
 *     sub-tab in Field Log. This is where the analyst logs when an
 *     operational change was made and the expected impact.
 *   - InterventionsList: read-only list for the Track dashboard.
 *
 * Data source: public.intervention_logs (RLS gives admin full access
 * and customer_members access to their plant's interventions).
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'

interface InterventionRow {
  id: string
  assessment_id: string
  plant_id: string
  intervention_date: string
  title: string
  description: string | null
  target_metric: string | null
  implemented_by: string | null
  created_at: string
}

const TARGET_METRIC_OPTIONS = [
  { value: '', label: 'Choose metric' },
  { value: 'tat', label: 'Turnaround (TAT)' },
  { value: 'dispatch', label: 'Dispatch time' },
  { value: 'reject_pct', label: 'Reject rate' },
  { value: 'deliveries_per_day', label: 'Deliveries per truck per day' },
  { value: 'site_wait', label: 'Site wait' },
  { value: 'loading', label: 'Loading time' },
  { value: 'other', label: 'Other' },
]

function labelForMetric(value: string | null): string {
  if (!value) return ''
  const match = TARGET_METRIC_OPTIONS.find(o => o.value === value)
  return match?.label ?? value
}

// ── Full editor (CRUD) for Field Log ──────────────────────────────────────

interface InterventionsEditorProps {
  assessmentId: string
  plantId: string
}

export function InterventionsEditor({ assessmentId, plantId }: InterventionsEditorProps) {
  const supabase = createClient()
  const { t } = useLogT()
  const [rows, setRows] = useState<InterventionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<InterventionRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('intervention_logs')
      .select('id, assessment_id, plant_id, intervention_date, title, description, target_metric, implemented_by, created_at')
      .eq('assessment_id', assessmentId)
      .order('intervention_date', { ascending: false })
    setRows((data ?? []) as InterventionRow[])
    setLoading(false)
  }, [supabase, assessmentId])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm(t('interv.delete_confirm'))) return
    await supabase.from('intervention_logs').delete().eq('id', id)
    await load()
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
            <Bilingual k="interv.title" />
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
            {t('interv.subtitle')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(null); setShowForm(true) }}
          style={{
            padding: '10px 16px', background: '#0F6E56', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', minHeight: '44px',
          }}
        >
          + <Bilingual k="interv.add" inline />
        </button>
      </div>

      {showForm && (
        <InterventionForm
          assessmentId={assessmentId}
          plantId={plantId}
          existing={editing}
          onSaved={() => { setShowForm(false); setEditing(null); load() }}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {loading && <div style={{ fontSize: '12px', color: '#888', padding: '10px' }}>{t('token.loading')}</div>}
      {!loading && rows.length === 0 && !showForm && (
        <div style={{
          padding: '24px', background: '#fafafa', border: '1px dashed #ddd',
          borderRadius: '10px', textAlign: 'center', color: '#888', fontSize: '13px',
        }}>
          <Bilingual k="interv.empty" />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map(row => (
          <div key={row.id} style={{
            background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px',
            padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
            alignItems: 'start', gap: '12px', flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                  {row.title}
                </span>
                {row.target_metric && (
                  <span style={{
                    padding: '2px 8px', background: '#E1F5EE', color: '#0F6E56',
                    borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '.3px',
                  }}>
                    {labelForMetric(row.target_metric)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: '#888', fontFamily: 'var(--mono)', marginBottom: '4px' }}>
                {new Date(row.intervention_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                {row.implemented_by && ` · ${row.implemented_by}`}
              </div>
              {row.description && (
                <div style={{ fontSize: '13px', color: '#555', lineHeight: 1.5, marginTop: '4px' }}>
                  {row.description}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => { setEditing(row); setShowForm(true) }}
                style={{
                  padding: '6px 10px', background: '#f5f5f5', color: '#333',
                  border: '1px solid #ddd', borderRadius: '6px', fontSize: '11px',
                  cursor: 'pointer', minHeight: '36px',
                }}
              >
                <Bilingual k="card.edit" inline />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(row.id)}
                style={{
                  padding: '6px 10px', background: '#fff', color: '#C0392B',
                  border: '1px solid #E8A39B', borderRadius: '6px', fontSize: '11px',
                  cursor: 'pointer', minHeight: '36px',
                }}
              >
                <Bilingual k="interv.delete" inline />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Add/edit form ─────────────────────────────────────────────────────────

interface InterventionFormProps {
  assessmentId: string
  plantId: string
  existing: InterventionRow | null
  onSaved: () => void
  onCancel: () => void
}

function InterventionForm({ assessmentId, plantId, existing, onSaved, onCancel }: InterventionFormProps) {
  const supabase = createClient()
  const { t } = useLogT()
  const today = new Date().toISOString().slice(0, 10)

  const [date, setDate] = useState(existing?.intervention_date ?? today)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [targetMetric, setTargetMetric] = useState(existing?.target_metric ?? '')
  const [implementedBy, setImplementedBy] = useState(existing?.implemented_by ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Translated metric options
  const metricOptions = [
    { value: '', label: t('interv.metric_choose') },
    { value: 'tat', label: t('interv.metric_tat') },
    { value: 'dispatch', label: t('interv.metric_dispatch') },
    { value: 'reject_pct', label: t('interv.metric_reject') },
    { value: 'deliveries_per_day', label: t('interv.metric_deliveries') },
    { value: 'site_wait', label: t('interv.metric_site_wait') },
    { value: 'loading', label: t('interv.metric_loading') },
    { value: 'other', label: t('interv.metric_other') },
  ]

  const handleSave = async () => {
    setError(null)
    if (!title.trim()) {
      setError(t('interv.title_required'))
      return
    }
    setSaving(true)
    const payload = {
      assessment_id: assessmentId,
      plant_id: plantId,
      intervention_date: date,
      title: title.trim(),
      target_metric: targetMetric || null,
      implemented_by: implementedBy.trim() || null,
      description: description.trim() || null,
    }
    const { error: err } = existing
      ? await supabase.from('intervention_logs').update(payload).eq('id', existing.id)
      : await supabase.from('intervention_logs').insert(payload)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '4px', display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit',
    minHeight: '44px', boxSizing: 'border-box',
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
      padding: '18px 20px', marginBottom: '16px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '12px' }}>
        {existing ? <Bilingual k="interv.edit" /> : <Bilingual k="interv.new" />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <div>
            <label style={labelStyle}><Bilingual k="interv.date" /></label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}><Bilingual k="interv.target_metric" /></label>
            <select value={targetMetric} onChange={e => setTargetMetric(e.target.value)} style={{ ...inputStyle, background: '#fff' }}>
              {metricOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}><Bilingual k="interv.title_label" /></label>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder={t('interv.title_placeholder')}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}><Bilingual k="interv.implemented_by" /></label>
          <input
            type="text" value={implementedBy} onChange={e => setImplementedBy(e.target.value)}
            placeholder={t('interv.implemented_by_placeholder')}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}><Bilingual k="interv.description_label" /></label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder={t('interv.description_placeholder')}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: '10px', padding: '8px 12px', background: '#FDEDEC',
          border: '1px solid #E8A39B', borderRadius: '8px', fontSize: '12px', color: '#8B3A2E',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 20px', background: '#0F6E56', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', minHeight: '44px',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? <Bilingual k="interv.saving" inline /> : existing ? <Bilingual k="interv.save_changes" inline /> : <Bilingual k="interv.add" inline />}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: '10px 20px', background: '#fff', color: '#555',
            border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px',
            cursor: 'pointer', minHeight: '44px',
          }}
        >
          <Bilingual k="interv.cancel" inline />
        </button>
      </div>
    </div>
  )
}

// ── Before/After impact calculation ───────────────────────────────────────

export interface WeeklyKpiEntry {
  week_number: number
  turnaround_min: number | null
  dispatch_min: number | null
  reject_pct: number | null
  logged_at: string
}

interface BeforeAfter {
  before: number | null
  after: number | null
  delta: number | null
  deltaPct: number | null
  direction: 'improved' | 'worsened' | 'flat' | 'insufficient'
  metricLabel: string
  unit: string
  weeksAfter: number
}

/** Compute before/after delta for a given intervention by comparing
 *  weekly entries on either side of the intervention_date. Uses up to 3
 *  weeks of data on each side. Direction is "improved" when the metric
 *  moves toward zero (lower is better for TAT, dispatch, reject_pct). */
function computeBeforeAfter(
  intervention: InterventionRow,
  entries: WeeklyKpiEntry[],
  trackingStartedAt: string | null,
): BeforeAfter {
  const metric = intervention.target_metric
  const key: keyof WeeklyKpiEntry | null =
    metric === 'tat' ? 'turnaround_min'
    : metric === 'dispatch' ? 'dispatch_min'
    : metric === 'reject_pct' ? 'reject_pct'
    : null

  const unit = metric === 'reject_pct' ? '%' : 'min'
  const label = labelForMetric(metric)

  if (!key || entries.length === 0 || !trackingStartedAt) {
    return { before: null, after: null, delta: null, deltaPct: null, direction: 'insufficient', metricLabel: label, unit, weeksAfter: 0 }
  }

  // Map intervention_date to a week number via tracking start
  const interventionMs = new Date(intervention.intervention_date).getTime()
  const startMs = new Date(trackingStartedAt).getTime()
  const interventionWeek = Math.max(1, Math.ceil((interventionMs - startMs) / 86_400_000 / 7))

  const toNum = (v: WeeklyKpiEntry[typeof key]): number | null =>
    typeof v === 'number' ? v : null

  const beforeValues = entries
    .filter(e => e.week_number < interventionWeek && e.week_number >= interventionWeek - 3)
    .map(e => toNum(e[key]))
    .filter((v): v is number => v !== null)

  const afterValues = entries
    .filter(e => e.week_number >= interventionWeek && e.week_number <= interventionWeek + 3)
    .map(e => toNum(e[key]))
    .filter((v): v is number => v !== null)

  if (beforeValues.length === 0 || afterValues.length === 0) {
    return { before: null, after: null, delta: null, deltaPct: null, direction: 'insufficient', metricLabel: label, unit, weeksAfter: afterValues.length }
  }

  const before = beforeValues.reduce((a, b) => a + b, 0) / beforeValues.length
  const after = afterValues.reduce((a, b) => a + b, 0) / afterValues.length
  const delta = after - before
  const deltaPct = before > 0 ? (delta / before) * 100 : null

  // Lower = better for all supported metrics (tat, dispatch, reject_pct).
  const threshold = 1  // min absolute change to avoid noise
  const direction: BeforeAfter['direction'] =
    Math.abs(delta) < threshold ? 'flat'
    : delta < 0 ? 'improved'
    : 'worsened'

  return { before, after, delta, deltaPct, direction, metricLabel: label, unit, weeksAfter: afterValues.length }
}

// ── Read-only list for Track dashboard ───────────────────────────────────

interface InterventionsListProps {
  assessmentId: string
}

export function InterventionsList({ assessmentId }: InterventionsListProps) {
  const supabase = createClient()
  const [rows, setRows] = useState<InterventionRow[]>([])
  const [entries, setEntries] = useState<WeeklyKpiEntry[]>([])
  const [trackingStartedAt, setTrackingStartedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Load interventions
      const { data: iv } = await supabase
        .from('intervention_logs')
        .select('id, assessment_id, plant_id, intervention_date, title, description, target_metric, implemented_by, created_at')
        .eq('assessment_id', assessmentId)
        .order('intervention_date', { ascending: false })
        .limit(20)
      setRows((iv ?? []) as InterventionRow[])

      // Load weekly KPI entries for before/after math
      const { data: cfg } = await supabase
        .from('tracking_configs')
        .select('id, started_at')
        .eq('assessment_id', assessmentId)
        .maybeSingle()

      if (cfg) {
        setTrackingStartedAt((cfg as { started_at: string }).started_at)
        const { data: en } = await supabase
          .from('tracking_entries')
          .select('week_number, turnaround_min, dispatch_min, reject_pct, logged_at')
          .eq('config_id', (cfg as { id: string }).id)
          .order('week_number', { ascending: true })
        setEntries((en ?? []) as WeeklyKpiEntry[])
      }

      setLoading(false)
    }
    load()
  }, [supabase, assessmentId])

  if (loading) return null
  if (rows.length === 0) {
    return (
      <div style={{
        marginTop: '16px', padding: '14px 16px',
        background: 'var(--gray-50)', border: '1px solid var(--border)',
        borderRadius: '10px', fontSize: '12px', color: 'var(--gray-500)',
      }}>
        No interventions logged yet. Log operational changes from the <strong>Log</strong> tab so tracking can show impact.
      </div>
    )
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>
        Interventions &amp; impact
      </div>
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: '10px', overflow: 'hidden',
      }}>
        {rows.map((row, i) => {
          const impact = computeBeforeAfter(row, entries, trackingStartedAt)
          return (
            <div key={row.id} style={{
              padding: '14px',
              borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'start',
                gap: '12px', flexWrap: 'wrap',
              }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)' }}>
                      {row.title}
                    </span>
                    {row.target_metric && (
                      <span style={{
                        padding: '2px 8px', background: '#E1F5EE',
                        color: '#0F6E56', borderRadius: '4px', fontSize: '10px',
                        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px',
                      }}>
                        {labelForMetric(row.target_metric)}
                      </span>
                    )}
                  </div>
                  {row.description && (
                    <div style={{ fontSize: '12px', color: 'var(--gray-600)', marginTop: '4px', lineHeight: 1.4 }}>
                      {row.description}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontFamily: 'var(--mono)', textAlign: 'right', flexShrink: 0 }}>
                  {new Date(row.intervention_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  {row.implemented_by && <div style={{ marginTop: '2px' }}>{row.implemented_by}</div>}
                </div>
              </div>

              {/* Impact strip: before vs after */}
              <ImpactStrip impact={impact} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Impact strip (before / after / delta) ────────────────────────────────
function ImpactStrip({ impact }: { impact: BeforeAfter }) {
  if (impact.direction === 'insufficient') {
    return (
      <div style={{
        marginTop: '10px', padding: '8px 12px', background: '#fafafa',
        border: '1px dashed #e0e0e0', borderRadius: '6px',
        fontSize: '11px', color: '#888',
      }}>
        {impact.weeksAfter === 0
          ? 'Waiting for post-intervention data to assess impact.'
          : 'Not enough weekly data yet to compute impact.'}
      </div>
    )
  }

  const color = impact.direction === 'improved' ? '#0F6E56'
    : impact.direction === 'worsened' ? '#C0392B'
    : '#B7950B'
  const bg = impact.direction === 'improved' ? '#E1F5EE'
    : impact.direction === 'worsened' ? '#FDEDEC'
    : '#FEF9E7'
  const border = impact.direction === 'improved' ? '#A8D9C5'
    : impact.direction === 'worsened' ? '#E8A39B'
    : '#F1D79A'
  const arrow = impact.direction === 'improved' ? '▼'
    : impact.direction === 'worsened' ? '▲'
    : '■'
  const verb = impact.direction === 'improved' ? 'improved'
    : impact.direction === 'worsened' ? 'worsened'
    : 'unchanged'

  const before = impact.before != null ? `${impact.before.toFixed(1)}${impact.unit}` : '-'
  const after = impact.after != null ? `${impact.after.toFixed(1)}${impact.unit}` : '-'
  const delta = impact.delta != null
    ? `${impact.delta > 0 ? '+' : ''}${impact.delta.toFixed(1)}${impact.unit}`
    : '-'
  const deltaPct = impact.deltaPct != null
    ? ` (${impact.deltaPct > 0 ? '+' : ''}${impact.deltaPct.toFixed(0)}%)`
    : ''

  return (
    <div style={{
      marginTop: '10px', padding: '10px 12px', background: bg,
      border: `1px solid ${border}`, borderRadius: '8px',
      display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap',
      fontSize: '12px',
    }}>
      <div>
        <div style={{ fontSize: '9px', color: '#888', fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase' }}>
          Before (3w avg)
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: '#333' }}>{before}</div>
      </div>
      <div style={{ color: '#888' }}>→</div>
      <div>
        <div style={{ fontSize: '9px', color: '#888', fontWeight: 700, letterSpacing: '.3px', textTransform: 'uppercase' }}>
          After (3w avg)
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: '#333' }}>{after}</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color, fontSize: '11px', fontWeight: 700 }}>{arrow}</span>
        <span style={{
          color, fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '13px',
        }}>
          {delta}{deltaPct}
        </span>
        <span style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>
          {impact.metricLabel} {verb}
        </span>
      </div>
    </div>
  )
}
