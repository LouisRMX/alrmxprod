'use client'

import type { DailyLogRow } from '@/lib/fieldlog/types'
import { createClient } from '@/lib/supabase/client'

function fmtTime(ts: string | null): string {
  if (!ts) return '-'
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return '-' }
}

function calcTat(dep: string | null, arr: string | null): string {
  if (!dep || !arr) return '-'
  const diff = (new Date(arr).getTime() - new Date(dep).getTime()) / 60000
  if (diff <= 0 || diff > 600) return '-'
  return `${Math.round(diff)} min`
}

interface TripTableProps {
  trips: DailyLogRow[]
  isAdmin?: boolean
  onDelete?: (id: string) => void
}

export default function TripTable({ trips, isAdmin, onDelete }: TripTableProps) {
  if (trips.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: '#aaa', fontSize: '13px' }}>
        No trips logged for this date.
      </div>
    )
  }

  const supabase = createClient()

  async function handleDelete(id: string) {
    if (!confirm('Delete this trip entry?')) return
    await supabase.from('daily_logs').delete().eq('id', id)
    onDelete?.(id)
  }

  const th: React.CSSProperties = {
    fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase',
    letterSpacing: '.04em', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #eee',
    whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    fontSize: '13px', padding: '7px 8px', borderBottom: '1px solid #f5f5f5',
    whiteSpace: 'nowrap', color: '#333',
  }

  return (
    <div style={{
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>Truck</th>
            <th style={th}>Site type</th>
            <th style={th}>Depart</th>
            <th style={th}>Arrive</th>
            <th style={th}>Disch.</th>
            <th style={th}>Return</th>
            <th style={th}>TAT</th>
            <th style={th}>m³</th>
            <th style={th}>Rej</th>
            <th style={th}>Notes</th>
            {isAdmin && <th style={th}></th>}
          </tr>
        </thead>
        <tbody>
          {trips.map((t, i) => (
            <tr key={t.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ ...td, color: '#aaa' }}>{i + 1}</td>
              <td style={{ ...td, fontWeight: 500 }}>{t.truck_id || '-'}</td>
              <td style={td}>
                {t.site_type && t.site_type !== 'unknown' ? (
                  <span style={{
                    padding: '2px 6px', background: '#E8F1FA', color: '#2E5C8A',
                    borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                  }}>
                    {t.site_type === 'ground_pour' ? 'Ground' : t.site_type === 'high_rise' ? 'High rise' : 'Infra'}
                  </span>
                ) : <span style={{ color: '#ccc' }}>-</span>}
              </td>
              <td style={td}>{fmtTime(t.departure_loaded)}</td>
              <td style={td}>{fmtTime(t.arrival_site)}</td>
              <td style={td}>{fmtTime(t.discharge_start)}</td>
              <td style={td}>{fmtTime(t.arrival_plant)}</td>
              <td style={{ ...td, fontWeight: 600, color: '#0F6E56' }}>{calcTat(t.departure_loaded, t.arrival_plant)}</td>
              <td style={td}>{t.load_m3 ?? '-'}</td>
              <td style={td}>{t.rejected ? '✕' : ''}</td>
              <td style={{ ...td, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', color: '#888', fontSize: '11px' }}>
                {t.notes || ''}
              </td>
              {isAdmin && (
                <td style={td}>
                  <button type="button" onClick={() => handleDelete(t.id)}
                    style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '14px', padding: '2px' }}
                    title="Delete">×</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
