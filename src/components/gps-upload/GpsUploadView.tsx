'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import UploadDropzone from './UploadDropzone'
import ColumnMapper from './ColumnMapper'
import ProcessingStatus, { type GpsStatus } from './ProcessingStatus'
import type { CanonicalField, FieldMatch } from '@/lib/gps/autoMapper'

interface GpsUploadViewProps {
  assessmentId: string
  isAdmin?: boolean
  onUploadComplete?: () => void
}

interface ExistingUpload {
  id: string
  original_filename: string
  processing_status: string
  analysis_confidence_score: number | null
  detected_format_type: string | null
  mapping_template_id: string | null
  parse_error_log: Record<string, unknown> | null
}

interface AnalysisResult {
  trips_analyzed: number | null
  trucks_analyzed: number | null
  avg_turnaround_minutes: number | null
  median_turnaround_minutes: number | null
  p90_turnaround_minutes: number | null
  target_ta_minutes: number | null
  delivery_radius_km: number | null
  avg_waiting_time_minutes: number | null
  confidence_score: number | null
  calculation_notes: string | null
  rows_parsed_pct: number | null
  generated_section_text: string | null
}

interface NormalizedSampleRow {
  truck_id: string | null
  event_timestamp: string | null
  stop_start_time: string | null
  stop_end_time: string | null
  location_name: string | null
  inferred_location_type: string
  raw_row_reference: number | null
}

interface MappingState {
  headers: string[]
  previewRows: Record<string, string>[]
  fieldMatches: FieldMatch[]
  detectedFormat: 'A' | 'B' | 'C'
  uploadId: string
}

