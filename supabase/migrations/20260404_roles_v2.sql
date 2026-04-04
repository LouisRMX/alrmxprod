-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Expand customer_members.role to owner | manager | operator
--
-- owner    = sees portfolio, reports, simulator (read-only)
-- manager  = full assessment access, fills in questions, logs tracking
-- operator = fills in assessment questions + logs weekly tracking numbers
--
-- profiles.role stays unchanged (system_admin | customer_admin | customer_user)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Drop old role constraint
ALTER TABLE public.customer_members
  DROP CONSTRAINT IF EXISTS customer_members_role_check;

-- Step 2: Add new constraint
ALTER TABLE public.customer_members
  ADD CONSTRAINT customer_members_role_check
    CHECK (role IN ('owner', 'manager', 'operator'));

-- Step 3: Migrate existing roles
UPDATE public.customer_members SET role = 'owner'   WHERE role = 'customer_admin';
UPDATE public.customer_members SET role = 'manager' WHERE role = 'customer_user';
