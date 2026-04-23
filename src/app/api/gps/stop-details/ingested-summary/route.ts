/**
 * GET /api/gps/stop-details/ingested-summary?assessmentId=...
 *
 * Aggregate view of everything currently ingested for the assessment.
 * Used by UtilizationView to show a stable "total state" indicator that
 * is independent of the per-batch parse response. Uploads append; this
 * endpoint is how the UI answers "what data is actually in the system
 * right now?".
 *
 * Returns:
 *   totalEvents   — count of normalized_gps_events (non-archived uploads)
 *   dateRange     — min/max stop_start_time (YYYY-MM-DD)
 *   distinctTrucks — unique truck_id count
 *   fileCount     — count of non-archived uploaded_gps_files rows
 *   files         — { filename, created_at, events_count } per batch
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const assessmentId = req.nextUrl.searchParams.get('assessmentId')
  if (!assessmentId) {
    return NextResponse.json({ error: 'assessmentId required' }, { status: 400 })
  }

  // Non-archived batches for this assessment — these define what counts
  // as "currently ingested" (archived ones are kept for audit but their
  // events have been deleted).
  const { data: uploads, error: uploadErr } = await supabase
    .from('uploaded_gps_files')
    .select('id, original_filename, created_at')
    .eq('assessment_id', assessmentId)
    .eq('archived', false)
    .order('created_at', { ascending: true })

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  if (!uploads || uploads.length === 0) {
    return NextResponse.json({
      totalEvents: 0,
      dateRange: null,
      distinctTrucks: 0,
      fileCount: 0,
      files: [],
    })
  }

  const uploadIds = uploads.map(u => u.id)

  // Aggregate counts. Pulling every row just to count is wasteful on
  // 100k-row datasets — use head-count + min/max via two cheap queries.
  const { count: totalEvents } = await supabase
    .from('normalized_gps_events')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId)
    .in('upload_id', uploadIds)

  // Min/max date. Postgres does this fast with the index on event_timestamp.
  const { data: earliest } = await supabase
    .from('normalized_gps_events')
    .select('stop_start_time')
    .eq('assessment_id', assessmentId)
    .in('upload_id', uploadIds)
    .order('stop_start_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: latest } = await supabase
    .from('normalized_gps_events')
    .select('stop_start_time')
    .eq('assessment_id', assessmentId)
    .in('upload_id', uploadIds)
    .order('stop_start_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Distinct truck count. No cheap way via Supabase client; page through
  // truck_id and dedupe in memory. For ~100 trucks this is fine.
  const truckSet = new Set<string>()
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('normalized_gps_events')
      .select('truck_id')
      .eq('assessment_id', assessmentId)
      .in('upload_id', uploadIds)
      .range(from, from + PAGE - 1)
    if (error) break
    if (!data || data.length === 0) break
    for (const r of data) if (r.truck_id) truckSet.add(String(r.truck_id))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Per-file event counts (lightweight — one count per batch).
  const fileRows = await Promise.all(uploads.map(async u => {
    const { count } = await supabase
      .from('normalized_gps_events')
      .select('*', { count: 'exact', head: true })
      .eq('upload_id', u.id)
    return {
      filename: u.original_filename,
      created_at: u.created_at,
      eventsCount: count ?? 0,
    }
  }))

  const dateRange = earliest && latest
    ? {
        start: String(earliest.stop_start_time).slice(0, 10),
        end: String(latest.stop_start_time).slice(0, 10),
      }
    : null

  return NextResponse.json({
    totalEvents: totalEvents ?? 0,
    dateRange,
    distinctTrucks: truckSet.size,
    fileCount: uploads.length,
    files: fileRows,
  })
}
