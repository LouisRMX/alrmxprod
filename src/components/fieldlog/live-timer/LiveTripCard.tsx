'use client'

/**
 * Single-trip timer view, optimised for iPhone one-handed use.
 *
 * Modes:
 *   - Normal: stopwatch view with big split button (stages 1-7)
 *   - Review: shown after last split, lets user edit timestamps before save
 *
 * Safety nets:
 *   - Lag 1 (transient undo): for ~8s after a split, a small "UNDO" bar
 *     appears at the bottom. Tap to revert the last split.
 *   - Lag 2 (pre-save review): after completing transit_back, the trip
 *     doesn't finalise immediately. Observer sees a review screen with
 *     all 7 timestamps and can edit any before saving.
 */

import { useEffect, useRef, useState } from 'react'
import type { ActiveTrip, StageName, SiteType } from '@/lib/fieldlog/offline-trip-queue'
import { STAGES, SITE_TYPE_ORDER } from '@/lib/fieldlog/offline-trip-queue'
import { useStopwatch } from '@/hooks/useStopwatch'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'
import type { LogStringKey } from '@/lib/i18n/log-catalog'

interface LiveTripCardProps {
  trip: ActiveTrip
  measurers: string[]
  recentTrucks: string[]
  recentDrivers: string[]
  recentSites: string[]
  originPlantSuggestions: string[]
  onSplit: (tripId: string) => void
  onUndoSplit: (tripId: string) => void
  onConfirmSave: (tripId: string, editedTimestamps?: Partial<Record<StageName | 'complete', string>>) => void
  onSavePartial: (tripId: string) => void
  onCancel: (tripId: string) => void
  onClose: () => void
  onUpdateIdentity: (tripId: string, ids: { truckId?: string; driverName?: string; siteName?: string }) => void
  onUpdateOriginPlant: (tripId: string, plant: string) => void
  onUpdateNotes: (tripId: string, notes: string) => void
  onUpdateStageNote: (tripId: string, stage: StageName, text: string) => void
  onUpdateRejected: (tripId: string, rejected: boolean) => void
  onLogSlumpTest: (tripId: string, location: 'plant' | 'site', pass: boolean) => void
  onClearSlumpTest: (tripId: string) => void
  onUpdateSiteType: (tripId: string, siteType: SiteType) => void
}

const UNDO_WINDOW_MS = 8000

