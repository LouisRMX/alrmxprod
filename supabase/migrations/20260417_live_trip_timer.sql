-- ============================================================
-- Live Trip Timer Module
-- - Adds 2 timestamps (plant_queue_start, loading_start) to daily_logs
--   to support full 7-stage stopwatch capture
-- - Adds measurer, is_partial, stage_notes metadata
-- - Creates field_capture_tokens table for URL-based helper access
-- ============================================================

-- ── 1. Extend daily_logs with missing stage timestamps + metadata ──
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS plant_queue_start timestamptz,
  ADD COLUMN IF NOT EXISTS loading_start     timestamptz,
  ADD COLUMN IF NOT EXISTS measurer_name     text,
  ADD COLUMN IF NOT EXISTS is_partial        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stage_notes       jsonb;

COMMENT ON COLUMN public.daily_logs.plant_queue_start IS
  'Timestamp when the stopwatch was started at plant queue (first tap). Marks trip start.';
COMMENT ON COLUMN public.daily_logs.loading_start IS
  'Timestamp when loading began (second tap). plant_queue_start to loading_start = plant queue duration.';
COMMENT ON COLUMN public.daily_logs.measurer_name IS
  'Free-text name of the person who captured this trip (e.g. Louis, Ali, Mohamed). Used to attribute data quality during analysis.';
COMMENT ON COLUMN public.daily_logs.is_partial IS
  'True when the observer could not capture all 7 stages. Partial trips are kept for downstream analysis with explicit uncertainty flag.';
COMMENT ON COLUMN public.daily_logs.stage_notes IS
  'Optional per-stage notes. Shape: { plant_queue: "text", loading: "text", transit_out: "text", site_wait: "text", pouring: "text", washout: "text", transit_back: "text" }';

-- ── 2. field_capture_tokens: URL-based helper access ──
-- Helpers receive a single URL (https://app/fc/[token]) and can only log
-- trips. No navigation, no report access, no assessment edit. Tokens can
-- be revoked by deleting the row; RLS enforces scope to the assessment
-- the token was created for.
CREATE TABLE IF NOT EXISTS public.field_capture_tokens (
  token          text PRIMARY KEY,
  assessment_id  uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  plant_id       uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  label          text,  -- optional description, e.g. "Ali on-site helper"
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  last_used_at   timestamptz,
  use_count      integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_capture_tokens_assessment
  ON public.field_capture_tokens (assessment_id);

ALTER TABLE public.field_capture_tokens ENABLE ROW LEVEL SECURITY;

-- Only system admins and customer members can manage tokens
CREATE POLICY "System admins manage tokens"
  ON public.field_capture_tokens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Customer members manage tokens for their assessments"
  ON public.field_capture_tokens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.plants pl
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE pl.id = public.field_capture_tokens.plant_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 3. Token validation function ──
-- Returns the assessment_id and plant_id for a valid token, or NULL otherwise.
-- Used by the /fc/[token] route and by a trip insertion RLS policy.
CREATE OR REPLACE FUNCTION public.validate_field_capture_token(p_token text)
RETURNS TABLE(assessment_id uuid, plant_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update last_used_at + use_count (best-effort, don't fail if token invalid)
  UPDATE public.field_capture_tokens
  SET last_used_at = now(), use_count = use_count + 1
  WHERE token = p_token
    AND expires_at > now()
    AND revoked_at IS NULL;

  RETURN QUERY
  SELECT t.assessment_id, t.plant_id
  FROM public.field_capture_tokens t
  WHERE t.token = p_token
    AND t.expires_at > now()
    AND t.revoked_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_field_capture_token(text) TO anon, authenticated;

-- ── 4. Allow anonymous inserts to daily_logs via token ──
-- Helpers using /fc/[token] are not authenticated. The API route will
-- validate the token server-side and then insert with a service-role key,
-- so no RLS policy change is needed here. The service-role key bypasses
-- RLS; the validation happens in the API layer.
--
-- Security model:
--   1. Helper hits POST /api/field-capture/trip with { token, trip_data }
--   2. API validates token via validate_field_capture_token(token)
--   3. If valid, API uses service-role client to insert into daily_logs
--      with the assessment_id and plant_id returned by the token function
--   4. Helper cannot forge assessment_id because it comes from the token, not the request body
