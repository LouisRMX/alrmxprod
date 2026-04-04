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

export default function DevRoleSwitcher({ viewAs, isOverridden }: DevRoleSwitcherProps) {
  const pathname = usePathname()
  const returnUrl = encodeURIComponent(pathname)

  const baseStyle: React.CSSProperties = {
    fontFamily: 'var(--font)',
    fontSize: '11px',
    lineHeight: 1,
  }

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

  if (isOverridden && viewAs) {
    return (
      <div style={{
        position: 'fixed',
        bottom: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: '#C0392B',
        color: '#fff',
        borderRadius: '8px',
        padding: '6px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap' as const,
        maxWidth: 'calc(100vw - 24px)',
        justifyContent: 'center',
        ...baseStyle,
      }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px', whiteSpace: 'nowrap' }}>
          View as:
        </span>
        {ROLES.map(({ role, label }) => (
          <a key={role} href={`/api/dev-role?role=${role}&return=${returnUrl}`} style={chipStyle(role === viewAs)}>
            {label}
          </a>
        ))}
        <a
          href={`/api/dev-role?clear=1&return=${returnUrl}`}
          style={{
            padding: '4px 8px',
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

  // Not overriding — compact trigger in bottom-right corner
  return (
    <div style={{
      position: 'fixed',
      bottom: '12px',
      right: '12px',
      zIndex: 9999,
      background: 'rgba(30,30,30,0.85)',
      borderRadius: '8px',
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
            padding: '3px 7px',
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
