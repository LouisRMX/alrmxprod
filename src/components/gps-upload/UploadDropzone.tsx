'use client'

import { useRef, useState, useCallback } from 'react'

const TIMEZONE_OPTIONS = [
  { value: 'AST', label: 'AST, Arabia Standard Time (UTC+3)' },
  { value: 'GST', label: 'GST, Gulf Standard Time (UTC+4)' },
  { value: 'UTC', label: 'UTC, Coordinated Universal Time (UTC+0)' },
]

interface UploadDropzoneProps {
  onFileSelected: (file: File, timezone: string, forceMapping: boolean) => void
  onSkip: () => void
  uploading?: boolean
  hasExistingUpload?: boolean
  existingFilename?: string | null
}

export default function UploadDropzone({
  onFileSelected,
  onSkip,
  uploading = false,
  hasExistingUpload = false,
  existingFilename = null,
}: UploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [timezone, setTimezone] = useState('AST')
  const [forceMapping, setForceMapping] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleFile = useCallback((file: File) => {
    setLocalError(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setLocalError('Only CSV files are supported. Please export from your GPS system as CSV.')
      return
    }
    if (file.size === 0) {
      setLocalError('The selected file is empty. Please export a non-empty GPS file.')
      return
    }
    onFileSelected(file, timezone, forceMapping)
  }, [timezone, forceMapping, onFileSelected])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Timezone selector */}
      <div>
        <label style={{
          display: 'block', fontSize: '12px', fontWeight: 500,
          color: 'var(--gray-600)', marginBottom: '6px',
        }}>
          What timezone does your GPS system use?
        </label>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          disabled={uploading}
          style={{
            padding: '7px 10px', fontSize: '13px', fontFamily: 'var(--font)',
            border: '1px solid var(--border)', borderRadius: '6px',
            background: 'var(--white)', color: 'var(--gray-700)',
            cursor: 'pointer', width: '100%', maxWidth: '380px',
          }}
        >
          {TIMEZONE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--green)' : 'var(--border)'}`,
          borderRadius: '10px',
          padding: '32px 20px',
          textAlign: 'center',
          background: dragging ? 'var(--phase-complete-bg)' : 'var(--gray-50)',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'all .15s',
          opacity: uploading ? 0.6 : 1,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: '28px', marginBottom: '10px' }}>📂</div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--gray-700)', marginBottom: '6px' }}>
          {uploading ? 'Uploading…' : 'Drag & drop your GPS export here, or click to browse'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
          Upload a GPS or fleet export for the last 30 days · CSV only
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '4px' }}>
          Column headers must be in English, Arabic column names are not supported in this version
        </div>
        {hasExistingUpload && existingFilename && (
          <div style={{
            marginTop: '12px', fontSize: '11px', color: 'var(--phase-complete)',
            fontFamily: 'var(--mono)',
          }}>
            Current file: {existingFilename} · Upload a new file to replace it
          </div>
        )}
      </div>

      {/* Force-mapping escape hatch: if auto-detect has been wrong before,
          user can opt out before uploading. Column mapper appears directly
          after the file is parsed, no silent wrong-format analysis. */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        fontSize: '12px', color: 'var(--gray-600)', cursor: 'pointer',
        lineHeight: 1.45,
      }}>
        <input
          type="checkbox"
          checked={forceMapping}
          onChange={e => setForceMapping(e.target.checked)}
          disabled={uploading}
          style={{ marginTop: '2px', cursor: 'pointer' }}
        />
        <span>
          Skip auto-detect, map columns manually.
          <span style={{ color: 'var(--gray-400)', marginInlineStart: '4px' }}>
            Use this if a previous upload picked the wrong format.
          </span>
        </span>
      </label>

      {/* Error */}
      {localError && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', fontSize: '12px',
          background: 'var(--error-bg)', border: '1px solid var(--error-border)',
          color: 'var(--red)',
        }}>
          {localError}
        </div>
      )}

      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onSkip}
          disabled={uploading}
          style={{
            padding: '7px 16px', background: 'none',
            border: '1px solid var(--border)', borderRadius: '6px',
            fontSize: '12px', color: 'var(--gray-500)', cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--gray-700)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--gray-500)' }}
        >
          Skip, I don&apos;t have GPS data
        </button>
      </div>
    </div>
  )
}
