'use client'

/**
 * Admin-only "Helper view" button.
 *
 * Opens the /fc/[token] route in a new tab using a dedicated preview
 * token (label="__preview__") so the admin can verify exactly what a
 * token recipient sees without manually creating a throwaway token
 * every time. Reuses an existing preview token if one is live, otherwise
 * mints a new one with a 30-day expiry.
 *
 * The preview token shows up in the regular token list — revoke it from
 * there if you want to invalidate the preview link.
 *
 * Mobile Safari / iOS PWA block window.open() that fires AFTER an async
 * operation because it doesn't look like a user gesture by the time it
 * runs. We work around this by opening a blank tab synchronously on
 * click and then navigating it once the token is resolved. If opening
 * is blocked outright, we fall back to navigating the current tab so
 * the admin still gets into the helper view.
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  assessmentId: string
  plantId: string
}

const PREVIEW_LABEL = '__preview__'
const PREVIEW_EXPIRY_DAYS = 30

function generateTokenString(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export default function FieldCapturePreviewButton({ assessmentId, plantId }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const openHelperView = () => {
    // Open the target tab SYNCHRONOUSLY inside the click handler so iOS
    // Safari / PWA treat it as a user gesture. We load a blank URL first
    // and navigate it once we have the token.
    const preOpenedTab: Window | null = window.open('about:blank', '_blank', 'noopener,noreferrer')

    setLoading(true)

    ;(async () => {
      try {
        // Look for an existing preview token that is still valid
        const { data: existing } = await supabase
          .from('field_capture_tokens')
          .select('token, expires_at, revoked_at')
          .eq('assessment_id', assessmentId)
          .eq('label', PREVIEW_LABEL)
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)

        let token = existing?.[0]?.token

        if (!token) {
          token = generateTokenString()
          const expiresAt = new Date(Date.now() + PREVIEW_EXPIRY_DAYS * 86_400_000).toISOString()
          const { error } = await supabase.from('field_capture_tokens').insert({
            token,
            assessment_id: assessmentId,
            plant_id: plantId,
            label: PREVIEW_LABEL,
            expires_at: expiresAt,
          })
          if (error) {
            if (preOpenedTab && !preOpenedTab.closed) preOpenedTab.close()
            alert('Could not create helper-view token: ' + error.message)
            return
          }
        }

        const url = `${window.location.origin}/fc/${token}`

        if (preOpenedTab && !preOpenedTab.closed) {
          preOpenedTab.location.href = url
        } else {
          // Popup blocker prevented the synchronous open. Fall back to
          // navigating the current tab — admin still gets into the view.
          window.location.href = url
        }
      } finally {
        setLoading(false)
      }
    })()
  }

  return (
    <button
      type="button"
      onClick={openHelperView}
      disabled={loading}
      style={{
        padding: '6px 12px',
        background: '#fff',
        color: '#0F6E56',
        border: '1.5px solid #0F6E56',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
        minHeight: '36px',
        opacity: loading ? 0.6 : 1,
      }}
      title="Open /fc/[token] in a new tab using a dedicated preview token (admin only)"
    >
      {loading ? '...' : '👁 Helper view'}
    </button>
  )
}
