-- Plant benchmarking: anonymized aggregate metrics, one row per assessment
-- No plant names, no customer IDs — only operational metrics + segmentation buckets

CREATE TABLE plant_benchmarks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid REFERENCES assessments(id) ON DELETE CASCADE,

  -- Segmentation buckets (used to find comparable plants)
  radius_bucket text NOT NULL,   -- 'short' (<10km) | 'medium' (10–20km) | 'long' (>20km)
  fleet_bucket  text NOT NULL,   -- 'small' (1–5 trucks) | 'medium' (6–15) | 'large' (16+)
  country       text,            -- market context only, nullable

  -- Normalized key metrics (from CalcResult, not raw answers)
  turnaround_min           integer,
  dispatch_min             integer,
  reject_pct               numeric(5,2),
  deliveries_per_truck_day numeric(5,2),
  util_pct                 numeric(5,2),
  overall_score            integer,
  bottleneck               text,

  created_at timestamptz DEFAULT now(),
  UNIQUE(assessment_id)
);

ALTER TABLE plant_benchmarks ENABLE ROW LEVEL SECURITY;

-- Only system_admin can read/write individual rows
CREATE POLICY "system_admin_all" ON plant_benchmarks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Aggregate query function
-- SECURITY DEFINER: any authenticated user can call this, but it returns
-- only aggregate statistics — never individual plant rows.
-- Returns NULL when fewer than 3 comparable plants exist.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_plant_percentiles(
  p_radius_bucket text,
  p_fleet_bucket  text,
  p_exclude_id    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  n_plants integer;
BEGIN
  WITH comp AS (
    SELECT *
    FROM plant_benchmarks
    WHERE radius_bucket = p_radius_bucket
      AND fleet_bucket  = p_fleet_bucket
      AND (p_exclude_id IS NULL OR assessment_id != p_exclude_id)
  ),
  stats AS (
    SELECT
      COUNT(*)::int                                                           AS n,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY turnaround_min)           AS ta_p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY turnaround_min)           AS ta_p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY turnaround_min)           AS ta_p75,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY dispatch_min)             AS dis_p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY dispatch_min)             AS dis_p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY dispatch_min)             AS dis_p75,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY reject_pct)               AS rej_p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY reject_pct)               AS rej_p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY reject_pct)               AS rej_p75,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY deliveries_per_truck_day) AS del_p50
    FROM comp
  )
  SELECT jsonb_build_object(
    'n',          n,
    'turnaround', jsonb_build_object('p25', ROUND(ta_p25),  'p50', ROUND(ta_p50),  'p75', ROUND(ta_p75)),
    'dispatch',   jsonb_build_object('p25', ROUND(dis_p25), 'p50', ROUND(dis_p50), 'p75', ROUND(dis_p75)),
    'reject',     jsonb_build_object('p25', ROUND(rej_p25::numeric, 1), 'p50', ROUND(rej_p50::numeric, 1), 'p75', ROUND(rej_p75::numeric, 1)),
    'deliveries', jsonb_build_object('p50', ROUND(del_p50::numeric, 1))
  ) INTO result
  FROM stats;

  -- Minimum 3 plants required before returning any data
  SELECT (result->>'n')::int INTO n_plants;
  IF n_plants IS NULL OR n_plants < 3 THEN
    RETURN NULL;
  END IF;

  RETURN result;
END;
$$;
