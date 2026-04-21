'use client'

/**
 * "+ Add trip" wrapper that consolidates the three backfill methods
 * (Manual entry, Document upload, Audio transcription) behind a single
 * sub-tab in Field Log. Previously each method had its own sub-tab,
 * which bloated the Log nav from 5 primary actions to 8. Helpers hitting
 * the Log daily for live capture only rarely need backfill, so the
 * backfill methods are grouped here and the default method is Manual.
 *
 * The Audio method is gated by a feature flag fetched by the caller;
 * when `audioEnabled` is false, the audio chip is hidden entirely.
 */

import { useState } from 'react'
import ManualEntryForm from './ManualEntryForm'
import UploadParseView from './UploadParseView'
import AudioCaptureView from './AudioCaptureView'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'
import type { LogStringKey } from '@/lib/i18n/log-catalog'

type AddMethod = 'manual' | 'upload' | 'audio'

interface Props {
  assessmentId: string
  plantId: string
  logDate: string
  onSaved: () => void
  existingTruckIds: string[]
  existingDriverNames: string[]
  existingSiteNames: string[]
  tripCount: number
  audioEnabled: boolean
}

export default function AddTripTabs({
  assessmentId,
  plantId,
  logDate,
  onSaved,
  existingTruckIds,
  existingDriverNames,
  existingSiteNames,
  tripCount,
  audioEnabled,
}: Props) {
  const { t } = useLogT()
  const [method, setMethod] = useState<AddMethod>('manual')

  const allMethods: { value: AddMethod; labelKey: LogStringKey; hintKey: LogStringKey; enabled: boolean }[] = [
    { value: 'manual', labelKey: 'add.method_manual', hintKey: 'add.method_manual_hint', enabled: true },
    { value: 'upload', labelKey: 'add.method_upload', hintKey: 'add.method_upload_hint', enabled: true },
    { value: 'audio', labelKey: 'add.method_audio', hintKey: 'add.method_audio_hint', enabled: audioEnabled },
  ]
  const methods = allMethods.filter(m => m.enabled)

  const activeHint = methods.find(m => m.value === method)?.hintKey

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Method selector: chip row */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '8px' }}>
          <Bilingual k="add.method_label" />
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {methods.map(m => {
            const active = method === m.value
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                style={{
                  padding: '8px 14px', minHeight: '44px',
                  background: active ? '#0F6E56' : '#fff',
                  color: active ? '#fff' : '#555',
                  border: `1.5px solid ${active ? '#0F6E56' : '#d1d5db'}`,
                  borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Bilingual k={m.labelKey} inline />
              </button>
            )
          })}
        </div>
        {activeHint && (
          <div style={{ fontSize: '11px', color: '#888', marginTop: '6px', lineHeight: 1.4 }}>
            {t(activeHint)}
          </div>
        )}
      </div>

      {/* Selected method's form */}
      <div>
        {method === 'manual' && (
          <ManualEntryForm
            assessmentId={assessmentId}
            plantId={plantId}
            logDate={logDate}
            onSaved={onSaved}
            existingTruckIds={existingTruckIds}
            existingDriverNames={existingDriverNames}
            existingSiteNames={existingSiteNames}
            tripCount={tripCount}
          />
        )}
        {method === 'upload' && (
          <UploadParseView
            assessmentId={assessmentId}
            plantId={plantId}
            logDate={logDate}
            onSaved={onSaved}
          />
        )}
        {method === 'audio' && audioEnabled && (
          <AudioCaptureView
            assessmentId={assessmentId}
            plantId={plantId}
            logDate={logDate}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  )
}
