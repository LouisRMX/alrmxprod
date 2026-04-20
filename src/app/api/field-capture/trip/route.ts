/**
 * POST /api/field-capture/trip
 *
 * Token-validated trip insert for helpers using the /fc/[token] route.
 *
 * Security model:
 *   1. Rate-limit: 60 req/min per token (in-memory sliding window).
 *      A compromised token cannot be used to flood daily_logs.
 *   2. Request body contains { token, payload }
 *   3. We validate the token via validate_field_capture_token() Postgres function
 *   4. If token is valid, we force assessment_id and plant_id from the token
 *      (never from the request body), preventing forgery
 *   5. log_date is derived from payload.plant_queue_start so the helper
 *      cannot backdate trips arbitrarily
 *   6. captured_ip and captured_user_agent are written from request headers
 *      as a per-trip audit fingerprint
 *   7. Insert into daily_logs via service-role client (bypasses RLS; the
 *      forced IDs + token validation are the real guard)
 *
 * Deduplication handled by caller (idempotent Dexie pendingTrips queue).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

interface TripPayload {
  assessment_id?: unknown
  plant_id?: unknown
  log_date?: string
  truck_id?: string | null
  driver_name?: string | null
  site_name?: string | null
  origin_plant?: string | null
  plant_queue_start?: string | null
  loading_start?: string | null
  loading_end?: string | null
  departure_loaded?: string | null
  arrival_site?: string | null
  discharge_start?: string | null
  discharge_end?: string | null
  departure_site?: string | null
  arrival_plant?: string | null
  plant_prep_end?: string | null
  measurer_name?: string
  is_partial?: boolean
  rejected?: boolean
  stage_notes?: Record<string, string> | null
  notes?: string | null
  data_source?: string
  slump_pass?: boolean | null
  slump_test_time?: string | null
  slump_test_location?: 'plant' | 'site' | null
}

function clientIpFrom(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
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

  // Rate limit per token. Key is prefixed so field-capture traffic cannot
  // collide with other rate-limited endpoints that key on user id.
  const rl = checkRateLimit(`fc-trip:${token}`, { maxRequests: 60, windowSeconds: 60 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } },
    )
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

  // Derive log_date from the trip's first timestamp so a helper cannot
  // backdate a trip to an arbitrary day. Fall back to today only when no
  // timestamp is present (e.g. single-stage capture that starts at a later
  // stage). payload.log_date is ignored entirely.
  const anchorTs = typeof payload.plant_queue_start === 'string' && payload.plant_queue_start.length >= 10
    ? payload.plant_queue_start
    : typeof payload.loading_start === 'string' && payload.loading_start.length >= 10
      ? payload.loading_start
      : typeof payload.departure_loaded === 'string' && payload.departure_loaded.length >= 10
        ? payload.departure_loaded
        : null
  const logDate = anchorTs ? anchorTs.slice(0, 10) : new Date().toISOString().slice(0, 10)

  // Audit fingerprint for forensics
  const capturedIp = clientIpFrom(req)
  const capturedUserAgent = req.headers.get('user-agent')

  // Build the insert payload: force IDs from the token (never from caller body)
  const insertRow = {
    assessment_id: assessmentId,
    plant_id: plantId,
    log_date: logDate,
    truck_id: payload.truck_id ?? null,
    driver_name: payload.driver_name ?? null,
    site_name: payload.site_name ?? null,
    origin_plant: typeof payload.origin_plant === 'string' ? payload.origin_plant : null,
    // 9-stage timestamps
    plant_queue_start: payload.plant_queue_start ?? null,
    loading_start: payload.loading_start ?? null,
    loading_end: payload.loading_end ?? null,
    departure_loaded: payload.departure_loaded ?? null,
    arrival_site: payload.arrival_site ?? null,
    discharge_start: payload.discharge_start ?? null,
    discharge_end: payload.discharge_end ?? null,
    departure_site: payload.departure_site ?? null,
    arrival_plant: payload.arrival_plant ?? null,
    plant_prep_end: payload.plant_prep_end ?? null,
    measurer_name: typeof payload.measurer_name === 'string' ? payload.measurer_name : 'anonymous',
    is_partial: Boolean(payload.is_partial),
    rejected: Boolean(payload.rejected),
    stage_notes: payload.stage_notes ?? null,
    notes: payload.notes ?? null,
    data_source: 'direct_observation' as const,
    // Slump-test metadata; NULL when the helper didn't run a formal test
    slump_pass: typeof payload.slump_pass === 'boolean' ? payload.slump_pass : null,
    slump_test_time: payload.slump_test_time ?? null,
    slump_test_location: (payload.slump_test_location === 'plant' || payload.slump_test_location === 'site')
      ? payload.slump_test_location
      : null,
    captured_ip: capturedIp,
    captured_user_agent: capturedUserAgent,
  }

  const { error: insertError } = await admin.from('daily_logs').insert(insertRow)
  if (insertError) {
    return NextResponse.json({ error: 'Insert failed', detail: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
