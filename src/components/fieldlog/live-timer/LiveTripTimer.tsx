'use client'

/**
 * Top-level Live Trip Timer view.
 *
 * Shows either:
 *   - The trip list (parallel observations) + a "Start new trip" button, or
 *   - An active trip card (when one is focused for split-tap work)
 *
 * Persists everything to IndexedDB via offline-trip-queue. Syncs pending
 * trips to Supabase via the authenticated client or the token-based API.
 *
 * Used in two contexts:
 *   - Inside the Field Log tab (authenticated admin/manager)
 *   - On /fc/[token] route (unauthenticated helper via device token)
 *
 * In the token context, `syncMode = 'token'` and we POST to
 * /api/field-capture/trip; otherwise we write directly via supabase client.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  startTrip,
  splitStage,
  undoLastSplit,
  finaliseWithEdits,
  savePartial,
  cancelTrip,
  setStageNote,
  setTripIdentity,
  setTripOriginPlant,
  setTripNotes,
  setTripRejected,
  getAllMeasurers,
  addMeasurer,
  getAllOriginPlants,
  addOriginPlant,
  drainPending,
  STAGES,
  type ActiveTrip,
  type PendingTrip,
  type StageName,
} from '@/lib/fieldlog/offline-trip-queue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { createClient } from '@/lib/supabase/client'
import LiveTripCard from './LiveTripCard'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import type { LogStringKey } from '@/lib/i18n/log-catalog'

interface LiveTripTimerProps {
  assessmentId: string
  plantId: string
  /** 'authed' uses supabase client directly; 'token' POSTs to the server-side API. */
  syncMode: 'authed' | 'token'
  /** When syncMode === 'token', this token is sent with every sync request. */
  token?: string
}

export default function LiveTripTimer({ assessmentId, plantId, syncMode, token }: LiveTripTimerProps) {
  const online = useOnlineStatus()
  const supabase = createClient()
  const { t } = useLogT()
  // Stage labels resolved via i18n (key prefix 'stage.')
  const stageLabel = (stage: StageName) => t(`stage.${stage}` as LogStringKey)

  const [measurers, setMeasurers] = useState<string[]>([])
  const [currentMeasurer, setCurrentMeasurer] = useState<string>('')
  const [showAddMeasurer, setShowAddMeasurer] = useState(false)
  const [newMeasurerName, setNewMeasurerName] = useState('')
  const [originPlants, setOriginPlants] = useState<string[]>([])
  const [currentOriginPlant, setCurrentOriginPlant] = useState<string>('')
  const [showAddOriginPlant, setShowAddOriginPlant] = useState(false)
  const [newOriginPlantName, setNewOriginPlantName] = useState('')
  const [focusedTripId, setFocusedTripId] = useState<string | null>(null)
  const [syncingNow, setSyncingNow] = useState(false)
  // Selected starting stage for the next trip. plant_queue = full cycle.
  const [startStage, setStartStage] = useState<StageName>('plant_queue')
  // Transient "Trip saved" toast shown after a trip finalises.
  const [saveToast, setSaveToast] = useState<string | null>(null)

  // Autocomplete sources (from server + from local pending trips)
  const [recentTrucks, setRecentTrucks] = useState<string[]>([])
  const [recentDrivers, setRecentDrivers] = useState<string[]>([])
  const [recentSites, setRecentSites] = useState<string[]>([])

  // Live active trips (scoped to this assessment)
  const activeTrips = useLiveQuery(
    () => db.activeTrips.where('assessmentId').equals(assessmentId).toArray(),
    [assessmentId],
    [] as ActiveTrip[],
  )
  const pendingTrips = useLiveQuery(
    () => db.pendingTrips.where('assessmentId').equals(assessmentId).toArray(),
    [assessmentId],
    [] as PendingTrip[],
  )
  const pendingCount = pendingTrips?.length ?? 0

  // Load measurer list from IndexedDB on mount
  useEffect(() => {
    getAllMeasurers().then(list => {
      setMeasurers(list)
      if (list.length > 0 && !currentMeasurer) setCurrentMeasurer(list[0])
    })
    getAllOriginPlants().then(list => {
      setOriginPlants(list)
      if (list.length > 0 && !currentOriginPlant) setCurrentOriginPlant(list[0])
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load autocomplete suggestions (server trucks/drivers/sites from prior trips)
  // Token mode has no authenticated supabase client, so suggestions come only
  // from local pending trips in that case.
  useEffect(() => {
    async function load() {
      const local = await db.pendingTrips.where('assessmentId').equals(assessmentId).toArray()
      const trucksLocal = local.map(t => t.truckId).filter(Boolean) as string[]
      const driversLocal = local.map(t => t.driverName).filter(Boolean) as string[]
      const sitesLocal = local.map(t => t.siteName).filter(Boolean) as string[]
      let trucksServer: string[] = []
      let driversServer: string[] = []
      let sitesServer: string[] = []
      if (syncMode === 'authed') {
        const { data } = await supabase
          .from('daily_logs')
          .select('truck_id, driver_name, site_name')
          .eq('assessment_id', assessmentId)
          .limit(500)
        trucksServer = (data ?? []).map(r => r.truck_id).filter(Boolean) as string[]
        driversServer = (data ?? []).map(r => r.driver_name).filter(Boolean) as string[]
        sitesServer = (data ?? []).map(r => r.site_name).filter(Boolean) as string[]
      }
      const dedup = (arr: string[]) => Array.from(new Set(arr))
      setRecentTrucks(dedup([...trucksLocal, ...trucksServer]))
      setRecentDrivers(dedup([...driversLocal, ...driversServer]))
      setRecentSites(dedup([...sitesLocal, ...sitesServer]))
    }
    load()
  }, [assessmentId, syncMode, supabase])

  // Auto-sync pending trips when online. Throttled by syncingNow flag.
  useEffect(() => {
    if (!online || syncingNow || pendingCount === 0) return
    runSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pendingCount])

  const runSync = useCallback(async () => {
    if (syncingNow) return
    setSyncingNow(true)
    try {
      await drainPending(async (payload) => {
        if (syncMode === 'token' && token) {
          const res = await fetch('/api/field-capture/trip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, payload }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            return { ok: false, error: body.error || `HTTP ${res.status}` }
          }
          return { ok: true }
        }
        const { error } = await supabase.from('daily_logs').insert(payload)
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      })
    } finally {
      setSyncingNow(false)
    }
  }, [syncingNow, syncMode, token, supabase])

  // ── Trip actions ──
  const handleStartNew = async () => {
    if (!currentMeasurer) {
      alert('Please add a measurer name first.')
      return
    }
    const trip = await startTrip({
      assessmentId,
      plantId,
      measurerName: currentMeasurer,
      originPlant: currentOriginPlant || undefined,
      startStage,
      viaToken: syncMode === 'token',
      token,
    })
    setFocusedTripId(trip.id)
    // Haptic confirmation on Start (works in PWA-installed iOS and most Android)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(75) } catch { /* ignore */ }
    }
  }

  const handleAddMeasurer = async () => {
    const name = newMeasurerName.trim()
    if (!name) return
    await addMeasurer(name)
    const list = await getAllMeasurers()
    setMeasurers(list)
    setCurrentMeasurer(name)
    setNewMeasurerName('')
    setShowAddMeasurer(false)
  }

  const handleAddOriginPlant = async () => {
    const name = newOriginPlantName.trim()
    if (!name) return
    await addOriginPlant(name)
    const list = await getAllOriginPlants()
    setOriginPlants(list)
    setCurrentOriginPlant(name)
    setNewOriginPlantName('')
    setShowAddOriginPlant(false)
  }

  const handleSplit = async (tripId: string) => {
    // splitStage now keeps trip in activeTrips (awaitingReview) on last stage.
    // The card surfaces the review UI; finalisation happens via handleConfirmSave.
    await splitStage(tripId)
  }

  const handleUndoSplit = async (tripId: string) => {
    await undoLastSplit(tripId)
  }

  const showSavedToast = useCallback((label: string) => {
    setSaveToast(label)
    setTimeout(() => setSaveToast(null), 2500)
  }, [])

  const handleConfirmSave = async (
    tripId: string,
    editedTimestamps?: Partial<Record<StageName | 'complete', string>>,
  ) => {
    const tripBefore = await db.activeTrips.get(tripId)
    const result = await finaliseWithEdits(tripId, editedTimestamps)
    if (!result.ok) {
      alert(result.error)
      return
    }
    setFocusedTripId(null)
    if (online) runSync()
    if (tripBefore) {
      const totalMin = computeTotalMin(tripBefore, editedTimestamps)
      showSavedToast(
        `✓ ${t('toast.trip_saved')}${totalMin != null ? `: ${totalMin} ${t('reviewq.min')}` : ''}${tripBefore.truckId ? ` · ${t('reviewq.truck')} ${tripBefore.truckId}` : ''}`
      )
    }
  }

  const handleSavePartial = async (tripId: string) => {
    const tripBefore = await db.activeTrips.get(tripId)
    await savePartial(tripId)
    setFocusedTripId(null)
    if (online) runSync()
    if (tripBefore) {
      showSavedToast(
        `✓ ${t('toast.partial_saved')}${tripBefore.truckId ? ` · ${t('reviewq.truck')} ${tripBefore.truckId}` : ''}`
      )
    }
  }

  const handleCancel = async (tripId: string) => {
    await cancelTrip(tripId)
    setFocusedTripId(null)
  }

  const handleUpdateRejected = async (tripId: string, rejected: boolean) => {
    await setTripRejected(tripId, rejected)
  }

  const focusedTrip = useMemo(
    () => (activeTrips ?? []).find(t => t.id === focusedTripId) ?? null,
    [activeTrips, focusedTripId],
  )

  // ── Render ──

  // If a trip is focused, show its card (full-screen on mobile)
  if (focusedTrip) {
    return (
      <LiveTripCard
        trip={focusedTrip}
        measurers={measurers}
        recentTrucks={recentTrucks}
        recentDrivers={recentDrivers}
        recentSites={recentSites}
        originPlantSuggestions={originPlants}
        onSplit={handleSplit}
        onUndoSplit={handleUndoSplit}
        onConfirmSave={handleConfirmSave}
        onSavePartial={handleSavePartial}
        onCancel={handleCancel}
        onClose={() => setFocusedTripId(null)}
        onUpdateIdentity={(id, ids) => setTripIdentity(id, ids)}
        onUpdateOriginPlant={(id, v) => setTripOriginPlant(id, v)}
        onUpdateNotes={(id, n) => setTripNotes(id, n)}
        onUpdateStageNote={(id, s, txt) => setStageNote(id, s, txt)}
        onUpdateRejected={handleUpdateRejected}
      />
    )
  }

  // Sort active trips: longest-running first. Stuck trips naturally bubble
  // to the top where they need attention.
  const sortedActiveTrips = [...(activeTrips ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  // Otherwise show the list + start button
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#fafafa', padding: '16px', gap: '14px',
      paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
    }}>
      {/* Status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: online ? '#E1F5EE' : '#FDEDEC',
        border: `1px solid ${online ? '#A8D9C5' : '#E8A39B'}`,
        borderRadius: '10px', padding: '8px 12px', fontSize: '12px',
      }}>
        <span style={{ color: online ? '#0F6E56' : '#8B3A2E', fontWeight: 600 }}>
          {online ? '● Online' : '● Offline — trips saved locally'}
        </span>
        <span style={{ color: '#666' }}>
          {pendingCount > 0 ? `${pendingCount} pending sync` : 'All synced'}
          {pendingCount > 0 && online && (
            <button
              type="button"
              onClick={runSync}
              disabled={syncingNow}
              style={{
                marginLeft: '8px', padding: '4px 10px',
                background: '#0F6E56', color: '#fff', border: 'none',
                borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              }}
            >{syncingNow ? 'Syncing…' : 'Sync now'}</button>
          )}
        </span>
      </div>

      {/* Measurer selector */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          {t('live.measuring_as')}
        </label>
        {!showAddMeasurer && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={currentMeasurer}
              onChange={(e) => setCurrentMeasurer(e.target.value)}
              style={{
                flex: 1, minHeight: '44px', padding: '0 12px',
                border: '1px solid #ddd', borderRadius: '8px',
                fontSize: '15px', background: '#fff',
              }}
            >
              {measurers.length === 0 && <option value="">Add a measurer first</option>}
              {measurers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowAddMeasurer(true)}
              style={{
                minWidth: '44px', minHeight: '44px',
                background: '#fff', color: '#0F6E56',
                border: '1px solid #0F6E56', borderRadius: '8px',
                fontSize: '20px', fontWeight: 700, cursor: 'pointer',
              }}
              aria-label="Add measurer"
            >+</button>
          </div>
        )}
        {showAddMeasurer && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newMeasurerName}
              onChange={(e) => setNewMeasurerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddMeasurer()
              }}
              placeholder={t('live.add_measurer_placeholder')}
              autoFocus
              style={{
                flex: 1, minHeight: '44px', padding: '0 12px',
                border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px',
              }}
            />
            <button
              type="button"
              onClick={handleAddMeasurer}
              style={{
                minWidth: '70px', minHeight: '44px',
                background: '#0F6E56', color: '#fff', border: 'none',
                borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >{t('live.add')}</button>
            <button
              type="button"
              onClick={() => { setShowAddMeasurer(false); setNewMeasurerName('') }}
              style={{
                minWidth: '44px', minHeight: '44px',
                background: '#fff', color: '#666',
                border: '1px solid #ddd', borderRadius: '8px',
                fontSize: '14px', cursor: 'pointer',
              }}
            >×</button>
          </div>
        )}
      </div>

      {/* Origin plant selector (optional, for multi-plant shared-fleet assessments) */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          {t('live.current_plant')}
        </label>
        {!showAddOriginPlant && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={currentOriginPlant}
              onChange={(e) => setCurrentOriginPlant(e.target.value)}
              style={{
                flex: 1, minHeight: '44px', padding: '0 12px',
                border: '1px solid #ddd', borderRadius: '8px',
                fontSize: '15px', background: '#fff',
              }}
            >
              <option value="">{t('live.not_specified')}</option>
              {originPlants.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowAddOriginPlant(true)}
              style={{
                minWidth: '44px', minHeight: '44px',
                background: '#fff', color: '#0F6E56',
                border: '1px solid #0F6E56', borderRadius: '8px',
                fontSize: '20px', fontWeight: 700, cursor: 'pointer',
              }}
              aria-label="Add plant"
            >+</button>
          </div>
        )}
        {showAddOriginPlant && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newOriginPlantName}
              onChange={(e) => setNewOriginPlantName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddOriginPlant() }}
              placeholder={t('live.add_plant_placeholder')}
              autoFocus
              style={{
                flex: 1, minHeight: '44px', padding: '0 12px',
                border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px',
              }}
            />
            <button
              type="button"
              onClick={handleAddOriginPlant}
              style={{
                minWidth: '70px', minHeight: '44px',
                background: '#0F6E56', color: '#fff', border: 'none',
                borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >{t('live.add')}</button>
            <button
              type="button"
              onClick={() => { setShowAddOriginPlant(false); setNewOriginPlantName('') }}
              style={{
                minWidth: '44px', minHeight: '44px',
                background: '#fff', color: '#666',
                border: '1px solid #ddd', borderRadius: '8px',
                fontSize: '14px', cursor: 'pointer',
              }}
            >×</button>
          </div>
        )}
      </div>

      {/* Measuring from selector: pick full cycle or single-stage mode */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          {t('live.measuring_from')}
        </label>
        <select
          value={startStage}
          onChange={e => setStartStage(e.target.value as StageName)}
          style={{
            width: '100%', minHeight: '44px', padding: '0 12px',
            border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '15px', background: '#fff',
          }}
        >
          <option value="plant_queue">{t('live.plant_queue_full_cycle')}</option>
          {STAGES.filter(s => s !== 'plant_queue').map(s => (
            <option key={s} value={s}>{stageLabel(s)} · {t('live.single_stage_only_suffix')}</option>
          ))}
        </select>
        {startStage !== 'plant_queue' && (
          <div style={{ fontSize: '11px', color: '#888', marginTop: '6px', lineHeight: 1.4 }}>
            {t('live.single_stage_explainer', { stage: stageLabel(startStage) })}
          </div>
        )}
      </div>

      {/* Start new trip button */}
      <button
        type="button"
        onClick={handleStartNew}
        disabled={!currentMeasurer}
        style={{
          width: '100%', minHeight: '64px',
          background: currentMeasurer ? '#0F6E56' : '#ccc', color: '#fff',
          border: 'none', borderRadius: '14px',
          fontSize: '17px', fontWeight: 700,
          cursor: currentMeasurer ? 'pointer' : 'not-allowed',
          boxShadow: currentMeasurer ? '0 4px 14px rgba(15, 110, 86, 0.25)' : 'none',
        }}
      >
        ▶  {startStage === 'plant_queue' ? t('live.start_new_trip') : t('live.start_measurement_of', { stage: stageLabel(startStage) })}
      </button>

      {/* Active trip list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          {t('live.active_trips')} ({activeTrips?.length ?? 0})
        </div>
        {(!activeTrips || activeTrips.length === 0) && (
          <div style={{
            background: '#fff', border: '1px dashed #ccc', borderRadius: '10px',
            padding: '20px', textAlign: 'center', fontSize: '13px', color: '#888',
          }}>
            {t('live.no_active_trips')}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sortedActiveTrips.map(trip => (
            <ActiveTripListItem
              key={trip.id}
              trip={trip}
              onFocus={() => setFocusedTripId(trip.id)}
            />
          ))}
        </div>

        {pendingCount > 0 && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
              {t('live.pending_sync')} ({pendingCount})
            </div>
            <div style={{
              background: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px',
              padding: '12px', fontSize: '12px', color: '#666',
            }}>
              {(pendingTrips ?? []).slice(0, 5).map(t => (
                <div key={t.id} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{t.label} · {t.measurerName}</span>
                  <span style={{ color: t.isPartial ? '#D68910' : '#0F6E56' }}>
                    {t.isPartial ? 'partial' : 'complete'}
                  </span>
                </div>
              ))}
              {pendingCount > 5 && <div style={{ paddingTop: '4px', color: '#999', fontStyle: 'italic' }}>{t('live.and_more', { n: pendingCount - 5 })}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Save toast. Auto-dismisses after 2.5s. */}
      {saveToast && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a1a', color: '#fff',
          padding: '12px 18px', borderRadius: '10px',
          fontSize: '14px', fontWeight: 500,
          boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
          zIndex: 1100, maxWidth: '90vw',
          textAlign: 'center',
          animation: 'toast-slide-in .2s ease-out',
        }}>
          {saveToast}
        </div>
      )}
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  )
}

// Stage colors, must match Diagnostics palette so mode dot matches chart.
const STAGE_DOT_COLOR: Record<StageName, string> = {
  plant_queue: '#e41a1c',
  loading: '#377eb8',
  transit_out: '#4daf4a',
  site_wait: '#984ea3',
  pouring: '#ff7f00',
  washout: '#a65628',
  transit_back: '#f781bf',
}

/** Compute total TAT in minutes from a trip's timestamps, applying any
 *  in-flight edits from the review UI. Returns null if insufficient data. */
function computeTotalMin(
  trip: ActiveTrip,
  edits?: Partial<Record<StageName | 'complete', string>>,
): number | null {
  const ts = { ...trip.timestamps, ...edits }
  const start = ts.plant_queue ?? ts.loading ?? ts.transit_out
  const end = ts.complete
  if (!start || !end) return null
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 60000
  return diff > 0 ? Math.round(diff) : null
}

/** Most recent split timestamp on a trip, used for stuck detection. */
function lastSplitTime(trip: ActiveTrip): number {
  const all = Object.values(trip.timestamps).filter(Boolean) as string[]
  if (all.length === 0) return new Date(trip.createdAt).getTime()
  return Math.max(...all.map(t => new Date(t).getTime()))
}

// ── Active trip list item ──
// Shows trip label + measurement mode (full vs single-stage) + current
// stage + elapsed minutes. When a trip has been running > 4 hours with
// no recent split, shows a soft amber reminder.
function ActiveTripListItem({ trip, onFocus }: { trip: ActiveTrip; onFocus: () => void }) {
  const { t } = useLogT()
  const stageLabel = t(`stage.${trip.currentStage}` as LogStringKey)
  const startedAt = new Date(trip.createdAt)
  const elapsedMs = Date.now() - startedAt.getTime()
  const elapsedMin = Math.floor(elapsedMs / 60000)
  const sinceLastSplitMs = Date.now() - lastSplitTime(trip)
  // Stuck signal: total > 4h AND no split in last hour. Very conservative.
  const isStuck = elapsedMs > 4 * 60 * 60 * 1000 && sinceLastSplitMs > 60 * 60 * 1000

  const isSingleStage = trip.measurementMode === 'single_stage'
  const modeDotColor = isSingleStage ? STAGE_DOT_COLOR[trip.currentStage] : '#0F6E56'
  const modeLabel = isSingleStage
    ? `${stageLabel} ${t('live.single_stage_only_suffix')}`
    : t('list.full_cycle')

  // Format elapsed time: < 60 min shows "X min", >= 60 shows "Xh Ym"
  const elapsedDisplay = elapsedMin < 60
    ? `${elapsedMin} ${t('list.min_in')}`
    : `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m`

  return (
    <button
      type="button"
      onClick={onFocus}
      style={{
        width: '100%', textAlign: 'left',
        background: '#fff',
        border: `1px solid ${isStuck ? '#F1D79A' : '#e5e5e5'}`,
        borderRadius: '12px',
        padding: '12px 14px', cursor: 'pointer', minHeight: '64px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
        boxShadow: isStuck ? '0 0 0 1px rgba(214, 137, 16, 0.1) inset' : 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>{trip.label}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: 600, color: '#666',
            textTransform: 'uppercase', letterSpacing: '.3px',
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: modeDotColor, display: 'inline-block' }} />
            {modeLabel}
          </span>
        </div>
        <div style={{ fontSize: '12px', color: '#888' }}>
          {isSingleStage ? stageLabel : stageLabel} · {trip.measurerName} · {elapsedDisplay}
          {isStuck && (
            <span style={{ color: '#B7950B', marginLeft: '6px' }}>⏳</span>
          )}
        </div>
      </div>
      <div style={{
        padding: '6px 10px', borderRadius: '6px',
        background: '#E1F5EE', color: '#0F6E56',
        fontSize: '12px', fontWeight: 600, flexShrink: 0,
      }}>
        {t('list.open')} →
      </div>
    </button>
  )
}
