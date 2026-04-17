'use client'

/**
 * Button + modal for generating and managing field-capture tokens.
 *
 * - Shows in the Field Log header for admins/managers
 * - Click → opens modal
 * - Modal lets you: create new token (with optional label + expiry),
 *   see existing tokens for this assessment, copy URL, revoke
 *
 * Tokens are stored in public.field_capture_tokens and validated by the
 * /api/field-capture/trip route when helpers POST trips.
 */

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  assessmentId: string
  plantId: string
}

interface Token {
  token: string
  label: string | null
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
  use_count: number
  created_at: string
}

function generateTokenString(): string {
  // Short-but-unguessable token for URL use. 16 hex chars = ~64 bits of entropy.
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export default function FieldCaptureTokenButton({ assessmentId, plantId }: Props) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [tokens, setTokens] = useState<Token[]>([])
  const [label, setLabel] = useState('')
  const [expiryDays, setExpiryDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [appUrl, setAppUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') setAppUrl(window.location.origin)
  }, [])

  const loadTokens = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('field_capture_tokens')
      .select('token, label, expires_at, revoked_at, last_used_at, use_count, created_at')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: false })
    setTokens((data ?? []) as Token[])
    setLoading(false)
  }, [supabase, assessmentId])

  useEffect(() => { if (open) loadTokens() }, [open, loadTokens])

  const createToken = async () => {
    const token = generateTokenString()
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('field_capture_tokens').insert({
      token,
      assessment_id: assessmentId,
      plant_id: plantId,
      label: label || null,
      expires_at: expiresAt,
    })
    if (error) {
      alert('Failed to create token: ' + error.message)
      return
    }
    setLabel('')
    await loadTokens()
  }

  const revokeToken = async (token: string) => {
    if (!confirm('Revoke this link? Anyone using it will lose access immediately.')) return
    const { error } = await supabase
      .from('field_capture_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token)
    if (error) {
      alert('Failed to revoke: ' + error.message)
      return
    }
    await loadTokens()
  }

  const copyUrl = async (token: string) => {
    const url = `${appUrl}/fc/${token}`
    try {
      await navigator.clipboard.writeText(url)
      alert('Link copied to clipboard')
    } catch {
      prompt('Copy this link:', url)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 14px',
          background: '#fff',
          border: '1px solid #0F6E56',
          color: '#0F6E56',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Share field-capture link
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px', padding: '20px',
              maxWidth: '560px', width: '94%', maxHeight: '85vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Field-capture links</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                  Share a URL with your on-site helpers. They can log trips without needing a login.
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888', lineHeight: 1,
              }}>×</button>
            </div>

            {/* Create new */}
            <div style={{
              background: '#f9fafb', border: '1px solid #e5e5e5', borderRadius: '8px',
              padding: '12px', marginBottom: '14px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>
                Generate new link
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="Label (e.g. Ali, site helper)"
                  style={{ flex: 1, minWidth: '200px', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                />
                <select
                  value={expiryDays}
                  onChange={e => setExpiryDays(+e.target.value)}
                  style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
                <button
                  type="button"
                  onClick={createToken}
                  style={{
                    padding: '8px 14px', background: '#0F6E56', color: '#fff',
                    border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Generate
                </button>
              </div>
            </div>

            {/* Existing list */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '8px' }}>
                Active links ({tokens.filter(t => !t.revoked_at && new Date(t.expires_at) > new Date()).length})
              </div>
              {loading && <div style={{ fontSize: '12px', color: '#888' }}>Loading…</div>}
              {!loading && tokens.length === 0 && (
                <div style={{ fontSize: '12px', color: '#888', padding: '14px', textAlign: 'center', background: '#fafafa', borderRadius: '6px' }}>
                  No links yet. Create one above.
                </div>
              )}
              {tokens.map(tok => {
                const isExpired = new Date(tok.expires_at) < new Date()
                const isRevoked = Boolean(tok.revoked_at)
                const isActive = !isExpired && !isRevoked
                const url = `${appUrl}/fc/${tok.token}`
                return (
                  <div key={tok.token} style={{
                    border: '1px solid #e5e5e5', borderRadius: '8px',
                    padding: '10px 12px', marginBottom: '8px',
                    background: isActive ? '#fff' : '#fafafa',
                    opacity: isActive ? 1 : 0.7,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                          {tok.label || <span style={{ color: '#888', fontStyle: 'italic' }}>Unlabeled</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', wordBreak: 'break-all' }}>
                          {url}
                        </div>
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                          {isRevoked && <span style={{ color: '#C0392B', fontWeight: 600 }}>Revoked · </span>}
                          {!isRevoked && isExpired && <span style={{ color: '#D68910', fontWeight: 600 }}>Expired · </span>}
                          Expires {new Date(tok.expires_at).toLocaleDateString()} · {tok.use_count} {tok.use_count === 1 ? 'use' : 'uses'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => copyUrl(tok.token)}
                          disabled={!isActive}
                          style={{
                            padding: '6px 10px', background: '#f0f0f0', border: '1px solid #ddd',
                            borderRadius: '5px', fontSize: '11px', cursor: isActive ? 'pointer' : 'not-allowed', color: '#333',
                          }}
                        >Copy</button>
                        {isActive && (
                          <button
                            type="button"
                            onClick={() => revokeToken(tok.token)}
                            style={{
                              padding: '6px 10px', background: '#fff', border: '1px solid #C0392B',
                              borderRadius: '5px', fontSize: '11px', cursor: 'pointer', color: '#C0392B',
                            }}
                          >Revoke</button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
