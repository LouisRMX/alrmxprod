export interface DailyLogRow {
  id: string
  assessment_id: string
  plant_id: string
  logged_by: string | null
  log_date: string          // 'YYYY-MM-DD'
  truck_id: string | null
  driver_name: string | null
  site_name: string | null
  site_type: 'ground_pour' | 'high_rise' | 'infrastructure' | 'unknown' | null
  departure_loaded: string | null   // ISO 8601 timestamp
  arrival_site: string | null
  discharge_start: string | null
  discharge_end: string | null
  departure_site: string | null
  arrival_plant: string | null
  // Plant-internal timing (optional)
  // 9-stage model (2026-04-20): loading_end = weighbridge start;
  // plant_prep_end = truck ready for next load (was washout_end,
  // renamed because the interval is holding water + driver break +
  // positioning, not just washout).
  loading_start: string | null
  loading_end: string | null
  plant_prep_end: string | null
  slump_pass: boolean | null
  slump_test_time: string | null
  slump_test_location: 'plant' | 'site' | null
  load_m3: number | null
  rejected: boolean
  reject_side: 'plant_side' | 'customer_side' | null
  reject_cause: string | null
  notes: string | null
  data_source: 'direct_observation' | 'document_upload' | 'audio'
  upload_id: string | null
  created_at: string
  updated_at: string
  // Live Trip Timer additions (2026-04-17 migration)
  plant_queue_start?: string | null
  measurer_name?: string | null
  is_partial?: boolean | null
  stage_notes?: Record<string, string> | null
  // Measurement scope (2026-04-20): distinguishes a full-cycle trip from
  // a deliberate single-stage sample. When mode is 'single', measured_stage
  // names which of the 9 stages the observer was timing.
  measurement_mode?: 'full' | 'single'
  measured_stage?: string | null
  // Multi-plant shared-fleet support (2026-04-18 migration)
  origin_plant?: string | null
  // Per-unit slicing inside a plant (2026-04-27 migration). NULL = rolls
  // up to origin_plant only.
  batching_unit?: string | null
  // Concrete mix / strength code (2026-05-04 migration). Free-text but
  // typically picked from the admin-curated assessment_options list.
  mix_type?: string | null
}

export interface DailyLogTripComputed extends DailyLogRow {
  tat_minutes: number | null
  outbound_transit_minutes: number | null
  return_transit_minutes: number | null
  site_wait_minutes: number | null
  unload_minutes: number | null
  // Plant-internal computed
  loading_minutes: number | null
  washout_minutes_measured: number | null
}

export interface ComputedSummary {
  assessment_id: string
  plant_id: string
  log_date: string
  total_trips: number
  reject_count: number
  reject_pct: number | null
  avg_tat_minutes: number | null
  avg_site_wait_minutes: number | null
  trucks_active: number
}

export interface InterventionRow {
  id: string
  assessment_id: string
  plant_id: string
  logged_by: string | null
  intervention_date: string
  title: string
  description: string | null
  target_metric: string | null
  implemented_by: string | null
  created_at: string
}

export interface DailyLogUpload {
  id: string
  assessment_id: string
  uploaded_by: string | null
  file_type: 'image' | 'pdf' | 'csv' | 'excel' | 'audio'
  original_filename: string | null
  storage_path: string | null
  processing_status: 'uploaded' | 'processing' | 'parsed' | 'approved' | 'failed'
  parsed_data: Partial<DailyLogRow>[] | null
  raw_transcription: string | null
  translated_text: string | null
  error_log: unknown | null
  log_date: string | null
  row_count: number | null
  created_at: string
}
