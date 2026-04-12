-- ============================================================
-- Priority Matrix Overrides — consultant can reassign quadrants
-- ============================================================

CREATE TABLE IF NOT EXISTS public.priority_matrix_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  issue_title       text NOT NULL,
  original_quadrant text NOT NULL,
  override_quadrant text NOT NULL
    CHECK (override_quadrant IN ('DO_FIRST', 'PLAN_CAREFULLY', 'QUICK_WIN', 'DONT_DO')),
  override_reason   text,
  overridden_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, issue_title)
);

CREATE INDEX idx_priority_overrides_assessment
  ON public.priority_matrix_overrides (assessment_id);

ALTER TABLE public.priority_matrix_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage priority overrides"
  ON public.priority_matrix_overrides FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
    OR auth.uid() IS NOT NULL
  );
