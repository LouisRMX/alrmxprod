-- ============================================================
-- Replace get_weekly_kpis_from_daily_logs + get_outliers_for_review
-- to produce per-stage figures for the 9-stage model.
--
-- Changes:
--   * avg_loading_min now = loading_start -> loading_end (pure
--     batching, was loading_start -> departure_loaded which conflated
--     batching and weighbridge).
--   * NEW avg_weighbridge_min = loading_end -> departure_loaded.
--   * avg_washout_min renamed to avg_site_washout_min (same mapping
--     discharge_end -> departure_site; rename for clarity).
--   * NEW avg_plant_prep_min = arrival_plant -> plant_prep_end (the
--     between-cycle time: holding water, driver break, positioning).
--   * total TAT now runs plant_queue_start -> plant_prep_end (truly
--     ready for next load) with arrival_plant as fallback when
--     plant_prep wasn't captured.
--   * Slump-test metadata: slump_test_location is carried in the
--     outlier row and a per-location slump-pass count is exposed in
--     the weekly KPIs.
-- ============================================================

-- Drop the legacy signatures first so return-type changes are accepted.
DROP FUNCTION IF EXISTS public.get_weekly_kpis_from_daily_logs(uuid);
DROP FUNCTION IF EXISTS public.get_outliers_for_review(uuid);

