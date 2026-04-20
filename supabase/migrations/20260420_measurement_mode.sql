-- ============================================================
-- Capture measurement scope per trip so the analyst can tell
-- single-stage samples apart from full cycles in the trip table
-- and downstream aggregates.
--
-- is_partial was doing double duty: "full cycle that was saved
-- early" AND "single-stage measurement (only one stage's timing
-- was captured)". Splitting the signal:
--
--   measurement_mode = 'full'   : full-cycle trip (may still be
--                                  saved partial via is_partial=true)
--   measurement_mode = 'single' : observer deliberately measured one
--                                  stage only; measured_stage names it.
--
-- measured_stage is required when mode='single', NULL when 'full'.
-- ============================================================

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS measurement_mode text NOT NULL DEFAULT 'full'
    CHECK (measurement_mode IN ('full', 'single')),
  ADD COLUMN IF NOT EXISTS measured_stage text
    CHECK (measured_stage IS NULL OR measured_stage IN (
      'plant_queue', 'loading', 'weighbridge', 'transit_out',
      'site_wait', 'pouring', 'site_washout', 'transit_back', 'plant_prep'
    ));

-- Guard: measured_stage must be set iff mode='single'.
ALTER TABLE public.daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_measurement_mode_stage_consistency;

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_measurement_mode_stage_consistency
  CHECK (
    (measurement_mode = 'full' AND measured_stage IS NULL)
    OR
    (measurement_mode = 'single' AND measured_stage IS NOT NULL)
  );

COMMENT ON COLUMN public.daily_logs.measurement_mode IS
  'How much of the cycle was measured. full = observer captured the whole cycle (plant_queue through plant_prep_end). single = observer measured only one named stage (see measured_stage).';

COMMENT ON COLUMN public.daily_logs.measured_stage IS
  'When measurement_mode = single, the stage that was measured. NULL for full-cycle trips.';
