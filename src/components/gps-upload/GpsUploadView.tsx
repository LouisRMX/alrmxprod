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
}

interface ExistingUpload {
  id: string
  original_filename: string
  processing_status: string
  analysis_confidence_score: number | null
}

interface AnalysisResult {
  trips_analyzed: number | null
  trucks_analyzed: number | null
  avg_turnaround_minutes: number | null
  target_ta_minutes: number | null
  avg_waiting_time_minutes: number | null
  confidence_score: number | null
  generated_section_text: string | null
}

interface MappingState {
  headers: string[]
  previewRows: Record<string, string>[]
  fieldMatches: FieldMatch[]
  detectedFormat: 'A' | 'B' | 'C'
  uploadId: string
}

export default function GpsUploadView({ assessmentId, isAdmin }: GpsUploadViewProps) {
  const supabase = createClient()
  const [status, setStatus] = useState<GpsStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [existingUpload, setExistingUpload] = useState<ExistingUpload | null>(null)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [mappingState, setMappingState] = useState<MappingState | null>(null)
  const [skipped, setSkipped] = useState(false)

  // ── Load existing upload on mount ────────────────────────
  useEffect(() => {
    if (assessmentId === 'demo') return

    async function load() {
      const { data: upload } = await supabase
        .from('uploaded_gps_files')
        .select('id, original_filename, processing_status, analysis_confidence_score')
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
            .select('trips_analyzed, trucks_analyzed, avg_turnaround_minutes, target_ta_minutes, avg_waiting_time_minutes, confidence_score, generated_section_text')
            .eq('assessment_id', assessmentId)
            .eq('archived', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (result) setAnalysisResult(result)
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
      setExistingUpload({ id: uploadId, original_filename: file.name, processing_status: 'uploaded', analysis_confidence_score: null })
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
      setAnalysisResult({
        trips_analyzed: data.tripsAnalyzed,
        trucks_analyzed: data.trucksAnalyzed,
        avg_turnaround_minutes: data.turnaroundAvg,
        target_ta_minutes: data.targetTa,
        avg_waiting_time_minutes: data.siteWaitAvg,
        confidence_score: data.confidenceScore,
        generated_section_text: null,
      })
    } catch {
      setStatus('failed')
      setErrorMessage('Analysis failed. Please try again.')
    }
  }, [assessmentId])

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
      setAnalysisResult({
        trips_analyzed: data.tripsAnalyzed,
        trucks_analyzed: data.trucksAnalyzed,
        avg_turnaround_minutes: data.turnaroundAvg,
        target_ta_minutes: data.targetTa,
        avg_waiting_time_minutes: data.siteWaitAvg,
        confidence_score: data.confidenceScore,
        generated_section_text: null,
      })
    } catch {
      setStatus('failed')
      setErrorMessage('Analysis failed. Please try again.')
    }
  }, [assessmentId, mappingState])

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
              lineHeight: '1.7',
            }}>
              <div>Upload ID: {existingUpload.id}</div>
              <div>Status: {existingUpload.processing_status}</div>
              <div>Confidence: {existingUpload.analysis_confidence_score ?? 'N/A'}</div>
              {analysisResult && (
                <>
                  <div>Trips: {analysisResult.trips_analyzed}</div>
                  <div>Trucks: {analysisResult.trucks_analyzed}</div>
                  <div>Target TA: {analysisResult.target_ta_minutes} min</div>
                </>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
