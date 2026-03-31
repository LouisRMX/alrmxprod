-- ============================================================
-- Customer onboarding: roles, members, assignments, report release
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Expand role enum ─────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('system_admin', 'customer_admin', 'customer_user'));

-- Migrate existing roles
UPDATE public.profiles SET role = 'system_admin' WHERE role = 'admin';
UPDATE public.profiles SET role = 'customer_user' WHERE role = 'customer';

-- Update the auto-create trigger to default to 'customer_user'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'role', 'customer_user')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Customer members table ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'customer_user'
    CHECK (role IN ('customer_admin', 'customer_user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_members_customer ON public.customer_members (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_members_user ON public.customer_members (user_id);

ALTER TABLE public.customer_members ENABLE ROW LEVEL SECURITY;

-- System admins manage all members
CREATE POLICY "System admins can manage all members"
  ON public.customer_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- Members can view their own org's members
CREATE POLICY "Members can view their org members"
  ON public.customer_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_members my
      WHERE my.customer_id = public.customer_members.customer_id
      AND my.user_id = auth.uid()
    )
  );

-- ── 3. Assessment assignments table ─────────────────────────
CREATE TABLE IF NOT EXISTS public.assessment_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_assessment_assignments_assessment ON public.assessment_assignments (assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_assignments_user ON public.assessment_assignments (user_id);

ALTER TABLE public.assessment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins can manage all assignments"
  ON public.assessment_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- ── 4. Add phase and report_released to assessments ─────────
-- phase may already exist as it's used in code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessments' AND column_name = 'phase'
  ) THEN
    ALTER TABLE public.assessments
      ADD COLUMN phase text NOT NULL DEFAULT 'workshop';
  END IF;
END $$;

-- Add check constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'assessments' AND constraint_name = 'assessments_phase_check'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_phase_check
        CHECK (phase IN ('workshop', 'workshop_complete', 'onsite', 'complete'));
  END IF;
END $$;

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS report_released boolean NOT NULL DEFAULT false;

-- ── 5. Replace customer-facing RLS policies ─────────────────

-- Update system admin policies to use new role name
DROP POLICY IF EXISTS "Admins can manage all customers" ON public.customers;
CREATE POLICY "System admins can manage all customers"
  ON public.customers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all plants" ON public.plants;
CREATE POLICY "System admins can manage all plants"
  ON public.plants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all assessments" ON public.assessments;
CREATE POLICY "System admins can manage all assessments"
  ON public.assessments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all reports" ON public.reports;
CREATE POLICY "System admins can manage all reports"
  ON public.reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage all action items" ON public.action_items;
CREATE POLICY "System admins can manage all action items"
  ON public.action_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

-- Drop old customer-facing policies (email-based)
DROP POLICY IF EXISTS "Customers can view their own record" ON public.customers;
DROP POLICY IF EXISTS "Customers can view their plants" ON public.plants;
DROP POLICY IF EXISTS "Customers can view their assessments" ON public.assessments;
DROP POLICY IF EXISTS "Customers can view their reports" ON public.reports;
DROP POLICY IF EXISTS "Customers can view their action items" ON public.action_items;

-- New member-based customer policies
CREATE POLICY "Members can view their customer"
  ON public.customers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_members cm
      WHERE cm.customer_id = public.customers.id
      AND cm.user_id = auth.uid()
    )
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

-- Customer admins see all assessments for their org
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

-- Customer users see only assigned assessments in workshop phases
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

-- Customer users can UPDATE their assigned workshop assessments (to save answers)
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

-- Reports: only visible when released
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

-- Action items: same visibility as released reports
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

-- Update admin profile policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "System admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );
