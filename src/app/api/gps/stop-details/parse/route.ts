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

  // `?reset=true` tells the route this is the first batch in a new
  // analysis — archive previous batches first. Without it, the route
  // APPENDS to whatever's already there. Used by the client when
  // uploading many files one-at-a-time to stay under Vercel's 4.5MB
  // body limit.
  const resetMode = req.nextUrl.searchParams.get('reset') === 'true'

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

  // Read all file bytes into memory. Per-request size is bounded by
  // Vercel's body limit (~4.5MB) — the client breaks large uploads into
  // single-file batches.
  const inputs: ParseInput[] = []
  for (const f of files) {
    inputs.push({
      filename: f.name,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })
  }

  // Cross-request duplicate detection: pull MD5s from prior uploaded_gps_files
  // rows for this assessment, pass them into the parser as known-seen. This
  // prevents the same file being ingested twice across separate API calls.
  const { data: priorUploads } = await supabase
    .from('uploaded_gps_files')
    .select('id, original_filename, parse_error_log')
    .eq('assessment_id', assessmentId)
    .eq('archived', false)
  const priorMd5s = new Map<string, string>()
  for (const u of priorUploads ?? []) {
    const log = (u.parse_error_log ?? {}) as Record<string, unknown>
    const md5 = typeof log.batch_md5 === 'string' ? log.batch_md5 : null
    const acceptedMd5s = Array.isArray(log.accepted_md5s) ? log.accepted_md5s as string[] : []
    // Collect every MD5 we've seen in any prior batch for this assessment.
    for (const m of acceptedMd5s) {
      priorMd5s.set(m, String(u.original_filename ?? 'unknown'))
    }
    if (md5) priorMd5s.set(md5, String(u.original_filename ?? 'unknown'))
  }

  // Parse with strict validation (MD5 dedup, filename/header match,
  // out-of-bounds events flagged).
  const parseResult = parseStopDetailsFiles(inputs)

  // Enforce cross-request MD5 dedup on top of the parser's in-request dedup.
  // Move any newly-accepted file that's a duplicate of an earlier batch
  // into rejections.
  const acceptedMd5s: string[] = []
  const crossRejections: typeof parseResult.filesRejected = []
  const keepFiles: typeof parseResult.filesAccepted = []
  const keepFilenames = new Set<string>()
  for (const accepted of parseResult.filesAccepted) {
    const priorFile = priorMd5s.get(accepted.md5)
    if (priorFile) {
      crossRejections.push({
        filename: accepted.filename,
        reason: 'md5_duplicate',
        detail: `byte-identical to previously ingested file ${priorFile}`,
        duplicateOf: priorFile,
      })
    } else {
      keepFiles.push(accepted)
      keepFilenames.add(accepted.filename)
      acceptedMd5s.push(accepted.md5)
    }
  }
  const eventsFromKeptFiles = parseResult.events.filter(e => keepFilenames.has(e.sourceFile))

  // Apply positive Riyadh-region filter (drops Makkah-dedicated trucks,
  // surfaces outliers for UI attention).
  const classified = classifyTrucksByRegion(eventsFromKeptFiles, RIYADH_BBOX)

  // Generate plant candidates for UI confirmation.
  const clusters = clusterByCoordinate(classified.kept)
  const candidates = identifyPlantCandidates(clusters, 10)

  // Reset mode: clear previous batches so the caller starts from a clean
  // slate. Append mode (default for chunked multi-batch uploads): leave
  // existing batches intact and just add this one alongside.
  if (resetMode) {
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
  }

  // Create an uploaded_gps_files row representing this batch. Each API
  // call yields one row, so a multi-call accumulating upload produces N
  // rows for the same assessment. All rows carry accepted_md5s so the
  // next call can dedup against them.
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
        files_accepted: keepFiles.map(f => f.filename),
        files_rejected: [...parseResult.filesRejected, ...crossRejections],
        accepted_md5s: acceptedMd5s,
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
    filesRejected: parseResult.filesRejected.length + crossRejections.length,
    eventsIngested: rows.length,
    eventsTotal: eventsFromKeptFiles.length,
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
    rejections: [
      ...parseResult.filesRejected.map(r => ({
        filename: r.filename,
        reason: r.reason as string,
        detail: r.detail,
      })),
      ...crossRejections.map(r => ({
        filename: r.filename,
        reason: r.reason as string,
        detail: r.detail,
      })),
    ],
  }

  return NextResponse.json(summary)
}
