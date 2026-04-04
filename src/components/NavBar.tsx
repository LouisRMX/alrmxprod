'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import type { Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'
import { useIsMobile } from '@/hooks/useIsMobile'

interface NavBarProps {
  user: User
  profile: Profile | null
}

export default function NavBar({ user, profile }: NavBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const isAdmin = profile?.role === 'system_admin'
  const isMobile = useIsMobile()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isCustomerAdmin = profile?.role === 'customer_admin'

  const tabs = [
    { label: 'New assessment', href: '/dashboard/assess', adminOnly: true },
    { label: 'Portfolio', href: '/dashboard/portfolio', adminOnly: true },
    { label: 'Customers', href: '/dashboard/customers', adminOnly: true },
    // My Plants: customer_admin only — system_admin uses Portfolio instead
    ...(isCustomerAdmin ? [{ label: 'My Plants', href: '/dashboard/plants', adminOnly: false }] : []),
    { label: isAdmin ? 'Reports' : 'My Reports', href: '/dashboard/reports', adminOnly: false },
    { label: 'Simulator', href: '/dashboard/simulator', adminOnly: true },
  ].filter(t => !t.adminOnly || isAdmin)

  return (
    <div>
      {/* Top bar */}
      <div style={{
        background: 'var(--green)', padding: isMobile ? '0 12px' : '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '48px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5DCAA5' }} />
          </div>
          <span style={{ color: '#fff', fontSize: '15px', fontWeight: '500' }}>Al-RMX</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!isMobile && (
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--mono)' }}>
              {profile?.full_name || user.email} · {profile?.role === 'system_admin' ? 'admin' : profile?.role || 'user'}
            </span>
          )}
          <button
            onClick={handleSignOut}
            style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.7)',
              background: 'none', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        background: 'var(--white)', borderBottom: '1px solid var(--border)',
        display: 'flex', padding: isMobile ? '0 8px' : '0 24px',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
      }}>
        {tabs.map(tab => {
          const active = pathname.startsWith(tab.href)
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              style={{
                padding: isMobile ? '11px 12px' : '13px 20px',
                fontSize: isMobile ? '12px' : '13px',
                color: active ? 'var(--green)' : 'var(--gray-500)',
                border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
                marginBottom: '-1px', fontWeight: active ? '500' : '400',
                fontFamily: 'var(--font)', whiteSpace: 'nowrap', transition: 'all .15s',
                flexShrink: 0,
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