-- ── Weekly KPIs ───────────────────────────────────────────────────────────
CREATE FUNCTION public.get_weekly_kpis_from_daily_logs(p_assessment_id uuid)
RETURNS TABLE (
  week_number                  int,
  trip_count                   int,
  complete_trip_count          int,
  partial_trip_count           int,
  total_m3                     numeric,
  avg_load_m3                  numeric,
  avg_tat_min                  numeric,
  avg_plant_queue_min          numeric,
  avg_loading_min              numeric,
  avg_weighbridge_min          numeric,
  avg_transit_out_min          numeric,
  avg_site_wait_min            numeric,
  avg_pouring_min              numeric,
  avg_site_washout_min         numeric,
  avg_transit_back_min         numeric,
  avg_plant_prep_min           numeric,
  reject_count                 int,
  reject_pct                   numeric,
  reject_plant_side_count      int,
  reject_customer_side_count   int,
  slump_tested_count           int,
  slump_pass_count             int,
  slump_pass_pct               numeric,
  slump_plant_tested_count     int,
  slump_site_tested_count      int,
  unique_trucks                int,
  unique_drivers               int,
  unique_sites                 int,
  days_with_trips              int,
  avg_trips_per_truck_per_day  numeric,
  avg_m3_per_truck_per_day     numeric,
  week_start_date              date,
  week_end_date                date,
  origin_plant_breakdown       jsonb,
  site_type_breakdown          jsonb,
  reject_cause_breakdown       jsonb,
  outliers_excluded_count      int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH config AS (
    SELECT started_at
    FROM tracking_configs
    WHERE assessment_id = p_assessment_id
    ORDER BY started_at ASC
    LIMIT 1
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
      -- Total TAT now ends at plant_prep_end (truck ready for next load),
      -- falls back to arrival_plant for trips where plant_prep wasn't
      -- captured (partial, or pre-9-stage data).
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
      AND dl.log_date >= (SELECT start_date FROM reference)
  ),
  iqr_bounds AS (
    SELECT
      week_num,
      CASE
        WHEN COUNT(*) >= 10 THEN
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY tat_min)
            + 3.0 * (
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY tat_min)
              - PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY tat_min)
            )
        ELSE NULL
      END AS upper_bound
    FROM bucketed
    WHERE tat_min IS NOT NULL
    GROUP BY week_num
  ),
  marked AS (
    SELECT
      b.*,
      (
        b.review_status IN ('flagged', 'reviewed_exclude')
        OR (
          b.review_status = 'normal'
          AND ib.upper_bound IS NOT NULL
          AND b.tat_min IS NOT NULL
          AND b.tat_min > ib.upper_bound
        )
      ) AS is_outlier
    FROM bucketed b
    LEFT JOIN iqr_bounds ib ON ib.week_num = b.week_num
  ),
  included AS (
    SELECT * FROM marked
    WHERE NOT is_outlier OR review_status = 'reviewed_include'
  ),
  origin_counts AS (
    SELECT week_num, jsonb_object_agg(origin_plant, cnt) AS origin_plant_breakdown
    FROM (
      SELECT week_num, origin_plant, COUNT(*) AS cnt
      FROM included
      WHERE origin_plant IS NOT NULL AND origin_plant <> ''
      GROUP BY week_num, origin_plant
    ) t
    GROUP BY week_num
  ),
  site_type_counts AS (
    SELECT week_num, jsonb_object_agg(site_type, cnt) AS site_type_breakdown
    FROM (
      SELECT week_num, site_type, COUNT(*) AS cnt
      FROM included
      WHERE site_type IS NOT NULL
      GROUP BY week_num, site_type
    ) t
    GROUP BY week_num
  ),
  reject_cause_counts AS (
    SELECT week_num, jsonb_object_agg(reject_cause, cnt) AS reject_cause_breakdown
    FROM (
      SELECT week_num, COALESCE(reject_cause, 'unspecified') AS reject_cause, COUNT(*) AS cnt
      FROM included
      WHERE rejected = true
      GROUP BY week_num, COALESCE(reject_cause, 'unspecified')
    ) t
    GROUP BY week_num
  ),
  outlier_counts AS (
    SELECT week_num, COUNT(*)::int AS outliers_excluded_count
    FROM marked
    WHERE is_outlier AND review_status <> 'reviewed_include'
    GROUP BY week_num
  ),
  weekly AS (
    SELECT
      week_num,
      COUNT(*)::int                                                       AS trip_count,
      COUNT(*) FILTER (WHERE NOT COALESCE(is_partial, false))::int        AS complete_trip_count,
      COUNT(*) FILTER (WHERE COALESCE(is_partial, false))::int            AS partial_trip_count,
      SUM(load_m3)                                                        AS total_m3,
      AVG(load_m3)                                                        AS avg_load_m3,
      AVG(tat_min)                                                        AS avg_tat_min,
      -- Stage durations (9-stage model). Each CASE computes the interval
      -- between two adjacent timestamps; NULL-safe via explicit guards.
      AVG(
        CASE WHEN loading_start IS NOT NULL AND plant_queue_start IS NOT NULL
          THEN EXTRACT(EPOCH FROM (loading_start::timestamptz - plant_queue_start::timestamptz)) / 60
        END
      )                                                                   AS avg_plant_queue_min,
      AVG(
        CASE WHEN loading_end IS NOT NULL AND loading_start IS NOT NULL
          THEN EXTRACT(EPOCH FROM (loading_end::timestamptz - loading_start::timestamptz)) / 60
        END
      )                                                                   AS avg_loading_min,
      AVG(
        CASE WHEN departure_loaded IS NOT NULL AND loading_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (departure_loaded::timestamptz - loading_end::timestamptz)) / 60
        END
      )                                                                   AS avg_weighbridge_min,
      AVG(
        CASE WHEN arrival_site IS NOT NULL AND departure_loaded IS NOT NULL
          THEN EXTRACT(EPOCH FROM (arrival_site::timestamptz - departure_loaded::timestamptz)) / 60
        END
      )                                                                   AS avg_transit_out_min,
      AVG(
        CASE WHEN discharge_start IS NOT NULL AND arrival_site IS NOT NULL
          THEN EXTRACT(EPOCH FROM (discharge_start::timestamptz - arrival_site::timestamptz)) / 60
        END
      )                                                                   AS avg_site_wait_min,
      AVG(
        CASE WHEN discharge_end IS NOT NULL AND discharge_start IS NOT NULL
          THEN EXTRACT(EPOCH FROM (discharge_end::timestamptz - discharge_start::timestamptz)) / 60
        END
      )                                                                   AS avg_pouring_min,
      AVG(
        CASE WHEN departure_site IS NOT NULL AND discharge_end IS NOT NULL
          THEN EXTRACT(EPOCH FROM (departure_site::timestamptz - discharge_end::timestamptz)) / 60
        END
      )                                                                   AS avg_site_washout_min,
      AVG(
        CASE WHEN arrival_plant IS NOT NULL AND departure_site IS NOT NULL
          THEN EXTRACT(EPOCH FROM (arrival_plant::timestamptz - departure_site::timestamptz)) / 60
        END
      )                                                                   AS avg_transit_back_min,
      AVG(
        CASE WHEN plant_prep_end IS NOT NULL AND arrival_plant IS NOT NULL
          THEN EXTRACT(EPOCH FROM (plant_prep_end::timestamptz - arrival_plant::timestamptz)) / 60
        END
      )                                                                   AS avg_plant_prep_min,
      COUNT(*) FILTER (WHERE rejected)::int                               AS reject_count,
      (COUNT(*) FILTER (WHERE rejected) * 100.0
        / NULLIF(COUNT(*), 0))::numeric                                   AS reject_pct,
      COUNT(*) FILTER (WHERE rejected AND reject_side = 'plant_side')::int    AS reject_plant_side_count,
      COUNT(*) FILTER (WHERE rejected AND reject_side = 'customer_side')::int AS reject_customer_side_count,
      COUNT(*) FILTER (WHERE slump_pass IS NOT NULL)::int                 AS slump_tested_count,
      COUNT(*) FILTER (WHERE slump_pass = true)::int                      AS slump_pass_count,
      (COUNT(*) FILTER (WHERE slump_pass = true) * 100.0
        / NULLIF(COUNT(*) FILTER (WHERE slump_pass IS NOT NULL), 0))::numeric AS slump_pass_pct,
      COUNT(*) FILTER (WHERE slump_test_location = 'plant')::int          AS slump_plant_tested_count,
      COUNT(*) FILTER (WHERE slump_test_location = 'site')::int           AS slump_site_tested_count,
      COUNT(DISTINCT truck_id)::int                                       AS unique_trucks,
      COUNT(DISTINCT driver_name)::int                                    AS unique_drivers,
      COUNT(DISTINCT site_name)::int                                      AS unique_sites,
      COUNT(DISTINCT log_date)::int                                       AS days_with_trips,
      (COUNT(*)::numeric
        / NULLIF(COUNT(DISTINCT truck_id) * COUNT(DISTINCT log_date), 0)) AS avg_trips_per_truck_per_day,
      (SUM(load_m3)::numeric
        / NULLIF(COUNT(DISTINCT truck_id) * COUNT(DISTINCT log_date), 0)) AS avg_m3_per_truck_per_day,
      MIN(log_date)                                                       AS week_start_date,
      MAX(log_date)                                                       AS week_end_date
    FROM included
    GROUP BY week_num
  )
  SELECT
    w.week_num                                                      AS week_number,
    w.trip_count, w.complete_trip_count, w.partial_trip_count,
    w.total_m3, w.avg_load_m3,
    w.avg_tat_min,
    w.avg_plant_queue_min, w.avg_loading_min, w.avg_weighbridge_min,
    w.avg_transit_out_min, w.avg_site_wait_min, w.avg_pouring_min,
    w.avg_site_washout_min, w.avg_transit_back_min, w.avg_plant_prep_min,
    w.reject_count, w.reject_pct,
    w.reject_plant_side_count, w.reject_customer_side_count,
    w.slump_tested_count, w.slump_pass_count, w.slump_pass_pct,
    w.slump_plant_tested_count, w.slump_site_tested_count,
    w.unique_trucks, w.unique_drivers, w.unique_sites, w.days_with_trips,
    w.avg_trips_per_truck_per_day, w.avg_m3_per_truck_per_day,
    w.week_start_date, w.week_end_date,
    COALESCE(oc.origin_plant_breakdown, '{}'::jsonb)               AS origin_plant_breakdown,
    COALESCE(stc.site_type_breakdown, '{}'::jsonb)                 AS site_type_breakdown,
    COALESCE(rcc.reject_cause_breakdown, '{}'::jsonb)              AS reject_cause_breakdown,
    COALESCE(ocnt.outliers_excluded_count, 0)                      AS outliers_excluded_count
  FROM weekly w
  LEFT JOIN origin_counts      oc   ON oc.week_num   = w.week_num
  LEFT JOIN site_type_counts   stc  ON stc.week_num  = w.week_num
  LEFT JOIN reject_cause_counts rcc ON rcc.week_num  = w.week_num
  LEFT JOIN outlier_counts     ocnt ON ocnt.week_num = w.week_num
  ORDER BY w.week_num;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_kpis_from_daily_logs(uuid) TO authenticated, anon;

