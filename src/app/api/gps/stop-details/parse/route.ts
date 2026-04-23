/**
 * POST /api/gps/stop-details/parse
 *
 * Multi-file TrackUS Stop Details upload. Parses each XLS file, validates
 * (MD5 dedup, filename/header mismatch, out-of-bounds timestamps), applies
 * the Riyadh positive-region filter, then persists normalised events to
 * the existing `normalized_gps_events` table (shared with CSV-format
 * pipeline — same downstream schema, different parse path).
 *
 * Request: FormData with assessmentId + N files (key "file0", "file1", ...).
 * Response: ParseSummary with per-file acceptance/rejection + cluster
 * candidates for the user to confirm in the Plant Profile UI.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  parseStopDetailsFiles,
  classifyTrucksByRegion,
  RIYADH_BBOX,
  type ParseInput,
} from '@/lib/gps/stopDetailsParser'
import {
  clusterByCoordinate,
  identifyPlantCandidates,
} from '@/lib/gps/coordinateClustering'

export const maxDuration = 120

interface ClusterCandidate {
  clusterKey: string
  centroid: { lat: number; lon: number }
  stopCount: number
  distinctTrucks: number
  mixerShare: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}

interface ParseSummary {
  assessmentId: string
  filesAccepted: number
  filesRejected: number
  eventsIngested: number
  eventsTotal: number
  eventsInScope: number
  trucksInScope: number
  trucksOutOfScope: number
  trucksOutliers: number
  outlierProfiles: Array<{
    truckId: string
    totalStops: number
    regionShare: number
    note: string
  }>
  plantCandidates: ClusterCandidate[]
  rejections: Array<{ filename: string; reason: string; detail: string }>
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const assessmentId = formData.get('assessmentId') as string | null
  if (!assessmentId) {
    return NextResponse.json({ error: 'assessmentId required' }, { status: 400 })
  }

  // Collect all File entries (fields "file0", "file1", ..., or "files"/"files[]")
  const files: File[] = []
  formData.forEach((value, key) => {
    if (value instanceof File && key !== 'assessmentId') {
      files.push(value)
    }
  })

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
  }

  // Check assessment exists + user has access (RLS enforces this on subsequent queries
  // but a 404 is friendlier than silent skip).
  const { data: assessment, error: asmtErr } = await supabase
    .from('assessments')
    .select('id')
    .eq('id', assessmentId)
    .single()
  if (asmtErr || !assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  // Read all file bytes into memory. Safe up to ~50 files × 500KB = 25MB.
  // For heavier volumes, revisit with streaming.
  const inputs: ParseInput[] = []
  for (const f of files) {
    inputs.push({
      filename: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })
  }

  // Parse with strict validation (MD5 dedup, filename/header match,
  // out-of-bounds events flagged).
  const parseResult = parseStopDetailsFiles(inputs)

  // Apply positive Riyadh-region filter (drops Makkah-dedicated trucks,
  // surfaces outliers for UI attention).
  const classified = classifyTrucksByRegion(parseResult.events, RIYADH_BBOX)

  // Generate plant candidates for UI confirmation.
  const clusters = clusterByCoordinate(classified.kept)
  const candidates = identifyPlantCandidates(clusters, 10)

  // Clear previous uploaded_gps_files (and cascade-delete their events)
  // for this assessment. Matches the CSV pipeline's archive-on-upload
  // pattern.
  const { data: previousUploads } = await supabase
    .from('uploaded_gps_files')
    .select('id')
    .eq('assessment_id', assessmentId)
    .eq('archived', false)

  if (previousUploads && previousUploads.length > 0) {
    const previousIds = previousUploads.map(u => u.id)
    await supabase
      .from('normalized_gps_events')
      .delete()
      .in('upload_id', previousIds)
    await supabase
      .from('uploaded_gps_files')
      .update({ archived: true })
      .in('id', previousIds)
  }

  // Create a single uploaded_gps_files row representing this multi-file
  // batch. normalized_gps_events requires a non-null upload_id FK, so
  // every event row needs to point at this batch record. storage_path is
  // synthetic — stop-details pipeline doesn't currently store raw XLS
  // bytes in Supabase Storage (revisit if audit trail is needed).
  const batchFilename = files.length === 1
    ? files[0].name
    : `stop-details-batch-${files.length}-files`
  const { data: uploadRecord, error: uploadErr } = await supabase
    .from('uploaded_gps_files')
    .insert({
      assessment_id: assessmentId,
      original_filename: batchFilename,
      timezone_selected: 'AST',
      storage_path: `stop-details-batch/${assessmentId}/${Date.now()}`,
      processing_status: 'complete',
      parse_error_log: {
        source: 'stop-details',
        files_accepted: parseResult.filesAccepted.map(f => f.filename),
        files_rejected: parseResult.filesRejected,
      },
    })
    .select('id')
    .single()

  if (uploadErr || !uploadRecord) {
    return NextResponse.json(
      { error: `Failed to create batch record: ${uploadErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  // Batch-insert in chunks of 500 (matches existing analyze route pattern).
  const CHUNK = 500
  const rows = classified.kept.map(e => ({
    assessment_id: assessmentId,
    upload_id: uploadRecord.id,
    truck_id: e.truckId,
    event_timestamp: e.startedAt + 'Z',  // naive → UTC; timezone normalization is TODO
    stop_start_time: e.startedAt + 'Z',
    stop_end_time: e.endedAt + 'Z',
    latitude: e.latitude,
    longitude: e.longitude,
    raw_row_reference: e.sourceRow,
    inferred_location_type: 'unknown',  // refined later by plant-geofence classification
  }))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('normalized_gps_events')
      .insert(chunk)
    if (error) {
      // Rollback: delete any events inserted under this batch + the batch row itself.
      await supabase
        .from('normalized_gps_events')
        .delete()
        .eq('upload_id', uploadRecord.id)
      await supabase
        .from('uploaded_gps_files')
        .delete()
        .eq('id', uploadRecord.id)
      return NextResponse.json(
        { error: `Event insert failed at chunk ${Math.floor(i / CHUNK) + 1}: ${error.message}` },
        { status: 500 },
      )
    }
  }

  const summary: ParseSummary = {
    assessmentId,
    filesAccepted: parseResult.filesAccepted.length,
    filesRejected: parseResult.filesRejected.length,
    eventsIngested: rows.length,
    eventsTotal: parseResult.events.length,
    eventsInScope: classified.summary.eventsKept,
    trucksInScope: classified.summary.trucksInScope,
    trucksOutOfScope: classified.summary.trucksOutOfScope,
    trucksOutliers: classified.summary.trucksOutliers,
    outlierProfiles: classified.truckProfiles
      .filter(p => p.classification === 'outlier')
      .map(p => ({
        truckId: p.truckId,
        totalStops: p.totalStops,
        regionShare: p.regionShare,
        note: p.note,
      })),
    plantCandidates: candidates.slice(0, 5),
    rejections: parseResult.filesRejected.map(r => ({
      filename: r.filename,
      reason: r.reason,
      detail: r.detail,
    })),
  }

  return NextResponse.json(summary)
}
