-- ============================================================
-- Trip Upload Module — manual dispatch/return CSV upload
-- Validates operational turnaround against assessment targets
-- ============================================================

-- ── 1. trip_uploads ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_uploads (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id   uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  uploaded_by     uuid REFERENCES auth.users(id),
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  trip_date       date NOT NULL,
  filename        text,
  row_count       int NOT NULL DEFAULT 0,
  valid_row_count int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_trip_uploads_assessment
  ON public.trip_uploads (assessment_id, trip_date DESC);

ALTER TABLE public.trip_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all trip uploads"
  ON public.trip_uploads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Customer members manage trip uploads"
  ON public.trip_uploads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.trip_uploads.assessment_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 2. trip_records ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_records (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_id           uuid NOT NULL REFERENCES public.trip_uploads(id) ON DELETE CASCADE,
  assessment_id       uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  truck_id            text NOT NULL,
  trip_date           date NOT NULL,

  -- Timestamps
  dispatched_at       timestamptz NOT NULL,
  site_arrival_at     timestamptz,
  site_departure_at   timestamptz,
  returned_at         timestamptz NOT NULL,

  -- Derived durations (seconds)
  turnaround_s        int NOT NULL,
  transit_to_site_s   int,
  site_dwell_s        int,
  transit_back_s      int,

  -- vs target
  turnaround_target_s int NOT NULL,
  turnaround_delay_s  int NOT NULL,

  -- Financial estimate
  est_loss_usd        numeric(8,2),

  -- Quality
  anomaly_flags       text[] NOT NULL DEFAULT '{}',
  data_completeness   text NOT NULL CHECK (data_completeness IN ('full', 'partial', 'minimal'))
);

CREATE INDEX IF NOT EXISTS idx_trip_records_assessment
  ON public.trip_records (assessment_id, trip_date DESC);

CREATE INDEX IF NOT EXISTS idx_trip_records_upload
  ON public.trip_records (upload_id);

ALTER TABLE public.trip_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all trip records"
  ON public.trip_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Customer members manage trip records"
  ON public.trip_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.trip_records.assessment_id
        AND cm.user_id = auth.uid()
    )
  );
