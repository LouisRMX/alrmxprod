'use client'

import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const redirectTo = searchParams.get('redirect')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    router.push(redirectTo === 'demo' ? '/dashboard/demo' : '/dashboard')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--gray-50)',
      padding: '24px', gap: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '380px',
        background: 'var(--white)',
        borderRadius: '16px',
        padding: '40px',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.06)'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px',
            background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#5DCAA5' }} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--gray-900)' }}>Al-RMX</div>
            <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>Plant Intelligence</div>
          </div>
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px', color: 'var(--gray-900)' }}>
          Sign in
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '28px' }}>
          {redirectTo === 'demo'
            ? 'Sign in to access the demo'
            : 'Enter your credentials to access the platform'}
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '14px', fontFamily: 'var(--font)',
                outline: 'none', background: 'var(--white)', color: 'var(--gray-900)'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '14px', fontFamily: 'var(--font)',
                outline: 'none', background: 'var(--white)', color: 'var(--gray-900)'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#FDEDEC', border: '1px solid #F5B7B1',
              borderRadius: '8px', padding: '10px 12px',
              fontSize: '13px', color: 'var(--red)'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', background: loading ? 'var(--green-mid)' : 'var(--green)',
              color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px',
              fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)', marginTop: '4px', transition: 'background .15s'
            }}
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p style={{ fontSize: '11px', color: 'var(--gray-300)', textAlign: 'center', marginTop: '24px' }}>
          Al-RMX Platform · Access by invitation only
        </p>
      </div>

      {/* Demo button below login card */}
      <button
        onClick={() => router.push('/login?redirect=demo')}
        style={{
          padding: '12px 28px', background: 'var(--white)',
          color: 'var(--green)', border: '1px solid var(--border)',
          borderRadius: '10px', fontSize: '13px', fontWeight: '500',
          cursor: 'pointer', fontFamily: 'var(--font)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          transition: 'all .15s'
        }}
      >
        Try demo →
      </button>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
