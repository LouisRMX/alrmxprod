-- ============================================================
-- Add site_type to get_outliers_for_review output so the review
-- queue UI can show a site-type badge on each outlier card. Lets
-- the analyst see at a glance whether a flagged trip was high-rise
-- (where a 90-min TAT might be normal) or ground pour (where the
-- same value is alarming).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_outliers_for_review(uuid);

CREATE FUNCTION public.get_outliers_for_review(p_assessment_id uuid)
RETURNS TABLE (
  id                      uuid,
  log_date                date,
  truck_id                text,
  driver_name             text,
  site_name               text,
  site_type               text,
  measurer_name           text,
  origin_plant            text,
  total_tat_min           numeric,
  plant_queue_min         numeric,
  loading_min             numeric,
  weighbridge_min         numeric,
  transit_out_min         numeric,
  site_wait_min           numeric,
  pouring_min             numeric,
  site_washout_min        numeric,
  transit_back_min        numeric,
  plant_prep_min          numeric,
  load_m3                 numeric,
  rejected                boolean,
  reject_cause            text,
  slump_pass              boolean,
  slump_test_location     text,
  notes                   text,
  stage_notes             jsonb,
  is_partial              boolean,
  review_status           text,
  review_note             text,
  reviewed_at             timestamptz,
  flag_reason             text,
  week_number             int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH config AS (
    SELECT started_at FROM tracking_configs
    WHERE assessment_id = p_assessment_id
    ORDER BY started_at ASC LIMIT 1
  ),
  reference AS (
    SELECT COALESCE(
      (SELECT started_at::date FROM config),
      (SELECT MIN(log_date) FROM daily_logs WHERE assessment_id = p_assessment_id)
    ) AS start_date
  ),
  bucketed AS (
    SELECT
      dl.*,
      GREATEST(1, LEAST(13,
        FLOOR((dl.log_date - (SELECT start_date FROM reference))::numeric / 7)::int + 1
      )) AS week_num,
      CASE
        WHEN COALESCE(dl.plant_prep_end, dl.arrival_plant) IS NOT NULL
         AND COALESCE(dl.plant_queue_start, dl.departure_loaded) IS NOT NULL
        THEN EXTRACT(EPOCH FROM (
              COALESCE(dl.plant_prep_end, dl.arrival_plant)::timestamptz
              - COALESCE(dl.plant_queue_start, dl.departure_loaded)::timestamptz
            )) / 60
        ELSE NULL
      END AS tat_min
    FROM daily_logs dl
    WHERE dl.assessment_id = p_assessment_id
  ),
  iqr_bounds AS (
    SELECT
      week_num,
      CASE
        WHEN COUNT(*) >= 10 THEN
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY tat_min)
            + 3.0 * (PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY tat_min)
                   - PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY tat_min))
        ELSE NULL
      END AS upper_bound
    FROM bucketed WHERE tat_min IS NOT NULL GROUP BY week_num
  )
  SELECT
    b.id, b.log_date, b.truck_id, b.driver_name, b.site_name,
    b.site_type,
    b.measurer_name, b.origin_plant,
    b.tat_min::numeric AS total_tat_min,
    CASE WHEN b.loading_start IS NOT NULL AND b.plant_queue_start IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.loading_start::timestamptz - b.plant_queue_start::timestamptz)) / 60)::numeric END AS plant_queue_min,
    CASE WHEN b.loading_end IS NOT NULL AND b.loading_start IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.loading_end::timestamptz - b.loading_start::timestamptz)) / 60)::numeric END AS loading_min,
    CASE WHEN b.departure_loaded IS NOT NULL AND b.loading_end IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.departure_loaded::timestamptz - b.loading_end::timestamptz)) / 60)::numeric END AS weighbridge_min,
    CASE WHEN b.arrival_site IS NOT NULL AND b.departure_loaded IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.arrival_site::timestamptz - b.departure_loaded::timestamptz)) / 60)::numeric END AS transit_out_min,
    CASE WHEN b.discharge_start IS NOT NULL AND b.arrival_site IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.discharge_start::timestamptz - b.arrival_site::timestamptz)) / 60)::numeric END AS site_wait_min,
    CASE WHEN b.discharge_end IS NOT NULL AND b.discharge_start IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.discharge_end::timestamptz - b.discharge_start::timestamptz)) / 60)::numeric END AS pouring_min,
    CASE WHEN b.departure_site IS NOT NULL AND b.discharge_end IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.departure_site::timestamptz - b.discharge_end::timestamptz)) / 60)::numeric END AS site_washout_min,
    CASE WHEN b.arrival_plant IS NOT NULL AND b.departure_site IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.arrival_plant::timestamptz - b.departure_site::timestamptz)) / 60)::numeric END AS transit_back_min,
    CASE WHEN b.plant_prep_end IS NOT NULL AND b.arrival_plant IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.plant_prep_end::timestamptz - b.arrival_plant::timestamptz)) / 60)::numeric END AS plant_prep_min,
    b.load_m3, b.rejected, b.reject_cause,
    b.slump_pass, b.slump_test_location,
    b.notes, b.stage_notes, b.is_partial,
    b.review_status, b.review_note, b.reviewed_at,
    CASE
      WHEN b.review_status = 'flagged'
        THEN 'Hard ceiling (TAT ' || ROUND(b.tat_min)::text || ' min > 300 min)'
      WHEN b.tat_min > ib.upper_bound
        THEN 'Statistical outlier (TAT ' || ROUND(b.tat_min)::text || ' min > Q3+3×IQR of ' || ROUND(ib.upper_bound)::text || ' min for week ' || b.week_num::text || ')'
      ELSE 'Reviewed'
    END AS flag_reason,
    b.week_num AS week_number
  FROM bucketed b
  LEFT JOIN iqr_bounds ib ON ib.week_num = b.week_num
  WHERE b.review_status IN ('flagged', 'reviewed_include', 'reviewed_exclude')
     OR (b.review_status = 'normal' AND ib.upper_bound IS NOT NULL
         AND b.tat_min IS NOT NULL AND b.tat_min > ib.upper_bound)
  ORDER BY
    CASE b.review_status
      WHEN 'flagged' THEN 1
      WHEN 'normal' THEN 2
      ELSE 3
    END,
    b.log_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_outliers_for_review(uuid) TO authenticated, anon;
