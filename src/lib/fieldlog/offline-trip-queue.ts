/**
 * Offline-first trip queue backed by IndexedDB (via Dexie).
 *
 * Why this exists:
 *   On a ready-mix plant yard in Riyadh, the observer's iPhone frequently
 *   loses signal (metal buildings, concrete structures, site dead zones).
 *   Every stopwatch tap and every trip-save must succeed locally first,
 *   then sync to Supabase when the network returns. Zero data loss,
 *   always-responsive UI.
 *
 * Architecture:
 *   - ActiveTrip: a trip currently being timed (one per parallel observation)
 *   - PendingTrip: a completed trip awaiting upload to daily_logs
 *   - SyncLog: audit trail of successful and failed sync attempts
 *
 * The timer UI writes to ActiveTrip on every tap. On "finish trip" the row
 * moves to PendingTrip. A background sync loop drains PendingTrip into
 * Supabase whenever online. If sync fails (network flap, server error),
 * the row stays in PendingTrip and retries later.
 */

import Dexie, { type Table } from 'dexie'

// ── Stage names in canonical order ────────────────────────────────────────
// These match the 9 stages of a ready-mix truck cycle and the timestamp
// columns on public.daily_logs. Each stage represents a real operational
// activity with a distinct queue-able resource; conflating any two (e.g.
// batching + weighbridge, or site-drum-flush + plant-prep) would hide the
// actual bottleneck when diagnosing TAT.
export const STAGES = [
  'plant_queue',     // plant_queue_start  → loading_start
  'loading',         // loading_start      → loading_end           (batching tower)
  'weighbridge',     // loading_end        → departure_loaded      (weighing out)
  'transit_out',     // departure_loaded   → arrival_site
  'site_wait',       // arrival_site       → discharge_start
  'pouring',         // discharge_start    → discharge_end
  'site_washout',    // discharge_end      → departure_site        (drum flush at site)
  'transit_back',    // departure_site     → arrival_plant
  'plant_prep',      // arrival_plant      → plant_prep_end        (holding water, break, positioning)
] as const

export type StageName = (typeof STAGES)[number]

/** Site type classification (10 values). Each value encodes both the site
 *  category and the implied pour method so TAT benchmarking can segment on
 *  the things that actually vary (direct vs pumped vs specialized).
 *
 *  Direct discharge: ground_pour, road_pavement, industrial
 *  Pumped + elevated: high_rise, bridge_deck
 *  Specialized profiles: tunnel, marine, piling
 *  Industrial receiver: precast
 *  Escape hatch: unknown
 */
export type SiteType =
  | 'ground_pour'
  | 'high_rise'
  | 'bridge_deck'
  | 'road_pavement'
  | 'industrial'
  | 'tunnel'
  | 'precast'
  | 'marine'
  | 'piling'
  | 'unknown'

/** Display order for pickers and dropdowns. Grouped: direct → pumped →
 *  specialized → industrial → unknown, so analysts can scan the profiles. */
export const SITE_TYPE_ORDER: readonly SiteType[] = [
  'ground_pour',
  'road_pavement',
  'industrial',
  'high_rise',
  'bridge_deck',
  'tunnel',
  'marine',
  'piling',
  'precast',
  'unknown',
] as const

/** Map stage name → daily_logs column name where the stage's START timestamp lives. */
export const STAGE_START_COLUMN: Record<StageName, string> = {
  plant_queue: 'plant_queue_start',
  loading: 'loading_start',
  weighbridge: 'loading_end',
  transit_out: 'departure_loaded',
  site_wait: 'arrival_site',
  pouring: 'discharge_start',
  site_washout: 'discharge_end',
  transit_back: 'departure_site',
  plant_prep: 'arrival_plant',
}

/** End-of-trip timestamp (when the truck is READY for the next load, not
 *  merely when it arrived back at the plant gate — that's arrival_plant). */
export const TRIP_END_COLUMN = 'plant_prep_end'

// ── Per-stage notes shape ────────────────────────────────────────────────
export type StageNotes = Partial<Record<StageName, string>>

// ── Trip records ──────────────────────────────────────────────────────────

