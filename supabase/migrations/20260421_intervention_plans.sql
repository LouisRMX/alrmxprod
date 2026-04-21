-- Intervention plan feature: AI-generated, plant-specific operational
-- improvement plans. Supports the consulting engagement flow where Louis
-- arrives on-site with a structured diagnostic playbook rather than a
-- polished-but-blind plan.
--
-- Two tables:
--   * intervention_library — curated catalog of known operational
--     interventions (dispatch SOP, demurrage clause, weighbridge kiosk,
--     etc.) with USD cost + impact ranges and applicability rules.
--   * intervention_plans — plan artifacts generated per assessment. One
--     assessment can have many plans (versioned via generated_at).
--
-- Idempotent: safe to re-run.

-- ── Library (catalog of known interventions) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.intervention_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title_en text NOT NULL,
  title_ar text,
  category text NOT NULL, -- dispatch | weighbridge | batching | fleet | site_ops | qc | driver | maintenance
  problem_solves text NOT NULL,
  -- Machine-readable rules. Evaluated against computed KPIs before
  -- surfacing to the LLM as a candidate. Example:
  -- { "trucks_min": 20, "avg_tat_min_gt": 120, "dispatch_tool_in": ["excel","whatsapp","none"] }
  applicability_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_usd_low numeric,
  cost_usd_high numeric,
  cost_notes text,
  impact_metric text, -- tat | dispatch | reject_pct | site_wait | utilization | partial_load | other
  impact_pct_low numeric, -- signed, negative = reduction
  impact_pct_high numeric,
  impact_secondary text,
  effort_weeks integer,
  complexity text, -- low | medium | high
  prerequisites text[] DEFAULT ARRAY[]::text[],
  quick_win boolean DEFAULT false,
  gcc_notes text,
  sources jsonb DEFAULT '[]'::jsonb, -- array of citation strings or { label, url } objects
  tags text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_library_category
  ON public.intervention_library (category);

CREATE INDEX IF NOT EXISTS idx_intervention_library_quick_win
  ON public.intervention_library (quick_win)
  WHERE quick_win = true;

COMMENT ON TABLE public.intervention_library IS
  'Curated catalog of operational interventions. Fed as cached context '
  'to Claude when generating plant-specific plans. Sourced via research '
  'agent; editable by admins.';

-- ── Plans (generated artifacts per assessment) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.intervention_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id),
  model_version text, -- e.g. claude-sonnet-4-5-20251001
  -- Input snapshot for reproducibility. Contains assessment answers,
  -- computed KPIs, recent field log summary at generation time.
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Structured plan output matching the prompt's output schema.
  -- Expected top-level keys: verify_onsite, hypotheses, phase_1, phase_2, phase_3, pitch_summary
  plan_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Consultant edits layered on top of plan_content. When non-empty,
  -- UI renders plan_content overlaid with edits.
  edits jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft', -- draft | reviewed | finalized | archived
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_plans_assessment
  ON public.intervention_plans (assessment_id, generated_at DESC);

COMMENT ON TABLE public.intervention_plans IS
  'AI-generated intervention plans per assessment. Versioned by '
  'generated_at. Consultants layer edits into the edits jsonb without '
  'mutating the original plan_content snapshot.';

-- ── Triggers to keep updated_at fresh ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_intervention_library_touch
  ON public.intervention_library;
CREATE TRIGGER trg_intervention_library_touch
  BEFORE UPDATE ON public.intervention_library
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_intervention_plans_touch
  ON public.intervention_plans;
CREATE TRIGGER trg_intervention_plans_touch
  BEFORE UPDATE ON public.intervention_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.intervention_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intervention_plans   ENABLE ROW LEVEL SECURITY;

-- Library: readable by any authenticated user; writable by system_admin
-- via JWT app_metadata (per project convention — never SELECT from
-- profiles in RLS, avoids recursion).
DROP POLICY IF EXISTS "library_read_authed" ON public.intervention_library;
CREATE POLICY "library_read_authed"
  ON public.intervention_library FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "library_write_admin" ON public.intervention_library;
CREATE POLICY "library_write_admin"
  ON public.intervention_library FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin')
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

-- Plans: analysts can CRUD plans for assessments they have access to.
-- Simple version: authenticated users can read/write all plans (tighten
-- when multi-tenant isolation lands). Admin can do anything.
DROP POLICY IF EXISTS "plans_read_authed" ON public.intervention_plans;
CREATE POLICY "plans_read_authed"
  ON public.intervention_plans FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "plans_write_authed" ON public.intervention_plans;
CREATE POLICY "plans_write_authed"
  ON public.intervention_plans FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
