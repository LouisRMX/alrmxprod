-- ============================================================
-- Field Log Context — returns all trip-level data for client-side
-- computation of variation, VSM, site concentration, capacity analysis
-- ============================================================

CREATE OR REPLACE FUNCTION get_field_log_context(p_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'trips', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'truck_id', truck_id,
        'site_name', site_name,
        'site_type', site_type,
        'log_date', log_date,
        'departure_loaded', departure_loaded,
        'arrival_site', arrival_site,
        'discharge_start', discharge_start,
        'discharge_end', discharge_end,
        'departure_site', departure_site,
        'arrival_plant', arrival_plant,
        'load_m3', load_m3,
        'rejected', rejected,
        'reject_side', reject_side
      ) ORDER BY log_date, departure_loaded)
      FROM public.daily_logs
      WHERE assessment_id = p_assessment_id
        AND departure_loaded IS NOT NULL
    ), '[]'::jsonb),
    'interventions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'intervention_date', intervention_date,
        'title', title,
        'description', description,
        'target_metric', target_metric
      ) ORDER BY intervention_date)
      FROM public.intervention_logs
      WHERE assessment_id = p_assessment_id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
