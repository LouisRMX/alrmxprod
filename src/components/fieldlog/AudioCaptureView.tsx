'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DailyLogRow } from '@/lib/fieldlog/types'
import ParsePreviewTable from './ParsePreviewTable'

type Status = 'idle' | 'recording' | 'recorded' | 'uploading' | 'transcribing' | 'preview' | 'saving' | 'done' | 'error'
type Mode = 'structured' | 'interview'
type PartialTrip = Partial<DailyLogRow> & { _idx: number }

interface AudioCaptureViewProps {
  assessmentId: string
  plantId: string
  logDate: string
  onSaved: () => void
}

export default function AudioCaptureView({ assessmentId, plantId, logDate, onSaved }: AudioCaptureViewProps) {
  const supabase = createClient()
  const [status, setStatus] = useState<Status>('idle')
  const [mode, setMode] = useState<Mode>('structured')
  const [error, setError] = useState('')
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [rows, setRows] = useState<PartialTrip[]>([])
  const [transcript, setTranscript] = useState('')
  const [translation, setTranslation] = useState('')
  const [language, setLanguage] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [savingApproval, setSavingApproval] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setStatus('recording')
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch {
      setError('Microphone access denied')
      setStatus('error')
    }
  }, [])

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setStatus('recorded')
  }, [])

  const handleFileUpload = useCallback((file: File) => {
    setAudioBlob(file)
    setAudioUrl(URL.createObjectURL(file))
    setStatus('recorded')
  }, [])

  const transcribe = useCallback(async () => {
    if (!audioBlob) return
    setStatus('transcribing')
    setError('')

    const formData = new FormData()
    const ext = audioBlob.type.includes('webm') ? 'webm' : audioBlob.type.includes('mp4') ? 'mp4' : 'wav'
    formData.append('audio', audioBlob, `recording.${ext}`)
    formData.append('assessmentId', assessmentId)
    formData.append('logDate', logDate)
    formData.append('mode', mode)

    try {
      const resp = await fetch('/api/fieldlog/transcribe', { method: 'POST', body: formData })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || `Transcription failed (${resp.status})`)
      }
      const data = await resp.json()
      setUploadId(data.uploadId)
      setTranscript(data.transcription || '')
      setTranslation(data.translation || '')
      setLanguage(data.language || 'en')

      if (data.mode === 'structured' && data.rows) {
        setRows((data.rows as Partial<DailyLogRow>[]).map((r, i) => ({ ...r, _idx: i })))
        setStatus('preview')
      } else {
        // Interview mode or no structured data
        setStatus('preview')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
      setStatus('error')
    }
  }, [audioBlob, assessmentId, logDate, mode])

  const saveInterviewNote = useCallback(async () => {
    setSavingApproval(true)
    const noteText = translation || transcript
    const { error: dbErr } = await supabase.from('daily_logs').insert({
      assessment_id: assessmentId,
      plant_id: plantId,
      log_date: logDate,
      truck_id: null,
      notes: noteText,
      data_source: 'audio',
      upload_id: uploadId,
    })
    setSavingApproval(false)
    if (dbErr) { setError(dbErr.message); return }
    setStatus('done')
    onSaved()
  }, [transcript, translation, assessmentId, plantId, logDate, uploadId, supabase, onSaved])

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

  const handleApproveStructured = useCallback(async () => {
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
      arrival_plant: r.arrival_plant || null,
      load_m3: r.load_m3 ?? null,
      rejected: r.rejected ?? false,
      notes: r.notes || null,
      data_source: 'audio' as const,
      upload_id: uploadId,
    }))
    const { error: dbErr } = await supabase.from('daily_logs').insert(mapped)
    setSavingApproval(false)
    if (dbErr) { setError(dbErr.message); return }
    if (uploadId) {
      await supabase.from('daily_log_uploads').update({ processing_status: 'approved', row_count: rows.length }).eq('id', uploadId)
    }
    setStatus('done')
    onSaved()
  }, [rows, assessmentId, plantId, logDate, uploadId, supabase, onSaved])

  const reset = useCallback(() => {
    setStatus('idle')
    setError('')
    setAudioBlob(null)
    setAudioUrl(null)
    setRows([])
    setTranscript('')
    setTranslation('')
    setUploadId(null)
    setRecordingTime(0)
    setSavingApproval(false)
  }, [])

  const fmtSec = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const modeBtn = (m: Mode, label: string) => (
    <button type="button" onClick={() => setMode(m)}
      style={{
        padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
        border: `1.5px solid ${mode === m ? '#0F6E56' : '#d1d5db'}`,
        background: mode === m ? '#e8f5ee' : '#fff',
        color: mode === m ? '#0F6E56' : '#888',
      }}>
      {label}
    </button>
  )

  if (status === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: '#0F6E56' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Saved</div>
        <div style={{ fontSize: '13px', color: '#888' }}>
          {mode === 'interview' ? 'Interview note saved.' : `${rows.length} trips saved from audio.`}
        </div>
        <button type="button" onClick={reset}
          style={{ marginTop: '12px', padding: '6px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: '13px', cursor: 'pointer' }}>
          Record another
        </button>
      </div>
    )
  }

  // Preview: structured shows ParsePreviewTable, interview shows transcript
  if (status === 'preview') {
    return (
      <div>
        {/* Transcript display */}
        {transcript && (
          <div style={{ marginBottom: '16px', padding: '12px', background: '#f9faf9', borderRadius: '8px', border: '1px solid #e8e8e6' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
              Transcription{language && language !== 'en' ? ` (${language})` : ''}
            </div>
            <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.5 }}>{transcript}</div>
            {translation && (
              <>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#888', textTransform: 'uppercase', marginTop: '10px', marginBottom: '4px' }}>English translation</div>
                <div style={{ fontSize: '12px', color: '#333', lineHeight: 1.5 }}>{translation}</div>
              </>
            )}
          </div>
        )}

        {mode === 'interview' ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={saveInterviewNote} disabled={savingApproval}
              style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0F6E56', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: savingApproval ? 0.6 : 1 }}>
              {savingApproval ? 'Saving...' : 'Save as field note'}
            </button>
            <button type="button" onClick={reset}
              style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        ) : (
          <ParsePreviewTable
            rows={rows}
            onRowChange={handleRowChange}
            onRowDelete={handleRowDelete}
            onApprove={handleApproveStructured}
            onCancel={reset}
            saving={savingApproval}
          />
        )}
        {error && <div style={{ color: '#c0392b', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
      </div>
    )
  }

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {modeBtn('structured', 'Structured log')}
        {modeBtn('interview', 'Interview note')}
      </div>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '14px' }}>
        {mode === 'structured'
          ? 'Record or upload audio describing truck trips. The system will extract structured data.'
          : 'Record or upload an interview. The system will transcribe and translate, saved as a field note.'}
      </div>

      {/* Record / Upload */}
      {(status === 'idle' || status === 'error') && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button type="button" onClick={startRecording}
            style={{
              width: '64px', height: '64px', borderRadius: '50%', border: 'none',
              background: '#c0392b', color: '#fff', fontSize: '24px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            ●
          </button>
          <div style={{ fontSize: '12px', color: '#888' }}>or</div>
          <button type="button" onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = '.mp3,.wav,.m4a,.webm,.ogg,.mp4'
            input.onchange = e => {
              const f = (e.target as HTMLInputElement).files?.[0]
              if (f) handleFileUpload(f)
            }
            input.click()
          }}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db',
              background: '#fff', color: '#555', fontSize: '13px', cursor: 'pointer',
            }}>
            Upload audio file
          </button>
        </div>
      )}

      {/* Recording in progress */}
      {status === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button type="button" onClick={stopRecording}
            style={{
              width: '64px', height: '64px', borderRadius: '50%', border: 'none',
              background: '#333', color: '#fff', fontSize: '20px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            ■
          </button>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#c0392b' }}>Recording... {fmtSec(recordingTime)}</div>
            <div style={{ fontSize: '11px', color: '#888' }}>Press stop when finished</div>
          </div>
        </div>
      )}

      {/* Recorded, ready to transcribe */}
      {status === 'recorded' && audioUrl && (
        <div>
          <audio src={audioUrl} controls style={{ width: '100%', marginBottom: '12px' }} />
          <button type="button" onClick={transcribe}
            style={{
              padding: '8px 18px', borderRadius: '6px', border: 'none',
              background: '#0F6E56', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>
            Transcribe
          </button>
          <button type="button" onClick={reset}
            style={{ marginLeft: '8px', padding: '8px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: '13px', cursor: 'pointer' }}>
            Discard
          </button>
        </div>
      )}

      {/* Transcribing */}
      {status === 'transcribing' && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#0F6E56', fontSize: '13px' }}>
          Transcribing audio...
        </div>
      )}

      {/* Uploading */}
      {status === 'uploading' && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#888', fontSize: '13px' }}>
          Uploading...
        </div>
      )}

      {error && <div style={{ color: '#c0392b', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
    </div>
  )
}
