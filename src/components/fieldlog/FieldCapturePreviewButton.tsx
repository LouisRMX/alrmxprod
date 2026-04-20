'use client'

/**
 * Admin-only "Preview as helper" button.
 *
 * Opens the /fc/[token] route in a new tab using a dedicated preview
 * token (label="__preview__") so the admin can verify exactly what a
 * token recipient sees without manually creating a throwaway token
 * every time. Reuses an existing preview token if one is live, otherwise
 * mints a new one with a 30-day expiry.
 *
 * The preview token shows up in the regular token list — revoke it from
 * there if you want to invalidate the preview link.
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

  const openPreview = async () => {
    setLoading(true)
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
          alert('Could not create preview token: ' + error.message)
          return
        }
      }

      const url = `${window.location.origin}/fc/${token}`
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={openPreview}
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
      title="Open /fc/[token] in a new tab using a dedicated preview token"
    >
      {loading ? '...' : '👁 Preview as helper'}
    </button>
  )
}
