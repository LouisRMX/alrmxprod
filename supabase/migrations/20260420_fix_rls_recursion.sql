-- ============================================================
-- Fix infinite recursion in profiles RLS
--
-- Three tables had admin policies using the recursive subquery
-- pattern (SELECT FROM profiles) which cycles through profiles'
-- own RLS. Replace all three with the JWT app_metadata check
-- that was established in 20260330 and 20260412_fix_daily_logs_rls.
--
-- Symptom: inserts into field_capture_tokens failed with
-- "infinite recursion detected in policy for relation profiles".
-- ============================================================

-- ── 1. profiles ──
-- Defensively recreate profiles policies in their canonical JWT form.
-- Safe to re-run: drops any lingering legacy policies first.
DROP POLICY IF EXISTS "System admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "System admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "System admins can view all profiles"
  ON public.profiles FOR SELECT
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

CREATE POLICY "System admins can manage all profiles"
  ON public.profiles FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

-- ── 2. field_capture_tokens ──
DROP POLICY IF EXISTS "System admins manage tokens" ON public.field_capture_tokens;
CREATE POLICY "System admins manage tokens"
  ON public.field_capture_tokens FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

-- ── 3. fieldlog_todos ──
DROP POLICY IF EXISTS "System admins manage all fieldlog todos" ON public.fieldlog_todos;
CREATE POLICY "System admins manage all fieldlog todos"
  ON public.fieldlog_todos FOR ALL
  USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');
