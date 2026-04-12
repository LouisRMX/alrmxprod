-- ============================================================
-- Plant-internal timing fields for daily_logs
-- Covers the blind spots: loading, washout, slump test, plant queue
-- ============================================================

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS loading_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loading_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS washout_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slump_pass BOOLEAN;

COMMENT ON COLUMN public.daily_logs.loading_start IS
  'Truck begins loading at batching plant';
COMMENT ON COLUMN public.daily_logs.loading_end IS
  'Truck fully loaded. Should equal or be close to departure_loaded';
COMMENT ON COLUMN public.daily_logs.washout_end IS
  'Washout complete, truck ready for next trip';
COMMENT ON COLUMN public.daily_logs.slump_pass IS
  'Slump test passed before dispatch (null = not tested)';

-- Update computed view with plant-internal timing
CREATE OR REPLACE VIEW public.daily_log_trips_computed AS
SELECT
  *,
  EXTRACT(EPOCH FROM (arrival_plant - departure_loaded)) / 60 AS tat_minutes,
  EXTRACT(EPOCH FROM (arrival_site - departure_loaded)) / 60 AS outbound_transit_minutes,
  EXTRACT(EPOCH FROM (arrival_plant - departure_site)) / 60 AS return_transit_minutes,
  EXTRACT(EPOCH FROM (discharge_start - arrival_site)) / 60 AS site_wait_minutes,
  EXTRACT(EPOCH FROM (discharge_end - discharge_start)) / 60 AS unload_minutes,
  -- Plant-internal timing (new)
  EXTRACT(EPOCH FROM (loading_end - loading_start)) / 60 AS loading_minutes,
  EXTRACT(EPOCH FROM (washout_end - arrival_plant)) / 60 AS washout_minutes_measured
FROM public.daily_logs;

-- Note: plant_queue_minutes requires LAG() which cannot be in a simple view.
-- It will be computed client-side in buildFieldLogContext() using:
-- plant_queue = loading_start - previous_trip.arrival_plant (same truck, same day)
