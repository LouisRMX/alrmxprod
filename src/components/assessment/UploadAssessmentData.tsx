'use client'

import { useState, useCallback } from 'react'

interface UploadAssessmentDataProps {
  onDataParsed: (answers: Record<string, string>) => void | Promise<void>
}

export default function UploadAssessmentData({ onDataParsed }: UploadAssessmentDataProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'preview' | 'error'>('idle')
  const [error, setError] = useState('')
  const [parsed, setParsed] = useState<Record<string, string>>({})
  const [warnings, setWarnings] = useState<string[]>([])
  const [fieldsFound, setFieldsFound] = useState(0)

  const handleFile = useCallback(async (file: File) => {
    setStatus('uploading')
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const resp = await fetch('/api/fieldlog/parse-assessment', { method: 'POST', body: formData })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || `Upload failed (${resp.status})`)
      }
      const data = await resp.json()
      setParsed(data.answers)
      setWarnings(data.warnings || [])
      setFieldsFound(data.fieldsFound)
      setStatus('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
  }, [])

  const handleApply = useCallback(async () => {
    const keys = Object.keys(parsed)
    if (keys.length === 0) {
      alert('No parsed data to apply')
      return
    }
    alert(`Applying ${keys.length} fields: ${keys.slice(0, 5).join(', ')}...`)
    try {
      await onDataParsed(parsed)
    } catch (err) {
      alert('Apply failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [parsed, onDataParsed])

  const LABELS: Record<string, string> = {
    price_m3: 'Selling price',
    material_cost: 'Material cost (total)',
    cement_cost: 'Cement cost',
    aggregate_cost: 'Aggregate cost',
    admix_cost: 'Admixture cost',
    plant_cap: 'Plant capacity',
    op_hours: 'Operating hours',
    op_days: 'Operating days',
    actual_prod: 'Production last month',
    n_trucks: 'Trucks',
    deliveries_day: 'Deliveries/day',
    turnaround: 'Turnaround time',
    reject_pct: 'Rejection rate',
    delivery_radius: 'Delivery radius',
    dispatch_tool: 'Dispatch tool',
    order_to_dispatch: 'Order-to-dispatch',
    prod_data_source: 'Data source',
    biggest_pain: 'Biggest challenge',
  }

  if (status === 'preview') {
    return (
      <div style={{ border: '1px solid #d1d5db', borderRadius: '10px', padding: '16px', background: '#fff', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>
          Parsed {fieldsFound} of 17 fields
        </div>

        {warnings.length > 0 && (
          <div style={{ background: '#fff8e1', border: '1px solid #f5cba0', borderRadius: '6px', padding: '8px 12px', marginBottom: '10px' }}>
            {warnings.map((w, i) => (
              <div key={i} style={{ fontSize: '12px', color: '#b8860b' }}>⚠ {w}</div>
            ))}
          </div>
        )}

        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '12px' }}>
          {Object.entries(parsed).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: '12px' }}>
              <span style={{ color: '#888' }}>{LABELS[key] || key}</span>
              <span style={{ color: '#1a1a1a', fontWeight: 500, maxWidth: '200px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={handleApply}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#0F6E56', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Apply to assessment
          </button>
          <button type="button" onClick={() => { setStatus('idle'); setParsed({}); setWarnings([]) }}
            style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: '13px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <button type="button"
        disabled={status === 'uploading'}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png'
          input.onchange = e => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) handleFile(f)
          }
          input.click()
        }}
        style={{
          padding: '8px 14px', borderRadius: '6px', border: '1px dashed #0F6E56',
          background: '#f0faf4', color: '#0F6E56', fontSize: '12px', fontWeight: 500,
          cursor: status === 'uploading' ? 'not-allowed' : 'pointer',
          opacity: status === 'uploading' ? 0.6 : 1,
        }}>
        {status === 'uploading' ? 'Analyzing...' : 'Upload plant data (Excel/CSV/PDF/image)'}
      </button>
      {status === 'error' && <div style={{ color: '#c0392b', fontSize: '12px', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}