/**
 * A trip currently being timed. Timestamps are filled in progressively
 * as the observer taps through the stages. An active trip is abandoned
 * (trip complete), saved partial (observer moves on), or cancelled.
 */
export interface ActiveTrip {
  /** Local UUID, set at trip start. Used as sync-queue key. */
  id: string
  /** Human label for the list view ("Truck TR-14, Ali"). */
  label: string
  /** Trip context. */
  assessmentId: string
  plantId: string
  measurerName: string
  /**
   * Physical plant of origin when the assessment covers multiple batching
   * plants with shared fleet (Model A). Free-text label picked by observer.
   */
  originPlant?: string
  /**
   * Optional batching unit inside the chosen plant (e.g. "Unit 1", "BU-A").
   * Most plants have 2-3 stationary batching units; capturing which one
   * loaded a given truck lets per-unit loading time and reject rate be
   * surfaced. NULL = rolls up to plant level only.
   */
  batchingUnit?: string
  /** Optional identifiers the observer filled in at start. */
  truckId?: string
  driverName?: string
  siteName?: string
  /** Site classification (ground_pour / high_rise / infrastructure / unknown).
   *  Auto-filled from the siteTypes cache when siteName matches a previously
   *  categorised site; observer can override per trip. Unknown is the default
   *  for first-time sites so the helper is not forced to guess. */
  siteType?: SiteType
  /** True when siteType was populated from the site-name cache and the
   *  observer has not yet tapped to confirm. Drives the auto-filled indicator
   *  so silent carry-over from a previous trip is visible on-screen. Any
   *  explicit tap via setTripSiteType clears this flag. */
  siteTypeFromCache?: boolean
  /** ISO timestamps, one per completed stage. plant_queue_start = trip start. */
  timestamps: Partial<Record<StageName | 'complete', string>>
  /** Current stage the timer is showing (the stage about to be ended by next tap). */
  currentStage: StageName
  /** Optional per-stage notes. */
  stageNotes: StageNotes
  /** Free-text note that applies to the whole trip. */
  notes: string
  /** Created via token URL? Used to decide the sync endpoint. */
  viaToken: boolean
  /** Token string if viaToken is true. */
  token?: string
  /** Local creation time (for display and ordering). */
  createdAt: string
  /**
   * After the observer hits split on the last stage, the trip enters a
   * "review" state. Timestamps are populated but the user can edit any of
   * them before the row is finalised and queued for sync. Lag 2 safety net.
   */
  awaitingReview?: boolean
  /**
   * Measurement scope. 'full' = trip starts at plant_queue and moves
   * through all 9 stages. 'single_stage' = observer wants to measure
   * just one specific stage (e.g., rapid site_washout sampling). Partial
   * saves work for both modes.
   */
  measurementMode: 'full' | 'single_stage'
  /** When measurementMode='single_stage', the stage being measured. */
  singleStage?: StageName
  /**
   * Marked rejected live during the trip. Observer taps "Mark rejected"
   * if a load is refused. Saved on the daily_logs row.
   */
  rejected?: boolean
  /**
   * Slump test result, if one was logged via the in-card action. A single
   * test per trip: location distinguishes pre-dispatch QC (plant) from
   * customer-side acceptance (site). Relogging overwrites. NULL when no
   * formal slump test was recorded for this trip.
   */
  slumpTest?: {
    time: string
    location: 'plant' | 'site'
    pass: boolean
  }
}

/**
 * A trip that has been marked complete or saved partial and is awaiting
 * sync to Supabase. Same shape as ActiveTrip but with sync metadata.
 */
export interface PendingTrip extends ActiveTrip {
  isPartial: boolean
  /** Attempts counter. */
  syncAttempts: number
  /** Last error string (for debugging). */
  lastSyncError?: string
  /** ISO timestamp when this trip was finalised. */
  finalisedAt: string
}

/** Sync audit record. */
export interface SyncLog {
  id?: number
  tripId: string
  status: 'ok' | 'error'
  message?: string
  at: string
}

