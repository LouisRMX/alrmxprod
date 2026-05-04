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
  setTripBatchingUnit,
  setTripNotes,
  setTripRejected,
  setTripSlumpTest,
  clearTripSlumpTest,
  setTripSiteType,
  getCachedSiteType,
  getAllMeasurers,
  addMeasurer,
  getAllOriginPlants,
  addOriginPlant,
  getBatchingUnitsForPlant,
  addBatchingUnit,
  drainPending,
  STAGES,
  type ActiveTrip,
  type PendingTrip,
  type StageName,
  type SiteType,
} from '@/lib/fieldlog/offline-trip-queue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { createClient } from '@/lib/supabase/client'
import {
  fetchOptionsForAssessment,
  fetchOptionsForToken,
  upsertAssessmentOption,
  EMPTY_OPTIONS,
  type FieldCaptureOptions,
} from '@/lib/fieldlog/assessment-options'
import LiveTripCard from './LiveTripCard'
import SiteTypeGrid from '../SiteTypeGrid'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import Bilingual from '@/lib/i18n/Bilingual'
import type { LogStringKey } from '@/lib/i18n/log-catalog'

/**
 * The three stages where site_type matters for analysis. Used by the
 * deferred-prompt gate: only when the truck is about to enter one of
 * these is the observer asked to classify the site.
 */
const SITE_SIDE_STAGES: StageName[] = ['site_wait', 'pouring', 'site_washout']

interface LiveTripTimerProps {
  assessmentId: string
  plantId: string
  /** 'authed' uses supabase client directly; 'token' POSTs to the server-side API. */
  syncMode: 'authed' | 'token'
  /** When syncMode === 'token', this token is sent with every sync request. */
  token?: string
  /** When set in token mode, locks the measurer name to this value and
   *  hides the measurer picker. The admin who minted the token chose
   *  the helper's name; the helper does not get to override it. */
  helperName?: string | null
}

export default function LiveTripTimer({ assessmentId, plantId, syncMode, token, helperName }: LiveTripTimerProps) {
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
  // Batching unit list for the currently-selected origin plant. Refreshes
  // whenever currentOriginPlant changes. Empty when no plant is picked.
  const [batchingUnits, setBatchingUnits] = useState<string[]>([])
  const [currentBatchingUnit, setCurrentBatchingUnit] = useState<string>('')
  const [showAddBatchingUnit, setShowAddBatchingUnit] = useState(false)
  const [newBatchingUnitName, setNewBatchingUnitName] = useState('')
  // Admin-curated option lists (origin_plants / batching_units / mix_types)
  // resolved server-side from assessment_options. When this assessment has
  // no curated rows we fall back to IndexedDB. Token-mode helpers ALWAYS
  // see this list (no fallback) so they can never pick a value the admin
  // did not authorise.
  const [serverOptions, setServerOptions] = useState<FieldCaptureOptions>(EMPTY_OPTIONS)
  const [currentMixType, setCurrentMixType] = useState<string>('')
  const [showAddMixType, setShowAddMixType] = useState(false)
  const [newMixTypeName, setNewMixTypeName] = useState('')
  // Cement variant + load volume. Both are per-trip metadata that the
  // observer ideally captures up-front; both stay sticky across back-to-
  // back single-stage taps so the same load setup does not need re-picking.
  const [currentCementType, setCurrentCementType] = useState<'' | 'OPC' | 'SRC'>('')
  const [currentLoadM3, setCurrentLoadM3] = useState<string>('')
  // One-line summary of the most recent saved measurement, rendered just
  // under the Start/Stop button. Helpers asked for visible confirmation
  // beyond the transient toast — back-to-back single-stage measurements
  // need a persistent receipt.
  const [lastSavedSummary, setLastSavedSummary] = useState<{
    label: string
    minutes: number | null
    truckId?: string
    mixType?: string
    cementType?: 'OPC' | 'SRC'
    loadM3?: number
    batchingUnit?: string
    savedAtIso: string
  } | null>(null)
  const [focusedTripId, setFocusedTripId] = useState<string | null>(null)
  const [syncingNow, setSyncingNow] = useState(false)
  // Selected starting stage for the next trip. plant_queue = full cycle;
  // any other value = single-stage measurement of that stage. Defaults to
  // 'loading' because helpers using a token typically observe Loading on a
  // batching unit, and the explicit Process picker (always visible) lets
  // them switch to any other single stage or to "Full cycle" with one tap.
  const [startStage, setStartStage] = useState<StageName>('loading')
  // Transient "Trip saved" toast shown after a trip finalises.
  const [saveToast, setSaveToast] = useState<string | null>(null)
  // Site-type gate state. Two scenarios trigger the same modal:
  //   1. pendingSplit: full-cycle trip about to enter the first site-side
  //      stage. Tap moment is frozen so site_wait start is the truck's
  //      arrival, not the moment after modal-tap.
  //   2. pendingStart: single-stage measurement that begins on a site-side
  //      stage. createdAtIso is frozen so the recorded stage start is the
  //      observer's Start tap, not post-modal.
  // Only one of the two is set at any time. The modal component is shared.
  const [pendingSplit, setPendingSplit] = useState<{
    tripId: string
    tapTime: string
  } | null>(null)
  const [pendingStart, setPendingStart] = useState<{
    startStage: StageName
    createdAtIso: string
  } | null>(null)
  const [pendingSiteTypeChoice, setPendingSiteTypeChoice] = useState<SiteType | undefined>(undefined)
  const [pendingSiteTypeFromCache, setPendingSiteTypeFromCache] = useState(false)
  // In-place single-stage capture. When set, the start screen renders a live
  // stopwatch + Stop button right where the Start button sits, instead of
  // navigating to LiveTripCard. Keeps the action button at the exact same
  // vertical position across Start and Stop, so back-to-back measurements
  // become predictable thumb-tap.
  const [inPlaceSingleStageTripId, setInPlaceSingleStageTripId] = useState<string | null>(null)
  // Forces a re-render every second while the in-place stopwatch is running.
  const [stopwatchTick, setStopwatchTick] = useState(0)

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

  // Load admin-curated option lists (origin_plants, batching_units,
  // mix_types) from assessment_options. Authed admins query the table
  // directly; token helpers go through the SECURITY DEFINER RPC. Result
  // populates serverOptions; the picker render functions prefer it over
  // the IndexedDB lists when present.
  //
  // In authed mode we ALSO push any IndexedDB-only origin_plants and
  // batching_units to the server so token helpers see them. This is the
  // one-time backfill for entries the admin added via the live-timer
  // "+" buttons before server-side wiring existed; it is idempotent
  // (the unique constraint absorbs duplicates) so running it on every
  // mount is safe.
  useEffect(() => {
    let cancelled = false
    async function loadServerOptions() {
      try {
        let opts = syncMode === 'token' && token
          ? await fetchOptionsForToken(token)
          : await fetchOptionsForAssessment(assessmentId)
        if (cancelled) return
        setServerOptions(opts)

        if (syncMode !== 'authed') return

        const localPlants = await getAllOriginPlants()
        const serverPlantNames = new Set(opts.origin_plants.map(o => o.name))
        let pushed = false
        for (const name of localPlants) {
          if (!serverPlantNames.has(name)) {
            await upsertAssessmentOption({ assessmentId, kind: 'origin_plant', name })
            pushed = true
          }
          const localUnits = await getBatchingUnitsForPlant(name)
          const serverUnitsForPlant = new Set(
            opts.batching_units.filter(u => u.parent_name === name).map(u => u.name),
          )
          for (const unit of localUnits) {
            if (!serverUnitsForPlant.has(unit)) {
              await upsertAssessmentOption({
                assessmentId, kind: 'batching_unit', name: unit, parentName: name,
              })
              pushed = true
            }
          }
        }
        if (pushed && !cancelled) {
          opts = await fetchOptionsForAssessment(assessmentId)
          if (!cancelled) setServerOptions(opts)
        }
      } catch {
        if (!cancelled) setServerOptions(EMPTY_OPTIONS)
      }
    }
    loadServerOptions()
    return () => { cancelled = true }
  }, [assessmentId, syncMode, token])

  // When the token carries a helper name (admin chose it at mint time),
  // lock the measurer to that value. The measurer card is also hidden
  // below so the helper cannot see or change the picker.
  useEffect(() => {
    if (syncMode === 'token' && helperName && currentMeasurer !== helperName) {
      setCurrentMeasurer(helperName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helperName, syncMode])

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

  // Refresh batching-unit list whenever the chosen plant changes. Unit
  // names are scoped to plant: "Unit 1" at Plant A is not "Unit 1" at
  // Plant B, so changing plants must clear the previous selection.
  useEffect(() => {
    let cancelled = false
    async function loadUnits() {
      if (!currentOriginPlant) {
        setBatchingUnits([])
        setCurrentBatchingUnit('')
        return
      }
      const units = await getBatchingUnitsForPlant(currentOriginPlant)
      if (cancelled) return
      setBatchingUnits(units)
      setCurrentBatchingUnit('')
    }
    loadUnits()
    return () => { cancelled = true }
  }, [currentOriginPlant])

  // Auto-sync pending trips when online. Throttled by syncingNow flag.
  useEffect(() => {
    if (!online || syncingNow || pendingCount === 0) return
    runSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pendingCount])

  // 1-second tick to drive the in-place single-stage stopwatch display.
  // Only runs while a measurement is in progress, so idle Start screens stay
  // at zero render cost.
  useEffect(() => {
    if (!inPlaceSingleStageTripId) return
    const id = setInterval(() => setStopwatchTick(n => (n + 1) % 1_000_000), 1000)
    return () => clearInterval(id)
  }, [inPlaceSingleStageTripId])

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

    // Single-stage gate: when the observer is about to start a single
    // stage measurement that already lives in the site-side region
    // (site_wait, pouring, site_washout), we cannot defer site_type to
    // the next split — there will not be one. Freeze the tap moment now
    // and ask via the modal before creating the trip.
    if (startStage !== 'plant_queue' && SITE_SIDE_STAGES.includes(startStage)) {
      const createdAtIso = new Date().toISOString()
      setPendingSiteTypeChoice(undefined)
      setPendingSiteTypeFromCache(false)
      setPendingStart({ startStage, createdAtIso })
      return
    }

    const trip = await startTrip({
      assessmentId,
      plantId,
      measurerName: currentMeasurer,
      originPlant: currentOriginPlant || undefined,
      batchingUnit: currentOriginPlant && currentBatchingUnit
        ? currentBatchingUnit
        : undefined,
      mixType: currentMixType || undefined,
      cementType: currentCementType || undefined,
      loadM3: currentLoadM3 ? Number(currentLoadM3) : undefined,
      // site_type is deliberately not set here for plant-side single-stage
      // and full-cycle trips. Full-cycle trips get prompted at the
      // transit_out -> site_wait boundary. Plant-side single-stage trips
      // never need it.
      startStage,
      viaToken: syncMode === 'token',
      token,
    })
    // Single-stage measurements run in-place on the start screen so the
    // action button stays anchored. Full-cycle trips still navigate into
    // LiveTripCard for the multi-split flow.
    if (startStage !== 'plant_queue') {
      setInPlaceSingleStageTripId(trip.id)
    } else {
      setFocusedTripId(trip.id)
    }
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
    // Admin path: also persist server-side so helpers see the new option
    // on their next picker refresh. Failures are non-fatal — the admin
    // still has the value in IndexedDB and the next sync will retry.
    if (syncMode === 'authed') {
      await upsertAssessmentOption({
        assessmentId,
        kind: 'origin_plant',
        name,
      })
      const refreshed = await fetchOptionsForAssessment(assessmentId)
      setServerOptions(refreshed)
    }
    setCurrentOriginPlant(name)
    setNewOriginPlantName('')
    setShowAddOriginPlant(false)
  }

  const handleAddBatchingUnit = async () => {
    const name = newBatchingUnitName.trim()
    if (!name || !currentOriginPlant) return
    await addBatchingUnit(currentOriginPlant, name)
    const list = await getBatchingUnitsForPlant(currentOriginPlant)
    setBatchingUnits(list)
    if (syncMode === 'authed') {
      await upsertAssessmentOption({
        assessmentId,
        kind: 'batching_unit',
        name,
        parentName: currentOriginPlant,
      })
      const refreshed = await fetchOptionsForAssessment(assessmentId)
      setServerOptions(refreshed)
    }
    setCurrentBatchingUnit(name)
    setNewBatchingUnitName('')
    setShowAddBatchingUnit(false)
  }

  const handleAddMixType = async () => {
    const name = newMixTypeName.trim()
    if (!name || syncMode !== 'authed') return
    // Treat all-numeric names as their own sort_value so the new entry
    // lands in the right ascending position next to the seeded set
    // (250, 270, 350, ...). Non-numeric names fall back to insertion order.
    const numeric = Number(name)
    const sortValue = Number.isFinite(numeric) ? numeric : null
    await upsertAssessmentOption({
      assessmentId,
      kind: 'mix_type',
      name,
      sortValue,
    })
    const refreshed = await fetchOptionsForAssessment(assessmentId)
    setServerOptions(refreshed)
    setCurrentMixType(name)
    setNewMixTypeName('')
    setShowAddMixType(false)
  }

  const showSavedToast = useCallback((label: string) => {
    setSaveToast(label)
    setTimeout(() => setSaveToast(null), 2500)
  }, [])

  const handleSplit = async (tripId: string) => {
    // splitStage keeps the trip in activeTrips (awaitingReview) on the last
    // stage of a full-cycle trip; for single-stage mode it finalises the
    // trip directly. We capture the trip BEFORE the call so we can show a
    // save toast with elapsed minutes once the trip has been moved to the
    // pendingTrips queue.
    const tripBefore = await db.activeTrips.get(tripId)
    if (!tripBefore) return

    // Site-type gate. Full-cycle trips that are about to advance INTO the
    // first site-side stage (site_wait) and have no site_type yet must
    // classify the site before continuing. We capture the tap moment now,
    // open the modal, and replay the split with that timestamp on confirm
    // so the recorded site_wait start is the moment the truck actually
    // arrived, not the moment the observer finished tapping the modal.
    if (tripBefore.measurementMode !== 'single_stage' && !tripBefore.siteType) {
      const currentIndex = STAGES.indexOf(tripBefore.currentStage)
      const nextStage: StageName | undefined = STAGES[currentIndex + 1]
      if (nextStage && SITE_SIDE_STAGES.includes(nextStage)) {
        const tapTime = new Date().toISOString()
        const cached = tripBefore.siteName
          ? await getCachedSiteType(tripBefore.siteName)
          : undefined
        setPendingSiteTypeChoice(cached)
        setPendingSiteTypeFromCache(Boolean(cached))
        setPendingSplit({ tripId, tapTime })
        return
      }
    }

    await splitStage(tripId)

    // Only single-stage trips finalise inside splitStage — full-cycle
    // trips either advance to the next stage or enter awaitingReview, both
    // of which keep the card open as before.
    if (tripBefore.measurementMode !== 'single_stage') return

    const stage = tripBefore.singleStage ?? tripBefore.currentStage
    const stageStartIso = tripBefore.timestamps[stage]
    const elapsedMin = stageStartIso
      ? Math.max(0, Math.round((Date.now() - new Date(stageStartIso).getTime()) / 60000))
      : null

    if (online) runSync()

    // Return to the start screen but keep the single-stage toggle, stage
    // selection, measurer and origin plant intact. The observer can tap
    // Start again immediately for the next observation. Avoiding auto-start
    // is deliberate: it lets the observer mark the actual moment the next
    // process began rather than carrying the previous Finish-tap forward
    // as the next Start timestamp (which would inflate every measurement
    // by the observer's reaction-and-reposition pause).
    setFocusedTripId(null)
    // If the just-finalised trip was the in-place single-stage measurement,
    // reset the in-place state so the Start button reappears.
    if (inPlaceSingleStageTripId === tripId) {
      setInPlaceSingleStageTripId(null)
    }
    // Persistent receipt under the Start button. Stays visible across
    // back-to-back measurements so the helper has visible confirmation
    // beyond the transient toast \u2014 they can verify the right mix and
    // unit was attached without scrolling to the pending-sync list.
    setLastSavedSummary({
      label: stageLabel(stage),
      minutes: elapsedMin,
      truckId: tripBefore.truckId,
      mixType: tripBefore.mixType,
      cementType: tripBefore.cementType,
      loadM3: tripBefore.loadM3,
      batchingUnit: tripBefore.batchingUnit,
      savedAtIso: new Date().toISOString(),
    })
    showSavedToast(
      `\u2713 ${t('toast.partial_saved')}${elapsedMin != null ? `: ${elapsedMin} ${t('reviewq.min')}` : ''}${tripBefore.truckId ? ` \u00b7 ${t('reviewq.truck')} ${tripBefore.truckId}` : ''}`,
    )
  }

  const handleUndoSplit = async (tripId: string) => {
    await undoLastSplit(tripId)
  }

  /**
   * Confirm the site_type chosen in the deferred-prompt modal. Dispatches
   * on which gate triggered the modal:
   *   - pendingSplit: full-cycle trip approaching site-side. Replays the
   *     split with the captured tap moment.
   *   - pendingStart: single-stage on a site-side stage. Creates the trip
   *     with the captured Start moment as createdAt + first stage timestamp.
   * Site_type stays on the trip for the rest of its life. Undoing a stage
   * does NOT clear it: classification is independent of timing taps.
   */
  const handleSiteTypeConfirm = async () => {
    if (!pendingSiteTypeChoice) return

    if (pendingSplit) {
      const { tripId, tapTime } = pendingSplit
      await setTripSiteType(tripId, pendingSiteTypeChoice)
      await splitStage(tripId, tapTime)
      setPendingSplit(null)
    } else if (pendingStart) {
      const { startStage: stage, createdAtIso } = pendingStart
      const trip = await startTrip({
        assessmentId,
        plantId,
        measurerName: currentMeasurer,
        originPlant: currentOriginPlant || undefined,
        batchingUnit: currentOriginPlant && currentBatchingUnit
          ? currentBatchingUnit
          : undefined,
        mixType: currentMixType || undefined,
        cementType: currentCementType || undefined,
        loadM3: currentLoadM3 ? Number(currentLoadM3) : undefined,
        siteType: pendingSiteTypeChoice,
        startStage: stage,
        createdAtIso,
        viaToken: syncMode === 'token',
        token,
      })
      // pendingStart is only ever set for single-stage site-side captures,
      // so the trip runs in-place on the start screen for action-button
      // continuity with the plant-side single-stage path.
      setInPlaceSingleStageTripId(trip.id)
      setPendingStart(null)
    }

    setPendingSiteTypeChoice(undefined)
    setPendingSiteTypeFromCache(false)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(50) } catch { /* ignore */ }
    }
  }

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
      setLastSavedSummary({
        label: t('list.full_cycle'),
        minutes: totalMin,
        truckId: tripBefore.truckId,
        mixType: tripBefore.mixType,
        cementType: tripBefore.cementType,
        loadM3: tripBefore.loadM3,
        batchingUnit: tripBefore.batchingUnit,
        savedAtIso: new Date().toISOString(),
      })
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

  // Picker source resolution: when the admin has curated options server-side,
  // they override the per-device IndexedDB lists. Token-mode helpers ALWAYS
  // see only the server list (no fallback); admin/manager fall back to
  // IndexedDB when the assessment has no curated rows yet.
  const serverOriginPlants = serverOptions.origin_plants.map(o => o.name)
  const displayedOriginPlants: string[] = serverOriginPlants.length > 0
    ? serverOriginPlants
    : (syncMode === 'token' ? [] : originPlants)
  const serverUnitsForPlant = currentOriginPlant
    ? serverOptions.batching_units
        .filter(u => u.parent_name === currentOriginPlant)
        .map(u => u.name)
    : []
  const displayedBatchingUnits: string[] = serverUnitsForPlant.length > 0
    ? serverUnitsForPlant
    : (syncMode === 'token' ? [] : batchingUnits)
  const displayedMixTypes: string[] = serverOptions.mix_types.map(m => m.name)
  // Token-mode hides "+" buttons: helpers cannot extend admin-curated
  // lists. Authed admins can add options on-the-fly; new entries persist
  // both locally (IndexedDB cache for offline) and server-side (so other
  // helpers immediately pick them up on their next refresh).
  const allowAddOptions = syncMode !== 'token'

  // ── Render ──

  // If a trip is focused, show its card (full-screen on mobile)
  if (focusedTrip) {
    return (
      <>
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
          onUpdateBatchingUnit={(id, v) => setTripBatchingUnit(id, v)}
          getBatchingUnitsForPlant={getBatchingUnitsForPlant}
          onUpdateNotes={(id, n) => setTripNotes(id, n)}
          onUpdateStageNote={(id, s, txt) => setStageNote(id, s, txt)}
          onUpdateRejected={handleUpdateRejected}
          onLogSlumpTest={(id, loc, pass) => setTripSlumpTest(id, loc, pass)}
          onClearSlumpTest={(id) => clearTripSlumpTest(id)}
          onUpdateSiteType={(id, type) => setTripSiteType(id, type)}
        />
        {(pendingSplit || pendingStart) && (
          <SiteTypeGateModal
            value={pendingSiteTypeChoice}
            fromCache={pendingSiteTypeFromCache}
            onChange={(v) => { setPendingSiteTypeChoice(v); setPendingSiteTypeFromCache(false) }}
            onConfirm={handleSiteTypeConfirm}
          />
        )}
      </>
    )
  }

  // Sort active trips: longest-running first. Stuck trips naturally bubble
  // to the top where they need attention. Hide the in-place single-stage
  // trip so it does not duplicate the live stopwatch above the action button.
  const sortedActiveTrips = [...(activeTrips ?? [])]
    .filter(tr => tr.id !== inPlaceSingleStageTripId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  // Otherwise show the list + start button
  return (
    <>
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

      {/* Measurer selector. Hidden in token mode when the admin baked a
          helper name into the token: the measurer is locked, no need to
          show a disabled picker. The helper's name is shown in the page
          header instead so they have visible confirmation of who they
          are logged in as. */}
      {!(syncMode === 'token' && helperName) && (
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
      )}

      {/* Site (origin_plant). Step 2 of the flow: helper picks which
          batching plant they are at before anything else. The list is
          admin-curated via assessment_options; "+" only shown to admins. */}
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
              {displayedOriginPlants.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {allowAddOptions && (
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
            )}
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

      {/* Process picker. Step 3 of the flow: which stage of the truck cycle
          you are timing. Default 'loading' matches the most common helper
          observation. "Full cycle" maps to plant_queue + measurementMode=full
          and runs through all 9 stages via LiveTripCard like before. */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          <Bilingual k="live.process" />
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
          {STAGES.filter(s => s !== 'plant_queue').map(s => (
            <option key={s} value={s}>{stageLabel(s)}</option>
          ))}
          <option value="plant_queue">{t('live.full_cycle_option')}</option>
        </select>
      </div>

      {/* Batching unit. Step 4: scoped to the picked Site. Stays disabled
          with a hint until a Site is chosen so the helper knows the order. */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          <Bilingual k="live.current_batching_unit" />
        </label>
        {!currentOriginPlant && (
          <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
            {t('live.batching_unit_needs_plant')}
          </div>
        )}
        {currentOriginPlant && !showAddBatchingUnit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={currentBatchingUnit}
              onChange={(e) => setCurrentBatchingUnit(e.target.value)}
              style={{
                flex: 1, minHeight: '44px', padding: '0 12px',
                border: '1px solid #ddd', borderRadius: '8px',
                fontSize: '15px', background: '#fff',
              }}
            >
              <option value="">{t('live.choose_batching_unit')}</option>
              {displayedBatchingUnits.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            {allowAddOptions && (
              <button
                type="button"
                onClick={() => setShowAddBatchingUnit(true)}
                style={{
                  minWidth: '44px', minHeight: '44px',
                  background: '#fff', color: '#0F6E56',
                  border: '1px solid #0F6E56', borderRadius: '8px',
                  fontSize: '20px', fontWeight: 700, cursor: 'pointer',
                }}
                aria-label="Add batching unit"
              >+</button>
            )}
          </div>
        )}
        {currentOriginPlant && showAddBatchingUnit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newBatchingUnitName}
              onChange={(e) => setNewBatchingUnitName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddBatchingUnit() }}
              placeholder={t('live.add_batching_unit_placeholder')}
              autoFocus
              style={{
                flex: 1, minHeight: '44px', padding: '0 12px',
                border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px',
              }}
            />
            <button
              type="button"
              onClick={handleAddBatchingUnit}
              style={{
                minWidth: '70px', minHeight: '44px',
                background: '#0F6E56', color: '#fff', border: 'none',
                borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >{t('live.add')}</button>
            <button
              type="button"
              onClick={() => { setShowAddBatchingUnit(false); setNewBatchingUnitName('') }}
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

      {/* Mix / strength. Step 5. Admin-curated list; "+" admins only. */}
      {(displayedMixTypes.length > 0 || allowAddOptions) && (
        <div style={{
          background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
        }}>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
            <Bilingual k="live.mix_type" />
          </label>
          {!showAddMixType && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={currentMixType}
                onChange={(e) => setCurrentMixType(e.target.value)}
                style={{
                  flex: 1, minHeight: '44px', padding: '0 12px',
                  border: '1px solid #ddd', borderRadius: '8px',
                  fontSize: '15px', background: '#fff',
                }}
              >
                <option value="">{t('live.choose_mix')}</option>
                {displayedMixTypes.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {allowAddOptions && (
                <button
                  type="button"
                  onClick={() => setShowAddMixType(true)}
                  style={{
                    minWidth: '44px', minHeight: '44px',
                    background: '#fff', color: '#0F6E56',
                    border: '1px solid #0F6E56', borderRadius: '8px',
                    fontSize: '20px', fontWeight: 700, cursor: 'pointer',
                  }}
                  aria-label="Add mix type"
                >+</button>
              )}
            </div>
          )}
          {showAddMixType && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={newMixTypeName}
                onChange={(e) => setNewMixTypeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddMixType() }}
                placeholder={t('live.add_mix_type_placeholder')}
                autoFocus
                style={{
                  flex: 1, minHeight: '44px', padding: '0 12px',
                  border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px',
                }}
              />
              <button
                type="button"
                onClick={handleAddMixType}
                style={{
                  minWidth: '70px', minHeight: '44px',
                  background: '#0F6E56', color: '#fff', border: 'none',
                  borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >{t('live.add')}</button>
              <button
                type="button"
                onClick={() => { setShowAddMixType(false); setNewMixTypeName('') }}
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
      )}

      {/* Load volume m³. Step 6. */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          <Bilingual k="live.load_m3" />
        </label>
        <select
          value={currentLoadM3}
          onChange={e => setCurrentLoadM3(e.target.value)}
          style={{
            width: '100%', minHeight: '44px', padding: '0 12px',
            border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '15px', background: '#fff',
          }}
        >
          <option value="">{t('live.choose_loading_size')}</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
            <option key={n} value={String(n)}>{n} m³</option>
          ))}
        </select>
      </div>

      {/* Cement type. Step 7. Two-button OPC/SRC toggle. */}
      <div style={{
        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '12px',
      }}>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          <Bilingual k="live.cement_type" />
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['OPC', 'SRC'] as const).map(opt => {
            const active = currentCementType === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setCurrentCementType(active ? '' : opt)}
                style={{
                  flex: 1, minHeight: '44px',
                  background: active ? '#0F6E56' : '#fff',
                  color: active ? '#fff' : '#0F6E56',
                  border: `1px solid ${active ? '#0F6E56' : '#A8D9C5'}`,
                  borderRadius: '8px',
                  fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer',
                }}
              >{opt}</button>
            )
          })}
        </div>
      </div>

      {/* Site type is intentionally NOT asked on the Start screen. The
          observer often does not know where the truck is going at the
          moment of dispatch, and it only matters for analysing site-side
          stages (site_wait, pouring, site_washout). It is prompted as a
          modal at the boundary into the first site-side stage. */}

      {/* In-place stopwatch (single-stage mode only). Renders whenever the
          chosen Process is a single stage (i.e. anything except "Full
          cycle"). 00:00 when idle, ticks every second while running.
          Anchors the action button so its position never shifts on Start. */}
      {startStage !== 'plant_queue' && (() => {
        // stopwatchTick is a render dependency; reference it so the IIFE
        // recomputes elapsed time every second while running.
        void stopwatchTick
        const inPlaceTrip = (activeTrips ?? []).find(tr => tr.id === inPlaceSingleStageTripId)
        const elapsedSec = inPlaceTrip
          ? Math.max(0, Math.floor((Date.now() - new Date(inPlaceTrip.createdAt).getTime()) / 1000))
          : 0
        const totalMin = Math.floor(elapsedSec / 60)
        const ss = elapsedSec % 60
        const hh = Math.floor(totalMin / 60)
        const mm = totalMin % 60
        const elapsedDisplay = hh > 0
          ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
          : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
        const isRunning = Boolean(inPlaceTrip)
        return (
          <div style={{
            background: '#fff', border: `1px solid ${isRunning ? '#A8D9C5' : '#e5e5e5'}`,
            borderRadius: '12px', padding: '14px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: isRunning ? '#C0392B' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {isRunning && (
                <span className="rec-pulse" style={{
                  display: 'inline-block', width: '8px', height: '8px',
                  borderRadius: '50%', background: '#C0392B',
                }} />
              )}
              <span>{isRunning ? <Bilingual k="card.rec" inline /> : <Bilingual k="card.total_elapsed" inline />}</span>
            </div>
            <div style={{
              fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
              fontSize: '36px', fontWeight: 700,
              color: isRunning ? '#0F6E56' : '#bbb',
              marginTop: '4px', letterSpacing: '-1px',
            }}>{elapsedDisplay}</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
              {stageLabel(startStage)}
            </div>
          </div>
        )
      })()}

      {/* CSS keyframe for the REC dot pulse on the in-place stopwatch.
          Mirrors the keyframe defined in LiveTripCard. */}
      {startStage !== 'plant_queue' && (
        <style>{`
          @keyframes rec-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%      { opacity: 0.5; transform: scale(0.85); }
          }
          .rec-pulse {
            animation: rec-pulse 1.2s ease-in-out infinite;
          }
        `}</style>
      )}

      {/* Start / Stop toggle. Stays in the same vertical position whether a
          single-stage measurement is running or not. Switches to red Stop
          state while in-place. Full-cycle (plant_queue) keeps the original
          green Start label and navigates to LiveTripCard on tap. */}
      <button
        type="button"
        onClick={inPlaceSingleStageTripId
          ? () => handleSplit(inPlaceSingleStageTripId)
          : handleStartNew}
        disabled={inPlaceSingleStageTripId ? false : !currentMeasurer}
        style={{
          width: '100%', minHeight: '64px',
          background: inPlaceSingleStageTripId
            ? '#C0392B'
            : (currentMeasurer ? '#0F6E56' : '#ccc'),
          color: '#fff', border: 'none', borderRadius: '14px',
          fontSize: '17px', fontWeight: 700,
          cursor: (inPlaceSingleStageTripId || currentMeasurer) ? 'pointer' : 'not-allowed',
          boxShadow: inPlaceSingleStageTripId
            ? '0 4px 14px rgba(192, 57, 43, 0.25)'
            : (currentMeasurer ? '0 4px 14px rgba(15, 110, 86, 0.25)' : 'none'),
        }}
      >
        {inPlaceSingleStageTripId ? (
          <>■&nbsp;&nbsp;<Bilingual k="stage.finish" inline />{' '}<Bilingual k={`stage.${startStage}` as LogStringKey} inline /></>
        ) : startStage === 'plant_queue' ? (
          <>▶&nbsp;&nbsp;<Bilingual k="live.start_new_trip" inline /></>
        ) : (
          <>▶&nbsp;&nbsp;<Bilingual k="live.start_stage_timer" params={{ stage: stageLabel(startStage) }} inline /></>
        )}
      </button>

      {/* Last saved measurement: persistent receipt under the action button.
          Stays visible across back-to-back single-stage taps, so the helper
          can verify the right mix and unit landed without scrolling. The
          transient toast at the bottom still fires for the moment-of-save
          confirmation; this line is the longer-lived audit trail. */}
      {lastSavedSummary && (
        <div style={{
          background: '#E1F5EE', border: '1px solid #A8D9C5',
          borderRadius: '10px', padding: '10px 12px',
          fontSize: '13px', color: '#0F6E56',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>
              ✓ {lastSavedSummary.label}
              {lastSavedSummary.minutes != null && (
                <span style={{ marginLeft: '8px', fontWeight: 600 }}>
                  {lastSavedSummary.minutes} {t('reviewq.min')}
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#0F6E56', opacity: 0.85, marginTop: '2px' }}>
              {[
                lastSavedSummary.truckId && `${t('reviewq.truck')} ${lastSavedSummary.truckId}`,
                lastSavedSummary.mixType && `${t('live.mix_type')} ${lastSavedSummary.mixType}`,
                lastSavedSummary.cementType,
                lastSavedSummary.loadM3 != null && `${lastSavedSummary.loadM3} m³`,
                lastSavedSummary.batchingUnit,
                new Date(lastSavedSummary.savedAtIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLastSavedSummary(null)}
            aria-label="Dismiss last saved"
            style={{
              background: 'transparent', border: 'none', color: '#0F6E56',
              fontSize: '18px', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >×</button>
        </div>
      )}

      {/* Active trip list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
          <Bilingual k="live.active_trips" /> ({sortedActiveTrips.length})
        </div>
        {sortedActiveTrips.length === 0 && (
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
    {(pendingSplit || pendingStart) && (
      <SiteTypeGateModal
        value={pendingSiteTypeChoice}
        fromCache={pendingSiteTypeFromCache}
        onChange={(v) => { setPendingSiteTypeChoice(v); setPendingSiteTypeFromCache(false) }}
        onConfirm={handleSiteTypeConfirm}
      />
    )}
    </>
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

// ── Site type gate modal ─────────────────────────────────────────────────
// Forced classification at the boundary into the first site-side stage.
// No cancel/skip: requirement is that every site-side stage has a
// site_type. "Unknown" is a valid value when the observer truly cannot
// tell. The modal is full-screen on mobile and dimmed-overlay on desktop.
function SiteTypeGateModal({
  value, fromCache, onChange, onConfirm,
}: {
  value: SiteType | undefined
  fromCache: boolean
  onChange: (v: SiteType) => void
  onConfirm: () => void
}) {
  const { t } = useLogT()
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(0, 0, 0, 0.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0',
    }}>
      <div style={{
        width: '100%', maxWidth: '560px',
        background: '#fff',
        borderTopLeftRadius: '18px', borderTopRightRadius: '18px',
        padding: '20px 16px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 -10px 30px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>
          {t('live.site_type_gate_title')}
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '14px', lineHeight: 1.4 }}>
          {t('live.site_type_gate_subtitle')}
        </div>
        <SiteTypeGrid value={value} fromCache={fromCache} onChange={onChange} />
        <button
          type="button"
          onClick={onConfirm}
          disabled={!value}
          style={{
            width: '100%', minHeight: '52px', marginTop: '16px',
            background: value ? '#0F6E56' : '#ccc', color: '#fff',
            border: 'none', borderRadius: '12px',
            fontSize: '15px', fontWeight: 700,
            cursor: value ? 'pointer' : 'not-allowed',
            boxShadow: value ? '0 4px 12px rgba(15, 110, 86, 0.25)' : 'none',
          }}
        >
          {t('live.confirm_and_continue')}
        </button>
      </div>
    </div>
  )
}