export default function LiveTripCard({
  trip,
  recentTrucks,
  recentDrivers,
  recentSites,
  originPlantSuggestions,
  onSplit,
  onUndoSplit,
  onConfirmSave,
  onSavePartial,
  onCancel,
  onClose,
  onUpdateIdentity,
  onUpdateOriginPlant,
  onUpdateNotes,
  onUpdateStageNote,
  onUpdateRejected,
  onLogSlumpTest,
  onClearSlumpTest,
  onUpdateSiteType,
}: LiveTripCardProps) {
  const { totalElapsed, stageElapsed } = useStopwatch(trip)
  const { t } = useLogT()
  const stageLabelT = (s: StageName) => t(`stage.${s}` as LogStringKey)
  const [showIdentity, setShowIdentity] = useState(!trip.truckId)
  const [showNotes, setShowNotes] = useState(false)
  const [showStageNote, setShowStageNote] = useState(false)

  // Vibrate on card mount so the observer gets haptic confirmation that
  // measurement started. Silently no-op on platforms without support.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(50) } catch { /* ignore */ }
    }
  }, [])

  // Transient undo state
  const [undoVisible, setUndoVisible] = useState(false)
  const [undoLabel, setUndoLabel] = useState('')
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSeenStageRef = useRef<StageName>(trip.currentStage)
  const lastSeenReviewRef = useRef<boolean>(Boolean(trip.awaitingReview))

  // Detect split events: whenever currentStage changes (or awaitingReview flips
  // true), show the undo bar for UNDO_WINDOW_MS then auto-hide.
  useEffect(() => {
    const stageChanged = trip.currentStage !== lastSeenStageRef.current
    const reviewEntered = trip.awaitingReview && !lastSeenReviewRef.current

    if (stageChanged || reviewEntered) {
      const label = reviewEntered
        ? t('undo.trip_complete')
        : t('undo.stage_started', { stage: stageLabelT(trip.currentStage) })
      setUndoLabel(label)
      setUndoVisible(true)
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      undoTimerRef.current = setTimeout(() => setUndoVisible(false), UNDO_WINDOW_MS)
    }
    lastSeenStageRef.current = trip.currentStage
    lastSeenReviewRef.current = Boolean(trip.awaitingReview)

    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
  }, [trip.currentStage, trip.awaitingReview])

  const handleUndoClick = () => {
    setUndoVisible(false)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    onUndoSplit(trip.id)
  }

  // Review state: show timestamp editor instead of normal timer UI
  if (trip.awaitingReview) {
    return (
      <TripReviewView
        trip={trip}
        onUndoSplit={() => onUndoSplit(trip.id)}
        onConfirmSave={(edits) => onConfirmSave(trip.id, edits)}
        onCancel={() => {
          if (confirm(t('card.discard_confirm'))) {
            onCancel(trip.id)
          }
        }}
        onClose={onClose}
      />
    )
  }

  const currentIndex = STAGES.indexOf(trip.currentStage)
  const stageLabel = stageLabelT(trip.currentStage)
  const isSingleStage = trip.measurementMode === 'single_stage'
  const isLastStage = currentIndex === STAGES.length - 1

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#fafafa', padding: '16px', gap: '14px',
      paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      position: 'relative',
    }}>
      {/* Header with REC indicator, back button, and stop button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="rec-pulse" style={{
              display: 'inline-block', width: '8px', height: '8px',
              borderRadius: '50%', background: '#C0392B',
            }} />
            <span><Bilingual k="card.rec" inline /> · {trip.measurerName}</span>
            {isSingleStage && (
              <span style={{ padding: '1px 6px', background: '#FFF4D6', border: '1px solid #F1D79A', color: '#B7950B', borderRadius: '3px', fontSize: '9px' }}>
                <Bilingual k={`stage.${trip.currentStage}` as LogStringKey} inline /> · <Bilingual k="live.single_stage_only_suffix" inline />
              </span>
            )}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {trip.label}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            border: '1px solid #ddd', background: '#fff',
            fontSize: '20px', color: '#666', cursor: 'pointer', flexShrink: 0,
          }}
          aria-label={t('card.back_to_list')}
          title={t('card.back_to_list_short')}
        >←</button>
        <button
          type="button"
          onClick={() => {
            if (confirm(t('card.stop_confirm'))) {
              onSavePartial(trip.id)
            }
          }}
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            border: '1px solid #C0392B', background: '#fff',
            fontSize: '16px', color: '#C0392B', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          aria-label={t('card.stop_save_partial')}
          title={t('card.stop_save_partial')}
        >
          <span style={{ width: '14px', height: '14px', background: '#C0392B', borderRadius: '2px', display: 'inline-block' }} />
        </button>
      </div>
      {/* CSS-in-JS keyframe for REC dot pulse */}
      <style>{`
        @keyframes rec-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        .rec-pulse {
          animation: rec-pulse 1.2s ease-in-out infinite;
        }
      `}</style>

      {/* Origin plant chip (editable) */}
      <OriginPlantChip
        value={trip.originPlant ?? ''}
        suggestions={originPlantSuggestions}
        onChange={(v) => onUpdateOriginPlant(trip.id, v)}
      />

      {/* Timers */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
        padding: '16px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>
          <Bilingual k="card.total_elapsed" />
        </div>
        <div style={{
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
          fontSize: '42px', fontWeight: 700, color: '#1a1a1a',
          marginTop: '4px', letterSpacing: '-1px',
        }}>
          {totalElapsed}
        </div>
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600 }}>
            <Bilingual k={`stage.${trip.currentStage}` as LogStringKey} inline />
          </div>
          <div style={{
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            fontSize: '28px', fontWeight: 600, color: '#0F6E56',
            marginTop: '2px',
          }}>
            {stageElapsed}
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
            <Bilingual k={`stage.hint.${trip.currentStage}` as LogStringKey} />
          </div>
        </div>
      </div>

      {/* Big split button */}
      <button
        type="button"
        onClick={() => onSplit(trip.id)}
        style={{
          width: '100%', minHeight: '72px',
          background: isLastStage ? '#C0392B' : '#0F6E56', color: '#fff',
          border: 'none', borderRadius: '14px',
          fontSize: '18px', fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(15, 110, 86, 0.25)',
          padding: '0 20px',
        }}
      >
        {isSingleStage ? (
          <><Bilingual k="stage.finish" inline />{' '}<Bilingual k={`stage.${trip.currentStage}` as LogStringKey} inline /></>
        ) : (
          <Bilingual k={`stage.next.${trip.currentStage}` as LogStringKey} inline />
        )}
      </button>

      {/* Stage timeline */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
        {STAGES.map((s, i) => {
          const done = i < currentIndex
          const current = i === currentIndex
          return (
            <div key={s} style={{
              flex: 1, height: '6px', borderRadius: '3px',
              background: done ? '#0F6E56' : current ? '#5AAE93' : '#e0e0e0',
            }} />
          )
        })}
      </div>
      <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginTop: '-8px' }}>
        <Bilingual k="card.stage_of" params={{ n: currentIndex + 1, total: STAGES.length }} />
      </div>

      {/* Identity (collapsible) */}
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px' }}>
        <button
          type="button"
          onClick={() => setShowIdentity(v => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', padding: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '13px', fontWeight: 600, color: '#555', cursor: 'pointer',
          }}
        >
          <span><Bilingual k="card.truck_driver_site" /></span>
          <span style={{ fontSize: '10px', color: '#888' }}>{showIdentity ? '▲' : '▼'}</span>
        </button>
        {showIdentity && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <InputWithAutocomplete
              label={t('card.truck_id')}
              value={trip.truckId ?? ''}
              suggestions={recentTrucks}
              onChange={(v) => onUpdateIdentity(trip.id, { truckId: v })}
              placeholder="TR-14, 42, etc."
            />
            <InputWithAutocomplete
              label={t('card.driver')}
              value={trip.driverName ?? ''}
              suggestions={recentDrivers}
              onChange={(v) => onUpdateIdentity(trip.id, { driverName: v })}
              placeholder=""
            />
            <InputWithAutocomplete
              label={t('card.site')}
              value={trip.siteName ?? ''}
              suggestions={recentSites}
              onChange={(v) => onUpdateIdentity(trip.id, { siteName: v })}
              placeholder=""
            />
            <SiteTypePicker
              value={trip.siteType}
              fromCache={Boolean(trip.siteTypeFromCache)}
              onChange={(v) => onUpdateSiteType(trip.id, v)}
            />
          </div>
        )}
      </div>

      {/* Stage-specific note */}
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px' }}>
        <button
          type="button"
          onClick={() => setShowStageNote(v => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', padding: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '13px', fontWeight: 600, color: '#555', cursor: 'pointer',
          }}
        >
          <span><Bilingual k="card.note_on" inline /> <Bilingual k={`stage.${trip.currentStage}` as LogStringKey} inline /></span>
          <span style={{ fontSize: '10px', color: '#888' }}>{showStageNote ? '▲' : '▼'}</span>
        </button>
        {showStageNote && (
          <textarea
            value={trip.stageNotes[trip.currentStage] ?? ''}
            onChange={(e) => onUpdateStageNote(trip.id, trip.currentStage, e.target.value)}
            placeholder={t('card.note_placeholder', { stage: stageLabel })}
            rows={2}
            style={{
              width: '100%', marginTop: '10px', padding: '10px',
              border: '1px solid #e0e0e0', borderRadius: '8px',
              fontSize: '14px', fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        )}
      </div>

      {/* Trip-level notes */}
      <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px' }}>
        <button
          type="button"
          onClick={() => setShowNotes(v => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', padding: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: '13px', fontWeight: 600, color: '#555', cursor: 'pointer',
          }}
        >
          <span><Bilingual k="card.trip_notes" /></span>
          <span style={{ fontSize: '10px', color: '#888' }}>{showNotes ? '▲' : '▼'}</span>
        </button>
        {showNotes && (
          <textarea
            value={trip.notes}
            onChange={(e) => onUpdateNotes(trip.id, e.target.value)}
            placeholder={t('card.trip_notes_placeholder')}
            rows={3}
            style={{
              width: '100%', marginTop: '10px', padding: '10px',
              border: '1px solid #e0e0e0', borderRadius: '8px',
              fontSize: '14px', fontFamily: 'inherit', resize: 'vertical',
            }}
          />
        )}
      </div>

      {/* Mark rejected toggle. Live flag for refused loads. Observer can
          toggle on/off during the trip if the customer rejects a batch. */}
      <button
        type="button"
        onClick={() => onUpdateRejected(trip.id, !trip.rejected)}
        style={{
          width: '100%', minHeight: '44px',
          background: trip.rejected ? '#FDEDEC' : '#fff',
          color: trip.rejected ? '#C0392B' : '#555',
          border: `1px solid ${trip.rejected ? '#C0392B' : '#ddd'}`,
          borderRadius: '10px', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        {trip.rejected ? (
          <>
            <span>✕</span>
            <span><Bilingual k="card.load_rejected" inline /></span>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>· {t('card.tap_to_unmark')}</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '14px' }}>○</span>
            <span><Bilingual k="card.mark_rejected" inline /></span>
          </>
        )}
      </button>

      {/* Slump test action. One test per trip; relogging overwrites.
          Pairs location (plant vs site) with pass/fail for root-cause
          attribution on rejected loads (batching fault vs transit fault). */}
      <SlumpTestControl
        slumpTest={trip.slumpTest}
        onLog={(loc, pass) => onLogSlumpTest(trip.id, loc, pass)}
        onClear={() => onClearSlumpTest(trip.id)}
      />

      {/* Secondary actions */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => {
            if (confirm(t('card.save_partial_confirm'))) {
              onSavePartial(trip.id)
            }
          }}
          style={{
            flex: 1, minHeight: '48px',
            background: '#fff', color: '#7a5a00',
            border: '1px solid #D68910', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Bilingual k="card.save_partial" inline />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(t('card.discard_confirm'))) {
              onCancel(trip.id)
            }
          }}
          style={{
            flex: 1, minHeight: '48px',
            background: '#fff', color: '#C0392B',
            border: '1px solid #C0392B', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Bilingual k="card.discard" inline />
        </button>
      </div>

      {/* Transient Undo bar (Lag 1 safety net) */}
      {undoVisible && currentIndex > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 'max(16px, env(safe-area-inset-bottom))',
          left: '16px', right: '16px',
          background: '#1a1a1a', color: '#fff',
          borderRadius: '12px', padding: '12px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: '12px', boxShadow: '0 8px 24px rgba(0,0,0,.25)',
          fontSize: '14px', zIndex: 1000,
        }}>
          <span>{undoLabel}</span>
          <button
            type="button"
            onClick={handleUndoClick}
            style={{
              background: 'none', color: '#5AD39A', border: 'none',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '.5px',
              padding: '6px 10px',
            }}
          >
            <Bilingual k="undo.undo" inline />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Trip review view (Lag 2 pre-save editor) ─────────────────────────────

interface TripReviewViewProps {
  trip: ActiveTrip
  onUndoSplit: () => void
  onConfirmSave: (edits?: Partial<Record<StageName | 'complete', string>>) => void
  onCancel: () => void
  onClose: () => void
}

function TripReviewView({ trip, onUndoSplit, onConfirmSave, onCancel, onClose }: TripReviewViewProps) {
  const { t } = useLogT()
  // Local edited map, one entry per stage timestamp that the user has modified.
  // Unmodified entries stay out of this map so they inherit trip.timestamps.
  const [edits, setEdits] = useState<Partial<Record<StageName | 'complete', string>>>({})
  const [error, setError] = useState<string | null>(null)

  const orderedKeys: Array<{ key: StageName | 'complete'; labelKey: LogStringKey }> = [
    { key: 'plant_queue', labelKey: 'review.ts_plant_queue' },
    { key: 'loading', labelKey: 'review.ts_loading' },
    { key: 'weighbridge', labelKey: 'review.ts_loading_end' },
    { key: 'transit_out', labelKey: 'review.ts_departure' },
    { key: 'site_wait', labelKey: 'review.ts_arrival_site' },
    { key: 'pouring', labelKey: 'review.ts_discharge_start' },
    { key: 'site_washout', labelKey: 'review.ts_discharge_end' },
    { key: 'transit_back', labelKey: 'review.ts_departure_site' },
    { key: 'plant_prep', labelKey: 'review.ts_arrival_plant' },
    { key: 'complete', labelKey: 'review.ts_plant_prep_end' },
  ]

  const timestampFor = (key: StageName | 'complete'): string | undefined => {
    return edits[key] ?? trip.timestamps[key] ?? undefined
  }

  const handleEdit = (key: StageName | 'complete', hhmm: string) => {
    // hhmm is a "HH:MM" string from <input type="time">. We combine with the
    // trip's date (from plant_queue) to get an ISO timestamp.
    const base = trip.timestamps.plant_queue ?? trip.createdAt
    const baseDate = new Date(base)
    const [h, m] = hhmm.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return
    const d = new Date(baseDate)
    d.setHours(h, m, 0, 0)
    // If the resulting time is earlier than plant_queue, assume next day
    // (trip straddled midnight). Only adjust when editing a later stage.
    if (key !== 'plant_queue' && d.getTime() < baseDate.getTime()) {
      d.setDate(d.getDate() + 1)
    }
    setEdits(prev => ({ ...prev, [key]: d.toISOString() }))
    setError(null)
  }

  const handleSave = () => {
    setError(null)
    onConfirmSave(Object.keys(edits).length > 0 ? edits : undefined)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#fafafa', padding: '16px', gap: '14px',
      paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            <Bilingual k="tab.review" inline /> · {trip.measurerName}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', marginTop: '2px' }}>
            {trip.label}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            border: '1px solid #ddd', background: '#fff',
            fontSize: '20px', color: '#666', cursor: 'pointer',
          }}
          aria-label="Back to trip list"
        >←</button>
      </div>

      <div style={{
        background: '#E1F5EE', border: '1px solid #A8D9C5',
        borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: '#0F6E56',
      }}>
        <Bilingual k="review.trip_complete" />
      </div>

      {/* Timestamp list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
        padding: '8px 0',
      }}>
        {orderedKeys.map((item, idx) => {
          const iso = timestampFor(item.key)
          const hhmm = iso ? formatHHMM(iso) : ''
          const edited = Boolean(edits[item.key])
          const missing = !iso
          return (
            <div
              key={item.key}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', gap: '12px',
                borderBottom: idx < orderedKeys.length - 1 ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>
                  <Bilingual k={item.labelKey} />
                </div>
                {missing && (
                  <div style={{ fontSize: '11px', color: '#C0392B', marginTop: '2px' }}>
                    <Bilingual k="review.not_recorded" inline />
                  </div>
                )}
                {edited && !missing && (
                  <div style={{ fontSize: '11px', color: '#D68910', marginTop: '2px' }}>
                    <Bilingual k="review.edited" inline />
                  </div>
                )}
              </div>
              <input
                type="time"
                value={hhmm}
                onChange={(e) => handleEdit(item.key, e.target.value)}
                style={{
                  padding: '8px 10px', minHeight: '40px',
                  border: '1px solid #ddd', borderRadius: '8px',
                  fontSize: '15px', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                  background: edited ? '#FFF7E6' : '#fff',
                }}
              />
            </div>
          )
        })}
      </div>

      {error && (
        <div style={{
          background: '#FDEDEC', border: '1px solid #E8A39B',
          borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#8B3A2E',
        }}>
          {error}
        </div>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          type="button"
          onClick={handleSave}
          style={{
            width: '100%', minHeight: '56px',
            background: '#0F6E56', color: '#fff',
            border: 'none', borderRadius: '14px',
            fontSize: '16px', fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(15, 110, 86, 0.25)',
          }}
        >
          <Bilingual k="review.save_trip" inline />
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={onUndoSplit}
            style={{
              flex: 1, minHeight: '44px',
              background: '#fff', color: '#333',
              border: '1px solid #ddd', borderRadius: '10px',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            ← <Bilingual k="review.back_to_timer" inline />
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, minHeight: '44px',
              background: '#fff', color: '#C0392B',
              border: '1px solid #C0392B', borderRadius: '10px',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Bilingual k="review.discard_trip" inline />
          </button>
        </div>
      </div>
    </div>
  )
}

function formatHHMM(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// ── Slump test control (in-card action) ──────────────────────────────────
// Collapsed: a single muted button "💧 Log slump test".
// After logging: shows a compact chip "💧 Plant Pass · 09:34" with a
// small clear button to re-log if the observer made a mistake. One test
// per trip by design; relogging simply overwrites.
interface SlumpTestControlProps {
  slumpTest: ActiveTrip['slumpTest']
  onLog: (location: 'plant' | 'site', pass: boolean) => void
  onClear: () => void
}

function SlumpTestControl({ slumpTest, onLog, onClear }: SlumpTestControlProps) {
  const { t } = useLogT()
  const [open, setOpen] = useState(false)
  const [location, setLocation] = useState<'plant' | 'site' | null>(null)
  const [result, setResult] = useState<boolean | null>(null)

  const handleSave = () => {
    if (location === null || result === null) return
    onLog(location, result)
    setOpen(false)
    setLocation(null)
    setResult(null)
  }

  // Already logged: compact summary chip
  if (slumpTest && !open) {
    const label = slumpTest.location === 'plant' ? t('slump.plant') : t('slump.site')
    const outcome = slumpTest.pass ? t('slump.pass') : t('slump.fail')
    const time = formatHHMM(slumpTest.time)
    return (
      <div style={{
        width: '100%', minHeight: '44px',
        background: slumpTest.pass ? '#E1F5EE' : '#FDEDEC',
        color: slumpTest.pass ? '#0F6E56' : '#8B3A2E',
        border: `1px solid ${slumpTest.pass ? '#A8D9C5' : '#E8A39B'}`,
        borderRadius: '10px', padding: '0 12px',
        display: 'flex', alignItems: 'center', gap: '8px',
        fontSize: '13px', fontWeight: 600,
      }}>
        <span>💧</span>
        <span>{t('slump.logged_prefix')}: {label} {outcome}</span>
        <span style={{ fontSize: '11px', opacity: 0.7, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>· {time}</span>
        <button
          type="button"
          onClick={onClear}
          style={{
            marginInlineStart: 'auto', background: 'none', border: 'none',
            color: 'inherit', opacity: 0.6, cursor: 'pointer', fontSize: '12px', padding: '4px 6px',
          }}
          aria-label={t('slump.clear')}
        >
          {t('slump.clear')}
        </button>
      </div>
    )
  }

  // Collapsed: show log button
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%', minHeight: '44px',
          background: '#fff', color: '#555',
          border: '1px solid #ddd', borderRadius: '10px',
          fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        <span>💧</span>
        <span><Bilingual k="slump.log_button" inline /></span>
      </button>
    )
  }

  // Expanded: where + result picker
  const choiceBtn = (active: boolean, onClick: () => void, label: React.ReactNode, color: string): React.CSSProperties => ({})
  void choiceBtn // helper kept inline below
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px',
      padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        <Bilingual k="slump.location_label" />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {(['plant', 'site'] as const).map(loc => {
          const active = location === loc
          return (
            <button
              key={loc}
              type="button"
              onClick={() => setLocation(loc)}
              style={{
                flex: 1, minHeight: '44px',
                background: active ? '#0F6E56' : '#fff',
                color: active ? '#fff' : '#333',
                border: `1.5px solid ${active ? '#0F6E56' : '#ddd'}`,
                borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Bilingual k={loc === 'plant' ? 'slump.plant' : 'slump.site'} inline />
            </button>
          )
        })}
      </div>

      <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: '4px' }}>
        <Bilingual k="slump.result_label" />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {([true, false] as const).map(pass => {
          const active = result === pass
          const color = pass ? '#0F6E56' : '#C0392B'
          return (
            <button
              key={pass ? 'pass' : 'fail'}
              type="button"
              onClick={() => setResult(pass)}
              style={{
                flex: 1, minHeight: '44px',
                background: active ? color : '#fff',
                color: active ? '#fff' : color,
                border: `1.5px solid ${color}`,
                borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Bilingual k={pass ? 'slump.pass' : 'slump.fail'} inline />
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={location === null || result === null}
          style={{
            flex: 1, minHeight: '44px',
            background: (location !== null && result !== null) ? '#0F6E56' : '#ccc',
            color: '#fff', border: 'none', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600,
            cursor: (location !== null && result !== null) ? 'pointer' : 'not-allowed',
          }}
        >
          <Bilingual k="slump.save" inline />
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setLocation(null); setResult(null) }}
          style={{
            flex: 1, minHeight: '44px',
            background: '#fff', color: '#555',
            border: '1px solid #ddd', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Bilingual k="slump.cancel" inline />
        </button>
      </div>
    </div>
  )
}

// ── Origin plant chip (inline picker on the active trip view) ────────────
function OriginPlantChip({ value, suggestions, onChange }: {
  value: string
  suggestions: string[]
  onChange: (v: string) => void
}) {
  const { t } = useLogT()
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value)

  useEffect(() => { setLocal(value) }, [value])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 12px', background: value ? '#E1F5EE' : '#F5F5F5',
          border: `1px solid ${value ? '#A8D9C5' : '#ddd'}`,
          borderRadius: '999px', fontSize: '12px', fontWeight: 600,
          color: value ? '#0F6E56' : '#888', cursor: 'pointer',
        }}
      >
        📍 {value || <Bilingual k="card.set_plant" inline />} · <Bilingual k="card.edit" inline />
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex', gap: '6px', alignItems: 'center',
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '8px',
    }}>
      <select
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        style={{
          flex: 1, minHeight: '40px', padding: '0 10px',
          border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px',
        }}
      >
        <option value="">{t('live.not_specified')}</option>
        {suggestions.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button
        type="button"
        onClick={() => { onChange(local); setEditing(false) }}
        style={{
          minWidth: '60px', minHeight: '40px',
          background: '#0F6E56', color: '#fff', border: 'none',
          borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}
      ><Bilingual k="card.save" inline /></button>
      <button
        type="button"
        onClick={() => { setLocal(value); setEditing(false) }}
        style={{
          minWidth: '40px', minHeight: '40px',
          background: '#fff', color: '#666',
          border: '1px solid #ddd', borderRadius: '8px',
          fontSize: '13px', cursor: 'pointer',
        }}
      >×</button>
    </div>
  )
}

// ── Site type picker (dropdown) ─────────────────────────────────────────
// 10-value dropdown whose labels embed both the site category and the
// implied pour method. The fromCache flag triggers an amber "⟳ auto"
// badge + dashed border so a silent carry-over from a previous trip is
// visible until the observer explicitly confirms or changes.
function SiteTypePicker({ value, fromCache, onChange }: {
  value?: SiteType
  fromCache: boolean
  onChange: (v: SiteType) => void
}) {
  const { t } = useLogT()
  const showAutoHint = fromCache && value !== undefined
  return (
    <div>
      <label style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 600,
      }}>
        <Bilingual k="site_type.label" />
        {showAutoHint && (
          <span style={{
            padding: '1px 6px', background: '#FFF4D6',
            color: '#7a5a00', border: '1px solid #F1D79A',
            borderRadius: '3px', fontSize: '9px', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.3px',
          }}>
            ⟳ {t('site_type.auto_badge')}
          </span>
        )}
      </label>
      <select
        value={value ?? ''}
        onChange={e => {
          const v = e.target.value as SiteType
          if (v) onChange(v)
        }}
        style={{
          width: '100%', minHeight: '44px', padding: '0 12px',
          fontSize: '14px',
          background: showAutoHint ? '#FFF4D6' : '#fff',
          color: showAutoHint ? '#7a5a00' : '#333',
          border: showAutoHint
            ? '1.5px dashed #D68910'
            : `1px solid ${value ? '#0F6E56' : '#ddd'}`,
          borderRadius: '8px', fontWeight: value ? 600 : 500, cursor: 'pointer',
        }}
      >
        <option value="">—</option>
        {SITE_TYPE_ORDER.map(opt => (
          <option key={opt} value={opt}>{t(`site_type.${opt}` as LogStringKey)}</option>
        ))}
      </select>
      <div style={{ fontSize: '10px', color: showAutoHint ? '#7a5a00' : '#aaa', marginTop: '4px', lineHeight: 1.3 }}>
        {showAutoHint ? t('site_type.auto_filled') : t('site_type.help')}
      </div>
    </div>
  )
}

// ── Autocomplete input ──────────────────────────────────────────────────
function InputWithAutocomplete({
  label, value, suggestions, onChange, placeholder,
}: {
  label: string
  value: string
  suggestions: string[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  const filtered = value
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 5)
    : suggestions.slice(0, 5)
  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '4px', fontWeight: 600 }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        style={{
          width: '100%', minHeight: '44px', padding: '8px 12px',
          border: '1px solid #ddd', borderRadius: '8px',
          fontSize: '15px', fontFamily: 'inherit',
        }}
      />
      {focused && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: '4px', background: '#fff', border: '1px solid #ddd',
          borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
          zIndex: 10, maxHeight: '200px', overflowY: 'auto',
        }}>
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={() => onChange(s)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px', border: 'none', background: 'none',
                fontSize: '14px', color: '#333', cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
              }}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}
