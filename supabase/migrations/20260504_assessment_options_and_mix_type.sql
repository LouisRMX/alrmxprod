-- ============================================================
-- Admin-managed option lists for Field Log + mix_type capture
--
-- Goals:
--   1. Admin can pre-create the lists of origin_plants, batching_units
--      (per origin_plant) and mix_types per assessment.
--   2. Helpers using a /fc/[token] link see exactly the lists the admin
--      curated, not whatever happened to be cached in their device's
--      IndexedDB.
--   3. Each measurement records which mix/cement type was poured so the
--      analyst can slice TAT by recipe.
--
-- Data model:
--   public.assessment_options          (kind, name, parent_name, sort_value, sort_order)
--     kind ∈ ('origin_plant', 'batching_unit', 'mix_type')
--     parent_name only used for kind='batching_unit' (the origin_plant it
--     belongs to)
--     sort_value optional numeric for mix_type ascending sort; falls back
--     to sort_order for non-numeric kinds
--
--   public.daily_logs.mix_type text    (nullable for legacy rows)
--
--   RPC public.get_field_capture_options(p_token)
--     Returns JSON with sites + units + mix_types for the assessment the
--     token is bound to. SECURITY DEFINER so unauthenticated /fc/[token]
--     callers can fetch admin-curated lists.
--
-- ============================================================

-- ── 1. assessment_options table ──
CREATE TABLE IF NOT EXISTS public.assessment_options (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('origin_plant', 'batching_unit', 'mix_type')),
  name            text NOT NULL,
  -- For kind='batching_unit', the origin_plant name this unit belongs to.
  -- NULL for the other kinds. Free-text reference (no FK) so admin can
  -- add a unit before adding the plant if they want; we just filter by
  -- name match in the UI.
  parent_name     text,
  -- For kind='mix_type' the numeric strength used for ascending sort
  -- (e.g. 250, 270, 350). Null for non-numeric kinds; sort by sort_order.
  sort_value      numeric,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (assessment_id, kind, name, parent_name)
);

CREATE INDEX IF NOT EXISTS idx_assessment_options_assessment_kind
  ON public.assessment_options (assessment_id, kind);

COMMENT ON TABLE public.assessment_options IS
  'Admin-curated option lists per assessment for the Field Log live timer. Backs the origin_plant, batching_unit and mix_type pickers so token-mode helpers see what the admin set up rather than per-device IndexedDB caches.';

-- RLS: admins manage all rows; customer members manage rows for their
-- assessments; everyone else (including unauthenticated token clients)
-- reads via the get_field_capture_options RPC, not direct table access.
ALTER TABLE public.assessment_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System admins manage assessment_options" ON public.assessment_options;
CREATE POLICY "System admins manage assessment_options"
  ON public.assessment_options FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

DROP POLICY IF EXISTS "Customer members manage assessment_options" ON public.assessment_options;
CREATE POLICY "Customer members manage assessment_options"
  ON public.assessment_options FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.assessment_options.assessment_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 2. mix_type column on daily_logs ──
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS mix_type text;

COMMENT ON COLUMN public.daily_logs.mix_type IS
  'Concrete mix / strength code recorded for this trip (e.g. "350", "B40"). Free-text but typically picked from the assessment_options list of kind=mix_type so values stay consistent for slicing.';

-- ── 3. get_field_capture_options RPC ──
-- Returns the option lists for the assessment that the token is bound
-- to. Used by /fc/[token] (unauthenticated) and by the authenticated
-- live timer for parity. SECURITY DEFINER so token clients can read
-- without an auth.uid().
CREATE OR REPLACE FUNCTION public.get_field_capture_options(p_token text)
RETURNS TABLE(
  origin_plants jsonb,
  batching_units jsonb,
  mix_types jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assessment_id uuid;
BEGIN
  -- Resolve token to assessment without bumping use_count (this is a
  -- list-fetch, not a measurement insert).
  SELECT t.assessment_id INTO v_assessment_id
  FROM public.field_capture_tokens t
  WHERE t.token = p_token
    AND t.expires_at > now()
    AND t.revoked_at IS NULL;

  IF v_assessment_id IS NULL THEN
    -- Empty arrays so the client renders empty pickers without error
    RETURN QUERY SELECT '[]'::jsonb, '[]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name) ORDER BY sort_order, name)
      FROM public.assessment_options
      WHERE assessment_id = v_assessment_id AND kind = 'origin_plant'
    ), '[]'::jsonb) AS origin_plants,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'parent_name', parent_name) ORDER BY parent_name, sort_order, name)
      FROM public.assessment_options
      WHERE assessment_id = v_assessment_id AND kind = 'batching_unit'
    ), '[]'::jsonb) AS batching_units,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'sort_value', sort_value) ORDER BY sort_value NULLS LAST, sort_order, name)
      FROM public.assessment_options
      WHERE assessment_id = v_assessment_id AND kind = 'mix_type'
    ), '[]'::jsonb) AS mix_types;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_field_capture_options(text) TO anon, authenticated;

-- ── 4. Helper to upsert a single option (used by admin UI) ──
-- Returns the row id. Uses ON CONFLICT on the (assessment_id, kind, name,
-- parent_name) unique key so re-adding the same option is a no-op rather
-- than an error.
CREATE OR REPLACE FUNCTION public.upsert_assessment_option(
  p_assessment_id uuid,
  p_kind text,
  p_name text,
  p_parent_name text DEFAULT NULL,
  p_sort_value numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_next_order integer;
BEGIN
  IF p_kind NOT IN ('origin_plant', 'batching_unit', 'mix_type') THEN
    RAISE EXCEPTION 'invalid kind %', p_kind;
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next_order
  FROM public.assessment_options
  WHERE assessment_id = p_assessment_id AND kind = p_kind;

  INSERT INTO public.assessment_options
    (assessment_id, kind, name, parent_name, sort_value, sort_order, created_by)
  VALUES
    (p_assessment_id, p_kind, p_name, p_parent_name, p_sort_value, v_next_order, auth.uid())
  ON CONFLICT (assessment_id, kind, name, parent_name)
  DO UPDATE SET
    sort_value = COALESCE(EXCLUDED.sort_value, public.assessment_options.sort_value)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_assessment_option(uuid, text, text, text, numeric) TO authenticated;
