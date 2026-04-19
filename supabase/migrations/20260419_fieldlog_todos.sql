-- ============================================================
-- Field Log To-do list
-- Per-assessment to-do items with target counts that read
-- live progress from daily_logs (e.g. "40 complete trips by Fri")
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fieldlog_todos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  plant_id        uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title           text NOT NULL,
  target_count    integer NOT NULL CHECK (target_count > 0),
  target_date     date NOT NULL,
  metric          text NOT NULL DEFAULT 'trips_complete'
                  CHECK (metric IN ('trips_complete', 'loads_delivered', 'rejected_loads')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fieldlog_todos_assessment_date
  ON public.fieldlog_todos (assessment_id, target_date ASC);

ALTER TABLE public.fieldlog_todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all fieldlog todos"
  ON public.fieldlog_todos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Customer members manage fieldlog todos"
  ON public.fieldlog_todos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.plants pl
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE pl.id = public.fieldlog_todos.plant_id
        AND cm.user_id = auth.uid()
    )
  );
