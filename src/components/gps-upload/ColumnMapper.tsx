'use client'

import { useState } from 'react'
import type { CanonicalField, FieldMatch } from '@/lib/gps/autoMapper'
import MappingPreview from './MappingPreview'

const CANONICAL_LABELS: Record<CanonicalField, string> = {
  truck_id:          'Truck / Vehicle ID',
  event_timestamp:   'Event Timestamp',
  stop_start_time:   'Stop Start / Arrival Time',
  stop_end_time:     'Stop End / Departure Time',
  location_name:     'Location / Site Name',
  latitude:          'Latitude',
  longitude:         'Longitude',
  event_type:        'Event Type',
  driver_id:         'Driver ID',
  speed:             'Speed',
  odometer:          'Odometer / Distance',
  trip_id:           'Trip ID',
}

const REQUIRED_CANONICAL: CanonicalField[] = ['truck_id', 'event_timestamp']
const RECOMMENDED_CANONICAL: CanonicalField[] = ['stop_start_time', 'stop_end_time', 'location_name']

interface ColumnMapperProps {
  uploadedHeaders: string[]
  previewRows: Record<string, string>[]
  fieldMatches: FieldMatch[]
  onConfirm: (mapping: Record<CanonicalField, string | null>) => void
  onCancel: () => void
}

export default function ColumnMapper({
  uploadedHeaders,
  previewRows,
  fieldMatches,
  onConfirm,
  onCancel,
}: ColumnMapperProps) {
  const [mapping, setMapping] = useState<Record<CanonicalField, string | null>>(() => {
    const initial: Record<CanonicalField, string | null> = {} as Record<CanonicalField, string | null>
    for (const m of fieldMatches) {
      initial[m.canonicalField] = m.uploadedColumn
    }
    return initial
  })

  const allCanonical = Object.keys(CANONICAL_LABELS) as CanonicalField[]

  const missingRequired = REQUIRED_CANONICAL.filter(f => !mapping[f])

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: '10px',
      padding: '20px', background: 'var(--white)',
    }}>
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '6px' }}>
          Column mapping
        </div>
        <div style={{
          fontSize: '12px', color: 'var(--gray-500)', lineHeight: '1.5',
          padding: '10px 12px', background: 'var(--info-bg)',
          border: '1px solid var(--info-border)', borderRadius: '6px',
        }}>
          We couldn&apos;t fully recognize your GPS format automatically.
          Please match your columns below — this takes about 30 seconds and will be remembered for future uploads.
          <br />
          <strong style={{ color: 'var(--gray-600)' }}>Note:</strong> Arabic column names are not supported — English only.
        </div>
      </div>

      {/* Mapping rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {allCanonical.map(field => {
          const isRequired = REQUIRED_CANONICAL.includes(field)
          const isRecommended = RECOMMENDED_CANONICAL.includes(field)
          const currentVal = mapping[field]

          return (
            <div key={field} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
              alignItems: 'center', padding: '6px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--gray-700)' }}>
                  {CANONICAL_LABELS[field]}
                  {isRequired && (
                    <span style={{ color: 'var(--red)', marginLeft: '4px' }}>*</span>
                  )}
                  {!isRequired && isRecommended && (
                    <span style={{ color: 'var(--gray-400)', fontSize: '10px', marginLeft: '4px' }}>recommended</span>
                  )}
                </span>
                {currentVal && (
                  <span style={{ fontSize: '10px', color: 'var(--phase-complete)', fontFamily: 'var(--mono)' }}>
                    ✓ matched: {currentVal}
                  </span>
                )}
              </div>

              <select
                value={currentVal ?? '__skip__'}
                onChange={e => setMapping(prev => ({
                  ...prev,
                  [field]: e.target.value === '__skip__' ? null : e.target.value,
                }))}
                style={{
                  padding: '5px 8px', fontSize: '12px', fontFamily: 'var(--font)',
                  border: `1px solid ${isRequired && !currentVal ? 'var(--red)' : 'var(--border)'}`,
                  borderRadius: '6px', background: 'var(--white)', color: 'var(--gray-700)',
                  cursor: 'pointer',
                }}
              >
                <option value="__skip__">— Skip this field —</option>
                {uploadedHeaders.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      {/* Data preview */}
      <MappingPreview headers={uploadedHeaders} rows={previewRows} />

      {/* Actions */}
      <div style={{
        marginTop: '16px', display: 'flex', gap: '10px',
        justifyContent: 'flex-end', alignItems: 'center',
      }}>
        {missingRequired.length > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--red)', flex: 1 }}>
            Required: {missingRequired.map(f => CANONICAL_LABELS[f]).join(', ')}
          </span>
        )}
        <button
          onClick={onCancel}
          style={{
            padding: '7px 16px', background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '6px', fontSize: '12px', color: 'var(--gray-600)',
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm(mapping)}
          disabled={missingRequired.length > 0}
          style={{
            padding: '7px 16px', background: missingRequired.length > 0 ? 'var(--gray-200)' : 'var(--green)',
            border: 'none', borderRadius: '6px', fontSize: '12px',
            color: missingRequired.length > 0 ? 'var(--gray-400)' : 'white',
            cursor: missingRequired.length > 0 ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontFamily: 'var(--font)',
          }}
        >
          Confirm mapping
        </button>
      </div>
    </div>
  )
}
