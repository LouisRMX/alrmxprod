'use client'

import { usePathname } from 'next/navigation'
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

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: '5px',
  fontSize: '11px',
  fontWeight: active ? 700 : 400,
  background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
  color: '#fff',
  textDecoration: 'none',
  border: '1px solid rgba(255,255,255,0.2)',
  fontFamily: 'var(--font)',
  whiteSpace: 'nowrap' as const,
})

export default function DevRoleSwitcher({ viewAs, isOverridden }: DevRoleSwitcherProps) {
  const pathname = usePathname()
  const returnUrl = encodeURIComponent(pathname)
  // Role chips always land on /dashboard so the routing logic picks the right page per role.
  // Exit returns to current page (restore normal admin view).
  const roleReturnUrl = encodeURIComponent('/dashboard')

  if (isOverridden && viewAs) {
    // Active override: red bar centered above the mobile tab bar
    return (
      <div style={{
        position: 'fixed',
        bottom: '72px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#C0392B',
        color: '#fff',
        borderRadius: '8px',
        padding: '6px 12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap' as const,
        justifyContent: 'center',
        maxWidth: 'calc(100vw - 32px)',
      }}>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}>
          View as:
        </span>
        {ROLES.map(({ role, label }) => (
          <a key={role} href={`/api/dev-role?role=${role}&return=${roleReturnUrl}`} style={chipStyle(role === viewAs)}>
            {label}
          </a>
        ))}
        <a
          href={`/api/dev-role?clear=1&return=${returnUrl}`}
          style={{
            padding: '4px 10px',
            borderRadius: '5px',
            fontSize: '11px',
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

  // No override active — compact trigger, above mobile tab bar
  return (
    <div style={{
      position: 'fixed',
      bottom: '72px',
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
          href={`/api/dev-role?role=${role}&return=${roleReturnUrl}`}
          style={{
            padding: '3px 8px',
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
