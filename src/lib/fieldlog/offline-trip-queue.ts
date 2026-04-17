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
// These match the 7 stages of a ready-mix truck cycle and the timestamp
// columns on public.daily_logs.
export const STAGES = [
  'plant_queue',
  'loading',
  'transit_out',
  'site_wait',
  'pouring',
  'washout',
  'transit_back',
] as const

export type StageName = (typeof STAGES)[number]

/** Map stage name → daily_logs column name where the stage's START timestamp lives. */
export const STAGE_START_COLUMN: Record<StageName, string> = {
  plant_queue: 'plant_queue_start',
  loading: 'loading_start',
  transit_out: 'departure_loaded',
  site_wait: 'arrival_site',
  pouring: 'discharge_start',
  washout: 'discharge_end',
  transit_back: 'departure_site',
}

/** End-of-trip timestamp (when the truck arrives back at plant). */
export const TRIP_END_COLUMN = 'arrival_plant'

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
  /** Optional identifiers the observer filled in at start. */
  truckId?: string
  driverName?: string
  siteName?: string
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

  constructor() {
    super('alrmx_fieldlog')
    this.version(1).stores({
      activeTrips: 'id, assessmentId, createdAt',
      pendingTrips: 'id, assessmentId, finalisedAt, syncAttempts',
      syncLog: '++id, tripId, at',
      measurers: 'name, lastUsed',
      tokenCache: 'token',
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

/** Start a new active trip. First tap happens here (plant_queue_start). */
export async function startTrip(input: {
  assessmentId: string
  plantId: string
  measurerName: string
  truckId?: string
  driverName?: string
  siteName?: string
  viaToken?: boolean
  token?: string
}): Promise<ActiveTrip> {
  const now = new Date().toISOString()
  const trip: ActiveTrip = {
    id: newTripId(),
    label: input.truckId ? `Truck ${input.truckId}` : 'Unlabeled trip',
    assessmentId: input.assessmentId,
    plantId: input.plantId,
    measurerName: input.measurerName,
    truckId: input.truckId,
    driverName: input.driverName,
    siteName: input.siteName,
    timestamps: { plant_queue: now },
    currentStage: 'plant_queue',
    stageNotes: {},
    notes: '',
    viaToken: input.viaToken ?? false,
    token: input.token,
    createdAt: now,
  }
  await db.activeTrips.add(trip)
  // Bump measurer last-used timestamp
  await db.measurers.put({ name: input.measurerName, lastUsed: now })
  return trip
}

/**
 * Advance a trip to the next stage. Saves the END timestamp of the current
 * stage (which is the START timestamp of the next stage). If the current
 * stage is the last one (transit_back), this call completes the trip.
 */
export async function splitStage(tripId: string): Promise<ActiveTrip | null> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return null
  const now = new Date().toISOString()
  const currentIndex = STAGES.indexOf(trip.currentStage)
  const nextIndex = currentIndex + 1

  if (nextIndex >= STAGES.length) {
    // Last stage done → finalise
    const updated: ActiveTrip = {
      ...trip,
      timestamps: { ...trip.timestamps, complete: now },
    }
    await finaliseTrip(updated, /* isPartial */ false)
    return null
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

/** Update truck/driver/site identifiers on an active trip. */
export async function setTripIdentity(
  tripId: string,
  ids: { truckId?: string; driverName?: string; siteName?: string },
): Promise<void> {
  const trip = await db.activeTrips.get(tripId)
  if (!trip) return
  const updated: ActiveTrip = {
    ...trip,
    truckId: ids.truckId ?? trip.truckId,
    driverName: ids.driverName ?? trip.driverName,
    siteName: ids.siteName ?? trip.siteName,
  }
  updated.label = updated.truckId ? `Truck ${updated.truckId}` : 'Unlabeled trip'
  await db.activeTrips.put(updated)
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
    plant_queue_start: ts.plant_queue ?? null,
    loading_start: ts.loading ?? null,
    departure_loaded: ts.transit_out ?? null,
    arrival_site: ts.site_wait ?? null,
    discharge_start: ts.pouring ?? null,
    discharge_end: ts.washout ?? null,
    departure_site: ts.transit_back ?? null,
    arrival_plant: ts.complete ?? null,
    measurer_name: trip.measurerName,
    is_partial: trip.isPartial,
    stage_notes: Object.keys(trip.stageNotes).length > 0 ? trip.stageNotes : null,
    notes: trip.notes || null,
    data_source: 'direct_observation',
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
