'use client'

/**
 * Review queue for flagged outlier trips.
 *
 * Uses the get_outliers_for_review RPC which returns trips that are:
 *   - Auto-flagged by the DB trigger (total TAT > 5h hard ceiling), or
 *   - Statistical outliers (Q3 + 3×IQR, for weeks with >= 10 trips), or
 *   - Previously reviewed (shown for audit)
 *
 * Each flagged row gets Include / Exclude buttons. Analyst's decision
 * updates review_status which flows through the weekly aggregation RPC.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface OutlierRow {
  id: string
  log_date: string
  truck_id: string | null
  driver_name: string | null
  site_name: string | null
  measurer_name: string | null
  origin_plant: string | null
  total_tat_min: number | null
  plant_queue_min: number | null
  loading_min: number | null
  transit_out_min: number | null
  site_wait_min: number | null
  pouring_min: number | null
  washout_min: number | null
  transit_back_min: number | null
  load_m3: number | null
  rejected: boolean
  reject_cause: string | null
  notes: string | null
  stage_notes: Record<string, string> | null
  is_partial: boolean | null
  review_status: 'normal' | 'flagged' | 'reviewed_include' | 'reviewed_exclude'
  review_note: string | null
  reviewed_at: string | null
  flag_reason: string
  week_number: number
}

interface Props {
  assessmentId: string
}

export default function ReviewQueue({ assessmentId }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<OutlierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.rpc('get_outliers_for_review', {
      p_assessment_id: assessmentId,
    })
    setRows((data ?? []) as OutlierRow[])
    setLoading(false)
  }, [supabase, assessmentId])

  useEffect(() => { load() }, [load])

  const act = async (id: string, status: 'reviewed_include' | 'reviewed_exclude', note?: string) => {
    await supabase
      .from('daily_logs')
      .update({
        review_status: status,
        review_note: note ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
    await load()
  }

  const pending = rows.filter(r => r.review_status === 'flagged' || r.review_status === 'normal')
  const reviewed = rows.filter(r => r.review_status === 'reviewed_include' || r.review_status === 'reviewed_exclude')
  const visible = filter === 'pending' ? pending : rows

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
            Review queue
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px', lineHeight: 1.4 }}>
            Trips flagged as outliers are excluded from weekly aggregates until reviewed.
            Include if the trip is real, Exclude if it&apos;s observer error or one-off breakdown.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: '#f4f4f4', padding: '3px', borderRadius: '8px' }}>
          {(['pending', 'all'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', background: filter === f ? '#fff' : 'transparent',
                border: 'none', borderRadius: '6px',
                fontSize: '12px', fontWeight: 600,
                color: filter === f ? '#1a1a1a' : '#666',
                cursor: 'pointer',
                boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}
            >
              {f === 'pending' ? `Pending (${pending.length})` : `All (${rows.length})`}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ fontSize: '12px', color: '#888', padding: '10px' }}>Loading...</div>}
      {!loading && visible.length === 0 && (
        <div style={{
          padding: '32px 16px', background: '#fafafa', border: '1px dashed #ddd',
          borderRadius: '10px', textAlign: 'center', color: '#888', fontSize: '13px',
        }}>
          {filter === 'pending'
            ? 'No trips awaiting review. Any outlier detected by the system will appear here.'
            : 'No outliers detected yet.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visible.map(row => <OutlierCard key={row.id} row={row} onAct={act} reviewedCount={reviewed.length} />)}
      </div>
    </div>
  )
}

function OutlierCard({ row, onAct }: {
  row: OutlierRow
  onAct: (id: string, status: 'reviewed_include' | 'reviewed_exclude', note?: string) => Promise<void>
  reviewedCount: number
}) {
  const [note, setNote] = useState('')
  const [acting, setActing] = useState<'include' | 'exclude' | null>(null)

  const isReviewed = row.review_status === 'reviewed_include' || row.review_status === 'reviewed_exclude'
  const statusLabel = row.review_status === 'reviewed_include'
    ? 'Included' : row.review_status === 'reviewed_exclude'
    ? 'Excluded' : row.review_status === 'flagged'
    ? 'Auto-flagged' : 'Statistical outlier'
  const statusColor = row.review_status === 'reviewed_include'
    ? '#0F6E56' : row.review_status === 'reviewed_exclude'
    ? '#888' : '#B7950B'

  const stageBreakdown = (label: string, val: number | null) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{
        fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
        color: val != null ? '#333' : '#ccc',
        fontWeight: 500,
      }}>
        {val != null ? `${val.toFixed(0)} min` : '-'}
      </span>
    </div>
  )

  const handleInclude = async () => {
    setActing('include')
    await onAct(row.id, 'reviewed_include', note.trim() || undefined)
    setActing(null)
  }
  const handleExclude = async () => {
    setActing('exclude')
    await onAct(row.id, 'reviewed_exclude', note.trim() || undefined)
    setActing(null)
  }

  return (
    <div style={{
      background: '#fff', border: `1px solid ${isReviewed ? '#e5e5e5' : '#F1D79A'}`,
      borderRadius: '10px', padding: '14px 16px',
      opacity: isReviewed ? 0.85 : 1,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
              {row.truck_id ? `Truck ${row.truck_id}` : 'Unknown truck'}
            </span>
            <span style={{
              padding: '2px 8px', background: statusColor + '22',
              color: statusColor, borderRadius: '4px', fontSize: '10px',
              fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px',
            }}>
              {statusLabel}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#888', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
            {new Date(row.log_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' · Week ' + row.week_number}
            {row.measurer_name && ` · ${row.measurer_name}`}
            {row.site_name && ` · ${row.site_name}`}
          </div>
          <div style={{ fontSize: '11px', color: statusColor, marginTop: '6px', lineHeight: 1.4 }}>
            {row.flag_reason}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' }}>
            Total TAT
          </div>
          <div style={{
            fontSize: '20px', fontWeight: 700, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            color: '#C0392B',
          }}>
            {row.total_tat_min != null ? `${row.total_tat_min.toFixed(0)} min` : '-'}
          </div>
        </div>
      </div>

      {/* Stage breakdown */}
      <div style={{
        background: '#fafafa', borderRadius: '8px', padding: '10px 12px',
        marginBottom: isReviewed ? 0 : '12px',
      }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>
          Stage breakdown
        </div>
        {stageBreakdown('Plant queue', row.plant_queue_min)}
        {stageBreakdown('Loading', row.loading_min)}
        {stageBreakdown('Transit out', row.transit_out_min)}
        {stageBreakdown('Site wait', row.site_wait_min)}
        {stageBreakdown('Pouring', row.pouring_min)}
        {stageBreakdown('Washout', row.washout_min)}
        {stageBreakdown('Transit back', row.transit_back_min)}
      </div>

      {row.notes && (
        <div style={{ fontSize: '12px', color: '#555', marginTop: '10px', lineHeight: 1.5 }}>
          <strong>Observer notes:</strong> {row.notes}
        </div>
      )}

      {/* Review actions (only if not already reviewed) */}
      {!isReviewed && (
        <div style={{ marginTop: '12px' }}>
          <label style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
            Reason (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Pump truck broke down, waited for replacement"
            style={{
              width: '100%', padding: '8px 10px',
              border: '1px solid #ddd', borderRadius: '8px',
              fontSize: '13px', minHeight: '40px', marginBottom: '10px',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleInclude}
              disabled={acting !== null}
              style={{
                flex: '1 1 140px', padding: '10px 16px',
                background: '#fff', color: '#0F6E56',
                border: '1px solid #0F6E56', borderRadius: '8px',
                fontSize: '13px', fontWeight: 600,
                cursor: acting ? 'not-allowed' : 'pointer', minHeight: '44px',
              }}
            >
              {acting === 'include' ? 'Including...' : 'Include in dataset'}
            </button>
            <button
              type="button"
              onClick={handleExclude}
              disabled={acting !== null}
              style={{
                flex: '1 1 140px', padding: '10px 16px',
                background: '#C0392B', color: '#fff',
                border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: 600,
                cursor: acting ? 'not-allowed' : 'pointer', minHeight: '44px',
              }}
            >
              {acting === 'exclude' ? 'Excluding...' : 'Confirm exclude'}
            </button>
          </div>
        </div>
      )}

      {isReviewed && row.review_note && (
        <div style={{ fontSize: '11px', color: '#888', marginTop: '8px', fontStyle: 'italic' }}>
          Note: {row.review_note}
        </div>
      )}
    </div>
  )
}
