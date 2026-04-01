-- ============================================================
-- GPS Upload Module — tables, RLS, storage
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. uploaded_gps_files ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.uploaded_gps_files (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
  original_filename text NOT NULL,
  upload_timestamp timestamptz NOT NULL DEFAULT now(),
  timezone_selected text NOT NULL DEFAULT 'AST',
  detected_format_type text CHECK (detected_format_type IN ('A', 'B', 'C')),
  mapping_template_id uuid,
  processing_status text NOT NULL DEFAULT 'uploaded'
    CHECK (processing_status IN ('uploaded', 'analyzing', 'mapping_required', 'processing', 'complete', 'failed')),
  parse_error_log jsonb,
  analysis_confidence_score numeric(4,3),
  storage_path text NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_files_assessment ON public.uploaded_gps_files (assessment_id);
ALTER TABLE public.uploaded_gps_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all GPS files"
  ON public.uploaded_gps_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Assessment owners can manage GPS files"
  ON public.uploaded_gps_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.uploaded_gps_files.assessment_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 2. mapping_templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mapping_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  template_name text NOT NULL,
  format_type text CHECK (format_type IN ('A', 'B', 'C')),
  column_mappings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mapping_templates_customer ON public.mapping_templates (customer_id);
ALTER TABLE public.mapping_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all templates"
  ON public.mapping_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Members see only their org templates"
  ON public.mapping_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_members cm
      WHERE cm.customer_id = public.mapping_templates.customer_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 3. normalized_gps_events ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.normalized_gps_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
  upload_id uuid REFERENCES public.uploaded_gps_files(id) ON DELETE CASCADE NOT NULL,
  truck_id text,
  event_timestamp timestamptz,
  stop_start_time timestamptz,
  stop_end_time timestamptz,
  location_name text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  event_type text,
  driver_id text,
  speed numeric(6,2),
  odometer numeric(10,2),
  inferred_location_type text NOT NULL DEFAULT 'unknown'
    CHECK (inferred_location_type IN ('plant', 'site', 'transit', 'unknown')),
  raw_row_reference integer,
  mapping_template_id uuid REFERENCES public.mapping_templates(id),
  derived_delivery_id text
);

CREATE INDEX IF NOT EXISTS idx_gps_events_assessment ON public.normalized_gps_events (assessment_id);
CREATE INDEX IF NOT EXISTS idx_gps_events_upload ON public.normalized_gps_events (upload_id);
CREATE INDEX IF NOT EXISTS idx_gps_events_truck ON public.normalized_gps_events (truck_id);
ALTER TABLE public.normalized_gps_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all GPS events"
  ON public.normalized_gps_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Assessment owners can view GPS events"
  ON public.normalized_gps_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.normalized_gps_events.assessment_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 4. logistics_analysis_results ───────────────────────────
CREATE TABLE IF NOT EXISTS public.logistics_analysis_results (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id uuid REFERENCES public.assessments(id) ON DELETE CASCADE NOT NULL,
  upload_id uuid REFERENCES public.uploaded_gps_files(id) ON DELETE CASCADE NOT NULL,
  -- Turnaround metrics
  avg_turnaround_minutes numeric(6,1),
  median_turnaround_minutes numeric(6,1),
  p90_turnaround_minutes numeric(6,1),
  -- Benchmark snapshot (stored at calculation time)
  target_ta_minutes numeric(6,1) NOT NULL,
  delivery_radius_km numeric(5,1) NOT NULL,
  -- Site wait metrics
  avg_waiting_time_minutes numeric(6,1),
  median_waiting_time_minutes numeric(6,1),
  -- Return loads
  probable_return_loads_count integer,
  probable_return_loads_pct numeric(5,2),
  -- Fleet metrics
  avg_trips_per_truck_per_day numeric(4,2),
  trucks_analyzed integer,
  trips_analyzed integer,
  rows_parsed_pct numeric(5,2),
  -- Analysis quality
  confidence_score numeric(4,3),
  calculation_notes text,
  -- Generated report section (template-filled, no AI)
  generated_section_text text,
  -- Status
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistics_results_assessment ON public.logistics_analysis_results (assessment_id);
ALTER TABLE public.logistics_analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System admins manage all logistics results"
  ON public.logistics_analysis_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'system_admin'
    )
  );

CREATE POLICY "Assessment owners can view logistics results"
  ON public.logistics_analysis_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.assessments a
      JOIN public.plants pl ON pl.id = a.plant_id
      JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
      WHERE a.id = public.logistics_analysis_results.assessment_id
        AND cm.user_id = auth.uid()
    )
  );

-- ── 5. Foreign key: uploaded_gps_files → mapping_templates ──
ALTER TABLE public.uploaded_gps_files
  ADD CONSTRAINT fk_gps_files_template
  FOREIGN KEY (mapping_template_id)
  REFERENCES public.mapping_templates(id)
  ON DELETE SET NULL;

-- ── 6. Supabase Storage bucket ───────────────────────────────
-- Run in Supabase dashboard > Storage or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('gps-uploads', 'gps-uploads', false);

-- Storage RLS (apply via Supabase dashboard > Storage > Policies):
-- Policy: "Assessment owners can upload GPS files"
--   Allow: INSERT
--   Check: bucket_id = 'gps-uploads' AND (storage.foldername(name))[1] = 'assessments'
--
-- Policy: "Assessment owners can read their GPS files"
--   Allow: SELECT
--   Check: bucket_id = 'gps-uploads' AND EXISTS (
--     SELECT 1 FROM public.assessments a
--     JOIN public.plants pl ON pl.id = a.plant_id
--     JOIN public.customer_members cm ON cm.customer_id = pl.customer_id
--     WHERE a.id::text = (storage.foldername(name))[2]
--       AND cm.user_id = auth.uid()
--   )