// ── Dexie database ────────────────────────────────────────────────────────
class FieldLogDB extends Dexie {
  activeTrips!: Table<ActiveTrip, string>
  pendingTrips!: Table<PendingTrip, string>
  syncLog!: Table<SyncLog, number>
  /**
   * Persisted measurer names (Option B dropdown). Grows as the observer
   * adds new measurers. The first measurer added becomes the default.
   */
  measurers!: Table<{ name: string; lastUsed: string }, string>
  /** Persisted token → last-known assessmentId/plantId so the timer works
   *  immediately even before a token re-validation round-trip. */
  tokenCache!: Table<{ token: string; assessmentId: string; plantId: string; cachedAt: string }, string>
  /**
   * Persisted origin plant labels (multi-plant shared-fleet support).
   * Populated when observer picks or adds a plant. Autofills on next trip.
   */
  originPlants!: Table<{ name: string; lastUsed: string }, string>
  /**
   * Per-site cache: remember the site_type the observer chose for a given
   * site_name so the next trip to the same site auto-fills it. The observer
   * can still override on any individual trip. Using site_name (free text)
   * as the key is pragmatic: consistent naming = consistent cache.
   */
  siteTypes!: Table<{ name: string; siteType: SiteType; lastUsed: string }, string>
  /**
   * Persisted batching-unit labels, scoped to the parent plant. Primary key
   * is "<plant>::<unit>" so the same unit name on two different plants does
   * not collide. The 'plant' index lets us query all units for a chosen
   * plant in O(log n).
   */
  batchingUnits!: Table<{ key: string; plant: string; unit: string; lastUsed: string }, string>

  constructor() {
    super('alrmx_fieldlog')
    this.version(1).stores({
      activeTrips: 'id, assessmentId, createdAt',
      pendingTrips: 'id, assessmentId, finalisedAt, syncAttempts',
      syncLog: '++id, tripId, at',
      measurers: 'name, lastUsed',
      tokenCache: 'token',
    })
    // v2: add originPlants table for multi-plant shared-fleet (Model A) support.
    this.version(2).stores({
      activeTrips: 'id, assessmentId, createdAt',
      pendingTrips: 'id, assessmentId, finalisedAt, syncAttempts',
      syncLog: '++id, tripId, at',
      measurers: 'name, lastUsed',
      tokenCache: 'token',
      originPlants: 'name, lastUsed',
    })
    // v3: siteTypes cache so site_name -> site_type mapping persists per device
    this.version(3).stores({
      activeTrips: 'id, assessmentId, createdAt',
      pendingTrips: 'id, assessmentId, finalisedAt, syncAttempts',
      syncLog: '++id, tripId, at',
      measurers: 'name, lastUsed',
      tokenCache: 'token',
      originPlants: 'name, lastUsed',
      siteTypes: 'name, lastUsed',
    })
    // v4: batchingUnits cache so each plant remembers its own unit list.
    this.version(4).stores({
      activeTrips: 'id, assessmentId, createdAt',
      pendingTrips: 'id, assessmentId, finalisedAt, syncAttempts',
      syncLog: '++id, tripId, at',
      measurers: 'name, lastUsed',
      tokenCache: 'token',
      originPlants: 'name, lastUsed',
      siteTypes: 'name, lastUsed',
      batchingUnits: 'key, plant, lastUsed',
    })
  }
}

export const db = new FieldLogDB()

// ── Helpers ───────────────────────────────────────────────────────────────

