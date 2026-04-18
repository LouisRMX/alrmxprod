'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
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

export default function DevRoleSwitcher({ viewAs, isOverridden }: DevRoleSwitcherProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    fetch('/api/me')
      .then(r => r.json())
      .then(d => { if (d.role === 'system_admin') setIsAdmin(true) })
      .catch(() => {})
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!mounted || !isAdmin) return null

  const returnUrl = encodeURIComponent(pathname)
  const roleReturnUrl = encodeURIComponent(pathname.startsWith('/demo') ? pathname : '/dashboard')

  // On mobile: anchored at bottom-left so it doesn't overlap page content
  // or the floating chat (which is bottom-right). Stays in the corner
  // above the bottom tab bar. Small and unobtrusive.
  // On desktop: bottom-right corner as before.
  const triggerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
        left: '10px',
        zIndex: 99999,
      }
    : { position: 'fixed', bottom: '20px', right: '16px', zIndex: 99999 }

  // Dropdown opens upward so menu items stay above the bottom tab bar.
  // On mobile anchor to left, on desktop to right.
  const dropdownStyle: React.CSSProperties = isMobile
    ? { position: 'absolute', bottom: 'calc(100% + 6px)', left: 0 }
    : { position: 'absolute', bottom: 'calc(100% + 6px)', right: 0 }

  const content = (
    <div ref={ref} style={triggerStyle}>

      {/* Dropdown menu */}
      {open && (
        <div style={{
          ...dropdownStyle,
          background: '#1a1a1a',
          borderRadius: '8px',
          padding: '6px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          minWidth: '120px',
        }}>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font)', padding: '2px 6px 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            View as
          </div>
          {ROLES.map(({ role, label }) => (
            <a
              key={role}
              href={`/api/dev-role?role=${role}&return=${roleReturnUrl}`}
              style={{
                display: 'block',
                padding: '6px 10px',
                borderRadius: '5px',
                fontSize: '12px',
                fontFamily: 'var(--font)',
                fontWeight: viewAs === role ? 600 : 400,
                background: viewAs === role ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: viewAs === role ? '#fff' : 'rgba(255,255,255,0.65)',
                textDecoration: 'none',
                borderLeft: viewAs === role ? '2px solid #e74c3c' : '2px solid transparent',
              }}
            >
              {label}
            </a>
          ))}
          {isOverridden && (
            <>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '3px 0' }} />
              <a
                href={`/api/dev-role?clear=1&return=${returnUrl}`}
                style={{
                  display: 'block',
                  padding: '6px 10px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontFamily: 'var(--font)',
                  color: 'rgba(255,255,255,0.45)',
                  textDecoration: 'none',
                }}
              >
                Exit role view
              </a>
            </>
          )}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isOverridden ? '#c0392b' : 'rgba(30,30,30,0.75)',
          border: 'none',
          borderRadius: '6px',
          padding: '5px 9px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <span style={{ fontSize: '10px', color: isOverridden ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)', fontFamily: 'var(--font)' }}>
          {isOverridden ? viewAs : 'View as'}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" style={{ opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M1 2.5L4 5.5L7 2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

    </div>
  )

  return createPortal(content, document.body)
}
