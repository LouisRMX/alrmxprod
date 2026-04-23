/**
 * GPS normalized events → CSV download.
 *
 * Admin diagnostic tool. Given an upload_id, streams all normalized events
 * for that upload as a CSV so the consultant can slice in Excel or hand
 * the cleaned data to the customer.
 *
 * RLS on normalized_gps_events enforces access. No extra admin check here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uploadId = req.nextUrl.searchParams.get('upload_id')
  if (!uploadId) {
    return NextResponse.json({ error: 'upload_id required' }, { status: 400 })
  }

  // Paginate so we don't blow up on 22M-row uploads. Supabase default limit
  // is 1000 rows per request; PostgREST caps range at 1000 unless the
  // server's db-max-rows is raised. Loop until no more rows.
  const PAGE = 1000
  const rows: Record<string, unknown>[] = []
  let from = 0
  // Hard cap to prevent a runaway download; 500k rows ~= 100 MB CSV
  const MAX_ROWS = 500_000

  while (rows.length < MAX_ROWS) {
    const to = from + PAGE - 1
    const { data, error } = await supabase
      .from('normalized_gps_events')
      .select(
        'truck_id, event_timestamp, stop_start_time, stop_end_time, ' +
        'location_name, latitude, longitude, event_type, driver_id, ' +
        'speed, odometer, inferred_location_type, raw_row_reference'
      )
      .eq('upload_id', uploadId)
      .order('truck_id', { ascending: true })
      .order('event_timestamp', { ascending: true, nullsFirst: false })
      .range(from, to)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as Record<string, unknown>[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const headers = [
    'truck_id', 'event_timestamp', 'stop_start_time', 'stop_end_time',
    'location_name', 'latitude', 'longitude', 'event_type', 'driver_id',
    'speed', 'odometer', 'inferred_location_type', 'raw_row_reference',
  ]

  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(','))
  }
  const csv = lines.join('\n')

  const filename = `gps_events_${uploadId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Row-Count': String(rows.length),
      'X-Row-Cap-Hit': rows.length >= MAX_ROWS ? 'true' : 'false',
    },
  })
}