function newTripId(): string {
  // RFC4122-ish; sufficient for local + server-side dedup via upsert.
  // Using crypto.randomUUID when available, fallback for older environments.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'trip-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

/** Start a new active trip. First tap happens here.
 *  If startStage is provided and is not 'plant_queue', the trip is
 *  treated as a single-stage measurement: only that stage gets a
 *  timestamp, and the trip is marked partial on save. */
export async function startTrip(input: {
  assessmentId: string
  plantId: string
  measurerName: string
  originPlant?: string
  /** Optional batching-unit label inside the chosen origin plant. */
  batchingUnit?: string
  truckId?: string
  driverName?: string
  siteName?: string
  siteType?: SiteType
  viaToken?: boolean
  token?: string
  /** Defaults to 'plant_queue' (full cycle). Any other stage starts
   *  a single-stage measurement. */
  startStage?: StageName
  /** Override the trip creation timestamp. Used when a UI gate (e.g.
   *  the site-type modal for single-stage measurements on site-side
   *  stages) defers the actual creation but the recorded start moment
   *  should be the observer's original Start tap. */
  createdAtIso?: string
}): Promise<ActiveTrip> {
  const now = input.createdAtIso ?? new Date().toISOString()
  const startStage = input.startStage ?? 'plant_queue'
  const mode: 'full' | 'single_stage' = startStage === 'plant_queue' ? 'full' : 'single_stage'

  // site_type is no longer auto-filled from the siteName cache at trip
  // start. With the deferred-prompt flow, the modal at the first site-side
  // stage handles cache lookup and asks the observer to confirm with a
  // single tap, so silent fill here would skip that confirmation.
  const trip: ActiveTrip = {
    id: newTripId(),
    label: input.truckId ? `Truck ${input.truckId}` : 'Unlabeled trip',
    assessmentId: input.assessmentId,
    plantId: input.plantId,
    measurerName: input.measurerName,
    originPlant: input.originPlant,
    batchingUnit: input.batchingUnit,
    truckId: input.truckId,
    driverName: input.driverName,
    siteName: input.siteName,
    siteType: input.siteType,
    siteTypeFromCache: undefined,
    timestamps: { [startStage]: now } as Partial<Record<StageName | 'complete', string>>,
    currentStage: startStage,
    stageNotes: {},
    notes: '',
    viaToken: input.viaToken ?? false,
    token: input.token,
    createdAt: now,
    measurementMode: mode,
    singleStage: mode === 'single_stage' ? startStage : undefined,
    rejected: false,
  }
  await db.activeTrips.add(trip)
  // Bump measurer last-used timestamp
  await db.measurers.put({ name: input.measurerName, lastUsed: now })
  if (input.originPlant) {
    await db.originPlants.put({ name: input.originPlant, lastUsed: now })
  }
  if (input.originPlant && input.batchingUnit) {
    await db.batchingUnits.put({
      key: `${input.originPlant}::${input.batchingUnit}`,
      plant: input.originPlant,
      unit: input.batchingUnit,
      lastUsed: now,
    })
  }
  // Cache the site_name -> site_type mapping if both are set. With the
  // deferred-prompt flow this only fires when a caller explicitly passes
  // siteType (e.g. token-mode pre-fill); the normal LiveTripTimer path
  // does not, and the modal handler caches the mapping itself.
  if (input.siteName && input.siteType) {
    await db.siteTypes.put({ name: input.siteName, siteType: input.siteType, lastUsed: now })
  }
  return trip
}

/** Toggle the rejected flag on an active trip. */
export async function setTripRejected(tripId: string, rejected: boolean): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  await db.activeTrips.put({ ...trip, rejected })
}

/** Log the slump test result for an active trip. Overwrites any existing
 *  slump test on the trip (one test per trip by design). Auto-timestamps. */
export async function setTripSlumpTest(
  tripId: string,
  location: 'plant' | 'site',
  pass: boolean,
): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  await db.activeTrips.put({
    ...trip,
    slumpTest: {
      time: new Date().toISOString(),
      location,
      pass,
    },
  })
}

/** Remove a previously-logged slump test from an active trip (e.g. if the
 *  observer logged it by mistake and wants to start over). */
export async function clearTripSlumpTest(tripId: string): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  const next: ActiveTrip = { ...trip }
  delete next.slumpTest
  await db.activeTrips.put(next)
}

/**
 * Advance a trip to the next stage (full mode) or finish the single-stage
 * measurement. In full mode, saves the END timestamp of the current stage
 * and moves on. If the current stage is the last one (transit_back), the
 * trip enters a review state for timestamp editing.
 *
 * In single_stage mode, Split is the "finish measurement" action: saves
 * the end-of-stage timestamp and finalises as partial (remaining stages
 * null by design).
 *
 * `tapTime` lets the caller record the moment the observer actually tapped
 * Split, even if a UI gate (e.g. site-type modal) defers the call. Defaults
 * to `Date.now()` when the caller doesn't pass one.
 */
