-- Extend action_items with assignee FK and source tag
ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('ai', 'manual'));

-- Customer members: insert their own assessment's items
CREATE POLICY "members_insert_action_items" ON public.action_items FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assessments a
    JOIN public.plants pl ON pl.id = a.plant_id
    JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
    WHERE a.id = action_items.assessment_id AND cm.user_id = auth.uid()
  )
);

-- Customer members: update their own assessment's items
CREATE POLICY "members_update_action_items" ON public.action_items FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.assessments a
    JOIN public.plants pl ON pl.id = a.plant_id
    JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
    WHERE a.id = action_items.assessment_id AND cm.user_id = auth.uid()
  )
);

-- Customer members: delete their own assessment's items
CREATE POLICY "members_delete_action_items" ON public.action_items FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.assessments a
    JOIN public.plants pl ON pl.id = a.plant_id
    JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
    WHERE a.id = action_items.assessment_id AND cm.user_id = auth.uid()
  )
);
