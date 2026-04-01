import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parse } from 'csv-parse/sync'
import { detectGpsFormat } from '@/lib/gps/detectFormat'
import { autoMapColumns } from '@/lib/gps/autoMapper'
import { normalizeRows } from '@/lib/gps/normalizer'
import { computeMetrics } from '@/lib/gps/metricsEngine'
import { generateLogisticsSection } from '@/lib/gps/reportGenerator'
import type { CanonicalField } from '@/lib/gps/autoMapper'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { uploadId, assessmentId, manualMapping } = body as {
    uploadId: string
    assessmentId: string
    manualMapping?: Record<CanonicalField, string | null>
  }

  if (!uploadId || !assessmentId) {
    return NextResponse.json({ error: 'Missing uploadId or assessmentId' }, { status: 400 })
  }

  // Mark as analyzing
  await supabase
    .from('uploaded_gps_files')
    .update({ processing_status: 'analyzing' })
    .eq('id', uploadId)

  try {
    // ── Fetch upload record ──────────────────────────────────
    const { data: uploadRecord, error: uploadErr } = await supabase
      .from('uploaded_gps_files')
      .select('*')
      .eq('id', uploadId)
      .single()

    if (uploadErr || !uploadRecord) {
      return NextResponse.json({ error: 'Upload record not found' }, { status: 404 })
    }

    // ── Fetch assessment + delivery_radius ───────────────────
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, answers, plant:plants(latitude, longitude)')
      .eq('id', assessmentId)
      .single()

    const answers = (assessment?.answers ?? {}) as Record<string, unknown>
    const rawRadius = answers['delivery_radius']
    const deliveryRadiusKm = rawRadius ? parseFloat(String(rawRadius)) : NaN
    const finalRadiusKm = isNaN(deliveryRadiusKm) ? 12.0 : deliveryRadiusKm

    // Plant coordinates (for Type A geofencing)
    const plant = assessment?.plant as { latitude?: number; longitude?: number } | null
    const plantLat = plant?.latitude ?? null
    const plantLon = plant?.longitude ?? null

    // ── Download CSV from storage ────────────────────────────
    const { data: fileData, error: dlErr } = await supabase.storage
      .from('gps-uploads')
      .download(uploadRecord.storage_path)

    if (dlErr || !fileData) {
      await supabase.from('uploaded_gps_files').update({
        processing_status: 'failed',
        parse_error_log: [{ error: 'File download failed' }],
      }).eq('id', uploadId)
      return NextResponse.json({ error: 'Could not retrieve uploaded file' }, { status: 500 })
    }

    const csvText = await fileData.text()

    // ── Parse CSV ────────────────────────────────────────────
    let records: Record<string, string>[]
    let headers: string[]

    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[]
      headers = records.length > 0 ? Object.keys(records[0]) : []
    } catch (parseErr) {
      await supabase.from('uploaded_gps_files').update({
        processing_status: 'failed',
        parse_error_log: [{ error: `CSV parse error: ${String(parseErr)}` }],
      }).eq('id', uploadId)
      return NextResponse.json({
        error: 'We could not read your CSV file. Please ensure it is a valid comma-separated file.',
      }, { status: 422 })
    }

    if (records.length < 20) {
      await supabase.from('uploaded_gps_files').update({
        processing_status: 'failed',
        parse_error_log: [{ error: `Only ${records.length} rows — minimum 20 required` }],
      }).eq('id', uploadId)
      return NextResponse.json({
        error: `Your file contains fewer than 20 data rows, which is not sufficient for reliable analysis. Please export at least 30 days of GPS data.`,
        requiresMoreData: true,
      }, { status: 422 })
    }

    if (headers.length === 0) {
      await supabase.from('uploaded_gps_files').update({
        processing_status: 'failed',
        parse_error_log: [{ error: 'No headers detected' }],
      }).eq('id', uploadId)
      return NextResponse.json({ error: 'Could not detect column headers in the file.' }, { status: 422 })
    }

    // ── Detect format ────────────────────────────────────────
    const formatResult = detectGpsFormat(headers, records.slice(0, 100))

    await supabase.from('uploaded_gps_files').update({
      detected_format_type: formatResult.type,
    }).eq('id', uploadId)

    // ── Map columns ──────────────────────────────────────────
    let mappingResult = autoMapColumns(headers, formatResult.type)
    let usedManualMapping = false

    if (manualMapping) {
      // Apply manual overrides
      const merged = { ...mappingResult.mapping, ...manualMapping }
      mappingResult = { ...mappingResult, mapping: merged, requiresManualMapping: false }
      usedManualMapping = true
    }

    // If manual mapping still required — return mapping data for the client
    if (mappingResult.requiresManualMapping && !usedManualMapping) {
      await supabase.from('uploaded_gps_files').update({
        processing_status: 'mapping_required',
      }).eq('id', uploadId)

      return NextResponse.json({
        requiresMapping: true,
        headers,
        previewRows: records.slice(0, 5),
        fieldMatches: mappingResult.fieldMatches,
        detectedFormat: formatResult.type,
        overallConfidence: mappingResult.overallConfidence,
      })
    }

    // Check for truck_id column
    if (!mappingResult.mapping['truck_id']) {
      await supabase.from('uploaded_gps_files').update({
        processing_status: 'failed',
        parse_error_log: [{ error: 'No truck ID column identified' }],
      }).eq('id', uploadId)
      return NextResponse.json({
        error: "We could not identify a truck or vehicle ID column. If your export covers only one truck, please add a column with the truck registration or ID before uploading.",
      }, { status: 422 })
    }

    // Check for timestamp column
    if (!mappingResult.mapping['event_timestamp'] &&
        !mappingResult.mapping['stop_start_time']) {
      await supabase.from('uploaded_gps_files').update({
        processing_status: 'failed',
        parse_error_log: [{ error: 'No timestamp column identified' }],
      }).eq('id', uploadId)
      return NextResponse.json({
        error: "We could not identify a timestamp column in your file. Please map the column containing the date and time for each truck event.",
      }, { status: 422 })
    }

    // ── Processing ───────────────────────────────────────────
    await supabase.from('uploaded_gps_files').update({
      processing_status: 'processing',
    }).eq('id', uploadId)

    const normResult = normalizeRows(
      records,
      mappingResult.mapping,
      uploadRecord.timezone_selected,
      plantLat,
      plantLon,
    )

    // Validate timestamps
    const validTimestamps = normResult.events.filter(
      e => e.eventTimestamp || e.stopStartTime
    ).length
    if (validTimestamps < normResult.events.length * 0.3) {
      await supabase.from('uploaded_gps_files').update({
        processing_status: 'failed',
        parse_error_log: [{ error: 'Too many unreadable timestamps' }],
      }).eq('id', uploadId)
      return NextResponse.json({
        error: "Several rows contain unreadable timestamps. This is often caused by timezone formatting. Please verify your export settings or try selecting a different timezone.",
      }, { status: 422 })
    }

    // ── Store normalized events ───────────────────────────────
    // Batch insert in chunks of 500 to avoid payload limits
    const CHUNK = 500
    const eventRows = normResult.events.map(e => ({
      assessment_id: assessmentId,
      upload_id: uploadId,
      truck_id: e.truckId,
      event_timestamp: e.eventTimestamp?.toISOString() ?? null,
      stop_start_time: e.stopStartTime?.toISOString() ?? null,
      stop_end_time: e.stopEndTime?.toISOString() ?? null,
      location_name: e.locationName,
      latitude: e.latitude,
      longitude: e.longitude,
      event_type: e.eventType,
      driver_id: e.driverId,
      speed: e.speed,
      odometer: e.odometer,
      inferred_location_type: e.inferredLocationType,
      raw_row_reference: e.rawRowReference,
      derived_delivery_id: e.derivedDeliveryId,
    }))

    for (let i = 0; i < eventRows.length; i += CHUNK) {
      const chunk = eventRows.slice(i, i + CHUNK)
      await supabase.from('normalized_gps_events').insert(chunk)
    }

    // ── Compute metrics ───────────────────────────────────────
    const metrics = computeMetrics(
      normResult.events,
      normResult.rowsTotal,
      normResult.rowsParsed,
      finalRadiusKm,
    )

    // ── Generate report section ───────────────────────────────
    const sectionText = generateLogisticsSection(metrics)
    const insufficientData = sectionText === '__INSUFFICIENT_DATA__'

    // ── Archive previous analysis results ─────────────────────
    await supabase
      .from('logistics_analysis_results')
      .update({ archived: true })
      .eq('assessment_id', assessmentId)
      .eq('archived', false)

    // ── Store analysis result ─────────────────────────────────
    const { data: resultRecord } = await supabase
      .from('logistics_analysis_results')
      .insert({
        assessment_id: assessmentId,
        upload_id: uploadId,
        avg_turnaround_minutes: metrics.turnaround.avg.value,
        median_turnaround_minutes: metrics.turnaround.median.value,
        p90_turnaround_minutes: metrics.turnaround.p90.value,
        target_ta_minutes: metrics.turnaround.targetTa,
        delivery_radius_km: finalRadiusKm,
        avg_waiting_time_minutes: metrics.siteWait.avg.value,
        median_waiting_time_minutes: metrics.siteWait.median.value,
        probable_return_loads_count: metrics.returnLoads.count,
        probable_return_loads_pct: metrics.returnLoads.pct,
        avg_trips_per_truck_per_day: metrics.fleet.avgTripsPerTruckPerDay,
        trucks_analyzed: metrics.fleet.trucksAnalyzed,
        trips_analyzed: metrics.fleet.tripsAnalyzed,
        rows_parsed_pct: metrics.fleet.rowsParsedPct,
        confidence_score: metrics.confidenceScore,
        calculation_notes: metrics.calculationNotes.join(' | ') || null,
        generated_section_text: insufficientData ? null : sectionText,
      })
      .select()
      .single()

    // Mark upload as complete
    await supabase.from('uploaded_gps_files').update({
      processing_status: 'complete',
      analysis_confidence_score: metrics.confidenceScore,
    }).eq('id', uploadId)

    return NextResponse.json({
      success: true,
      analysisId: resultRecord?.id ?? null,
      confidenceScore: metrics.confidenceScore,
      tripsAnalyzed: metrics.fleet.tripsAnalyzed,
      trucksAnalyzed: metrics.fleet.trucksAnalyzed,
      insufficientData,
      turnaroundAvg: metrics.turnaround.avg.value,
      siteWaitAvg: metrics.siteWait.avg.value,
      targetTa: metrics.turnaround.targetTa,
    })
  } catch (err) {
    console.error('GPS analyze error:', err)
    await supabase.from('uploaded_gps_files').update({
      processing_status: 'failed',
      parse_error_log: [{ error: String(err) }],
    }).eq('id', uploadId)

    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}
