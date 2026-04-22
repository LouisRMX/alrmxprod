-- Field guide progress state: checkbox gates + per-hypothesis notes.
--
-- One row per (user, engagement, item_type, item_id). Item types:
--   'pre_arrival' + pre-arrival checklist id
--   'hypothesis'  + hypothesis id (h1a, h1b, h2, ...)
--   'slot_gate'   + slot-level gate id (d1am_g1_sanity, ...)
--   'eod_gate'    + end-of-day gate id
--   'interview'   + interview id
--   'abort'       + abort scenario id (marked as triggered)
--
-- Status enum:
--   'todo'        — not started
--   'in_progress' — opened / partial
--   'confirmed'   — hypothesis confirmed, gate passed, task done
--   'invalidated' — hypothesis invalidated
--   'partial'     — hypothesis partially confirmed
--   'failed'      — gate failed
--   'skipped'     — intentionally skipped (with note)
--   'triggered'   — abort scenario triggered
--
-- Notes are free-text markdown the consultant takes while on-site.
-- All rows are scoped to assessment_id (= engagement).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.field_guide_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_id text NOT NULL,
  status text NOT NULL DEFAULT 'todo',
  note text,
  usd_adjusted numeric, -- consultant's revised USD after on-site validation
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_field_guide_progress_assessment
  ON public.field_guide_progress (assessment_id, item_type);

COMMENT ON TABLE public.field_guide_progress IS
  'Per-user state for the on-site field guide: checkbox gates, hypothesis '
  'fate notes, revised USD estimates. Rendered by FieldGuideView with the '
  'hardcoded content in src/data/omix-field-guide.ts.';

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS trg_field_guide_progress_touch
  ON public.field_guide_progress;
CREATE TRIGGER trg_field_guide_progress_touch
  BEFORE UPDATE ON public.field_guide_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.field_guide_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fg_progress_read_own" ON public.field_guide_progress;
CREATE POLICY "fg_progress_read_own"
  ON public.field_guide_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()
    OR (auth.jwt()->'app_metadata'->>'role') = 'system_admin');

DROP POLICY IF EXISTS "fg_progress_write_own" ON public.field_guide_progress;
CREATE POLICY "fg_progress_write_own"
  ON public.field_guide_progress FOR ALL
  TO authenticated
  USING (user_id = auth.uid()
    OR (auth.jwt()->'app_metadata'->>'role') = 'system_admin')
  WITH CHECK (user_id = auth.uid()
    OR (auth.jwt()->'app_metadata'->>'role') = 'system_admin');