export async function splitStage(tripId: string, tapTime?: string): Promise<ActiveTrip | null> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip || trip.awaitingReview) return null
  const now = tapTime ?? new Date().toISOString()
  const currentIndex = STAGES.indexOf(trip.currentStage)
  const nextIndex = currentIndex + 1

  // Single-stage mode: Split finishes the measurement. No review step.
  // End timestamp maps to the NEXT stage's start column (or 'complete'
  // if measuring transit_back, the last stage).
  if (trip.measurementMode === 'single_stage') {
    const endKey: StageName | 'complete' = nextIndex < STAGES.length
      ? STAGES[nextIndex]
      : 'complete'
    const updated: ActiveTrip = {
      ...trip,
      timestamps: { ...trip.timestamps, [endKey]: now },
    }
    await finaliseTrip(updated, /* isPartial */ true)
    return null
  }

  // Full mode: normal stage progression
  if (nextIndex >= STAGES.length) {
    // Last stage done → enter review state (Lag 2 safety net)
    const updated: ActiveTrip = {
      ...trip,
      timestamps: { ...trip.timestamps, complete: now },
      awaitingReview: true,
    }
    await db.activeTrips.put(updated)
    return updated
  }

  const nextStage = STAGES[nextIndex]
  const updated: ActiveTrip = {
    ...trip,
    timestamps: { ...trip.timestamps, [nextStage]: now },
    currentStage: nextStage,
  }
  await db.activeTrips.put(updated)
  return updated
}

/**
 * Undo the most recent split (Lag 1 safety net). Reverts currentStage to
 * the previous stage and deletes its timestamp. If we are in the review
 * state (after finishing the last stage, plant_prep), drops the complete
 * timestamp. Returns null if nothing to undo.
 */
export async function undoLastSplit(tripId: string): Promise<ActiveTrip | null> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return null

  // Undo review-state split: drop complete, return to the final stage.
  if (trip.awaitingReview) {
    const newTimestamps = { ...trip.timestamps }
    delete newTimestamps.complete
    const updated: ActiveTrip = {
      ...trip,
      timestamps: newTimestamps,
      awaitingReview: false,
      currentStage: STAGES[STAGES.length - 1],
    }
    await db.activeTrips.put(updated)
    return updated
  }

  const currentIndex = STAGES.indexOf(trip.currentStage)
  if (currentIndex <= 0) return null  // can't undo first split (plant_queue start)

  const previousStage = STAGES[currentIndex - 1]
  const newTimestamps = { ...trip.timestamps }
  delete newTimestamps[trip.currentStage]

  const updated: ActiveTrip = {
    ...trip,
    currentStage: previousStage,
    timestamps: newTimestamps,
  }
  await db.activeTrips.put(updated)
  return updated
}

/**
 * Finalise a trip that is in review state, optionally overriding any of
 * the 9 stage timestamps or 'complete'. Edits are validated (each must
 * be after the previous) before the trip moves to the pending queue for
 * sync.
 */
export async function finaliseWithEdits(
  tripId: string,
  editedTimestamps?: Partial<Record<StageName | 'complete', string>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return { ok: false, error: 'Trip not found' }
  if (!trip.awaitingReview) return { ok: false, error: 'Trip is not in review state' }

  const mergedTimestamps = { ...trip.timestamps, ...editedTimestamps }

  // Validate: each non-null timestamp must be after the previous one.
  const ordered: Array<StageName | 'complete'> = [...STAGES, 'complete']
  let lastTime = 0
  let lastKey: string | null = null
  for (const key of ordered) {
    const value = mergedTimestamps[key]
    if (!value) continue
    const t = new Date(value).getTime()
    if (isNaN(t)) return { ok: false, error: `Invalid timestamp for ${key}` }
    if (t < lastTime) {
      return { ok: false, error: `${key} must be after ${lastKey ?? 'previous'}` }
    }
    lastTime = t
    lastKey = key
  }

  const updated: ActiveTrip = {
    ...trip,
    timestamps: mergedTimestamps,
  }
  await finaliseTrip(updated, /* isPartial */ false)
  return { ok: true }
}

