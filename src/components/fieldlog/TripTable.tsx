'use client'

import type { DailyLogRow } from '@/lib/fieldlog/types'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/hooks/useIsMobile'

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

function siteTypeShort(t: string | null): string {
  switch (t) {
    case 'ground_pour': return 'Ground'
    case 'high_rise': return 'High rise'
    case 'bridge_deck': return 'Bridge'
    case 'road_pavement': return 'Road'
    case 'industrial': return 'Industrial'
    case 'tunnel': return 'Tunnel'
    case 'precast': return 'Precast'
    case 'marine': return 'Marine'
    case 'piling': return 'Piling'
    default: return ''
  }
}

function stageShort(s: string | null | undefined): string {
  switch (s) {
    case 'plant_queue': return 'Plant queue'
    case 'loading': return 'Loading'
    case 'weighbridge': return 'Weighbridge'
    case 'transit_out': return 'Transit out'
    case 'site_wait': return 'Site wait'
    case 'pouring': return 'Pouring'
    case 'site_washout': return 'Site washout'
    case 'transit_back': return 'Transit back'
    case 'plant_prep': return 'Plant prep'
    default: return s ?? ''
  }
}

/** Render a short mode label for the table cell:
 *  - Full cycle trip, all stages captured → "Full"
 *  - Full cycle trip saved mid-way → "Partial"
 *  - Single-stage measurement → "{Stage} only"
 */
function modeLabel(t: {
  measurement_mode?: 'full' | 'single'
  measured_stage?: string | null
  is_partial?: boolean | null
}): { label: string; tone: 'full' | 'partial' | 'single' } {
  if (t.measurement_mode === 'single' && t.measured_stage) {
    return { label: `${stageShort(t.measured_stage)} only`, tone: 'single' }
  }
  if (t.is_partial) {
    return { label: 'Partial', tone: 'partial' }
  }
  return { label: 'Full', tone: 'full' }
}

interface TripTableProps {
  trips: DailyLogRow[]
  isAdmin?: boolean
  onDelete?: (id: string) => void
}

export default function TripTable({ trips, isAdmin, onDelete }: TripTableProps) {
  const isMobile = useIsMobile()

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

  // Mobile: compact card per trip. Core stats up top, less-used detail
  // (all four stage timestamps, volume, notes) inside an expandable row
  // on tap. Keeps the list scannable without horizontal scroll.
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 0' }}>
        {trips.map((t, i) => {
          const m = modeLabel(t)
          const modeBg = m.tone === 'full' ? '#E1F5EE' : m.tone === 'single' ? '#FFF4D6' : '#FDEDEC'
          const modeFg = m.tone === 'full' ? '#0F6E56' : m.tone === 'single' ? '#7a5a00' : '#8B3A2E'
          const tat = calcTat(t.departure_loaded, t.arrival_plant)
          const isRejected = t.rejected
          return (
            <div key={t.id} style={{
              background: '#fff', border: `1px solid ${isRejected ? '#E8A39B' : '#e5e5e5'}`,
              borderRadius: '10px', padding: '12px 14px',
            }}>
              {/* Row 1: truck + TAT */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#aaa', fontSize: '11px' }}>#{i + 1}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>
                    {t.truck_id || 'Unlabeled'}
                  </span>
                  <span style={{
                    padding: '2px 6px', background: modeBg, color: modeFg,
                    borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                  }}>{m.label}</span>
                  {isRejected && (
                    <span style={{
                      padding: '2px 6px', background: '#FDEDEC', color: '#8B3A2E',
                      borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                    }}>Rejected</span>
                  )}
                </div>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F6E56', fontFamily: 'var(--mono)' }}>
                  {tat}
                </span>
              </div>

              {/* Row 2: measurer + site type + time window */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {t.measurer_name && <span>{t.measurer_name}</span>}
                  {t.site_type && t.site_type !== 'unknown' && (
                    <span style={{
                      padding: '1px 6px', background: '#E8F1FA', color: '#2E5C8A',
                      borderRadius: '3px', fontSize: '10px', fontWeight: 600,
                    }}>{siteTypeShort(t.site_type)}</span>
                  )}
                  {t.batching_unit && (
                    <span style={{
                      padding: '1px 6px', background: '#EEF1F5', color: '#3a4a66',
                      borderRadius: '3px', fontSize: '10px', fontWeight: 600,
                    }} title={t.origin_plant ? `${t.origin_plant} · ${t.batching_unit}` : t.batching_unit}>
                      ⚙ {t.batching_unit}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#888', fontFamily: 'var(--mono)' }}>
                  {fmtTime(t.departure_loaded)} → {fmtTime(t.arrival_plant)}
                </div>
              </div>

              {/* Row 3: notes (only when present) */}
              {t.notes && (
                <div style={{ fontSize: '11px', color: '#777', marginTop: '6px', lineHeight: 1.4, fontStyle: 'italic' }}>
                  {t.notes}
                </div>
              )}

              {/* Admin delete action */}
              {isAdmin && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    style={{
                      background: 'none', border: 'none', color: '#C0392B',
                      fontSize: '11px', cursor: 'pointer', padding: '4px 8px',
                      minHeight: '32px',
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const th: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase',
    letterSpacing: '.04em', padding: '10px 10px', textAlign: 'left', borderBottom: '1px solid #eee',
    whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    fontSize: '13px', padding: '12px 10px', borderBottom: '1px solid #f5f5f5',
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
            <th style={th}>Measurer</th>
            <th style={th}>Mode</th>
            <th style={th}>Plant / Unit</th>
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
              <td style={{ ...td, color: t.measurer_name ? '#333' : '#ccc' }}>
                {t.measurer_name || '-'}
              </td>
              <td style={td}>
                {(() => {
                  const m = modeLabel(t)
                  const bg = m.tone === 'full' ? '#E1F5EE' : m.tone === 'single' ? '#FFF4D6' : '#FDEDEC'
                  const fg = m.tone === 'full' ? '#0F6E56' : m.tone === 'single' ? '#7a5a00' : '#8B3A2E'
                  return (
                    <span style={{
                      padding: '2px 6px', background: bg, color: fg,
                      borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                    }}>{m.label}</span>
                  )
                })()}
              </td>
              <td style={td}>
                {t.origin_plant || t.batching_unit ? (
                  <span style={{ color: '#333' }}>
                    {t.origin_plant ?? '-'}
                    {t.batching_unit && (
                      <span style={{ color: '#888' }}> / {t.batching_unit}</span>
                    )}
                  </span>
                ) : <span style={{ color: '#ccc' }}>-</span>}
              </td>
              <td style={td}>
                {t.site_type && t.site_type !== 'unknown' ? (
                  <span style={{
                    padding: '2px 6px', background: '#E8F1FA', color: '#2E5C8A',
                    borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                  }}>
                    {siteTypeShort(t.site_type)}
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
