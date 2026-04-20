-- ============================================================
-- Hardening pass before multi-customer deployment
--
-- Addresses three concerns that surfaced during a security audit
-- of the Field Log and Field Capture token flows:
--
-- 1. Remaining tables using the SELECT FROM profiles admin-check
--    pattern (same recursion class as 20260420_fix_rls_recursion).
--    These would fire the same "infinite recursion in policy for
--    relation profiles" error the first time an admin touches them.
-- 2. Per-trip audit trail: daily_logs rows written via the token
--    route had no forensic fingerprint, so there was no way to
--    trace a suspicious cluster back to a device.
--
-- Tables touched: trip_uploads, trip_records, uploaded_gps_files,
-- mapping_templates, normalized_gps_events, logistics_analysis_results,
-- daily_entries, daily_logs (new columns).
-- ============================================================

-- ── 1. RLS: replace SELECT-FROM-profiles admin checks with JWT ──

-- trip_uploads
DROP POLICY IF EXISTS "System admins manage all trip uploads" ON public.trip_uploads;
CREATE POLICY "System admins manage all trip uploads"
  ON public.trip_uploads FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

-- trip_records
DROP POLICY IF EXISTS "System admins manage all trip records" ON public.trip_records;
CREATE POLICY "System admins manage all trip records"
  ON public.trip_records FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

-- uploaded_gps_files (guarded: table may not exist in every environment)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'uploaded_gps_files') THEN
    EXECUTE 'DROP POLICY IF EXISTS "System admins manage all GPS files" ON public.uploaded_gps_files';
    EXECUTE $policy$
      CREATE POLICY "System admins manage all GPS files"
        ON public.uploaded_gps_files FOR ALL
        USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin')
    $policy$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mapping_templates') THEN
    EXECUTE 'DROP POLICY IF EXISTS "System admins manage all templates" ON public.mapping_templates';
    EXECUTE $policy$
      CREATE POLICY "System admins manage all templates"
        ON public.mapping_templates FOR ALL
        USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin')
    $policy$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'normalized_gps_events') THEN
    EXECUTE 'DROP POLICY IF EXISTS "System admins manage all GPS events" ON public.normalized_gps_events';
    EXECUTE $policy$
      CREATE POLICY "System admins manage all GPS events"
        ON public.normalized_gps_events FOR ALL
        USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin')
    $policy$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'logistics_analysis_results') THEN
    EXECUTE 'DROP POLICY IF EXISTS "System admins manage all logistics results" ON public.logistics_analysis_results';
    EXECUTE $policy$
      CREATE POLICY "System admins manage all logistics results"
        ON public.logistics_analysis_results FOR ALL
        USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin')
    $policy$;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'daily_entries') THEN
    EXECUTE 'DROP POLICY IF EXISTS "system_admin_all" ON public.daily_entries';
    EXECUTE $policy$
      CREATE POLICY "system_admin_all"
        ON public.daily_entries FOR ALL
        USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin')
    $policy$;
  END IF;
END $$;

-- ── 2. Audit trail columns on daily_logs ──
--
-- These are populated only by the token route (/api/field-capture/trip)
-- so admin and direct-client inserts leave them NULL. Queryable per-trip
-- for forensics: "where did these 200 trips come from?"
ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS captured_ip text,
  ADD COLUMN IF NOT EXISTS captured_user_agent text;

COMMENT ON COLUMN public.daily_logs.captured_ip IS
  'Source IP of the POST to /api/field-capture/trip. NULL for authenticated or direct-client inserts. Used for forensics when a token is suspected of abuse.';

COMMENT ON COLUMN public.daily_logs.captured_user_agent IS
  'User-Agent header of the POST to /api/field-capture/trip. NULL for authenticated or direct-client inserts. Used alongside captured_ip for device fingerprinting.';
