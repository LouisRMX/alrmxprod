-- Utilization analysis pipeline: plant operational profile + computed results.
--
-- Feeds the Results Summary hero-card with the demonstrated-capacity gap
-- analysis. Uses self-benchmarked proxies (the plant's own best operating
-- week as reference) — no industry-standard targets. Every numeric input
-- carries an input_source flag so the UI can render integrity badges
-- (verified / proxy / default).
--
-- Two tables:
--   * plant_operational_profile — per-plant configuration (margin, m³/load,
--     batching mixer count, plant-centroid coordinates). One row per
--     (assessment, plant). User-editable.
--   * utilization_analysis_results — computed output snapshots. One row
--     per computation run. Older rows archived (archived=true) but kept
--     for audit / trend tracking.
--
-- Idempotent: safe to re-run.

-- ── Plant operational profile ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plant_operational_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  -- Human-readable name. Multiple plants per assessment allowed (central
  -- dispatch / shared fleet scenario). plant_slug is a stable key for
  -- UPSERT operations.
  plant_slug text NOT NULL,
  plant_name text NOT NULL,

  -- Physical plant centroid (from confirmed GPS-cluster). Used with
  -- radius_m to classify stops as "at plant" vs "at site".
  centroid_lat numeric(10, 7) NOT NULL,
  centroid_lon numeric(10, 7) NOT NULL,
  centroid_source text NOT NULL DEFAULT 'proxy' CHECK (centroid_source IN ('verified', 'proxy', 'default')),

  -- Radius in meters for the plant-stop classification geofence.
  plant_radius_m integer NOT NULL DEFAULT 500,

  -- Batching plant mixer units (stationary batching equipment, NOT transit
  -- mixer trucks). Drives theoretical capacity.
  batching_mixer_count integer NOT NULL DEFAULT 1,
  batching_mixer_count_source text NOT NULL DEFAULT 'default'
    CHECK (batching_mixer_count_source IN ('verified', 'proxy', 'default')),

  -- Rated capacity per batching mixer unit (m³/hr).
  capacity_per_mixer_m3_per_hr numeric(6, 2) NOT NULL DEFAULT 90.0,
  capacity_per_mixer_source text NOT NULL DEFAULT 'default'
    CHECK (capacity_per_mixer_source IN ('verified', 'proxy', 'default')),

  -- Financial inputs. Same across plants for same customer typically,
  -- but kept at plant level so a multi-customer future doesn't require
  -- schema changes.
  m3_per_load numeric(5, 2) NOT NULL DEFAULT 7.5,
  m3_per_load_source text NOT NULL DEFAULT 'default'
    CHECK (m3_per_load_source IN ('verified', 'proxy', 'default')),
  margin_per_m3 numeric(7, 2) NOT NULL DEFAULT 25.0,
  margin_per_m3_source text NOT NULL DEFAULT 'default'
    CHECK (margin_per_m3_source IN ('verified', 'proxy', 'default')),

  -- Metadata
  notes text,
  last_validated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (assessment_id, plant_slug)
);

CREATE INDEX IF NOT EXISTS idx_plant_profile_assessment
  ON public.plant_operational_profile (assessment_id);

COMMENT ON TABLE public.plant_operational_profile IS
  'Per-plant configuration used by the utilization analysis engine. '
  'One row per plant per assessment. Each numeric input has an '
  'input_source flag (verified / proxy / default) that drives the '
  'integrity badge in the Results hero-card.';

