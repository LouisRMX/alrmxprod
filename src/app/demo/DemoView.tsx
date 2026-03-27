'use client'

import { useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function DemoView() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Minimal top bar — just logo + sign out */}
      <div style={{
        background: 'var(--green)', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '44px', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5DCAA5' }} />
          </div>
          <span style={{ color: '#fff', fontSize: '15px', fontWeight: '500' }}>Al-RMX</span>
          <span style={{
            fontSize: '11px', color: 'rgba(255,255,255,0.5)',
            background: 'rgba(255,255,255,0.1)', padding: '2px 8px',
            borderRadius: '4px', marginLeft: '4px'
          }}>
            DEMO
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.7)',
              background: 'none', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'var(--font)'
            }}
          >
            Go to platform
          </button>
          <button
            onClick={handleSignOut}
            style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.7)',
              background: 'none', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
              fontFamily: 'var(--font)'
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Full-screen iframe — no tab bar, no double navigation */}
      <iframe
        ref={iframeRef}
        src="/assessment-tool.html#demo"
        style={{
          width: '100%',
          flex: 1,
          border: 'none',
        }}
      />
    </div>
  )
}
