/**
 * Display names for the 9 stopwatch stages. Separate file so both the
 * timer UI and the diagnostics view import the same labels. The Log tab
 * actually sources all label text from the i18n catalog at runtime; this
 * record exists for consumers outside the Log tab (exports, reports) that
 * need a single English source of truth.
 */
import type { StageName } from '@/lib/fieldlog/offline-trip-queue'

export const STAGE_LABELS: Record<StageName, string> = {
  plant_queue: 'Plant queue',
  loading: 'Loading',
  weighbridge: 'Weighbridge',
  transit_out: 'Transit out',
  site_wait: 'Site wait',
  pouring: 'Pouring',
  site_washout: 'Site washout',
  transit_back: 'Transit back',
  plant_prep: 'Plant prep',
}

export const STAGE_HINTS: Record<StageName, string> = {
  plant_queue: 'Waiting to enter loading bay',
  loading: 'Batching materials and filling the mixer',
  weighbridge: 'Loaded truck at weighbridge',
  transit_out: 'Truck on the road to the site',
  site_wait: 'At site, waiting to pour',
  pouring: 'Discharging concrete',
  site_washout: 'Drum flush at site before return',
  transit_back: 'Truck returning to plant',
  plant_prep: 'Holding water, driver break, positioning for next load',
}

/** Short tap-label for the big green split button, keyed by CURRENT stage. */
export const NEXT_ACTION_LABEL: Record<StageName, string> = {
  plant_queue: 'Start loading',
  loading: 'Loading complete',
  weighbridge: 'Leaves plant',
  transit_out: 'Arrives at site',
  site_wait: 'Pour starts',
  pouring: 'Pour complete',
  site_washout: 'Leaves site',
  transit_back: 'Back at plant',
  plant_prep: 'Ready for next load · Complete trip',
}
