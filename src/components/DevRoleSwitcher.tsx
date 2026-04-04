'use client'

import { usePathname } from 'next/navigation'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { MemberRole } from '@/lib/getEffectiveMemberRole'

interface DevRoleSwitcherProps {
  viewAs: MemberRole | null
  isOverridden: boolean
}

const ROLES: { role: MemberRole; label: string }[] = [
  { role: 'owner',    label: 'Owner'    },
  { role: 'manager',  label: 'Manager'  },
  { role: 'operator', label: 'Operator' },
]

export default function DevRoleSwitcher({ viewAs, isOverridden }: DevRoleSwitcherProps) {
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const returnUrl = encodeURIComponent(pathname)

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: isMobile ? '5px 12px' : '4px 10px',
    borderRadius: '5px',
    fontSize: isMobile ? '12px' : '11px',
    fontWeight: active ? 700 : 400,
    background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
    color: '#fff',
    textDecoration: 'none',
    border: '1px solid rgba(255,255,255,0.2)',
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap' as const,
  })

  // On mobile: thin bar just below the top nav bar (above content, never touches bottom tab bar)
  // On desktop: floating at bottom
  if (isOverridden && viewAs) {
    return (
      <div style={{
        position: isMobile ? 'sticky' : 'fixed',
        top: isMobile ? 0 : 'auto',
        bottom: isMobile ? 'auto' : '14px',
        left: isMobile ? 0 : '50%',
        right: isMobile ? 0 : 'auto',
        transform: isMobile ? 'none' : 'translateX(-50%)',
        zIndex: 9999,
        background: '#C0392B',
        color: '#fff',
        padding: isMobile ? '8px 16px' : '6px 10px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? '8px' : '6px',
        flexWrap: 'nowrap' as const,
        justifyContent: isMobile ? 'space-between' : 'center',
        borderRadius: isMobile ? 0 : '8px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: isMobile ? '11px' : '10px', color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
          View as:
        </span>
        <div style={{ display: 'flex', gap: '4px', flex: isMobile ? 1 : 'none', justifyContent: isMobile ? 'center' : 'flex-start' }}>
          {ROLES.map(({ role, label }) => (
            <a key={role} href={`/api/dev-role?role=${role}&return=${returnUrl}`} style={chipStyle(role === viewAs)}>
              {label}
            </a>
          ))}
        </div>
        <a
          href={`/api/dev-role?clear=1&return=${returnUrl}`}
          style={{
            padding: isMobile ? '5px 12px' : '4px 8px',
            borderRadius: '5px',
            fontSize: isMobile ? '12px' : '11px',
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.3)',
            fontFamily: 'var(--font)',
            whiteSpace: 'nowrap' as const,
          }}
        >
          Exit
        </a>
      </div>
    )
  }

  // No override active — compact trigger
  // Mobile: top-right corner (below top bar). Desktop: bottom-right.
  return (
    <div style={{
      position: 'fixed',
      top: isMobile ? '54px' : 'auto',
      bottom: isMobile ? 'auto' : '14px',
      right: '12px',
      zIndex: 9999,
      background: 'rgba(30,30,30,0.85)',
      borderRadius: '7px',
      padding: '5px 8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    }}>
      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font)', marginRight: '2px' }}>
        View as
      </span>
      {ROLES.map(({ role, label }) => (
        <a
          key={role}
          href={`/api/dev-role?role=${role}&return=${returnUrl}`}
          style={{
            padding: isMobile ? '4px 10px' : '3px 7px',
            borderRadius: '5px',
            fontSize: '10px',
            background: 'rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.8)',
            textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            fontFamily: 'var(--font)',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {label}
        </a>
      ))}
    </div>
  )
}
