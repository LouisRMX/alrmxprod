-- Sync system_admin role from profiles into auth.users app_metadata
-- so that RLS policies using auth.jwt()->'app_metadata'->>'role' work
-- for client-side requests (browser Supabase client).

-- 1. Backfill existing system admins
-- (Already applied manually via Auth Admin API on 2026-04-07)
-- UPDATE auth.users
-- SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"system_admin"}'::jsonb
-- WHERE id IN (
--   SELECT id FROM public.profiles WHERE role = 'system_admin'
-- );

-- 2. Trigger function: keep app_metadata.role in sync with profiles.role
CREATE OR REPLACE FUNCTION public.sync_profile_role_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'system_admin' THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"system_admin"}'::jsonb
    WHERE id = NEW.id;
  ELSE
    -- Remove the role key when demoted from system_admin
    UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data - 'role'
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger to profiles table
DROP TRIGGER IF EXISTS sync_profile_role ON public.profiles;
CREATE TRIGGER sync_profile_role
AFTER INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_to_jwt();
