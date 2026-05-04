/**
 * /fc/[token]  —  Field Capture standalone page
 *
 * Unauthenticated URL used by helpers. The token is validated server-side
 * against field_capture_tokens. If valid, we render ONLY the LiveTripTimer
 * in token mode; no navigation, no menu, no access to anything else.
 *
 * Helpers save "Add to Home Screen" on iPhone, and the app works offline
 * via IndexedDB with deferred sync through /api/field-capture/trip.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import FieldCaptureClient from './FieldCaptureClient'

export const dynamic = 'force-dynamic'

interface TokenValidation {
  assessment_id: string
  plant_id: string
  label: string | null
  note: string | null
}

export default async function FieldCapturePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!token || token.length < 8) {
    notFound()
  }

  const admin = createAdminClient()
  const { data: validation, error } = await admin.rpc('validate_field_capture_token', { p_token: token })

  if (error) {
    return (
      <ErrorScreen title="Cannot reach server" body="Please check your connection and try again." />
    )
  }

  const row: TokenValidation | null = Array.isArray(validation) ? validation[0] ?? null : validation ?? null
  if (!row || !row.assessment_id || !row.plant_id) {
    return (
      <ErrorScreen
        title="Link is invalid or expired"
        body="Ask the person who shared this link to issue a new one."
      />
    )
  }

  // Get optional context for display (plant name, assessment label)
  const { data: plantData } = await admin
    .from('plants')
    .select('name')
    .eq('id', row.plant_id)
    .maybeSingle()

  return (
    <FieldCaptureClient
      token={token}
      assessmentId={row.assessment_id}
      plantId={row.plant_id}
      plantName={plantData?.name ?? 'Plant'}
      helperName={row.label ?? null}
    />
  )
}

function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center', background: '#fafafa',
    }}>
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '14px',
        padding: '28px', maxWidth: '360px',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#C0392B', marginBottom: '8px' }}>
          {title}
        </div>
        <div style={{ fontSize: '14px', color: '#555', lineHeight: 1.5 }}>
          {body}
        </div>
      </div>
    </div>
  )
}
