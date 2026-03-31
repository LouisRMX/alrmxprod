-- ============================================================
-- Switch to JWT app_metadata role checks
-- Eliminates infinite recursion in profiles RLS
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Drop ALL policies that reference profiles.role ───────

-- Profiles
DROP POLICY IF EXISTS "System admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Customers
DROP POLICY IF EXISTS "System admins can manage all customers" ON public.customers;
DROP POLICY IF EXISTS "Members can view their customer" ON public.customers;

-- Plants
DROP POLICY IF EXISTS "System admins can manage all plants" ON public.plants;
DROP POLICY IF EXISTS "Members can view their plants" ON public.plants;

-- Assessments
DROP POLICY IF EXISTS "System admins can manage all assessments" ON public.assessments;
DROP POLICY IF EXISTS "Customer admins can view org assessments" ON public.assessments;
DROP POLICY IF EXISTS "Customer users can view assigned assessments" ON public.assessments;
DROP POLICY IF EXISTS "Customer users can update assigned workshop assessments" ON public.assessments;

-- Reports
DROP POLICY IF EXISTS "System admins can manage all reports" ON public.reports;
DROP POLICY IF EXISTS "Members can view released reports" ON public.reports;

-- Action items
DROP POLICY IF EXISTS "System admins can manage all action items" ON public.action_items;
DROP POLICY IF EXISTS "Members can view released action items" ON public.action_items;

-- Customer members
DROP POLICY IF EXISTS "System admins can manage all members" ON public.customer_members;
DROP POLICY IF EXISTS "Members can view their org members" ON public.customer_members;

-- Assessment assignments
DROP POLICY IF EXISTS "System admins can manage all assignments" ON public.assessment_assignments;

-- ── 2. Recreate ALL policies using auth.jwt() ──────────────

-- Helper expression used everywhere:
--   auth.jwt()->'app_metadata'->>'role' = 'system_admin'

-- == PROFILES ==

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "System admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

CREATE POLICY "System admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

-- == CUSTOMERS ==

CREATE POLICY "System admins can manage all customers"
  ON public.customers FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

CREATE POLICY "Members can view their customer"
  ON public.customers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_members cm
      WHERE cm.customer_id = public.customers.id
      AND cm.user_id = auth.uid()
    )
  );

-- == PLANTS ==

CREATE POLICY "System admins can manage all plants"
  ON public.plants FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

CREATE POLICY "Members can view their plants"
  ON public.plants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_members cm
      WHERE cm.customer_id = public.plants.customer_id
      AND cm.user_id = auth.uid()
    )
  );

-- == ASSESSMENTS ==

CREATE POLICY "System admins can manage all assessments"
  ON public.assessments FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

CREATE POLICY "Customer admins can view org assessments"
  ON public.assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.plants pl
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE pl.id = public.assessments.plant_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'customer_admin'
    )
  );

CREATE POLICY "Customer users can view assigned assessments"
  ON public.assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_assignments aa
      WHERE aa.assessment_id = public.assessments.id
      AND aa.user_id = auth.uid()
    )
    AND public.assessments.phase IN ('workshop', 'workshop_complete')
  );

CREATE POLICY "Customer users can update assigned workshop assessments"
  ON public.assessments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_assignments aa
      WHERE aa.assessment_id = public.assessments.id
      AND aa.user_id = auth.uid()
    )
    AND public.assessments.phase = 'workshop'
  );

-- == REPORTS ==

CREATE POLICY "System admins can manage all reports"
  ON public.reports FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

CREATE POLICY "Members can view released reports"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.reports.assessment_id
      AND cm.user_id = auth.uid()
      AND a.report_released = true
    )
  );

-- == ACTION ITEMS ==

CREATE POLICY "System admins can manage all action items"
  ON public.action_items FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

CREATE POLICY "Members can view released action items"
  ON public.action_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.action_items.assessment_id
      AND cm.user_id = auth.uid()
      AND a.report_released = true
    )
  );

-- == CUSTOMER MEMBERS ==

CREATE POLICY "System admins can manage all members"
  ON public.customer_members FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );

CREATE POLICY "Members can view their org members"
  ON public.customer_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_members my
      WHERE my.customer_id = public.customer_members.customer_id
      AND my.user_id = auth.uid()
    )
  );

-- == ASSESSMENT ASSIGNMENTS ==

CREATE POLICY "System admins can manage all assignments"
  ON public.assessment_assignments FOR ALL
  USING (
    (auth.jwt()->'app_metadata'->>'role') = 'system_admin'
  );
