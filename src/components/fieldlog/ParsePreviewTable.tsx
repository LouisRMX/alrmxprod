'use client'

import type { DailyLogRow } from '@/lib/fieldlog/types'

type PartialTrip = Partial<DailyLogRow> & { _idx: number }

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

interface ParsePreviewTableProps {
  rows: PartialTrip[]
  onRowChange: (idx: number, field: string, value: string) => void
  onRowDelete: (idx: number) => void
  onApprove: () => void
  onCancel: () => void
  saving?: boolean
}

export default function ParsePreviewTable({ rows, onRowChange, onRowDelete, onApprove, onCancel, saving }: ParsePreviewTableProps) {
  const th: React.CSSProperties = {
    fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase',
    letterSpacing: '.04em', padding: '5px 6px', textAlign: 'left', borderBottom: '1px solid #ddd',
    whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid #f0f0f0' }
  const inpStyle: React.CSSProperties = {
    width: '100%', padding: '4px 6px', border: '1px solid #e0e0e0', borderRadius: '4px',
    fontSize: '12px', background: '#fff', boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
        {rows.length} trip{rows.length !== 1 ? 's' : ''} parsed. Review and edit before saving.
      </div>
      <div style={{
        overflowX: 'auto', marginBottom: '12px',
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '720px' }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>Truck</th>
              <th style={th}>Driver</th>
              <th style={th}>Site</th>
              <th style={th}>Depart</th>
              <th style={th}>Arrive</th>
              <th style={th}>Return</th>
              <th style={th}>m³</th>
              <th style={th}>Rej</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r._idx} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ ...td, color: '#aaa' }}>{i + 1}</td>
                <td style={td}>
                  <input value={r.truck_id ?? ''} onChange={e => onRowChange(r._idx, 'truck_id', e.target.value)} style={inpStyle} />
                </td>
                <td style={td}>
                  <input value={r.driver_name ?? ''} onChange={e => onRowChange(r._idx, 'driver_name', e.target.value)} style={inpStyle} />
                </td>
                <td style={td}>
                  <input value={r.site_name ?? ''} onChange={e => onRowChange(r._idx, 'site_name', e.target.value)} style={inpStyle} />
                </td>
                <td style={td}><span style={{ fontSize: '11px' }}>{fmtTime(r.departure_loaded)}</span></td>
                <td style={td}><span style={{ fontSize: '11px' }}>{fmtTime(r.arrival_site)}</span></td>
                <td style={td}><span style={{ fontSize: '11px' }}>{fmtTime(r.arrival_plant)}</span></td>
                <td style={td}>
                  <input type="number" step="0.1" value={r.load_m3 ?? ''} onChange={e => onRowChange(r._idx, 'load_m3', e.target.value)} style={{ ...inpStyle, width: '60px' }} />
                </td>
                <td style={td}>
                  <input type="checkbox" checked={r.rejected ?? false} onChange={e => onRowChange(r._idx, 'rejected', e.target.checked ? 'true' : 'false')} />
                </td>
                <td style={td}>
                  <button type="button" onClick={() => onRowDelete(r._idx)}
                    style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '14px' }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={onApprove} disabled={saving || rows.length === 0}
          style={{
            padding: '8px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: '#0F6E56', color: '#fff', fontSize: '13px', fontWeight: 600,
            opacity: saving ? 0.6 : 1,
          }}>
          {saving ? 'Saving...' : `Approve & Save (${rows.length})`}
        </button>
        <button type="button" onClick={onCancel}
          style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: '13px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
