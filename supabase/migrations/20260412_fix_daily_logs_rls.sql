-- Fix infinite recursion in daily_logs RLS policies
-- Root cause: system admin policy queried profiles table which has its own
-- RLS policies that reference back, creating circular dependency.
-- Fix: use JWT app_metadata instead of profiles table lookup.

-- ── daily_logs ──
DROP POLICY IF EXISTS "System admins manage all daily logs" ON public.daily_logs;
CREATE POLICY "System admins manage all daily logs"
  ON public.daily_logs FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

-- ── intervention_logs ──
DROP POLICY IF EXISTS "System admins manage all intervention logs" ON public.intervention_logs;
CREATE POLICY "System admins manage all intervention logs"
  ON public.intervention_logs FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

-- ── daily_log_uploads ──
DROP POLICY IF EXISTS "System admins manage all daily log uploads" ON public.daily_log_uploads;
CREATE POLICY "System admins manage all daily log uploads"
  ON public.daily_log_uploads FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );
