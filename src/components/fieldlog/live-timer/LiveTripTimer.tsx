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
  setTripSlumpTest,
  clearTripSlumpTest,
  setTripSiteType,
  getAllMeasurers,
  addMeasurer,
  getAllOriginPlants,
  addOriginPlant,
  drainPending,
  STAGES,
  SITE_TYPE_ORDER,
  type ActiveTrip,
  type PendingTrip,
  type StageName,
  type SiteType,
} from '@/lib/fieldlog/offline-trip-queue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { createClient } from '@/lib/supabase/client'
import LiveTripCard from './LiveTripCard'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'
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
  // Single-stage capture is an advanced use-case (~5% of trips). Default
  // to the full-cycle flow and only reveal the stage picker when the user
  // ticks "Measure single stage". Keeps the start screen uncluttered for
  // the common case.
  const [showSingleStagePicker, setShowSingleStagePicker] = useState(false)
  // Collapsed by default: hides origin plant + single-stage toggle so first-time
  // users see only their name + site type + big Start button. Expand when needed.
  const [showMoreOptions, setShowMoreOptions] = useState(false)
  // Site type pre-selected on the start screen. Observer can override on the
  // trip card later. Undefined means "don't set" — startTrip will still do
  // a cache lookup by site_name if one is provided.
  const [startSiteType, setStartSiteType] = useState<SiteType | undefined>(undefined)
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

  // Load measurer list from IndexedDB on mount, and auto-seed with the
  // logged-in user's name if the list is empty. Low-tech users should never
  // have to "Add a measurer first" before starting their first trip.
  useEffect(() => {
    async function init() {
      const list = await getAllMeasurers()
      const plantList = await getAllOriginPlants()
      setOriginPlants(plantList)
      if (plantList.length > 0 && !currentOriginPlant) setCurrentOriginPlant(plantList[0])

      if (list.length > 0) {
        setMeasurers(list)
        if (!currentMeasurer) setCurrentMeasurer(list[0])
        return
      }
      // Empty measurer list: seed with logged-in user's name (authed mode only)
      if (syncMode !== 'authed') {
        setMeasurers(list)
        return
      }
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setMeasurers(list); return }
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle()
        const name = (profile?.full_name || user.email?.split('@')[0] || '').trim()
        if (!name) { setMeasurers(list); return }
        await addMeasurer(name)
        const seeded = await getAllMeasurers()
        setMeasurers(seeded)
        setCurrentMeasurer(name)
      } catch {
        setMeasurers(list)
      }
    }
    init()
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
      siteType: startSiteType,
      startStage,
      viaToken: syncMode === 'token',
      token,
    })
    setFocusedTripId(trip.id)
    // Reset the pre-selection so the next trip starts blank; cache still
    // auto-applies via site_name so consistent sites don't need re-picking.
    setStartSiteType(undefined)
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
        onLogSlumpTest={(id, loc, pass) => setTripSlumpTest(id, loc, pass)}
        onClearSlumpTest={(id) => clearTripSlumpTest(id)}
        onUpdateSiteType={(id, type) => setTripSiteType(id, type)}
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
      {/* Status bar. In authed mode, FieldLogView already renders a SyncStatusBar
          at the top of the tab, so we skip this one. Token (helper) mode has no
          outer bar so we still show it here. */}
      {syncMode === 'token' && (
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
      )}

      {/* Measurer selector */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          <Bilingual k="live.measuring_as" />
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

      {/* Site type: friendly one-liner question. Dropdown stays here for Wave 1;
          Wave 2 will convert to an icon grid. Observer can still change it on
          the trip card once a trip is active. */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>
          <Bilingual k="site_type.question" />
        </label>
        <select
          value={startSiteType ?? ''}
          onChange={e => setStartSiteType((e.target.value || undefined) as SiteType | undefined)}
          style={{
            width: '100%', minHeight: '44px', padding: '0 12px',
            border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '15px', background: '#fff',
          }}
        >
          <option value="">—</option>
          {SITE_TYPE_ORDER.map(opt => (
            <option key={opt} value={opt}>{t(`site_type.${opt}` as LogStringKey)}</option>
          ))}
        </select>
      </div>

      {/* More options toggle: collapses rarely-used controls (origin plant for
          multi-plant shared-fleet assessments, single-stage measurement). */}
      <button
        type="button"
        onClick={() => setShowMoreOptions(v => !v)}
        style={{
          width: '100%', minHeight: '40px',
          background: 'transparent', color: '#0F6E56',
          border: '1px dashed #A8D9C5', borderRadius: '10px',
          fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}
      >
        {showMoreOptions
          ? <>▲ <Bilingual k="live.hide_options" inline /></>
          : <>▼ <Bilingual k="live.more_options" inline /></>}
      </button>

      {/* Origin plant selector (optional, for multi-plant shared-fleet assessments) */}
      {showMoreOptions && (<div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          <Bilingual k="live.current_plant" />
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

      {/* Advanced: measuring single stage. Hidden behind a checkbox because
          ~95% of captures are full-cycle trips. Showing all 9 single-stage
          options in a dropdown by default clutters the start screen. */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#555' }}>
          <input
            type="checkbox"
            checked={showSingleStagePicker}
            onChange={e => {
              const checked = e.target.checked
              setShowSingleStagePicker(checked)
              // Reset to full cycle when collapsing the picker
              if (!checked) setStartStage('plant_queue')
            }}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <Bilingual k="live.measure_single_stage_toggle" />
        </label>
        {showSingleStagePicker && (
          <div style={{ marginTop: '10px' }}>
            <select
              value={startStage}
              onChange={e => setStartStage(e.target.value as StageName)}
              style={{
                width: '100%', minHeight: '44px', padding: '0 12px',
                border: '1px solid #ddd', borderRadius: '8px',
                fontSize: '15px', background: '#fff',
              }}
            >
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
        )}
      </div>
      </div>)}

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
        ▶&nbsp;&nbsp;{startStage === 'plant_queue'
          ? <Bilingual k="live.start_new_trip" inline />
          : <Bilingual k="live.start_measurement_of" params={{ stage: stageLabel(startStage) }} inline />}
      </button>

      {/* Active trip list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          <Bilingual k="live.active_trips" /> ({activeTrips?.length ?? 0})
        </div>
        {(!activeTrips || activeTrips.length === 0) && (
          <div style={{
            background: '#fff', border: '1px dashed #ccc', borderRadius: '10px',
            padding: '20px', textAlign: 'center', fontSize: '13px', color: '#888',
          }}>
            <Bilingual k="live.no_active_trips" />
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
              <Bilingual k="live.pending_sync" /> ({pendingCount})
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
  weighbridge: '#1b7fa8',
  transit_out: '#4daf4a',
  site_wait: '#984ea3',
  pouring: '#ff7f00',
  site_washout: '#a65628',
  transit_back: '#f781bf',
  plant_prep: '#5a5a5a',
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
        <Bilingual k="list.open" inline /> →
      </div>
    </button>
  )
}