-- ── Utilization analysis results ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.utilization_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false,

  -- ── Data coverage ───────────────────────────────────────────────────
  -- Observation window.
  window_start date NOT NULL,
  window_end date NOT NULL,
  total_calendar_days integer NOT NULL,
  operating_days integer NOT NULL,           -- calendar days - fridays - low-activity
  fridays_excluded integer NOT NULL,
  low_activity_days_excluded integer NOT NULL,

  -- ── Fleet classification ────────────────────────────────────────────
  events_total integer NOT NULL,             -- after parser + validation
  events_in_scope integer NOT NULL,          -- after region filter
  events_out_of_scope integer NOT NULL,
  trucks_in_scope integer NOT NULL,
  trucks_out_of_scope integer NOT NULL,
  trucks_outlier integer NOT NULL,
  -- Per-truck outlier details for UI surfacing.
  -- [{ truck_id, total_stops, region_share, note }]
  outlier_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ── CURRENT metrics (rolling 30 days, operating-day normalized) ─────
  current_loads_per_op_day numeric(8, 2),
  current_trips_per_truck_per_op_day numeric(5, 2),
  current_median_tat_min numeric(6, 1),
  current_utilization_pct numeric(5, 2),

  -- ── DEMONSTRATED CAPACITY (top-2 operating weeks average) ───────────
  -- Self-benchmarked proxy. Represents what the plant has actually done,
  -- averaged across its 2 best operating weeks in the window. Not a
  -- target. Not an external benchmark.
  demonstrated_loads_per_op_day numeric(8, 2),
  demonstrated_trips_per_truck_per_op_day numeric(5, 2),
  demonstrated_median_tat_min numeric(6, 1),
  demonstrated_utilization_pct numeric(5, 2),
  demonstrated_weeks jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{week_start, loads_per_op_day}]

  -- ── PEAK (single best operating week) ───────────────────────────────
  -- Shown as aspirational secondary reference in UI.
  peak_loads_per_op_day numeric(8, 2),
  peak_week_start date,

  -- ── GAP + financial impact ──────────────────────────────────────────
  gap_loads_per_op_day numeric(8, 2),        -- demonstrated - current
  monthly_value_usd numeric(12, 2),          -- gap × m³/load × margin × monthly_op_days

  -- ── Per-plant breakdown (for "where does the gap come from") ────────
  -- [{ plant_slug, plant_name, current_loads_per_op_day, demonstrated_..., gap_... }]
  plant_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- ── Computation context ─────────────────────────────────────────────
  -- [{ note }] — operational notes the compute engine emits (e.g.
  -- "Only 5 operating weeks available; demonstrated uses top-2 of 5")
  computation_notes jsonb NOT NULL DEFAULT '[]'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_util_results_assessment_live
  ON public.utilization_analysis_results (assessment_id, computed_at DESC)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_util_results_archived
  ON public.utilization_analysis_results (assessment_id, archived);

COMMENT ON TABLE public.utilization_analysis_results IS
  'Computed output of the utilization analysis engine. One row per '
  'computation run. Previous rows kept (archived=true) for audit and '
  'trend tracking across the engagement lifecycle. The Results hero-card '
  'reads the latest non-archived row per assessment.';

-- ── Triggers to keep updated_at fresh ─────────────────────────────────
DO $$
BEGIN
  -- Reuse the existing touch_updated_at() function if it exists, else
  -- create it (matches the intervention_plans migration pattern).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'touch_updated_at'
  ) THEN
    CREATE FUNCTION public.touch_updated_at() RETURNS trigger AS $f$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_plant_profile_touch
  ON public.plant_operational_profile;
CREATE TRIGGER trg_plant_profile_touch
  BEFORE UPDATE ON public.plant_operational_profile
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.plant_operational_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utilization_analysis_results ENABLE ROW LEVEL SECURITY;

-- Profile: admins + authenticated users (will tighten to customer-members
-- when multi-tenant isolation lands; matches intervention_plans pattern).
DROP POLICY IF EXISTS "profile_read_authed" ON public.plant_operational_profile;
CREATE POLICY "profile_read_authed"
  ON public.plant_operational_profile FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profile_write_authed" ON public.plant_operational_profile;
CREATE POLICY "profile_write_authed"
  ON public.plant_operational_profile FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Results: same scope as profile.
DROP POLICY IF EXISTS "util_results_read_authed" ON public.utilization_analysis_results;
CREATE POLICY "util_results_read_authed"
  ON public.utilization_analysis_results FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "util_results_write_authed" ON public.utilization_analysis_results;
CREATE POLICY "util_results_write_authed"
  ON public.utilization_analysis_results FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