/** Update note for a specific stage on an active trip. */
export async function setStageNote(tripId: string, stage: StageName, text: string): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  await db.activeTrips.put({
    ...trip,
    stageNotes: { ...trip.stageNotes, [stage]: text },
  })
}

/** Update free-text notes on an active trip. */
export async function setTripNotes(tripId: string, notes: string): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  await db.activeTrips.put({ ...trip, notes })
}

/** Update truck/driver/site identifiers on an active trip. When the site
 *  name changes and no explicit site_type has been set on the trip, look
 *  up the cache so a previously-categorised site auto-fills. */
export async function setTripIdentity(
  tripId: string,
  ids: { truckId?: string; driverName?: string; siteName?: string },
): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  const nextSiteName = ids.siteName ?? trip.siteName
  // Auto-apply cached site_type when the site_name changes to a site we
  // have seen before AND the trip doesn't already have a user-confirmed type.
  // A user-confirmed type is one with siteTypeFromCache === false/undefined;
  // if the current value was itself from cache we treat the change as fresh.
  let nextSiteType: SiteType | undefined = trip.siteType
  let nextFromCache = trip.siteTypeFromCache ?? false
  const currentIsConfirmed = trip.siteType && !trip.siteTypeFromCache
  if (nextSiteName && nextSiteName !== trip.siteName && !currentIsConfirmed) {
    const cached = await db.siteTypes.get(nextSiteName)
    if (cached) {
      nextSiteType = cached.siteType
      nextFromCache = true
    } else {
      // No cache for the new site — clear any stale auto-filled value.
      nextSiteType = undefined
      nextFromCache = false
    }
  }
  const updated: ActiveTrip = {
    ...trip,
    truckId: ids.truckId ?? trip.truckId,
    driverName: ids.driverName ?? trip.driverName,
    siteName: nextSiteName,
    siteType: nextSiteType,
    siteTypeFromCache: nextFromCache ? true : undefined,
  }
  updated.label = updated.truckId ? `Truck ${updated.truckId}` : 'Unlabeled trip'
  await db.activeTrips.put(updated)
}

/** Update origin plant on an active trip (observer can correct mid-trip).
 *  Changing the plant clears any previously-selected batching unit because
 *  unit labels are scoped to plant: "Unit 1" on Plant A is not "Unit 1" on
 *  Plant B. The observer reselects the unit if needed. */
export async function setTripOriginPlant(tripId: string, originPlant: string): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  const trimmed = originPlant.trim()
  const plantChanged = (trip.originPlant ?? '') !== trimmed
  await db.activeTrips.put({
    ...trip,
    originPlant: trimmed || undefined,
    batchingUnit: plantChanged ? undefined : trip.batchingUnit,
  })
  if (trimmed) {
    await db.originPlants.put({ name: trimmed, lastUsed: new Date().toISOString() })
  }
}

/** Update the batching unit on an active trip. Empty string clears it
 *  (rolls back up to plant level only). The unit is cached against the
 *  trip's current originPlant so future trips at that plant see it in
 *  the dropdown. */
export async function setTripBatchingUnit(tripId: string, batchingUnit: string): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  const trimmed = batchingUnit.trim()
  await db.activeTrips.put({ ...trip, batchingUnit: trimmed || undefined })
  if (trimmed && trip.originPlant) {
    await db.batchingUnits.put({
      key: `${trip.originPlant}::${trimmed}`,
      plant: trip.originPlant,
      unit: trimmed,
      lastUsed: new Date().toISOString(),
    })
  }
}

/** Set the site_type for an active trip and persist the site_name ->
 *  site_type mapping in the cache so future trips to the same site
 *  auto-fill. Observer can still override per trip. Any explicit tap
 *  clears the siteTypeFromCache flag so the auto-filled indicator in
 *  the UI disappears (the value is now user-confirmed). */
export async function setTripSiteType(tripId: string, siteType: SiteType): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  const { siteTypeFromCache: _stfc, ...rest } = trip
  void _stfc
  await db.activeTrips.put({ ...rest, siteType })
  if (trip.siteName) {
    await db.siteTypes.put({
      name: trip.siteName,
      siteType,
      lastUsed: new Date().toISOString(),
    })
  }
}

/** Lookup a cached site_type for a site_name (returns undefined if
 *  this site has never been categorised on this device). */
export async function getCachedSiteType(siteName: string): Promise<SiteType | undefined> {
  if (!siteName) return undefined
  const row = await db.siteTypes.get(siteName)
  return row?.siteType
}

/** Save a trip as partial (observer abandoned mid-cycle). */
export async function savePartial(tripId: string): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  await finaliseTrip(trip, /* isPartial */ true)
}

/** Cancel an active trip without saving anything. */
export async function cancelTrip(tripId: string): Promise<void> {
  await db.activeTrips.delete(tripId)
}

/**
 * Move an active trip to the pending queue. Called from splitStage when the
 * last stage completes, or explicitly by savePartial.
 */
async function finaliseTrip(trip: ActiveTrip, isPartial: boolean): Promise<void> {
  const pending: PendingTrip = {
    ...trip,
    isPartial,
    syncAttempts: 0,
    finalisedAt: new Date().toISOString(),
  }
  await db.transaction('rw', db.activeTrips, db.pendingTrips, async () => {
    await db.pendingTrips.put(pending)
    await db.activeTrips.delete(trip.id)
  })
}

// ── Measurer helpers ──────────────────────────────────────────────────────
export async function getAllMeasurers(): Promise<string[]> {
  const rows = await db.measurers.orderBy('lastUsed').reverse().toArray()
  return rows.map((r) => r.name)
}

export async function addMeasurer(name: string): Promise<void> {
  if (!name.trim()) return
  await db.measurers.put({ name: name.trim(), lastUsed: new Date().toISOString() })
}

// ── Origin plant helpers ──────────────────────────────────────────────────
export async function getAllOriginPlants(): Promise<string[]> {
  const rows = await db.originPlants.orderBy('lastUsed').reverse().toArray()
  return rows.map((r) => r.name)
}

export async function addOriginPlant(name: string): Promise<void> {
  if (!name.trim()) return
  await db.originPlants.put({ name: name.trim(), lastUsed: new Date().toISOString() })
}

// ── Batching unit helpers ────────────────────────────────────────────────
/** All batching-unit labels recorded for the given plant, most-recent first.
 *  Empty plant string returns []. */
export async function getBatchingUnitsForPlant(plant: string): Promise<string[]> {
  if (!plant) return []
  const rows = await db.batchingUnits.where('plant').equals(plant).toArray()
  rows.sort((a, b) => (a.lastUsed < b.lastUsed ? 1 : -1))
  return rows.map((r) => r.unit)
}

/** Persist a (plant, unit) pair without touching an active trip. Used by
 *  the start-screen "+" picker before the first trip exists. */
export async function addBatchingUnit(plant: string, unit: string): Promise<void> {
  const p = plant.trim()
  const u = unit.trim()
  if (!p || !u) return
  await db.batchingUnits.put({
    key: `${p}::${u}`,
    plant: p,
    unit: u,
    lastUsed: new Date().toISOString(),
  })
}

// ── Token cache helpers ───────────────────────────────────────────────────
export async function cacheTokenContext(
  token: string,
  assessmentId: string,
  plantId: string,
): Promise<void> {
  await db.tokenCache.put({
    token,
    assessmentId,
    plantId,
    cachedAt: new Date().toISOString(),
  })
}

export async function readCachedToken(
  token: string,
): Promise<{ assessmentId: string; plantId: string } | null> {
  const row = await db.tokenCache.get(token)
  return row ? { assessmentId: row.assessmentId, plantId: row.plantId } : null
}

// ── Sync to Supabase ──────────────────────────────────────────────────────

/**
 * Build the insert payload for daily_logs from a PendingTrip.
 * Shared between authenticated sync (Supabase client with RLS) and
 * token-based sync (via server-side API route).
 */
