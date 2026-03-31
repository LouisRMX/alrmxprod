-- ============================================================
-- 90-day tracking module
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. tracking_configs ─────────────────────────────────────
-- One config per assessment, created by Louis when he starts tracking

CREATE TABLE IF NOT EXISTS public.tracking_configs (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id         uuid REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- When tracking started
  started_at            date NOT NULL DEFAULT CURRENT_DATE,

  -- Baseline values (pulled from assessment answers at setup time)
  baseline_turnaround   numeric,   -- minutes
  baseline_reject_pct   numeric,   -- %
  baseline_dispatch_min numeric,   -- minutes

  -- Targets set by Louis
  target_turnaround     numeric,   -- minutes
  target_reject_pct     numeric,   -- %
  target_dispatch_min   numeric,   -- minutes

  -- Which metrics to actively track
  track_turnaround      boolean NOT NULL DEFAULT true,
  track_reject          boolean NOT NULL DEFAULT true,
  track_dispatch        boolean NOT NULL DEFAULT false,

  -- Financial coefficients ($/month per 1-unit improvement, from assessment)
  coeff_turnaround      numeric NOT NULL DEFAULT 0,  -- $/month per minute reduction
  coeff_reject          numeric NOT NULL DEFAULT 0,  -- $/month per 1% reduction

  -- Baseline total monthly loss (Cost of Inaction at assessment time)
  baseline_monthly_loss numeric,

  -- Client has consented to anonymised case study use
  consent_case_study    boolean NOT NULL DEFAULT false,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_configs_assessment ON public.tracking_configs (assessment_id);

ALTER TABLE public.tracking_configs ENABLE ROW LEVEL SECURITY;

-- Admins manage all configs
CREATE POLICY "Admins manage tracking configs"
  ON public.tracking_configs FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

-- Customers can view their own config
CREATE POLICY "Customers view their tracking config"
  ON public.tracking_configs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.tracking_configs.assessment_id
      AND cm.user_id = auth.uid()
    )
  );

-- ── 2. tracking_entries ─────────────────────────────────────
-- Weekly logs from the plant (13 weeks = 90 days)

CREATE TABLE IF NOT EXISTS public.tracking_entries (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id     uuid REFERENCES public.tracking_configs(id) ON DELETE CASCADE NOT NULL,
  week_number   int NOT NULL CHECK (week_number BETWEEN 1 AND 13),

  logged_at     timestamptz NOT NULL DEFAULT now(),
  logged_by     uuid REFERENCES public.profiles(id),

  -- The three metrics
  turnaround_min  numeric,
  reject_pct      numeric,
  dispatch_min    numeric,

  -- Optional context from plant
  notes           text,

  UNIQUE(config_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_tracking_entries_config ON public.tracking_entries (config_id);

ALTER TABLE public.tracking_entries ENABLE ROW LEVEL SECURITY;

-- Admins manage all entries
CREATE POLICY "Admins manage tracking entries"
  ON public.tracking_entries FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

-- Customers can view entries for their configs
CREATE POLICY "Customers view their tracking entries"
  ON public.tracking_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tracking_configs tc
      JOIN public.assessments a ON a.id = tc.assessment_id
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE tc.id = public.tracking_entries.config_id
      AND cm.user_id = auth.uid()
    )
  );

-- Customers can insert entries for their configs
CREATE POLICY "Customers insert tracking entries"
  ON public.tracking_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tracking_configs tc
      JOIN public.assessments a ON a.id = tc.assessment_id
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE tc.id = public.tracking_entries.config_id
      AND cm.user_id = auth.uid()
    )
  );

-- Customers can update their own entries (same week, same person)
CREATE POLICY "Customers update own tracking entries"
  ON public.tracking_entries FOR UPDATE
  USING (
    logged_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tracking_configs tc
      JOIN public.assessments a ON a.id = tc.assessment_id
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE tc.id = public.tracking_entries.config_id
      AND cm.user_id = auth.uid()
    )
  );
