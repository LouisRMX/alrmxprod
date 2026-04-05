-- Daily ops log for the 90-day tracker
-- One row per plant per calendar day: deliveries completed (required),
-- orders received (optional), rejects (optional).
-- Drives the 30-day trend chart + 7-day rolling average in TrackingTab.

CREATE TABLE public.daily_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     uuid REFERENCES public.tracking_configs(id) ON DELETE CASCADE NOT NULL,
  logged_date   date NOT NULL,
  logged_at     timestamptz NOT NULL DEFAULT now(),
  logged_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deliveries_completed integer NOT NULL,
  orders_received      integer,
  rejects              integer,
  UNIQUE(config_id, logged_date)
);

ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;

-- System admins: full access
CREATE POLICY "system_admin_all" ON public.daily_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'system_admin')
  );

-- Customer members: insert for their own assessments
CREATE POLICY "members_insert" ON public.daily_entries FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tracking_configs tc
    JOIN public.assessments a ON a.id = tc.assessment_id
    JOIN public.plants pl ON pl.id = a.plant_id
    JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
    WHERE tc.id = daily_entries.config_id AND cm.user_id = auth.uid()
  )
);

-- Customer members: update their own entries
CREATE POLICY "members_update" ON public.daily_entries FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.tracking_configs tc
    JOIN public.assessments a ON a.id = tc.assessment_id
    JOIN public.plants pl ON pl.id = a.plant_id
    JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
    WHERE tc.id = daily_entries.config_id AND cm.user_id = auth.uid()
  )
);

-- Customer members: select for their own assessments
CREATE POLICY "members_select" ON public.daily_entries FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.tracking_configs tc
    JOIN public.assessments a ON a.id = tc.assessment_id
    JOIN public.plants pl ON pl.id = a.plant_id
    JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
    WHERE tc.id = daily_entries.config_id AND cm.user_id = auth.uid()
  )
);
