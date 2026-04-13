-- Fix chat_questions admin policy: replace profiles table lookup with JWT app_metadata
-- to avoid recursive RLS evaluation (profiles table has its own RLS policies).
-- Matches the pattern used on all other tables since 20260330_app_metadata_roles.sql.

DROP POLICY IF EXISTS "admins_read_all" ON public.chat_questions;

CREATE POLICY "admins_read_all" ON public.chat_questions
  FOR SELECT USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );
