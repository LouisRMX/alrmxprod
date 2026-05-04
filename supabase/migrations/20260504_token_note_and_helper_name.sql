-- ============================================================
-- field_capture_tokens: add note + return label/note from validate RPC
--
-- The token's existing `label` field is repurposed as the helper's
-- name, set by the admin when minting the token. Helpers using the
-- token URL no longer pick a measurer name themselves; the live
-- timer pre-fills it from the token.
--
-- A new `note` column gives the admin a free-text scratchpad per
-- token (e.g. "Friday day shift only", "Phone shared by Ali + Hany").
-- It is shown in the token list in the admin modal but never sent
-- to the helper page.
--
-- validate_field_capture_token returns label + note alongside the
-- existing assessment_id + plant_id so the /fc/[token] page can
-- pre-fill the helper name on first render without a second round-trip.
-- ============================================================

ALTER TABLE public.field_capture_tokens
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN public.field_capture_tokens.note IS
  'Admin-only free-text note about this token (shift, phone owner, etc.). Never exposed via the /fc/[token] page; only visible in the token list in the admin modal.';

-- Extend the return signature. CREATE OR REPLACE cannot change a
-- function's return type, so drop and recreate. The function is
-- SECURITY DEFINER and bumps last_used_at + use_count; preserve both.
DROP FUNCTION IF EXISTS public.validate_field_capture_token(text);

CREATE FUNCTION public.validate_field_capture_token(p_token text)
RETURNS TABLE(
  assessment_id uuid,
  plant_id uuid,
  label text,
  note text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Best-effort use_count + last_used_at bump; ignore failure on
  -- expired/revoked tokens so the SELECT still returns nothing.
  UPDATE public.field_capture_tokens
  SET last_used_at = now(), use_count = use_count + 1
  WHERE token = p_token
    AND expires_at > now()
    AND revoked_at IS NULL;

  RETURN QUERY
  SELECT t.assessment_id, t.plant_id, t.label, t.note
  FROM public.field_capture_tokens t
  WHERE t.token = p_token
    AND t.expires_at > now()
    AND t.revoked_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_field_capture_token(text) TO anon, authenticated;
