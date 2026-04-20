-- ============================================================
-- Expand trip tracking to 9 stages and add slump-test metadata
--
-- Operational changes this supports:
--   * Weighbridge capture: the weighing step between batching-tower
--     completion and plant gate-out is a real queue that used to be
--     conflated with "loading". Now a dedicated stage reusing the
--     loading_end column (already existed unused).
--   * Plant prep capture: after the truck rolls back through the plant
--     gate it is NOT yet ready for the next load (holding water,
--     driver break, positioning). The stage between arrival_plant and
--     truck-ready-for-next-load maps to a renamed column plant_prep_end
--     (was washout_end, never populated by live timer).
--   * Slump test metadata: the existing slump_pass boolean told us
--     yes/no but not when or where. Add slump_test_time and
--     slump_test_location so rejections can be attributed to the
--     correct root cause (plant batching vs transit-induced).
--
-- No data loss: washout_end was never populated. Rename is safe.
-- ============================================================

-- ── 1. Rename washout_end -> plant_prep_end ──
-- The column has existed since 20260413_daily_logs_plant_internal
-- but was never written by live timer. Renaming communicates that
-- the interval arrival_plant -> plant_prep_end is the between-cycle
-- prep time (not just washout: holding water, driver break, etc.).
ALTER TABLE public.daily_logs
  RENAME COLUMN washout_end TO plant_prep_end;

COMMENT ON COLUMN public.daily_logs.plant_prep_end IS
  'Timestamp when the truck is ready for the next load. Spans arrival_plant to plant_prep_end and includes: holding water top-up, minor drum flush, driver handoff, queue positioning. Does NOT include full drum washout events (those live in a separate event log).';

-- ── 2. Slump test metadata ──
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS slump_test_time timestamptz,
  ADD COLUMN IF NOT EXISTS slump_test_location text
    CHECK (slump_test_location IN ('plant', 'site'));

COMMENT ON COLUMN public.daily_logs.slump_test_time IS
  'When the slump test was performed. Paired with slump_test_location to distinguish plant-batching slump from customer site-of-pour slump. NULL if no formal slump test was logged for this trip.';

COMMENT ON COLUMN public.daily_logs.slump_test_location IS
  'Where the slump test was performed: plant (pre-dispatch QC) or site (customer-side acceptance). Paired with slump_pass for root-cause attribution on rejected loads.';

-- ── 3. Index for slump-by-location analytics ──
-- Supports queries like "what % of site-tested loads fail slump" which
-- separate transit-induced failures from batching-induced ones.
CREATE INDEX IF NOT EXISTS idx_daily_logs_slump_location
  ON public.daily_logs (assessment_id, slump_test_location)
  WHERE slump_test_location IS NOT NULL;
