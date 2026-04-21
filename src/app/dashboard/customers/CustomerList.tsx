'use client'

/**
 * Customer list, mobile-responsive.
 *
 * Desktop (>= 640px): table with 5 columns.
 * Mobile (< 640px): stacked card view so contact emails and plant counts
 * stay readable without horizontal scroll.
 *
 * Primary reading device in GCC is a smartphone, so the mobile layout is
 * designed to be comfortable at 375px width without any scrolling.
 */

import Link from 'next/link'
import { useIsMobile } from '@/hooks/useIsMobile'

interface Customer {
  id: string
  name: string
  country: string | null
  contact_name: string | null
  contact_email: string | null
  plants?: { count: number }[]
}

interface Props {
  customers: Customer[]
}

export default function CustomerList({ customers }: Props) {
  const isMobile = useIsMobile()

  if (!customers || customers.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
        No customers yet. Add your first customer above.
      </div>
    )
  }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
        {customers.map(c => (
          <Link
            key={c.id}
            href={`/dashboard/customers/${c.id}`}
            style={{
              display: 'block',
              padding: '14px 16px',
              background: 'var(--white)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              textDecoration: 'none',
              color: 'inherit',
              minHeight: '44px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-900)' }}>
                  {c.name}
                </div>
                {c.country && (
                  <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>
                    {c.country}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontWeight: 500, textAlign: 'right' }}>
                {(c.plants as { count: number }[])?.[0]?.count || 0} plants
              </div>
            </div>
            {(c.contact_name || c.contact_email) && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--gray-50)' }}>
                {c.contact_name && (
                  <div style={{ fontSize: '12px', color: 'var(--gray-700)' }}>
                    {c.contact_name}
                  </div>
                )}
                {c.contact_email && (
                  <div style={{
                    fontSize: '11px', color: 'var(--gray-400)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}>
                    {c.contact_email}
                  </div>
                )}
              </div>
            )}
            <div style={{
              fontSize: '12px', color: 'var(--green)', fontWeight: 500,
              marginTop: '8px',
            }}>
              Open →
            </div>
          </Link>
        ))}
      </div>
    )
  }

  // Desktop: table layout
  return (
    <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
            {['Customer', 'Country', 'Contact', 'Plants', ''].map(h => (
              <th key={h} style={{
                padding: '10px 16px', fontSize: '11px', fontWeight: '500',
                color: 'var(--gray-500)', textAlign: 'left',
                textTransform: 'uppercase', letterSpacing: '.4px',
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customers.map((c, i) => (
            <tr key={c.id} style={{ borderBottom: i < customers.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <td style={{ padding: 0 }}>
                <Link href={`/dashboard/customers/${c.id}`} style={{
                  display: 'block', padding: '12px 16px', color: 'inherit',
                  textDecoration: 'none', minHeight: '44px',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--gray-900)' }}>{c.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 500, marginTop: '2px' }}>
                    Open →
                  </div>
                </Link>
              </td>
              <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>{c.country}</td>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--gray-700)' }}>{c.contact_name || '-'}</div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{c.contact_email || ''}</div>
              </td>
              <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)' }}>
                {(c.plants as { count: number }[])?.[0]?.count || 0}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <Link href={`/dashboard/customers/${c.id}`} style={{
                  fontSize: '12px', color: 'var(--green)', textDecoration: 'none', fontWeight: '500',
                  whiteSpace: 'nowrap',
                }}>
                  Manage →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