export function buildDailyLogPayload(trip: PendingTrip): Record<string, unknown> {
  const ts = trip.timestamps
  return {
    assessment_id: trip.assessmentId,
    plant_id: trip.plantId,
    log_date: (ts.plant_queue ?? trip.createdAt).slice(0, 10),
    truck_id: trip.truckId ?? null,
    driver_name: trip.driverName ?? null,
    site_name: trip.siteName ?? null,
    site_type: trip.siteType ?? null,
    origin_plant: trip.originPlant ?? null,
    batching_unit: trip.batchingUnit ?? null,
    // 9-stage timing. Each line: the column on daily_logs = the Dexie key
    // whose tap value represents the START of that stage (or the END of
    // the previous stage — they are the same moment).
    plant_queue_start: ts.plant_queue ?? null,
    loading_start: ts.loading ?? null,
    loading_end: ts.weighbridge ?? null,       // truck finished batching, entering weighbridge
    departure_loaded: ts.transit_out ?? null,   // weighbridge done, truck leaving gate
    arrival_site: ts.site_wait ?? null,
    discharge_start: ts.pouring ?? null,
    discharge_end: ts.site_washout ?? null,     // pour ended, drum flush starting
    departure_site: ts.transit_back ?? null,    // drum flush done, truck leaving site
    arrival_plant: ts.plant_prep ?? null,       // truck back at plant gate, prep starting
    plant_prep_end: ts.complete ?? null,        // prep done, truck ready for next load
    measurer_name: trip.measurerName,
    // Partial if explicitly saved mid-trip, OR if single-stage mode
    // (only one stage was measured, remaining are null by design).
    is_partial: trip.isPartial || trip.measurementMode === 'single_stage',
    // Measurement scope: distinguishes a full-cycle trip from a deliberate
    // single-stage sample. Full trips set measured_stage=NULL; single
    // trips require measured_stage to name the one stage being timed.
    measurement_mode: trip.measurementMode === 'single_stage' ? 'single' : 'full',
    measured_stage: trip.measurementMode === 'single_stage' ? (trip.singleStage ?? null) : null,
    rejected: trip.rejected ?? false,
    stage_notes: Object.keys(trip.stageNotes).length > 0 ? trip.stageNotes : null,
    notes: trip.notes || null,
    data_source: 'direct_observation',
    // Slump test metadata (logged via the in-card action; nullable when
    // no formal slump test was run for this trip).
    slump_pass: trip.slumpTest?.pass ?? null,
    slump_test_time: trip.slumpTest?.time ?? null,
    slump_test_location: trip.slumpTest?.location ?? null,
  }
}

/** Append an audit log entry. */
export async function logSync(tripId: string, status: 'ok' | 'error', message?: string) {
  await db.syncLog.add({ tripId, status, message, at: new Date().toISOString() })
}

/**
 * Drain the pending queue. For each pending trip, calls the provided
 * uploader function; if it returns ok, deletes the trip from IndexedDB.
 * Otherwise increments syncAttempts and keeps the trip for next drain.
 *
 * The uploader is injected so this function works for both authenticated
 * sync (direct Supabase client) and token-based sync (fetch to API route).
 */
export async function drainPending(
  uploader: (payload: Record<string, unknown>, trip: PendingTrip) => Promise<{ ok: boolean; error?: string }>,
): Promise<{ synced: number; failed: number }> {
  const pending = await db.pendingTrips.orderBy('finalisedAt').toArray()
  let synced = 0
  let failed = 0
  for (const trip of pending) {
    const payload = buildDailyLogPayload(trip)
    try {
      const r = await uploader(payload, trip)
      if (r.ok) {
        await db.pendingTrips.delete(trip.id)
        await logSync(trip.id, 'ok')
        synced += 1
      } else {
        await db.pendingTrips.update(trip.id, {
          syncAttempts: trip.syncAttempts + 1,
          lastSyncError: r.error,
        })
        await logSync(trip.id, 'error', r.error)
        failed += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await db.pendingTrips.update(trip.id, {
        syncAttempts: trip.syncAttempts + 1,
        lastSyncError: msg,
      })
      await logSync(trip.id, 'error', msg)
      failed += 1
    }
  }
  return { synced, failed }
}

/** Count of pending trips (for the status indicator). */
export async function pendingCount(): Promise<number> {
  return db.pendingTrips.count()
}
