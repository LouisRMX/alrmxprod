'use client'

import { useState, useRef } from 'react'
import { parseTripCsv, type ParsedRow, type ParseError } from '@/lib/trips/parser'
import { analyzeTrips, fmtDuration, type TripRecord } from '@/lib/trips/analyzer'

interface TripUploadViewProps {
  assessmentId:  string
  targetTAMin:   number
  perMinTACoeff: number
  onImported:    (trips: TripRecord[], date: string, filename: string) => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function downloadTemplate() {
  const csv = [
    'truck;dispatch;return',
    'T01;07:23;10:52',
    'T02;07:31;11:08',
  ].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'trip-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function TripUploadView({ targetTAMin, perMinTACoeff, onImported }: TripUploadViewProps) {
  const [date,     setDate]     = useState(todayIso())
  const [rows,     setRows]     = useState<ParsedRow[]>([])
  const [errors,   setErrors]   = useState<ParseError[]>([])
  const [filename, setFilename] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string ?? ''
      const { rows, errors } = parseTripCsv(text)
      setRows(rows)
      setErrors(errors)
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleImport() {
    const trips = analyzeTrips(rows, { date, targetTAMin, perMinTACoeff })
    onImported(trips, date, filename)
  }

  const validCount = rows.length
  const errorCount = errors.filter(e => e.rowIndex > 0).length

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '8px 0' }}>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Trip date
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              fontSize: '14px', padding: '7px 10px', borderRadius: '7px',
              border: '1px solid var(--border)', background: 'var(--white)',
              color: 'var(--gray-900)', fontFamily: 'var(--font)',
            }}
          />
        </div>
        <button
          onClick={downloadTemplate}
          style={{
            fontSize: '12px', fontWeight: 600, padding: '8px 14px',
            borderRadius: '7px', border: '1px solid var(--border)',
            background: 'var(--white)', color: 'var(--gray-600)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
          }}
        >
          <span>↓</span> Download template
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--green)' : 'var(--border)'}`,
          borderRadius: '10px',
          padding: '32px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? '#f0faf5' : 'var(--gray-50)',
          transition: 'all .15s',
          marginBottom: '20px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
          {filename
            ? <><strong style={{ color: 'var(--gray-800)' }}>{filename}</strong><span style={{ color: 'var(--gray-400)' }}>, click to replace</span></>
            : <>Drop CSV here or <strong style={{ color: 'var(--green)' }}>click to browse</strong></>
          }
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-300)', marginTop: '6px' }}>
          Required columns: truck, dispatch, return
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {/* Preview */}
      {(rows.length > 0 || errors.length > 0) && (
        <>
          <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginBottom: '10px' }}>
            {filename && <><strong style={{ color: 'var(--gray-700)' }}>{validCount} rows parsed</strong></>}
            {errorCount > 0 && (
              <span style={{ color: '#cc3333', marginLeft: '8px' }}>
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--border)' }}>
                  {['Truck', 'Dispatch', 'Return', 'Turnaround', 'Status'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: '11px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const trips = analyzeTrips([row], { date, targetTAMin, perMinTACoeff })
                  const t = trips[0]
                  const over = t.turnaroundDelayS > 0
                  return (
                    <tr key={row.rowIndex} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{row.truckId}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)' }}>{row.dispatch}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)' }}>{row.returnTime}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', color: over ? '#cc3333' : '#1a6644', fontWeight: 600 }}>
                        {fmtDuration(t.turnaroundS)}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#1a6644', fontSize: '12px' }}>
                        {t.anomalyFlags.length > 0
                          ? <span style={{ color: '#c96a00' }}>⚠ {t.anomalyFlags[0].replace(/_/g, ' ')}</span>
                          : <span>✓</span>
                        }
                      </td>
                    </tr>
                  )
                })}
                {errors.filter(e => e.rowIndex > 0).map(err => (
                  <tr key={`err-${err.rowIndex}`} style={{ background: '#fff3f3', borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{err.truck || '—'}</td>
                    <td colSpan={3} style={{ padding: '8px 12px', color: '#cc3333', fontSize: '12px' }}>—</td>
                    <td style={{ padding: '8px 12px', color: '#cc3333', fontSize: '12px' }}>⚠ {err.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Fatal errors (header problems) */}
          {errors.filter(e => e.rowIndex === 0).map((err, i) => (
            <div key={i} style={{ padding: '10px 14px', background: '#fff3f3', border: '1px solid #fcc', borderRadius: '7px', fontSize: '13px', color: '#cc3333', marginBottom: '8px' }}>
              {err.message}
            </div>
          ))}

          {/* Import button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              disabled={validCount === 0}
              onClick={handleImport}
              style={{
                fontSize: '14px', fontWeight: 700, padding: '10px 22px',
                borderRadius: '8px', border: 'none', cursor: validCount > 0 ? 'pointer' : 'not-allowed',
                background: validCount > 0 ? 'var(--green)' : 'var(--gray-200)',
                color: validCount > 0 ? '#fff' : 'var(--gray-400)',
                fontFamily: 'var(--font)',
              }}
            >
              Import {validCount > 0 ? `${validCount} trip${validCount > 1 ? 's' : ''}` : '—'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
