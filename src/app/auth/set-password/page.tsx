'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '14px', fontFamily: 'var(--font)',
    outline: 'none', background: 'var(--white)', color: 'var(--gray-900)',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--gray-50)', padding: '20px',
    }}>
      <div style={{
        background: 'var(--white)', borderRadius: '12px', padding: '40px',
        width: '100%', maxWidth: '400px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '10px',
          background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '20px',
        }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#5DCAA5' }} />
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--gray-900)', marginBottom: '4px' }}>
          Set your password
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '24px', lineHeight: 1.5 }}>
          Create a password to access your Al-RMX account. You will use this to log in going forward.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              style={inp}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '6px' }}>
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Type password again"
              style={inp}
            />
          </div>

          {error && (
            <div style={{
              background: 'var(--error-bg)', border: '1px solid var(--error-border)',
              borderRadius: '8px', padding: '10px 12px', marginBottom: '16px',
              fontSize: '13px', color: 'var(--red)',
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px', background: 'var(--green)', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
          }}>
            {loading ? 'Setting password…' : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
