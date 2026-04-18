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
    if (!confirm('Delete this intervention?')) return
    await supabase.from('intervention_logs').delete().eq('id', id)
    await load()
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
            Interventions
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
            Log when operational changes are made so tracking can attribute impact.
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
          + Add intervention
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

      {loading && <div style={{ fontSize: '12px', color: '#888', padding: '10px' }}>Loading…</div>}
      {!loading && rows.length === 0 && !showForm && (
        <div style={{
          padding: '24px', background: '#fafafa', border: '1px dashed #ddd',
          borderRadius: '10px', textAlign: 'center', color: '#888', fontSize: '13px',
        }}>
          No interventions logged yet. Add the first one when a change is implemented.
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
                Edit
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
                Delete
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
  const today = new Date().toISOString().slice(0, 10)

  const [date, setDate] = useState(existing?.intervention_date ?? today)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [targetMetric, setTargetMetric] = useState(existing?.target_metric ?? '')
  const [implementedBy, setImplementedBy] = useState(existing?.implemented_by ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)
    if (!title.trim()) {
      setError('Title is required')
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
        {existing ? 'Edit intervention' : 'New intervention'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Target metric</label>
            <select value={targetMetric} onChange={e => setTargetMetric(e.target.value)} style={{ ...inputStyle, background: '#fff' }}>
              {TARGET_METRIC_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Title</label>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Tightened dispatch window from 25 to 15 min"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Implemented by</label>
          <input
            type="text" value={implementedBy} onChange={e => setImplementedBy(e.target.value)}
            placeholder="Name or role"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Description / expected impact</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What changed and what impact is expected (e.g. Expected: -10 min TAT by week 4)"
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
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Add intervention'}
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
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Read-only list for Track dashboard ───────────────────────────────────

interface InterventionsListProps {
  assessmentId: string
}

export function InterventionsList({ assessmentId }: InterventionsListProps) {
  const supabase = createClient()
  const [rows, setRows] = useState<InterventionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('intervention_logs')
        .select('id, assessment_id, plant_id, intervention_date, title, description, target_metric, implemented_by, created_at')
        .eq('assessment_id', assessmentId)
        .order('intervention_date', { ascending: false })
        .limit(20)
      setRows((data ?? []) as InterventionRow[])
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
        Interventions
      </div>
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: '10px', overflow: 'hidden',
      }}>
        {rows.map((row, i) => (
          <div key={row.id} style={{
            padding: '12px 14px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
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
                    padding: '2px 8px', background: 'var(--green-light, #E1F5EE)',
                    color: 'var(--green)', borderRadius: '4px', fontSize: '10px',
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
        ))}
      </div>
    </div>
  )
}
