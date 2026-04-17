/**
 * POST /api/field-capture/trip
 *
 * Token-validated trip insert for helpers using the /fc/[token] route.
 *
 * Security model:
 *   1. Request body contains { token, payload }
 *   2. We validate the token via validate_field_capture_token() Postgres function
 *   3. If token is valid, we force assessment_id and plant_id from the token
 *      (never from the request body), preventing forgery
 *   4. Insert into daily_logs via service-role client
 *
 * Rate limiting:
 *   - 60 requests per minute per token (generous for batch sync after offline)
 *   - Deduplication handled by caller (idempotent Dexie pendingTrips queue)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

interface TripPayload {
  assessment_id?: unknown
  plant_id?: unknown
  log_date?: string
  truck_id?: string | null
  driver_name?: string | null
  site_name?: string | null
  plant_queue_start?: string | null
  loading_start?: string | null
  departure_loaded?: string | null
  arrival_site?: string | null
  discharge_start?: string | null
  discharge_end?: string | null
  departure_site?: string | null
  arrival_plant?: string | null
  measurer_name?: string
  is_partial?: boolean
  stage_notes?: Record<string, string> | null
  notes?: string | null
  data_source?: string
}

export async function POST(req: NextRequest) {
  let body: { token?: string; payload?: TripPayload }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const payload = body.payload
  if (!token || !payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Missing token or payload' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Validate the token and get the authoritative assessment_id + plant_id
  const { data: validation, error: valError } = await admin.rpc('validate_field_capture_token', {
    p_token: token,
  })
  if (valError) {
    return NextResponse.json({ error: 'Token validation failed', detail: valError.message }, { status: 500 })
  }
  const row = Array.isArray(validation) ? validation[0] : validation
  if (!row || !row.assessment_id || !row.plant_id) {
    return NextResponse.json({ error: 'Token is invalid, expired, or revoked' }, { status: 401 })
  }

  const assessmentId: string = row.assessment_id
  const plantId: string = row.plant_id

  // Build the insert payload: force IDs from the token (never from caller body)
  const insertRow = {
    assessment_id: assessmentId,
    plant_id: plantId,
    log_date: payload.log_date ?? new Date().toISOString().slice(0, 10),
    truck_id: payload.truck_id ?? null,
    driver_name: payload.driver_name ?? null,
    site_name: payload.site_name ?? null,
    plant_queue_start: payload.plant_queue_start ?? null,
    loading_start: payload.loading_start ?? null,
    departure_loaded: payload.departure_loaded ?? null,
    arrival_site: payload.arrival_site ?? null,
    discharge_start: payload.discharge_start ?? null,
    discharge_end: payload.discharge_end ?? null,
    departure_site: payload.departure_site ?? null,
    arrival_plant: payload.arrival_plant ?? null,
    measurer_name: typeof payload.measurer_name === 'string' ? payload.measurer_name : 'anonymous',
    is_partial: Boolean(payload.is_partial),
    stage_notes: payload.stage_notes ?? null,
    notes: payload.notes ?? null,
    data_source: 'direct_observation' as const,
  }

  const { error: insertError } = await admin.from('daily_logs').insert(insertRow)
  if (insertError) {
    return NextResponse.json({ error: 'Insert failed', detail: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
