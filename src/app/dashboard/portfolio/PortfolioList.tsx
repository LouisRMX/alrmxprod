'use client'

/**
 * Portfolio assessments list, mobile-responsive.
 *
 * Desktop (>= 640px): table with 8 columns.
 * Mobile (< 640px): stacked card view. Each card shows plant name,
 * customer, date, phase + score + tracking status as inline chips, monthly
 * loss, and a View/Delete row. Layout is optimised for one-thumb scrolling
 * on a phone.
 */

import Link from 'next/link'
import { useIsMobile } from '@/hooks/useIsMobile'
import DeleteButton from './DeleteButton'

export interface PortfolioRow {
  id: string
  date: string | null
  phase: string | null
  overall: number | null
  ebitda_monthly: number | null
  plant: { name: string | null; country: string | null; customer?: { name: string | null } | null } | null
  tracking_config: { id: string; started_at: string } | { id: string; started_at: string }[] | null
}

interface Props {
  rows: PortfolioRow[]
}

function scoreColor(s: number | null) {
  if (s === null) return 'var(--gray-300)'
  if (s >= 80) return 'var(--phase-complete)'
  if (s >= 60) return 'var(--warning)'
  return 'var(--red)'
}

function fmt(n: number | null) {
  if (!n) return '-'
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'k'
  return '$' + Math.round(n)
}

function phaseChip(phase: string | null) {
  const p = phase || 'workshop'
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    workshop: { label: 'Workshop', bg: 'var(--phase-workshop-bg)', color: 'var(--phase-workshop)' },
    onsite: { label: 'On-site', bg: 'var(--phase-onsite-bg)', color: 'var(--phase-onsite)' },
    complete: { label: 'Complete', bg: 'var(--phase-complete-bg)', color: 'var(--phase-complete)' },
  }
  return cfg[p] || cfg.workshop
}

function trackingChip(tc: PortfolioRow['tracking_config']) {
  const row = Array.isArray(tc) ? tc[0] : tc
  if (!row) return null
  const days = Math.floor((Date.now() - new Date(row.started_at).getTime()) / 86_400_000)
  const week = Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
  const done = week >= 13
  return {
    label: done ? '✓ Done' : `Wk ${week}/13`,
    bg: done ? 'var(--phase-complete-bg)' : 'var(--phase-onsite-bg)',
    color: done ? 'var(--phase-complete)' : 'var(--phase-onsite)',
  }
}

export default function PortfolioList({ rows }: Props) {
  const isMobile = useIsMobile()

  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-500)' }}>
        <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}>No assessments yet</div>
        <div style={{ fontSize: '13px', marginBottom: '20px' }}>Start your first plant assessment to see results here.</div>
        <Link href="/dashboard/assess/new" style={{
          padding: '10px 20px', background: 'var(--green)', color: '#fff',
          borderRadius: '8px', fontSize: '13px', fontWeight: '500', textDecoration: 'none',
        }}>
          Start first assessment →
        </Link>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
        {rows.map(a => {
          const phase = phaseChip(a.phase)
          const tracking = trackingChip(a.tracking_config)
          return (
            <div key={a.id} style={{
              background: 'var(--white)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '14px 16px',
            }}>
              <Link href={`/dashboard/assess/${a.id}`} style={{
                display: 'block', textDecoration: 'none', color: 'inherit', minHeight: '44px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-900)' }}>
                      {a.plant?.name || '-'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                      {a.plant?.customer?.name ?? '-'}{a.plant?.country && ` · ${a.plant.country}`}
                    </div>
                  </div>
                  {a.overall !== null && (
                    <div style={{
                      fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)',
                      color: scoreColor(a.overall),
                    }}>
                      {a.overall}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                    background: phase.bg, color: phase.color,
                  }}>
                    {phase.label}
                  </span>
                  {tracking && (
                    <span style={{
                      padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                      background: tracking.bg, color: tracking.color,
                    }}>
                      {tracking.label}
                    </span>
                  )}
                  {a.ebitda_monthly && (
                    <span style={{ fontSize: '12px', fontFamily: 'var(--mono)', color: 'var(--gray-700)', marginInlineStart: 'auto' }}>
                      {fmt(a.ebitda_monthly)}/mo
                    </span>
                  )}
                </div>
              </Link>

              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--gray-50)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontFamily: 'var(--mono)' }}>
                  {a.date ? new Date(a.date).toLocaleDateString('en-GB') : '-'}
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Link href={`/dashboard/assess/${a.id}`} style={{ fontSize: '12px', color: 'var(--green)', textDecoration: 'none', fontWeight: 500 }}>
                    View →
                  </Link>
                  <DeleteButton assessmentId={a.id} plantName={a.plant?.name || '-'} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // Desktop: table (preserves existing layout)
  return (
    <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
            {['Plant', 'Customer', 'Date', 'Phase', 'Score', 'Monthly loss', 'Tracking', ''].map(h => (
              <th key={h} style={{
                padding: '10px 16px', fontSize: '11px', fontWeight: '500',
                color: 'var(--gray-500)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.4px',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((a, i) => {
            const phase = phaseChip(a.phase)
            const tracking = trackingChip(a.tracking_config)
            return (
              <tr key={a.id} style={{
                borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background .1s',
              }}>
                <td style={{ padding: 0 }}>
                  <Link href={`/dashboard/assess/${a.id}`} style={{
                    display: 'block', padding: '12px 16px',
                    color: 'inherit', textDecoration: 'none',
                    minHeight: '44px',
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--gray-900)' }}>
                      {a.plant?.name || '-'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>{a.plant?.country}</div>
                    <div style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 500, marginTop: '2px' }}>
                      Open →
                    </div>
                  </Link>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-700)' }}>
                  {a.plant?.customer?.name ?? '-'}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)', fontFamily: 'var(--mono)' }}>
                  {a.date ? new Date(a.date).toLocaleDateString('en-GB') : '-'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                    background: phase.bg, color: phase.color,
                  }}>
                    {phase.label}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {a.overall !== null ? (
                    <span style={{
                      fontSize: '15px', fontWeight: 700, fontFamily: 'var(--mono)',
                      color: scoreColor(a.overall),
                    }}>
                      {a.overall}
                    </span>
                  ) : <span style={{ color: 'var(--gray-300)' }}>-</span>}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>
                  {fmt(a.ebitda_monthly)}<span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>/mo</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {tracking ? (
                    <span style={{
                      padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                      background: tracking.bg, color: tracking.color,
                    }}>
                      {tracking.label}
                    </span>
                  ) : <span style={{ color: 'var(--gray-300)', fontSize: '13px' }}>-</span>}
                </td>
                <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Link href={`/dashboard/assess/${a.id}`} style={{
                    fontSize: '12px', color: 'var(--green)', textDecoration: 'none', fontWeight: 500,
                  }}>
                    View →
                  </Link>
                  <DeleteButton assessmentId={a.id} plantName={a.plant?.name || '-'} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
