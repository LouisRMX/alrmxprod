'use client'

import { fmtDuration, fmtDelay, summarizeTrips, type TripRecord } from '@/lib/trips/analyzer'

interface TripDashboardProps {
  trips:       TripRecord[]
  date:        string   // YYYY-MM-DD displayed
  targetTAMin: number
  onUploadNew: () => void
  onDateChange: (delta: -1 | 1) => void
  canGoBack:   boolean
  canGoForward: boolean
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtTime(isoTs: string): string {
  return isoTs.slice(11, 16)  // HH:MM from ISO string
}

function fmtLoss(usd: number | null): string {
  if (usd == null) return '—'
  if (usd < 1000) return `~$${Math.round(usd)}`
  return `~$${Math.round(usd / 1000)}k`
}

function rowColor(t: TripRecord): string {
  if (t.anomalyFlags.includes('invalid_timestamps')) return '#fff3f3'
  const delay = t.turnaroundDelayS
  if (delay <= 0) return 'transparent'
  const mins = delay / 60
  if (mins > 30) return '#fff3f3'
  if (mins > 10) return '#fffbf0'
  return 'transparent'
}

function delayColor(t: TripRecord): string {
  const delay = t.turnaroundDelayS
  if (delay <= 0) return '#1a6644'
  const mins = delay / 60
  if (mins > 30) return '#cc3333'
  if (mins > 10) return '#c96a00'
  return '#1a6644'
}

const ANOMALY_LABELS: Record<string, string> = {
  suspiciously_short: 'Short',
  possibly_incomplete: 'Long',
  site_time_too_short: 'Site < 10min',
  site_time_too_long: 'Site > 2h',
  invalid_timestamps: 'Invalid times',
}

export default function TripDashboard({
  trips, date, targetTAMin, onUploadNew, onDateChange, canGoBack, canGoForward,
}: TripDashboardProps) {
  const summary = summarizeTrips(trips, targetTAMin)

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '8px 0' }}>

      {/* Date nav + upload button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => onDateChange(-1)}
            disabled={!canGoBack}
            style={{
              fontSize: '16px', background: 'none', border: 'none', cursor: canGoBack ? 'pointer' : 'default',
              color: canGoBack ? 'var(--gray-700)' : 'var(--gray-200)', padding: '0 4px',
            }}
          >
            ←
          </button>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-800)' }}>
            {fmtDate(date)}
          </span>
          <button
            onClick={() => onDateChange(1)}
            disabled={!canGoForward}
            style={{
              fontSize: '16px', background: 'none', border: 'none', cursor: canGoForward ? 'pointer' : 'default',
              color: canGoForward ? 'var(--gray-700)' : 'var(--gray-200)', padding: '0 4px',
            }}
          >
            →
          </button>
        </div>
        <button
          onClick={onUploadNew}
          style={{
            fontSize: '12px', fontWeight: 600, padding: '7px 14px',
            borderRadius: '7px', border: '1px solid var(--border)',
            background: 'var(--white)', color: 'var(--gray-600)',
            cursor: 'pointer',
          }}
        >
          Upload new
        </button>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {/* Trips */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--gray-400)', marginBottom: '6px' }}>Trips</div>
          <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--gray-900)' }}>{summary.tripCount}</div>
        </div>

        {/* Avg turnaround */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--gray-400)', marginBottom: '6px' }}>Avg turnaround</div>
          <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--mono)', color: summary.avgTurnaroundMin > targetTAMin ? '#cc3333' : '#1a6644' }}>
            {summary.avgTurnaroundMin} min
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>target {targetTAMin} min</div>
        </div>

        {/* Over target */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--gray-400)', marginBottom: '6px' }}>Over target</div>
          <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--mono)', color: summary.tripsOverTarget > 0 ? '#c96a00' : '#1a6644' }}>
            {summary.tripsOverTarget}/{summary.tripCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>
            {summary.tripCount > 0 ? Math.round(summary.tripsOverTarget / summary.tripCount * 100) : 0}% of trips
          </div>
        </div>

        {/* Est. loss */}
        <div style={{ background: summary.totalEstLossUsd != null && summary.totalEstLossUsd > 0 ? '#fff3f3' : 'var(--white)', border: `1px solid ${summary.totalEstLossUsd != null && summary.totalEstLossUsd > 0 ? '#fcc' : 'var(--border)'}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--gray-400)', marginBottom: '6px' }}>Est. loss today</div>
          <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--mono)', color: summary.totalEstLossUsd != null && summary.totalEstLossUsd > 0 ? '#cc3333' : 'var(--gray-400)' }}>
            {summary.totalEstLossUsd != null ? fmtLoss(summary.totalEstLossUsd) : '—'}
          </div>
          {summary.totalEstLossUsd != null && (
            <div style={{ fontSize: '10px', color: 'var(--gray-300)', marginTop: '2px' }}>directional estimate</div>
          )}
        </div>
      </div>

      {/* Trip table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
              {['Truck', 'Dispatch', 'Return', 'Turnaround', 'vs Target', 'Site time', 'Est. loss', 'Flags'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={t.rowIndex} style={{ background: rowColor(t), borderBottom: i < trips.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--gray-800)' }}>{t.truckId}</td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', color: 'var(--gray-600)' }}>{fmtTime(t.dispatchedAt)}</td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', color: 'var(--gray-600)' }}>{fmtTime(t.returnedAt)}</td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontWeight: 700, color: delayColor(t) }}>
                  {fmtDuration(t.turnaroundS)}
                </td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', fontWeight: 600, color: delayColor(t) }}>
                  {fmtDelay(t.turnaroundDelayS)}
                </td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', color: 'var(--gray-600)' }}>
                  {fmtDuration(t.siteDwellS)}
                </td>
                <td style={{ padding: '9px 12px', fontFamily: 'var(--mono)', color: t.estLossUsd != null && t.estLossUsd > 0 ? '#cc3333' : 'var(--gray-400)' }}>
                  {fmtLoss(t.estLossUsd)}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {t.anomalyFlags.map(f => (
                      <span key={f} style={{
                        fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px',
                        background: '#fff8ed', color: '#c96a00', border: '1px solid #f5cba0',
                      }}>
                        {ANOMALY_LABELS[f] ?? f}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--gray-300)', textAlign: 'right' }}>
        Est. loss is directional. Assumes all delay is recoverable and excludes external factors.
      </div>
    </div>
  )
}
