-- ============================================================
-- Daily Log Module — on-site trip-level data collection
-- Foundation for field observation, document upload, and audio input
-- ============================================================

-- ── 1. daily_logs ──────────────────────────────────────────────
-- One row per truck trip. Core on-site observation record.
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  plant_id          uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  logged_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  log_date          date NOT NULL,

  -- Truck and driver (free text, plants vary in naming convention)
  truck_id          text,
  driver_name       text,

  -- Site
  site_name         text,
  site_type         text CHECK (site_type IN ('ground_pour', 'high_rise', 'infrastructure', 'unknown')),

  -- Timestamps (all nullable, not all can be observed on every trip)
  departure_loaded  timestamptz,  -- truck leaves plant gate, loaded
  arrival_site      timestamptz,  -- truck arrives at construction site
  discharge_start   timestamptz,  -- pour/unloading begins
  discharge_end     timestamptz,  -- pour/unloading complete
  departure_site    timestamptz,  -- truck leaves site
  arrival_plant     timestamptz,  -- truck arrives at plant gate (physical return, NOT ready for next load)

  -- Load
  load_m3           numeric(6,2),

  -- Quality
  rejected          boolean NOT NULL DEFAULT false,
  reject_side       text CHECK (reject_side IN ('plant_side', 'customer_side')),
  reject_cause      text,

  -- Meta
  notes             text,
  data_source       text NOT NULL DEFAULT 'direct_observation'
                    CHECK (data_source IN ('direct_observation', 'document_upload', 'audio')),
  upload_id         uuid,  -- links to daily_log_uploads for document/audio sources

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.daily_logs.arrival_plant IS
  'Timestamp when truck physically arrives at plant gate after completing delivery. This is NOT when the truck is ready for next load (which includes washout, weighbridge, queue time).';

CREATE INDEX idx_daily_logs_assessment_date
  ON public.daily_logs (assessment_id, log_date DESC);

CREATE INDEX idx_daily_logs_plant_date
  ON public.daily_logs (plant_id, log_date DESC);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all daily logs"
  ON public.daily_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Customer members manage daily logs"
  ON public.daily_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.plants pl
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE pl.id = public.daily_logs.plant_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 2. intervention_logs ───────────────────────────────────────
-- Breakdowns, weather stops, quality holds, supply disruptions
CREATE TABLE IF NOT EXISTS public.intervention_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id       uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  plant_id            uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  logged_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  intervention_date   date NOT NULL,
  title               text NOT NULL,
  description         text,
  target_metric       text,
  implemented_by      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intervention_logs_assessment
  ON public.intervention_logs (assessment_id, intervention_date DESC);

ALTER TABLE public.intervention_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all intervention logs"
  ON public.intervention_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Customer members manage intervention logs"
  ON public.intervention_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.plants pl
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE pl.id = public.intervention_logs.plant_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 3. daily_log_uploads ───────────────────────────────────────
-- Source tracking for document and audio uploads
CREATE TABLE IF NOT EXISTS public.daily_log_uploads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id       uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  uploaded_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  file_type           text NOT NULL CHECK (file_type IN ('image', 'pdf', 'csv', 'excel', 'audio')),
  original_filename   text,
  storage_path        text,
  processing_status   text NOT NULL DEFAULT 'uploaded'
                      CHECK (processing_status IN ('uploaded', 'processing', 'parsed', 'approved', 'failed')),
  parsed_data         jsonb,
  raw_transcription   text,       -- Whisper output for audio sources
  translated_text     text,       -- Claude translation if source language is not English
  error_log           jsonb,
  log_date            date,
  row_count           integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_log_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all daily log uploads"
  ON public.daily_log_uploads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Customer members manage daily log uploads"
  ON public.daily_log_uploads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.daily_log_uploads.assessment_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 4. Computed views ──────────────────────────────────────────

-- Per-trip calculated fields (for outlier identification)
CREATE OR REPLACE VIEW public.daily_log_trips_computed AS
SELECT
  *,
  EXTRACT(EPOCH FROM (arrival_plant - departure_loaded)) / 60 AS tat_minutes,
  EXTRACT(EPOCH FROM (arrival_site - departure_loaded)) / 60 AS outbound_transit_minutes,
  EXTRACT(EPOCH FROM (arrival_plant - departure_site)) / 60 AS return_transit_minutes,
  EXTRACT(EPOCH FROM (discharge_start - arrival_site)) / 60 AS site_wait_minutes,
  EXTRACT(EPOCH FROM (discharge_end - discharge_start)) / 60 AS unload_minutes
FROM public.daily_logs;

-- Daily aggregates per assessment per plant
CREATE OR REPLACE VIEW public.daily_logs_computed AS
SELECT
  assessment_id,
  plant_id,
  log_date,
  COUNT(*) AS total_trips,
  COUNT(*) FILTER (WHERE rejected = true) AS reject_count,
  ROUND(
    COUNT(*) FILTER (WHERE rejected = true)::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS reject_pct,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (arrival_plant - departure_loaded)) / 60)
    FILTER (WHERE arrival_plant IS NOT NULL AND departure_loaded IS NOT NULL)::numeric, 1
  ) AS avg_tat_minutes,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (discharge_start - arrival_site)) / 60)
    FILTER (WHERE discharge_start IS NOT NULL AND arrival_site IS NOT NULL)::numeric, 1
  ) AS avg_site_wait_minutes,
  COUNT(DISTINCT truck_id) AS trucks_active
FROM public.daily_logs
GROUP BY assessment_id, plant_id, log_date;

-- Note: Storage bucket 'daily-log-uploads' (private) must be created
-- via Supabase dashboard. Path convention: daily-log-uploads/{assessment_id}/{timestamp}_{filename}
