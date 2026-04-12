import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const RATE_LIMIT = { maxRequests: 10, windowSeconds: 60 }

const PARSE_PROMPT = `You are parsing a field document from a ready-mix concrete plant.
Extract any data that maps to these fields:
- Date (log_date, format: YYYY-MM-DD)
- Truck ID or number (truck_id)
- Driver name (driver_name)
- Delivery site name (site_name)
- Departure time loaded from plant (departure_loaded, ISO 8601)
- Arrival time at site (arrival_site, ISO 8601)
- Discharge/pour start time (discharge_start, ISO 8601)
- Discharge/pour end time (discharge_end, ISO 8601)
- Departure time from site (departure_site, ISO 8601)
- Return time to plant (arrival_plant, ISO 8601)
- Load volume in cubic meters (load_m3, number)
- Rejection (rejected: true/false)
- Rejection cause (reject_cause, text)

Return ONLY a JSON array of trips. Each trip is one object with these field names:
log_date, truck_id, driver_name, site_name, departure_loaded, arrival_site,
discharge_start, discharge_end, departure_site, arrival_plant, load_m3,
rejected, reject_cause

Use null for any field not found. Use ISO 8601 for timestamps.
If date is ambiguous, use the provided log_date.
If you find data that does not fit these fields, add it to a "notes" field.
Return valid JSON only, no explanation.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })
  }
  const spend = checkSpendCap(user.id)
  if (!spend.allowed) {
    return NextResponse.json({ error: 'Daily AI budget reached.' }, { status: 429 })
  }

  const { uploadId, assessmentId, logDate } = await req.json()
  if (!uploadId || !assessmentId) {
    return NextResponse.json({ error: 'Missing uploadId or assessmentId' }, { status: 400 })
  }

  // Fetch upload record
  const { data: upload } = await supabase
    .from('daily_log_uploads')
    .select('*')
    .eq('id', uploadId)
    .single()

  if (!upload) return NextResponse.json({ error: 'Upload not found' }, { status: 404 })

  // Update status
  await supabase.from('daily_log_uploads').update({ processing_status: 'processing' }).eq('id', uploadId)

  try {
    let parsedRows: Record<string, unknown>[] = []

    if (upload.file_type === 'image' || upload.file_type === 'pdf') {
      // Download file from storage
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('daily-log-uploads')
        .download(upload.storage_path)

      if (dlErr || !fileData) {
        throw new Error(`Failed to download file: ${dlErr?.message}`)
      }

      const buffer = await fileData.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const isPdf = upload.file_type === 'pdf'
      const imageMediaType = upload.original_filename?.toLowerCase().endsWith('.png')
        ? 'image/png' as const : 'image/jpeg' as const

      // Claude vision/document parse
      const contentBlock = isPdf
        ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
        : { type: 'image' as const, source: { type: 'base64' as const, media_type: imageMediaType, data: base64 } }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text' as const,
              text: `${PARSE_PROMPT}\n\nThe log_date for entries without a clear date is: ${logDate || new Date().toISOString().slice(0, 10)}`,
            },
          ],
        }],
      })

      const text = response.content[0].type === 'text' ? response.content[0].text : ''
      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        parsedRows = JSON.parse(jsonMatch[0])
      }

      trackSpend(user.id)

    } else if (upload.file_type === 'csv') {
      // Direct CSV parse (no AI needed)
      const { data: fileData } = await supabase.storage
        .from('daily-log-uploads')
        .download(upload.storage_path)

      if (!fileData) throw new Error('Failed to download CSV')

      const csvText = await fileData.text()
      const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) throw new Error('CSV has no data rows')

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      parsedRows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim())
        const row: Record<string, unknown> = {}
        headers.forEach((h, i) => {
          const val = vals[i] || null
          // Map common header names to our fields
          if (h.includes('truck')) row.truck_id = val
          else if (h.includes('driver')) row.driver_name = val
          else if (h.includes('site')) row.site_name = val
          else if (h.includes('depart') && h.includes('load')) row.departure_loaded = val
          else if (h.includes('arriv') && h.includes('site')) row.arrival_site = val
          else if (h.includes('return') || (h.includes('arriv') && h.includes('plant'))) row.arrival_plant = val
          else if (h.includes('volume') || h.includes('m3') || h.includes('load')) row.load_m3 = val ? parseFloat(val) : null
          else if (h.includes('reject')) row.rejected = val?.toLowerCase() === 'yes' || val === '1' || val?.toLowerCase() === 'true'
        })
        row.log_date = logDate
        return row
      })

    } else {
      // Excel - would need xlsx library, return error for now
      throw new Error('Excel parsing requires the xlsx library. Use CSV format or image upload.')
    }

    // Save parsed data
    await supabase.from('daily_log_uploads').update({
      processing_status: 'parsed',
      parsed_data: parsedRows,
      row_count: parsedRows.length,
    }).eq('id', uploadId)

    return NextResponse.json({ rows: parsedRows, uploadId })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Parse failed'
    await supabase.from('daily_log_uploads').update({
      processing_status: 'failed',
      error_log: { error: msg, timestamp: new Date().toISOString() },
    }).eq('id', uploadId)

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