-- ── Outlier review queue ──────────────────────────────────────────────────
CREATE FUNCTION public.get_outliers_for_review(p_assessment_id uuid)
RETURNS TABLE (
  id                      uuid,
  log_date                date,
  truck_id                text,
  driver_name             text,
  site_name               text,
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
    SELECT started_at
    FROM tracking_configs
    WHERE assessment_id = p_assessment_id
    ORDER BY started_at ASC
    LIMIT 1
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
            + 3.0 * (
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY tat_min)
              - PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY tat_min)
            )
        ELSE NULL
      END AS upper_bound
    FROM bucketed
    WHERE tat_min IS NOT NULL
    GROUP BY week_num
  )
  SELECT
    b.id,
    b.log_date,
    b.truck_id,
    b.driver_name,
    b.site_name,
    b.measurer_name,
    b.origin_plant,
    b.tat_min::numeric                                                                    AS total_tat_min,
    CASE WHEN b.loading_start IS NOT NULL AND b.plant_queue_start IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.loading_start::timestamptz - b.plant_queue_start::timestamptz)) / 60)::numeric
    END                                                                                   AS plant_queue_min,
    CASE WHEN b.loading_end IS NOT NULL AND b.loading_start IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.loading_end::timestamptz - b.loading_start::timestamptz)) / 60)::numeric
    END                                                                                   AS loading_min,
    CASE WHEN b.departure_loaded IS NOT NULL AND b.loading_end IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.departure_loaded::timestamptz - b.loading_end::timestamptz)) / 60)::numeric
    END                                                                                   AS weighbridge_min,
    CASE WHEN b.arrival_site IS NOT NULL AND b.departure_loaded IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.arrival_site::timestamptz - b.departure_loaded::timestamptz)) / 60)::numeric
    END                                                                                   AS transit_out_min,
    CASE WHEN b.discharge_start IS NOT NULL AND b.arrival_site IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.discharge_start::timestamptz - b.arrival_site::timestamptz)) / 60)::numeric
    END                                                                                   AS site_wait_min,
    CASE WHEN b.discharge_end IS NOT NULL AND b.discharge_start IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.discharge_end::timestamptz - b.discharge_start::timestamptz)) / 60)::numeric
    END                                                                                   AS pouring_min,
    CASE WHEN b.departure_site IS NOT NULL AND b.discharge_end IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.departure_site::timestamptz - b.discharge_end::timestamptz)) / 60)::numeric
    END                                                                                   AS site_washout_min,
    CASE WHEN b.arrival_plant IS NOT NULL AND b.departure_site IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.arrival_plant::timestamptz - b.departure_site::timestamptz)) / 60)::numeric
    END                                                                                   AS transit_back_min,
    CASE WHEN b.plant_prep_end IS NOT NULL AND b.arrival_plant IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (b.plant_prep_end::timestamptz - b.arrival_plant::timestamptz)) / 60)::numeric
    END                                                                                   AS plant_prep_min,
    b.load_m3,
    b.rejected,
    b.reject_cause,
    b.slump_pass,
    b.slump_test_location,
    b.notes,
    b.stage_notes,
    b.is_partial,
    b.review_status,
    b.review_note,
    b.reviewed_at,
    CASE
      WHEN b.review_status = 'flagged'
        THEN 'Hard ceiling (TAT ' || ROUND(b.tat_min)::text || ' min > 300 min)'
      WHEN b.tat_min > ib.upper_bound
        THEN 'Statistical outlier (TAT ' || ROUND(b.tat_min)::text || ' min > Q3+3×IQR of ' || ROUND(ib.upper_bound)::text || ' min for week ' || b.week_num::text || ')'
      ELSE 'Reviewed'
    END                                                                                   AS flag_reason,
    b.week_num                                                                            AS week_number
  FROM bucketed b
  LEFT JOIN iqr_bounds ib ON ib.week_num = b.week_num
  WHERE b.review_status IN ('flagged', 'reviewed_include', 'reviewed_exclude')
     OR (
       b.review_status = 'normal'
       AND ib.upper_bound IS NOT NULL
       AND b.tat_min IS NOT NULL
       AND b.tat_min > ib.upper_bound
     )
  ORDER BY
    CASE b.review_status
      WHEN 'flagged' THEN 1
      WHEN 'normal' THEN 2
      ELSE 3
    END,
    b.log_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_outliers_for_review(uuid) TO authenticated, anon;

COMMENT ON FUNCTION public.get_weekly_kpis_from_daily_logs(uuid) IS
  'Weekly KPIs for the 9-stage trip model. Stage durations: avg_plant_queue_min (start -> loading_start), avg_loading_min (loading_start -> loading_end), avg_weighbridge_min (loading_end -> departure_loaded), avg_transit_out_min, avg_site_wait_min, avg_pouring_min, avg_site_washout_min (discharge_end -> departure_site), avg_transit_back_min, avg_plant_prep_min (arrival_plant -> plant_prep_end). Total TAT is plant_queue_start -> plant_prep_end with arrival_plant fallback.';

COMMENT ON FUNCTION public.get_outliers_for_review(uuid) IS
  'Per-trip stage breakdown for the outlier review queue. Uses 9-stage model. Includes slump_pass and slump_test_location for root-cause attribution.';
