-- Site-type-aware percentile view for intervention-plan analysis.
--
-- Philosophy: do NOT use external industry benchmarks for anomaly detection.
-- Benchmark every plant against its OWN distribution, segmented by site_type.
-- This is defensible to the customer (all numbers trace to their own tickets)
-- and self-calibrating as field-log data grows.
--
-- The HAVING COUNT(*) >= 5 gate enforces: no conclusions on sparse data.
-- Site types with fewer than 5 trips return no row; the plan generator
-- will explicitly say "insufficient data for <site_type> analysis".
--
-- Data-quality filters catch obvious timestamp integrity problems before
-- they pollute percentiles.
--
-- Idempotent: safe to re-run.

DROP VIEW IF EXISTS public.plant_site_type_percentiles;

CREATE VIEW public.plant_site_type_percentiles AS
SELECT
  plant_id,
  site_type,
  COUNT(*) AS sample_size,
  -- TAT percentiles
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY tat_minutes)::numeric(10, 2) AS tat_p25,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY tat_minutes)::numeric(10, 2) AS tat_p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY tat_minutes)::numeric(10, 2) AS tat_p75,
  -- Site-wait percentiles (the most actionable TAT component)
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY site_wait_minutes)::numeric(10, 2) AS site_wait_p25,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY site_wait_minutes)::numeric(10, 2) AS site_wait_p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY site_wait_minutes)::numeric(10, 2) AS site_wait_p75,
  -- Unload percentiles (drum discharge performance)
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY unload_minutes)::numeric(10, 2) AS unload_p50,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY unload_minutes)::numeric(10, 2) AS unload_p75,
  -- Timestamps bracket so the plan knows data freshness
  MIN(log_date) AS first_trip_date,
  MAX(log_date) AS last_trip_date
FROM public.daily_log_trips_computed
WHERE tat_minutes IS NOT NULL
  -- Data-quality filters: catch obvious timestamp integrity issues
  AND tat_minutes > 0
  AND tat_minutes < 600  -- 10-hour cap; anything higher is almost certainly a timestamp error
  AND (site_wait_minutes IS NULL OR (site_wait_minutes >= 0 AND site_wait_minutes < 480))
  AND (unload_minutes IS NULL OR (unload_minutes >= 0 AND unload_minutes < 120))
GROUP BY plant_id, site_type
HAVING COUNT(*) >= 5;

COMMENT ON VIEW public.plant_site_type_percentiles IS
  'Percentile distribution of TAT and its components (site_wait, unload) '
  'for each plant, segmented by site_type. Requires >=5 trips per '
  '(plant, site_type) before surfacing. Used by /api/generate-intervention-plan '
  'to anchor anomaly detection in the plant''s own data rather than external '
  'industry benchmarks. Data-quality filters excluded timestamp-invalid rows.';
