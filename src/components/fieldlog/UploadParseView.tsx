'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DailyLogRow } from '@/lib/fieldlog/types'
import ParsePreviewTable from './ParsePreviewTable'

type Status = 'idle' | 'uploading' | 'parsing' | 'preview' | 'saving' | 'done' | 'error'
type PartialTrip = Partial<DailyLogRow> & { _idx: number }

interface UploadParseViewProps {
  assessmentId: string
  plantId: string
  logDate: string
  onSaved: () => void
}

const ACCEPTED = '.jpg,.jpeg,.png,.pdf,.csv,.xlsx'
const MAX_SIZE_MB = 20

export default function UploadParseView({ assessmentId, plantId, logDate, onSaved }: UploadParseViewProps) {
  const supabase = createClient()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [rows, setRows] = useState<PartialTrip[]>([])
  const [savingApproval, setSavingApproval] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    setError('')

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large (max ${MAX_SIZE_MB}MB)`)
      return
    }

    // Upload
    setStatus('uploading')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('assessmentId', assessmentId)
    formData.append('logDate', logDate)

    try {
      const uploadResp = await fetch('/api/fieldlog/upload', { method: 'POST', body: formData })
      if (!uploadResp.ok) {
        const body = await uploadResp.json().catch(() => ({}))
        throw new Error(body.error || `Upload failed (${uploadResp.status})`)
      }
      const { uploadId: uid } = await uploadResp.json()
      setUploadId(uid)

      // Parse
      setStatus('parsing')
      const parseResp = await fetch('/api/fieldlog/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: uid, assessmentId, logDate }),
      })
      if (!parseResp.ok) {
        const body = await parseResp.json().catch(() => ({}))
        throw new Error(body.error || `Parse failed (${parseResp.status})`)
      }
      const { rows: parsed } = await parseResp.json()
      setRows((parsed as Partial<DailyLogRow>[]).map((r, i) => ({ ...r, _idx: i })))
      setStatus('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [assessmentId, logDate])

  const handleRowChange = useCallback((idx: number, field: string, value: string) => {
    setRows(prev => prev.map(r => {
      if (r._idx !== idx) return r
      if (field === 'rejected') return { ...r, rejected: value === 'true' }
      if (field === 'load_m3') return { ...r, load_m3: value ? parseFloat(value) : null }
      return { ...r, [field]: value || null }
    }))
  }, [])

  const handleRowDelete = useCallback((idx: number) => {
    setRows(prev => prev.filter(r => r._idx !== idx))
  }, [])

  const handleApprove = useCallback(async () => {
    setSavingApproval(true)
    const mapped = rows.map(r => ({
      assessment_id: assessmentId,
      plant_id: plantId,
      log_date: logDate,
      truck_id: r.truck_id || null,
      driver_name: r.driver_name || null,
      site_name: r.site_name || null,
      departure_loaded: r.departure_loaded || null,
      arrival_site: r.arrival_site || null,
      discharge_start: r.discharge_start || null,
      discharge_end: r.discharge_end || null,
      departure_site: r.departure_site || null,
      arrival_plant: r.arrival_plant || null,
      load_m3: r.load_m3 ?? null,
      rejected: r.rejected ?? false,
      reject_side: r.reject_side || null,
      reject_cause: r.reject_cause || null,
      notes: r.notes || null,
      data_source: 'document_upload',
      upload_id: uploadId,
    }))

    const { error: dbErr } = await supabase.from('daily_logs').insert(mapped)
    if (dbErr) {
      setError(dbErr.message)
      setStatus('error')
      return
    }

    // Update upload status
    if (uploadId) {
      await supabase.from('daily_log_uploads')
        .update({ processing_status: 'approved', row_count: rows.length })
        .eq('id', uploadId)
    }

    setStatus('done')
    onSaved()
  }, [rows, assessmentId, plantId, logDate, uploadId, supabase, onSaved])

  const handleCancel = useCallback(() => {
    setRows([])
    setUploadId(null)
    setStatus('idle')
    setError('')
  }, [])

  if (status === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: '#0F6E56' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Saved</div>
        <div style={{ fontSize: '13px', color: '#888' }}>{rows.length} trips imported from document.</div>
        <button type="button" onClick={handleCancel}
          style={{ marginTop: '12px', padding: '6px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: '13px', cursor: 'pointer' }}>
          Upload another
        </button>
      </div>
    )
  }

  if (status === 'preview') {
    return (
      <ParsePreviewTable
        rows={rows}
        onRowChange={handleRowChange}
        onRowDelete={handleRowDelete}
        onApprove={handleApprove}
        onCancel={handleCancel}
        saving={savingApproval}
      />
    )
  }

  return (
    <div>
      <div
        style={{
          border: '2px dashed #d1d5db', borderRadius: '10px', padding: '32px 16px',
          textAlign: 'center', cursor: status === 'idle' || status === 'error' ? 'pointer' : 'default',
          background: '#fafafa',
        }}
        onClick={() => {
          if (status !== 'idle' && status !== 'error') return
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = ACCEPTED
          input.onchange = (e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) handleFile(f)
          }
          input.click()
        }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation()
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
      >
        {status === 'idle' || status === 'error' ? (
          <>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#555', marginBottom: '4px' }}>
              Drop a file here or click to browse
            </div>
            <div style={{ fontSize: '11px', color: '#aaa' }}>
              JPG, PNG, PDF, CSV, or Excel. Max {MAX_SIZE_MB}MB.
            </div>
          </>
        ) : status === 'uploading' ? (
          <div style={{ color: '#888', fontSize: '13px' }}>Uploading...</div>
        ) : status === 'parsing' ? (
          <div style={{ color: '#0F6E56', fontSize: '13px' }}>Analyzing document...</div>
        ) : null}
      </div>
      {error && <div style={{ color: '#c0392b', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
    </div>
  )
}
