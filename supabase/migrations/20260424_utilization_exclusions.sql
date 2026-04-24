-- Utilization exclusions: periods that should be treated separately from
-- the baseline analysis. Primary use case is Ramadan — operations run at
-- ~30-50% of normal capacity due to shorter workdays, site-activity drops,
-- and truck-movement restrictions. Including Ramadan in baseline drags
-- down current-loads/day in a way that misrepresents steady-state
-- operations.
--
-- Design: each row defines a date range (inclusive). Baseline compute
-- filters these events out. Per-period compute can ALSO run over only
-- the excluded range to produce a Ramadan-specific analysis that gets
-- rendered alongside baseline. This turns "Ramadan is messy" from a data
-- problem into a differentiating consulting output.
--
-- Idempotent: safe to re-run.

-- ── Exclusions table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.utilization_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,

  start_date date NOT NULL,
  end_date date NOT NULL,

  -- Categorical reason — drives default labels and grouping. 'ramadan'
  -- is the bellwether case; 'eid' and 'holiday' are related; 'other'
  -- is a catch-all.
  reason text NOT NULL DEFAULT 'other'
    CHECK (reason IN ('ramadan', 'eid', 'holiday', 'maintenance', 'other')),

  -- User-visible label. Falls back to humanized reason + year if empty.
  label text NOT NULL,

  -- Active exclusions apply to baseline. Inactive ones are kept for
  -- audit / reactivation, but don't affect compute.
  active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),

  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_util_exclusions_assessment
  ON public.utilization_exclusions (assessment_id, active);

COMMENT ON TABLE public.utilization_exclusions IS
  'Date ranges excluded from baseline utilization compute. Each range '
  'can also be computed in isolation (analysis_mode=within_period) to '
  'produce a period-specific analysis — e.g. Ramadan output vs rest of '
  'year. One row per logical period per assessment.';

-- ── Augment utilization_analysis_results with mode + period linkage ────
-- Baseline vs within-period distinction. A single assessment can have
-- multiple live results: one 'baseline' + one per active exclusion
-- computed in within_period mode.
ALTER TABLE public.utilization_analysis_results
  ADD COLUMN IF NOT EXISTS analysis_mode text NOT NULL DEFAULT 'baseline'
    CHECK (analysis_mode IN ('baseline', 'within_period'));

ALTER TABLE public.utilization_analysis_results
  ADD COLUMN IF NOT EXISTS period_label text;

ALTER TABLE public.utilization_analysis_results
  ADD COLUMN IF NOT EXISTS exclusion_id uuid
    REFERENCES public.utilization_exclusions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_util_results_mode
  ON public.utilization_analysis_results (assessment_id, analysis_mode, archived);

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.utilization_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exclusions_read_authed" ON public.utilization_exclusions;
CREATE POLICY "exclusions_read_authed"
  ON public.utilization_exclusions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "exclusions_write_authed" ON public.utilization_exclusions;
CREATE POLICY "exclusions_write_authed"
  ON public.utilization_exclusions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
