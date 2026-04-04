'use client'

import { usePathname } from 'next/navigation'
import type { MemberRole } from '@/lib/getEffectiveMemberRole'

interface DevRoleSwitcherProps {
  viewAs: MemberRole | null
  isOverridden: boolean
}

const ROLES: { role: MemberRole; label: string; emoji: string }[] = [
  { role: 'owner',    label: 'Owner',    emoji: '👑' },
  { role: 'manager',  label: 'Manager',  emoji: '🔧' },
  { role: 'operator', label: 'Operator', emoji: '📋' },
]

export default function DevRoleSwitcher({ viewAs, isOverridden }: DevRoleSwitcherProps) {
  const pathname = usePathname()
  const returnUrl = encodeURIComponent(pathname)

  // When overriding a role, show the red "viewing as" banner
  if (isOverridden && viewAs) {
    return (
      <div style={{
        position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', alignItems: 'center', gap: '8px',
        background: '#C0392B', color: '#fff', borderRadius: '10px',
        padding: '8px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        fontFamily: 'var(--font)', fontSize: '12px', whiteSpace: 'nowrap',
      }}>
        <span style={{ marginRight: '4px' }}>👁</span>
        <span style={{ fontWeight: 600 }}>
          Viewing as: {viewAs.charAt(0).toUpperCase() + viewAs.slice(1)}
        </span>
        <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.3)', margin: '0 4px' }} />
        {ROLES.map(({ role, label }) => (
          <a
            key={role}
            href={`/api/dev-role?role=${role}&return=${returnUrl}`}
            style={{
              padding: '2px 8px', borderRadius: '5px', fontSize: '11px',
              fontWeight: role === viewAs ? 700 : 400,
              background: role === viewAs ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
              color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)',
              transition: 'background .15s',
            }}
          >
            {label}
          </a>
        ))}
        <a
          href={`/api/dev-role?clear=1&return=${returnUrl}`}
          style={{
            marginLeft: '4px', padding: '2px 8px', borderRadius: '5px',
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            textDecoration: 'none', fontSize: '11px', border: '1px solid rgba(255,255,255,0.3)',
          }}
        >
          ✕ Exit
        </a>
      </div>
    )
  }

  // Not overriding — show floating trigger button
  return (
    <div style={{
      position: 'fixed', bottom: '16px', right: '16px',
      zIndex: 9999,
    }}>
      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'flex', gap: '4px',
          background: 'rgba(30,30,30,0.88)', borderRadius: '10px',
          padding: '6px 10px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginRight: '4px', fontFamily: 'var(--font)' }}>
            👁 View as
          </span>
          {ROLES.map(({ role, label, emoji }) => (
            <a
              key={role}
              href={`/api/dev-role?role=${role}&return=${returnUrl}`}
              style={{
                padding: '3px 8px', borderRadius: '6px',
                background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)',
                textDecoration: 'none', fontSize: '11px', fontFamily: 'var(--font)',
                border: '1px solid rgba(255,255,255,0.15)',
                transition: 'background .15s',
              }}
            >
              {emoji} {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
