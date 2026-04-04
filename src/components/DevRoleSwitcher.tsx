'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  const [mounted, setMounted] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Fetch role client-side — bypasses any server-side isAdmin check issues
    fetch('/api/me')
      .then(r => r.json())
      .then(d => { if (d.role === 'system_admin') setIsAdmin(true) })
      .catch(() => {})
  }, [])

  if (!mounted || !isAdmin) return null

  const returnUrl = encodeURIComponent(pathname)
  const roleReturnUrl = encodeURIComponent('/dashboard')

  const content = isOverridden && viewAs ? (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      background: '#C0392B',
      color: '#fff',
      borderRadius: '8px',
      padding: '6px 12px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
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
  ) : (
    <div style={{
      position: 'fixed',
      bottom: '80px',
      right: '16px',
      zIndex: 99999,
      background: 'rgba(20,20,20,0.9)',
      borderRadius: '8px',
      padding: '6px 10px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
    }}>
      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font)', marginRight: '2px', whiteSpace: 'nowrap' }}>
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

  return createPortal(content, document.body)
}
