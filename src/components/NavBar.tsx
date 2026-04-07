'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter, usePathname } from 'next/navigation'
import type { Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { MemberRole } from '@/lib/getEffectiveMemberRole'

interface NavBarProps {
  user: User
  profile: Profile | null
  memberRole?: MemberRole | null
}

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const color = active ? 'var(--green)' : 'var(--gray-400)'
  const sw = active ? '2' : '1.5'

  switch (name) {
    case 'assess':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      )
    case 'portfolio':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    case 'customers':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      )
    case 'reports':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      )
    case 'simulator':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
        </svg>
      )
    default:
      return null
  }
}

const TAB_ICONS: Record<string, string> = {
  '/dashboard/assess':   'assess',
  '/dashboard/portfolio':'portfolio',
  '/dashboard/customers':'customers',
  '/dashboard/reports':  'reports',
  '/dashboard/simulator':'simulator',
  '/dashboard/plants':   'portfolio',
  '/dashboard/compare':  'simulator',
  '/dashboard/track':    'assess',
}

const SHORT_LABELS: Record<string, string> = {
  'New assessment': 'Assess',
  'Portfolio':      'Portfolio',
  'Customers':      'Clients',
  'Reports':        'Reports',
  'My Reports':     'Reports',
  'My Plants':      'Plants',
  'Overview':       'Overview',
  'Comparison':     'Compare',
  'My Task':        'Track',
  'Simulator':      'Sim',
}

export default function NavBar({ user, profile, memberRole }: NavBarProps) {
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

  // Determine which tabs to show based on effective role.
  // memberRole is already the effective role (with viewAs override applied),
  // so it takes priority over the raw isAdmin check.
  const tabs = (() => {
    if (memberRole === 'owner') {
      return [
        { label: 'Overview',    href: '/dashboard/plants' },
        { label: 'Comparison',  href: '/dashboard/compare' },
        { label: 'Reports',     href: '/dashboard/reports' },
      ]
    }

    if (memberRole === 'operator') {
      return [
        { label: 'My Task', href: '/dashboard/track' },
      ]
    }

    if (memberRole === 'manager') {
      return [
        { label: 'Overview',    href: '/dashboard/plants' },
        { label: 'Comparison',  href: '/dashboard/compare' },
        { label: 'Reports',     href: '/dashboard/reports' },
      ]
    }

    // No memberRole override — show full admin tabs
    if (isAdmin) {
      return [
        { label: 'New assessment', href: '/dashboard/assess' },
        { label: 'Portfolio',      href: '/dashboard/portfolio' },
        { label: 'Customers',      href: '/dashboard/customers' },
        { label: 'Reports',        href: '/dashboard/reports' },
        { label: 'Simulator',      href: '/dashboard/simulator' },
      ]
    }

    // Fallback: manager view
    return [
      { label: 'My Plants',  href: '/dashboard/plants' },
      { label: 'My Reports', href: '/dashboard/reports' },
    ]
  })()

  const roleLabel = isAdmin
    ? 'admin'
    : memberRole
      ? memberRole
      : (profile?.role || 'user')

  return (
    <>
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
              {profile?.full_name || user.email} · {roleLabel}
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

      {/* Desktop: top tab bar */}
      {!isMobile && (
        <div style={{
          background: 'var(--white)', borderBottom: '1px solid var(--border)',
          display: 'flex', padding: '0 24px',
        }}>
          {tabs.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <button
                key={tab.href}
                onClick={() => router.push(tab.href)}
                style={{
                  padding: '13px 20px',
                  fontSize: '13px',
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
      )}

      {/* Mobile: bottom tab bar */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--white)',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-around',
          padding: '6px 0 env(safe-area-inset-bottom, 6px)',
          zIndex: 100,
          boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
        }}>
          {tabs.map(tab => {
            const active = pathname.startsWith(tab.href)
            const iconName = TAB_ICONS[tab.href] || 'reports'
            const shortLabel = SHORT_LABELS[tab.label] || tab.label
            return (
              <button
                key={tab.href}
                onClick={() => router.push(tab.href)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '4px 8px', minWidth: '48px',
                  fontFamily: 'var(--font)',
                }}
              >
                <TabIcon name={iconName} active={active} />
                <span style={{
                  fontSize: '10px', fontWeight: active ? 600 : 400,
                  color: active ? 'var(--green)' : 'var(--gray-400)',
                  lineHeight: 1,
                }}>
                  {shortLabel}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
