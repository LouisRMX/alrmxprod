'use client'

/**
 * Field Log To-do list.
 *
 * Each to-do is a target (e.g. "40 complete trips by Friday") that
 * reads its progress live from daily_logs using a named metric.
 * Progress counts are computed between the to-do's created_at and
 * target_date so new targets don't retroactively include old data.
 *
 * Data source: public.fieldlog_todos (RLS follows the intervention_logs
 * pattern — admin full access, customer members scoped to their plant).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'
import type { LogStringKey } from '@/lib/i18n/log-catalog'

type TodoMetric = 'trips_complete' | 'loads_delivered' | 'rejected_loads'

const METRIC_VALUES: TodoMetric[] = ['trips_complete', 'loads_delivered', 'rejected_loads']

// Accept both machine keys and human labels in uploaded files
const METRIC_ALIASES: Record<string, TodoMetric> = {
  'trips_complete': 'trips_complete',
  'complete trips': 'trips_complete',
  'complete': 'trips_complete',
  'trips': 'trips_complete',
  'loads_delivered': 'loads_delivered',
  'loads delivered': 'loads_delivered',
  'delivered': 'loads_delivered',
  'loads': 'loads_delivered',
  'rejected_loads': 'rejected_loads',
  'rejected loads': 'rejected_loads',
  'rejected': 'rejected_loads',
  'rejects': 'rejected_loads',
}

interface ParsedRow {
  rowNum: number
  title: string
  target_count: number
  target_date: string
  metric: TodoMetric
  error: string | null
}

interface TodoRow {
  id: string
  assessment_id: string
  plant_id: string
  title: string
  target_count: number
  target_date: string
  metric: TodoMetric
  created_at: string
}

interface Props {
  assessmentId: string
  plantId: string
}

export default function ToDoEditor({ assessmentId, plantId }: Props) {
  const supabase = createClient()
  const { t } = useLogT()
  const [rows, setRows] = useState<TodoRow[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TodoRow | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)

    const { data } = await supabase
      .from('fieldlog_todos')
      .select('id, assessment_id, plant_id, title, target_count, target_date, metric, created_at')
      .eq('assessment_id', assessmentId)
      .order('target_date', { ascending: true })

    const todos = (data ?? []) as TodoRow[]
    setRows(todos)

    // Compute progress for each todo in parallel
    const progressEntries = await Promise.all(
      todos.map(async todo => {
        const startDate = todo.created_at.slice(0, 10)
        const endDate = todo.target_date

        let query = supabase
          .from('daily_logs')
          .select('id', { count: 'exact', head: true })
          .eq('assessment_id', assessmentId)
          .gte('log_date', startDate)
          .lte('log_date', endDate)

        if (todo.metric === 'trips_complete') {
          query = query.not('arrival_plant', 'is', null).eq('rejected', false)
        } else if (todo.metric === 'loads_delivered') {
          query = query.not('discharge_end', 'is', null).eq('rejected', false)
        } else if (todo.metric === 'rejected_loads') {
          query = query.eq('rejected', true)
        }

        const { count } = await query
        return [todo.id, count ?? 0] as const
      })
    )
    setProgressMap(Object.fromEntries(progressEntries))
    setLoading(false)
  }, [supabase, assessmentId])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm(t('todo.delete_confirm'))) return
    await supabase.from('fieldlog_todos').delete().eq('id', id)
    await load()
  }

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    setParsedRows(raw.map((r, i) => validateRow(r, i + 2, t)))
  }

  const handleImport = async () => {
    if (!parsedRows) return
    const valid = parsedRows.filter(r => !r.error)
    if (valid.length === 0) return
    setImporting(true)
    const payload = valid.map(r => ({
      assessment_id: assessmentId,
      plant_id: plantId,
      title: r.title,
      target_count: r.target_count,
      target_date: r.target_date,
      metric: r.metric,
    }))
    await supabase.from('fieldlog_todos').insert(payload)
    setImporting(false)
    setParsedRows(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await load()
  }

  const handleDownloadTemplate = () => {
    const csv = [
      'title,target_count,target_date,metric',
      'Measure 40 complete trips,40,2026-04-27,trips_complete',
      '50 loads delivered,50,2026-04-25,loads_delivered',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'todos-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px', marginBottom: '14px',
      }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
            <Bilingual k="todo.title" />
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
            {t('todo.subtitle')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '10px 14px', background: '#fff', color: '#0F6E56',
              border: '1.5px solid #0F6E56', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: '44px',
            }}
          >
            📥 <Bilingual k="todo.upload" inline />
          </button>
          <button
            type="button"
            onClick={() => { setEditing(null); setShowForm(true) }}
            style={{
              padding: '10px 16px', background: '#0F6E56', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', minHeight: '44px',
            }}
          >
            + <Bilingual k="todo.add" inline />
          </button>
        </div>
      </div>

      {parsedRows && (
        <ImportPreview
          rows={parsedRows}
          importing={importing}
          onImport={handleImport}
          onCancel={() => {
            setParsedRows(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
          onDownloadTemplate={handleDownloadTemplate}
        />
      )}

      {!parsedRows && (
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
          {t('todo.upload_hint')} ·{' '}
          <button
            type="button"
            onClick={handleDownloadTemplate}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: '#0F6E56', textDecoration: 'underline', cursor: 'pointer',
              font: 'inherit',
            }}
          >
            {t('todo.download_template')}
          </button>
        </div>
      )}

      {showForm && (
        <ToDoForm
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
          <Bilingual k="todo.empty" />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map(row => (
          <ToDoCard
            key={row.id}
            row={row}
            progress={progressMap[row.id] ?? 0}
            onEdit={() => { setEditing(row); setShowForm(true) }}
            onDelete={() => handleDelete(row.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── To-do card with progress bar ────────────────────────────────────────

interface CardProps {
  row: TodoRow
  progress: number
  onEdit: () => void
  onDelete: () => void
}

function ToDoCard({ row, progress, onEdit, onDelete }: CardProps) {
  const { t } = useLogT()
  const percent = Math.min(100, Math.round((progress / row.target_count) * 100))
  const isComplete = progress >= row.target_count

  const today = new Date().toISOString().slice(0, 10)
  const diffDays = Math.round(
    (new Date(row.target_date).getTime() - new Date(today).getTime()) / 86_400_000
  )
  const isOverdue = diffDays < 0 && !isComplete

  // Colour: complete > overdue > on-track
  const barColor = isComplete ? '#0F6E56' : isOverdue ? '#C0392B' : '#2E86C1'
  const barBg = isComplete ? '#E1F5EE' : isOverdue ? '#FDEDEC' : '#E8F1FA'
  const barBorder = isComplete ? '#A8D9C5' : isOverdue ? '#E8A39B' : '#AED0E8'

  const metricLabel = t(`todo.metric_${row.metric}` as LogStringKey)

  const daysLabel = isComplete
    ? null
    : isOverdue
      ? t('todo.days_overdue').replace('{n}', String(Math.abs(diffDays)))
      : t('todo.days_left').replace('{n}', String(diffDays))

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px',
      padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'start',
        gap: '12px', flexWrap: 'wrap', marginBottom: '10px',
      }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
              {row.title}
            </span>
            <span style={{
              padding: '2px 8px', background: '#E1F5EE', color: '#0F6E56',
              borderRadius: '4px', fontSize: '10px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '.3px',
            }}>
              {metricLabel}
            </span>
            {isComplete && (
              <span style={{
                padding: '2px 8px', background: '#0F6E56', color: '#fff',
                borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '.3px',
              }}>
                ✓ <Bilingual k="todo.complete_badge" inline />
              </span>
            )}
            {isOverdue && (
              <span style={{
                padding: '2px 8px', background: '#C0392B', color: '#fff',
                borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '.3px',
              }}>
                <Bilingual k="todo.overdue_badge" inline />
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: '#888', fontFamily: 'var(--mono)' }}>
            {new Date(row.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            {daysLabel && ` · ${daysLabel}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onEdit}
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
            onClick={onDelete}
            style={{
              padding: '6px 10px', background: '#fff', color: '#C0392B',
              border: '1px solid #E8A39B', borderRadius: '6px', fontSize: '11px',
              cursor: 'pointer', minHeight: '36px',
            }}
          >
            <Bilingual k="todo.delete" inline />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        padding: '10px 12px', background: barBg,
        border: `1px solid ${barBorder}`, borderRadius: '8px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '6px', fontSize: '12px',
        }}>
          <span style={{ color: barColor, fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px' }}>
            {progress}/{row.target_count}
          </span>
          <span style={{ color: barColor, fontFamily: 'var(--mono)', fontWeight: 600 }}>
            {percent}%
          </span>
        </div>
        <div style={{
          height: '8px', background: '#fff', borderRadius: '4px', overflow: 'hidden',
          border: `1px solid ${barBorder}`,
        }}>
          <div style={{
            height: '100%', width: `${percent}%`, background: barColor,
            transition: 'width 240ms ease',
          }} />
        </div>
        <div style={{ fontSize: '10px', color: '#888', marginTop: '6px', fontStyle: 'italic' }}>
          {t('todo.progress_live')}
        </div>
      </div>
    </div>
  )
}

// ── Add/edit form ───────────────────────────────────────────────────────

interface FormProps {
  assessmentId: string
  plantId: string
  existing: TodoRow | null
  onSaved: () => void
  onCancel: () => void
}

function ToDoForm({ assessmentId, plantId, existing, onSaved, onCancel }: FormProps) {
  const supabase = createClient()
  const { t } = useLogT()

  const today = new Date().toISOString().slice(0, 10)
  const oneWeekFromNow = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

  const [title, setTitle] = useState(existing?.title ?? '')
  const [targetCount, setTargetCount] = useState<number>(existing?.target_count ?? 40)
  const [targetDate, setTargetDate] = useState(existing?.target_date ?? oneWeekFromNow)
  const [metric, setMetric] = useState<TodoMetric>(existing?.metric ?? 'trips_complete')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setError(null)
    if (!title.trim()) {
      setError(t('todo.title_required'))
      return
    }
    if (!targetCount || targetCount < 1) return
    setSaving(true)

    const payload = {
      assessment_id: assessmentId,
      plant_id: plantId,
      title: title.trim(),
      target_count: targetCount,
      target_date: targetDate,
      metric,
      updated_at: new Date().toISOString(),
    }

    const { error: err } = existing
      ? await supabase.from('fieldlog_todos').update(payload).eq('id', existing.id)
      : await supabase.from('fieldlog_todos').insert(payload)

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: '#666',
    textTransform: 'uppercase', letterSpacing: '.3px',
    marginBottom: '4px', display: 'block',
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
        {existing ? <Bilingual k="todo.edit" /> : <Bilingual k="todo.new" />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}><Bilingual k="todo.title_label" /></label>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder={t('todo.title_placeholder')}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div>
            <label style={labelStyle}><Bilingual k="todo.target_count_label" /></label>
            <input
              type="number" min={1} value={targetCount}
              onChange={e => setTargetCount(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}><Bilingual k="todo.target_date_label" /></label>
            <input
              type="date" value={targetDate} min={today}
              onChange={e => setTargetDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}><Bilingual k="todo.metric_label" /></label>
            <select
              value={metric}
              onChange={e => setMetric(e.target.value as TodoMetric)}
              style={{ ...inputStyle, background: '#fff' }}
            >
              {METRIC_VALUES.map(m => (
                <option key={m} value={m}>
                  {t(`todo.metric_${m}` as LogStringKey)}
                </option>
              ))}
            </select>
          </div>
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
          {saving ? <Bilingual k="todo.saving" inline /> : existing ? <Bilingual k="todo.save_changes" inline /> : <Bilingual k="todo.add" inline />}
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
          <Bilingual k="todo.cancel" inline />
        </button>
      </div>
    </div>
  )
}

// ── Bulk upload helpers ─────────────────────────────────────────────────

type TFn = (k: LogStringKey) => string

function validateRow(raw: Record<string, unknown>, rowNum: number, t: TFn): ParsedRow {
  const title = String(raw.title ?? '').trim()
  const countRaw = raw.target_count
  const target_count = typeof countRaw === 'number' ? countRaw : parseInt(String(countRaw ?? ''), 10)
  const target_date = normaliseDate(raw.target_date)
  const metricRaw = String(raw.metric ?? 'trips_complete').trim().toLowerCase()
  const metric = METRIC_ALIASES[metricRaw] ?? null

  let error: string | null = null
  if (!title) error = t('todo.err_missing_title')
  else if (!Number.isFinite(target_count) || target_count < 1) error = t('todo.err_invalid_count')
  else if (!target_date) error = t('todo.err_invalid_date')
  else if (!metric) error = t('todo.err_unknown_metric')

  return {
    rowNum,
    title,
    target_count: Number.isFinite(target_count) ? target_count : 0,
    target_date: target_date ?? '',
    metric: metric ?? 'trips_complete',
    error,
  }
}

function normaliseDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  const str = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const parsed = new Date(str)
  if (isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

// ── Import preview panel ────────────────────────────────────────────────

interface PreviewProps {
  rows: ParsedRow[]
  importing: boolean
  onImport: () => void
  onCancel: () => void
  onDownloadTemplate: () => void
}

function ImportPreview({ rows, importing, onImport, onCancel, onDownloadTemplate }: PreviewProps) {
  const { t } = useLogT()
  const validCount = rows.filter(r => !r.error).length
  const errorCount = rows.length - validCount

  const headerText = t('todo.preview_header')
    .replace('{valid}', String(validCount))
    .replace('{errors}', String(errorCount))

  const importLabel = importing
    ? t('todo.importing')
    : t('todo.import_button').replace('{n}', String(validCount))

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
      padding: '18px 20px', marginBottom: '16px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '12px', flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
          {headerText}
        </div>
        <button
          type="button"
          onClick={onDownloadTemplate}
          style={{
            background: 'none', border: 'none', padding: 0,
            color: '#0F6E56', textDecoration: 'underline', cursor: 'pointer',
            fontSize: '11px',
          }}
        >
          {t('todo.download_template')}
        </button>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: '4px',
        maxHeight: '320px', overflowY: 'auto',
        border: '1px solid #eee', borderRadius: '8px', padding: '8px',
        marginBottom: '12px',
      }}>
        {rows.map(r => (
          <div key={r.rowNum} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 8px', borderRadius: '6px',
            background: r.error ? '#FDEDEC' : '#F4F9F7',
            fontSize: '12px',
          }}>
            <span style={{
              color: r.error ? '#C0392B' : '#0F6E56',
              fontWeight: 700, fontFamily: 'var(--mono)', minWidth: '20px',
            }}>
              {r.error ? '✗' : '✓'}
            </span>
            <span style={{ fontSize: '10px', color: '#888', minWidth: '30px', fontFamily: 'var(--mono)' }}>
              #{r.rowNum}
            </span>
            {r.error ? (
              <span style={{ color: '#8B3A2E' }}>{r.error}</span>
            ) : (
              <span style={{ color: '#333' }}>
                {r.title} · {r.target_count} · {r.target_date} · {r.metric}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onImport}
          disabled={importing || validCount === 0}
          style={{
            padding: '10px 20px', background: '#0F6E56', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
            cursor: importing || validCount === 0 ? 'not-allowed' : 'pointer',
            minHeight: '44px',
            opacity: importing || validCount === 0 ? 0.5 : 1,
          }}
        >
          {importLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={importing}
          style={{
            padding: '10px 20px', background: '#fff', color: '#555',
            border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px',
            cursor: 'pointer', minHeight: '44px',
          }}
        >
          {t('todo.cancel')}
        </button>
      </div>
    </div>
  )
}
