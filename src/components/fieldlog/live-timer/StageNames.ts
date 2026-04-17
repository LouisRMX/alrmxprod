/**
 * Display names for the 7 stopwatch stages. Separate file so both the
 * timer UI and the diagnostics view import the same labels.
 */
import type { StageName } from '@/lib/fieldlog/offline-trip-queue'

export const STAGE_LABELS: Record<StageName, string> = {
  plant_queue: 'Plant queue',
  loading: 'Loading',
  transit_out: 'Transit out',
  site_wait: 'Site wait',
  pouring: 'Pouring',
  washout: 'Washout',
  transit_back: 'Transit back',
}

export const STAGE_HINTS: Record<StageName, string> = {
  plant_queue: 'Waiting to enter loading bay',
  loading: 'Batching and filling the mixer',
  transit_out: 'Truck on the road to the site',
  site_wait: 'At site, waiting to pour',
  pouring: 'Discharging concrete',
  washout: 'Cleaning drum after pour',
  transit_back: 'Truck returning to plant',
}

/** Short tap-label for the big green split button, keyed by CURRENT stage. */
export const NEXT_ACTION_LABEL: Record<StageName, string> = {
  plant_queue: 'Start loading',
  loading: 'Leaves plant',
  transit_out: 'Arrives at site',
  site_wait: 'Pour starts',
  pouring: 'Pour complete',
  washout: 'Leaves site',
  transit_back: 'Back at plant · Complete trip',
}