export default function GpsUploadView({ assessmentId, isAdmin, onUploadComplete }: GpsUploadViewProps) {
  const supabase = createClient()
  const [status, setStatus] = useState<GpsStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [existingUpload, setExistingUpload] = useState<ExistingUpload | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [mappingState, setMappingState] = useState<MappingState | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [sampleRows, setSampleRows] = useState<NormalizedSampleRow[] | null>(null)

  // ── Load existing upload on mount ────────────────────────
  useEffect(() => {
    if (assessmentId === 'demo') return

    async function load() {
      const { data: upload } = await supabase
        .from('uploaded_gps_files')
        .select('id, original_filename, processing_status, analysis_confidence_score, detected_format_type, mapping_template_id, parse_error_log')
        .eq('assessment_id', assessmentId)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (upload) {
        setExistingUpload(upload)

        // If stuck in a transient state on page reload (no in-memory state to recover),
        // treat as failed so user can re-upload cleanly
        const transientStatuses = ['analyzing', 'processing', 'mapping_required', 'uploaded']
        const displayStatus = transientStatuses.includes(upload.processing_status)
          ? 'failed'
          : upload.processing_status as GpsStatus
        setStatus(displayStatus)
        if (displayStatus === 'failed') {
          setErrorMessage('Previous analysis did not complete. Please upload the file again.')
        }

        if (upload.processing_status === 'complete') {
          // Load analysis result
          const { data: result } = await supabase
            .from('logistics_analysis_results')
            .select('trips_analyzed, trucks_analyzed, avg_turnaround_minutes, median_turnaround_minutes, p90_turnaround_minutes, target_ta_minutes, delivery_radius_km, avg_waiting_time_minutes, confidence_score, calculation_notes, rows_parsed_pct, generated_section_text')
            .eq('assessment_id', assessmentId)
            .eq('archived', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (result) setAnalysisResult(result)

          // Load normalized sample rows (admin debug)
          const { data: rows } = await supabase
            .from('normalized_gps_events')
            .select('truck_id, event_timestamp, stop_start_time, stop_end_time, location_name, inferred_location_type, raw_row_reference')
            .eq('upload_id', upload.id)
            .order('raw_row_reference', { ascending: true })
            .limit(10)

          if (rows) setSampleRows(rows)
        }
      }
    }

    load()
  }, [assessmentId, supabase])

  // ── Handle file selection ────────────────────────────────
  const handleFileSelected = useCallback(async (file: File, timezone: string) => {
    setStatus('uploaded')
    setErrorMessage(null)
    setMappingState(null)

    // Upload file
    const formData = new FormData()
    formData.append('file', file)
    formData.append('assessmentId', assessmentId)
    formData.append('timezone', timezone)

    let uploadId: string
    try {
      const resp = await fetch('/api/gps/upload', { method: 'POST', body: formData })
      const data = await resp.json()

      if (!resp.ok) {
        setStatus('failed')
        setErrorMessage(data.error || 'Upload failed. Please try again.')
        return
      }
      uploadId = data.uploadId
      setExistingUpload({ id: uploadId, original_filename: file.name, processing_status: 'uploaded', analysis_confidence_score: null, detected_format_type: null, mapping_template_id: null, parse_error_log: null })
    } catch {
      setStatus('failed')
      setErrorMessage('Network error during upload. Please try again.')
      return
    }

    // Trigger analysis
    setStatus('analyzing')

    try {
      const resp = await fetch('/api/gps/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, assessmentId }),
      })
      const data = await resp.json()

      if (!resp.ok) {
        setStatus('failed')
        setErrorMessage(data.error || 'Analysis failed.')
        return
      }

      if (data.requiresMapping) {
        // Manual mapping needed
        setStatus('mapping_required')
        setMappingState({
          headers: data.headers,
          previewRows: data.previewRows,
          fieldMatches: data.fieldMatches,
          detectedFormat: data.detectedFormat,
          uploadId,
        })
        return
      }

      if (data.insufficientData) {
        setStatus('failed')
        setErrorMessage('GPS data provided does not contain sufficient information for reliable logistics analysis. Please contact your GPS vendor for a more detailed export, or this section will be completed during the physical assessment.')
        return
      }

      setStatus('complete')
      onUploadComplete?.()
      setAnalysisResult({
        trips_analyzed: data.tripsAnalyzed,
        trucks_analyzed: data.trucksAnalyzed,
        avg_turnaround_minutes: data.turnaroundAvg,
        median_turnaround_minutes: null,
        p90_turnaround_minutes: null,
        target_ta_minutes: data.targetTa,
        delivery_radius_km: null,
        avg_waiting_time_minutes: data.siteWaitAvg,
        confidence_score: data.confidenceScore,
        calculation_notes: null,
        rows_parsed_pct: null,
        generated_section_text: null,
      })
    } catch {
      setStatus('failed')
      setErrorMessage('Analysis failed. Please try again.')
    }
  }, [assessmentId, onUploadComplete])

  // ── Handle manual mapping confirmation ───────────────────
  const handleMappingConfirm = useCallback(async (mapping: Record<CanonicalField, string | null>) => {
    if (!mappingState) return
    setStatus('processing')
    setMappingState(null)

    try {
      const resp = await fetch('/api/gps/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: mappingState.uploadId,
          assessmentId,
          manualMapping: mapping,
        }),
      })
      const data = await resp.json()

      if (!resp.ok) {
        setStatus('failed')
        setErrorMessage(data.error || 'Analysis failed.')
        return
      }

      setStatus('complete')
      onUploadComplete?.()
      setAnalysisResult({
        trips_analyzed: data.tripsAnalyzed,
        trucks_analyzed: data.trucksAnalyzed,
        avg_turnaround_minutes: data.turnaroundAvg,
        median_turnaround_minutes: null,
        p90_turnaround_minutes: null,
        target_ta_minutes: data.targetTa,
        delivery_radius_km: null,
        avg_waiting_time_minutes: data.siteWaitAvg,
        confidence_score: data.confidenceScore,
        calculation_notes: null,
        rows_parsed_pct: null,
        generated_section_text: null,
      })
    } catch {
      setStatus('failed')
      setErrorMessage('Analysis failed. Please try again.')
    }
  }, [assessmentId, mappingState, onUploadComplete])

  // ── Skipped state ────────────────────────────────────────
  if (skipped) {
    return (
      <div style={{ padding: '40px 32px', maxWidth: '640px' }}>
        <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '12px' }}>
          GPS data upload skipped. The Logistics Intelligence section will not appear in the report.
        </div>
        <button
          onClick={() => setSkipped(false)}
          style={{
            padding: '7px 16px', background: 'none',
            border: '1px solid var(--border)', borderRadius: '6px',
            fontSize: '12px', color: 'var(--gray-500)', cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          Upload GPS data after all
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
      <div style={{ maxWidth: '680px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '6px' }}>
            GPS Fleet Data
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: '1.6' }}>
            Upload a fleet management CSV export to automatically calculate turnaround time,
            site waiting time, and return load rate — and include a Logistics Intelligence
            section in the report.
          </p>
        </div>

        {/* Status indicator */}
        {status !== 'idle' && status !== 'mapping_required' && (
          <div style={{ marginBottom: '20px' }}>
            <ProcessingStatus
              status={status}
              errorMessage={errorMessage}
              confidenceScore={analysisResult?.confidence_score ?? existingUpload?.analysis_confidence_score}
              tripsAnalyzed={analysisResult?.trips_analyzed}
              trucksAnalyzed={analysisResult?.trucks_analyzed}
            />
          </div>
        )}

        {/* Manual column mapper */}
        {mappingState && (
          <div style={{ marginBottom: '20px' }}>
            <ColumnMapper
              uploadedHeaders={mappingState.headers}
              previewRows={mappingState.previewRows}
              fieldMatches={mappingState.fieldMatches}
              onConfirm={handleMappingConfirm}
              onCancel={() => {
                setMappingState(null)
                setStatus('idle')
              }}
            />
          </div>
        )}

        {/* Summary when complete */}
        {status === 'complete' && analysisResult && (
          <div style={{
            padding: '16px 20px', borderRadius: '10px',
            border: '1px solid var(--tooltip-border)',
            background: 'var(--phase-complete-bg)',
            marginBottom: '20px',
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px',
          }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '3px' }}>Avg turnaround</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--gray-900)' }}>
                {analysisResult.avg_turnaround_minutes !== null
                  ? `${analysisResult.avg_turnaround_minutes} min`
                  : '—'}
              </div>
              {analysisResult.target_ta_minutes !== null && (
                <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                  Target: {analysisResult.target_ta_minutes} min
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '3px' }}>Avg site wait</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--gray-900)' }}>
                {analysisResult.avg_waiting_time_minutes !== null
                  ? `${analysisResult.avg_waiting_time_minutes} min`
                  : '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>Benchmark: 25 min</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '3px' }}>Trips analysed</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--gray-900)' }}>
                {analysisResult.trips_analyzed ?? '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                {analysisResult.trucks_analyzed ?? '?'} trucks
              </div>
            </div>
          </div>
        )}

        {/* Upload dropzone — show when not yet complete or to allow re-upload */}
        {(status === 'idle' || status === 'failed' || status === 'complete') && (
          <UploadDropzone
            onFileSelected={handleFileSelected}
            onSkip={() => setSkipped(true)}
            uploading={false}
            hasExistingUpload={status === 'complete'}
            existingFilename={existingUpload?.original_filename}
          />
        )}

        {/* Admin debug panel */}
        {isAdmin && existingUpload && (
          <details style={{ marginTop: '24px' }}>
            <summary style={{
              fontSize: '11px', color: 'var(--gray-400)', cursor: 'pointer',
              fontFamily: 'var(--mono)',
            }}>
              Admin: GPS debug info
            </summary>
            <div style={{
              marginTop: '10px', padding: '12px', borderRadius: '8px',
              background: 'var(--gray-50)', border: '1px solid var(--border)',
              fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--gray-600)',
              lineHeight: '1.8', display: 'flex', flexDirection: 'column', gap: '12px',
            }}>

              {/* Upload record */}
              <div>
                <div style={{ fontWeight: 700, color: 'var(--gray-800)', marginBottom: '2px' }}>UPLOAD</div>
                <div>ID: {existingUpload.id}</div>
                <div>Status: {existingUpload.processing_status}</div>
                <div>Format detected: {existingUpload.detected_format_type ?? 'N/A'}</div>
                <div>Template applied: {existingUpload.mapping_template_id ?? 'none (auto-mapped)'}</div>
                <div>Analysis confidence: {existingUpload.analysis_confidence_score ?? 'N/A'}</div>
              </div>

              {/* Column mapping */}
              {(() => {
                const debug = (existingUpload.parse_error_log as Record<string, unknown> | null)?.debug as Record<string, unknown> | undefined
                if (!debug) return null
                const headers = debug.headers as string[] | undefined
                const fieldMatches = debug.fieldMatches as Array<{ canonical: string; mappedColumn: string | null; confidence: number }> | undefined
                const mapConf = debug.overallMappingConfidence as number | undefined
                return (
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--gray-800)', marginBottom: '2px' }}>COLUMN MAPPING</div>
                    <div>Overall mapping confidence: {mapConf != null ? `${Math.round(mapConf * 100)}%` : 'N/A'}</div>
                    <div>Manual mapping used: {String(debug.usedManualMapping ?? false)}</div>
                    {headers && <div>Headers ({headers.length}): {headers.join(', ')}</div>}
                    {fieldMatches && fieldMatches.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        {fieldMatches.filter(f => f.mappedColumn).map(f => (
                          <div key={f.canonical}>
                            {f.canonical} → {f.mappedColumn} ({Math.round(f.confidence * 100)}%)
                          </div>
                        ))}
                        {fieldMatches.filter(f => !f.mappedColumn).map(f => (
                          <div key={f.canonical} style={{ color: 'var(--gray-400)' }}>
                            {f.canonical} → unmapped
                          </div>
                        ))}
                      </div>
                    )}
                    <div>Rows parsed: {String(debug.rowsParsed ?? 'N/A')} / {String(debug.rowsTotal ?? 'N/A')}</div>
                  </div>
                )
              })()}

              {/* Analysis result */}
              {analysisResult && (
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--gray-800)', marginBottom: '2px' }}>METRICS</div>
                  <div>Trips analyzed: {analysisResult.trips_analyzed ?? 'N/A'}</div>
                  <div>Trucks analyzed: {analysisResult.trucks_analyzed ?? 'N/A'}</div>
                  <div>Rows parsed: {analysisResult.rows_parsed_pct != null ? `${analysisResult.rows_parsed_pct}%` : 'N/A'}</div>
                  <div>Delivery radius: {analysisResult.delivery_radius_km ?? 'N/A'} km</div>
                  <div>Target TA: {analysisResult.target_ta_minutes ?? 'N/A'} min</div>
                  <div>Avg TA: {analysisResult.avg_turnaround_minutes ?? 'N/A'} min</div>
                  <div>Median TA: {analysisResult.median_turnaround_minutes ?? 'N/A'} min</div>
                  <div>P90 TA: {analysisResult.p90_turnaround_minutes ?? 'N/A'} min</div>
                  <div>Avg site wait: {analysisResult.avg_waiting_time_minutes ?? 'N/A'} min</div>
                  {analysisResult.calculation_notes && (
                    <div>Notes: {analysisResult.calculation_notes}</div>
                  )}
                </div>
              )}

              {/* Parse errors */}
              {(() => {
                const log = existingUpload.parse_error_log as Record<string, unknown> | null
                const errors = log?.errors as Array<{ error: string }> | undefined
                if (!errors?.length) return null
                return (
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: '2px' }}>PARSE ERRORS</div>
                    {errors.map((e, i) => <div key={i} style={{ color: 'var(--red)' }}>{e.error}</div>)}
                  </div>
                )
              })()}

              {/* Normalized sample rows */}
              {sampleRows && sampleRows.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--gray-800)', marginBottom: '4px' }}>
                    NORMALIZED EVENTS (first {sampleRows.length})
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: '100%' }}>
                      <thead>
                        <tr style={{ background: 'var(--gray-100)' }}>
                          {['row', 'truck', 'event_ts', 'stop_start', 'stop_end', 'location', 'type'].map(h => (
                            <th key={h} style={{ padding: '2px 6px', border: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleRows.map((row, i) => (
                          <tr key={i}>
                            <td style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>{row.raw_row_reference ?? i}</td>
                            <td style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>{row.truck_id ?? '—'}</td>
                            <td style={{ padding: '2px 6px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{row.event_timestamp ? row.event_timestamp.slice(0, 16) : '—'}</td>
                            <td style={{ padding: '2px 6px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{row.stop_start_time ? row.stop_start_time.slice(0, 16) : '—'}</td>
                            <td style={{ padding: '2px 6px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{row.stop_end_time ? row.stop_end_time.slice(0, 16) : '—'}</td>
                            <td style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>{row.location_name ?? '—'}</td>
                            <td style={{ padding: '2px 6px', border: '1px solid var(--border)' }}>{row.inferred_location_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </details>
        )}
      </div>
    </div>
  )
}
