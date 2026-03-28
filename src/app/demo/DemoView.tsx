'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import DemoSimulator from './DemoSimulator'

export default function DemoView() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'assessment' | 'simulator'>('assessment')

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Minimal top bar */}
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
          <button onClick={() => router.push('/dashboard')} style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.7)',
            background: 'none', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)'
          }}>
            Go to platform
          </button>
          <button onClick={handleSignOut} style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.7)',
            background: 'none', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)'
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        background: 'var(--white)', borderBottom: '1px solid var(--border)',
        display: 'flex', padding: '0 24px'
      }}>
        {[
          { key: 'assessment' as const, label: 'Assessment' },
          { key: 'simulator' as const, label: 'Simulator' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '13px 20px', fontSize: '13px',
              color: activeTab === tab.key ? 'var(--green)' : 'var(--gray-500)',
              border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.key ? '2px solid var(--green)' : '2px solid transparent',
              marginBottom: '-1px', fontWeight: activeTab === tab.key ? '500' : '400',
              fontFamily: 'var(--font)', whiteSpace: 'nowrap', transition: 'all .15s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'assessment' ? (
        <iframe
          ref={iframeRef}
          src="/assessment-tool.html#demo"
          style={{ width: '100%', flex: 1, border: 'none' }}
        />
      ) : (
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--gray-50)' }}>
          <DemoSimulator />
        </div>
      )}
    </div>
  )
}
