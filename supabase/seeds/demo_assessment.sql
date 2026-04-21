-- ============================================================
-- Demo assessment seed — alrmx Consulting / Demo Riyadh
--
-- Target IDs (hardcoded; update if your demo IDs change):
--   customer_id:   b8f426ff-8554-4bcd-aa3b-ee862981b0f2
--   plant_id:      f0d7daf0-c7db-4979-a501-bf0de19761cc
--   assessment_id: 38349219-7ddc-4932-8005-36fe508eb73a
--
-- Run this in Supabase SQL Editor. Idempotent: wipes the demo rows
-- before reinserting so you can re-run after app changes that add
-- new columns.
--
-- Generates:
--   * Workshop + on-site answers (matches DemoView's hardcoded demo)
--   * Focus actions (3 items)
--   * Tracking config with baseline / target / coefficients
--   * 3 weekly tracking entries (weeks 1-3)
--   * 3 intervention logs with dates spread across the 14-day window
--   * 2 fieldlog_todos with realistic targets
--   * 35 daily_logs over 2026-04-07 to 2026-04-20 with:
--       - 9-stage timestamps (realistic GCC TAT 60-130 min, 2-3 outliers)
--       - site_type mix (40% ground_pour, 25% high_rise, 15% road, etc.)
--       - ~5% rejected loads
--       - ~20% with slump tests logged (plant + site mix)
--       - 70% full / 20% single-stage / 10% partial measurement modes
--       - 3 measurer names, 6 truck IDs, 5 site names
-- ============================================================

BEGIN;

-- ── Reset demo-scoped rows ──────────────────────────────────
DELETE FROM public.daily_logs WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a';
DELETE FROM public.fieldlog_todos WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a';
DELETE FROM public.intervention_logs WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a';
DELETE FROM public.tracking_entries WHERE config_id IN (
  SELECT id FROM public.tracking_configs
  WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a'
);
DELETE FROM public.tracking_configs WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a';

-- ── 1. Answers + focus actions on the assessment row ────────
UPDATE public.assessments
SET
  phase = 'onsite',
  answers = jsonb_build_object(
    -- Workshop (pre-assessment) answers
    'price_m3',           '64',
    'material_cost',      '31',
    'cement_cost',        '18',
    'aggregate_cost',     '9',
    'admix_cost',         '4',
    'plant_cap',          '90',
    'op_hours',           '12',
    'op_days',            '260',
    'n_trucks',           '24',
    'delivery_radius',    '16',
    'dispatch_tool',      'Spreadsheet combined with WhatsApp',
    'prod_data_source',   'System records, read from batch computer or dispatch system',
    'biggest_pain',       'Trucks wait too long at construction sites. We lose 2-3 hours of productive time every morning because sites are not ready when trucks arrive.',
    'demand_sufficient',  'Operations, we have more demand than we can currently produce or deliver',
    -- On-site verified values (differ from self-reported)
    'actual_prod',        '15800',
    'deliveries_day',     '98',
    'turnaround',         '112',
    'reject_pct',         '3.8',
    'order_to_dispatch',  '25 to 40 minutes, slow',
    'fuel_per_delivery',  '6',
    'water_cost',         '0',
    -- Production depth
    'batch_cycle',        'Normal, 5 to 7 minutes',
    'batch_calibration',  '1 to 2 years ago',
    'stops_freq',         '1 to 2 stops',
    'operator_backup',    'Partially, someone could manage but has limited experience',
    'mix_design_review',  '1 to 3 years ago',
    'admix_strategy',     'Workability only, admixtures used to improve flow and placement',
    -- Dispatch depth
    'order_notice',       '4 to 24 hours, day-of or day-before',
    'route_clustering',   'Sometimes, depends on the dispatcher',
    'plant_idle',         'Regularly, most busy periods',
    -- Quality & maintenance
    'maint_programme',    'Informal, some checks but no written programme',
    'truck_breakdowns',   '7',
    'return_liability',   'Plant always absorbs the cost',
    'demurrage_policy',   'Clause exists but rarely enforced',
    'top_customer_pct',   '41',
    'quality_control',    'Usually done, most trucks, informal recording',
    'reject_cause',       'Heat and slump loss during transit, loads batched before 09:00 arriving outside spec at peak summer sites',
    'surplus_concrete',   '0.2 to 0.5 m3, moderate',
    'summer_cooling',     'Partial, cold tap water or shaded aggregate storage only',
    'breakdowns',         '2 to 3, acceptable',
    -- Data quality (on-site observed)
    'data_freshness',     'Today''s operation, figures from this visit',
    'data_observed',      'Seen on screen, batch computer, dispatch system, or printout',
    'data_crosscheck',    'Partially, one or two figures cross-checked',
    'data_confidence_self', 'Medium, reasonable but I''d verify one or two before presenting',
    'data_days_match',    'Yes, all from the same month',
    'summer_prod_drop',   '20 to 30%, significant drop during June to September'
  ),
  focus_actions = ARRAY[
    'Implement dispatch SOP: order-to-dispatch under 20 min. Pre-load 3 trucks before first orders and assign a dedicated dispatcher with a fixed zone map.',
    'Enforce demurrage clause: 45-min site limit with $25/15-min charge. Communicate to top 3 contractors this week.',
    'Run turnaround audit: time-stamp 5 full truck cycles and map where the 112 minutes goes before committing to further actions.'
  ]
WHERE id = '38349219-7ddc-4932-8005-36fe508eb73a';

-- ── 2. Tracking config ──────────────────────────────────────
INSERT INTO public.tracking_configs (
  assessment_id, started_at,
  baseline_turnaround, baseline_reject_pct, baseline_dispatch_min,
  target_turnaround,   target_reject_pct,   target_dispatch_min,
  track_turnaround, track_reject, track_dispatch,
  coeff_turnaround, coeff_reject,
  baseline_monthly_loss,
  consent_case_study
) VALUES (
  '38349219-7ddc-4932-8005-36fe508eb73a',
  '2026-04-07',
  112, 3.8, 32,      -- baseline
  84,  2.0, 18,      -- target
  true, true, true,
  1200, 15000,       -- $/month per unit improvement
  136000,            -- total monthly loss at baseline
  true
);

-- ── 3. Weekly tracking entries (week 1-3) ───────────────────
WITH cfg AS (
  SELECT id FROM public.tracking_configs
  WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a'
)
INSERT INTO public.tracking_entries (config_id, week_number, logged_at, turnaround_min, reject_pct, dispatch_min, notes)
SELECT cfg.id, v.week_number, v.logged_at, v.turnaround_min, v.reject_pct, v.dispatch_min, v.notes
FROM cfg, (VALUES
  (1, '2026-04-13 18:00:00+03'::timestamptz, 108, 3.5, 30, 'Baseline week after dispatch SOP rollout. Small reduction as dispatcher adjusts to 20-min rule.'),
  (2, '2026-04-20 18:00:00+03'::timestamptz, 100, 3.1, 26, 'Demurrage clause communicated to top 3 contractors mid-week. Site wait dropping.'),
  (3, '2026-04-27 18:00:00+03'::timestamptz,  94, 2.7, 22, 'Retarder on loads arriving after 10:00 shows effect. Reject rate down from 3.5 to 2.7%.')
) AS v(week_number, logged_at, turnaround_min, reject_pct, dispatch_min, notes);

-- ── 4. Intervention logs ────────────────────────────────────
INSERT INTO public.intervention_logs (assessment_id, plant_id, intervention_date, title, description, target_metric, implemented_by)
VALUES
  ('38349219-7ddc-4932-8005-36fe508eb73a', 'f0d7daf0-c7db-4979-a501-bf0de19761cc',
    '2026-04-08',
    'Tighten dispatch window: order-to-dispatch 25 -> 18 min',
    'Pre-load 3 trucks before 07:30. Dedicated dispatcher, fixed zone map (North/East/South). Expected -7 min on dispatch time, -3 min on cycle TAT via reduced handoff.',
    'dispatch', 'Ahmed (dispatch lead)'),
  ('38349219-7ddc-4932-8005-36fe508eb73a', 'f0d7daf0-c7db-4979-a501-bf0de19761cc',
    '2026-04-12',
    'Demurrage clause enforced on top 3 contractors',
    '45-min site-wait limit with $25/15-min charge. Communicated to Al-Bawani, Saudi Readymix, and Dar Al-Arkan. Expected -10 min site_wait by week 3.',
    'site_wait', 'Louis (consultant)'),
  ('38349219-7ddc-4932-8005-36fe508eb73a', 'f0d7daf0-c7db-4979-a501-bf0de19761cc',
    '2026-04-15',
    'Retarder dosage increased on post-10:00 summer loads',
    'Admixture SOP: +0.3% retarder for any load batched after 10:00 with forecast site arrival > 25 min. Counteracts slump loss during summer transit.',
    'reject_pct', 'Khalid (QC lead)');

-- ── 5. Field-log to-dos ─────────────────────────────────────
INSERT INTO public.fieldlog_todos (assessment_id, plant_id, title, target_count, target_date, metric, created_at)
VALUES
  ('38349219-7ddc-4932-8005-36fe508eb73a', 'f0d7daf0-c7db-4979-a501-bf0de19761cc',
    'Measure 40 complete trips for baseline TAT', 40, '2026-04-24', 'trips_complete', '2026-04-10 08:00:00+03'),
  ('38349219-7ddc-4932-8005-36fe508eb73a', 'f0d7daf0-c7db-4979-a501-bf0de19761cc',
    'Track 15 site-rejected loads for root-cause analysis', 15, '2026-05-05', 'rejected_loads', '2026-04-12 10:00:00+03');

-- ── 6. Daily logs: 35 trips over 14 days ────────────────────
-- Timezone: Saudi Arabia (+03:00). Realistic GCC TAT, mix of site
-- types, 2 outliers, ~5% rejects, ~20% slump tests.
INSERT INTO public.daily_logs (
  assessment_id, plant_id, logged_by, log_date,
  truck_id, driver_name, site_name, site_type, measurer_name, origin_plant,
  plant_queue_start, loading_start, loading_end, departure_loaded,
  arrival_site, discharge_start, discharge_end, departure_site,
  arrival_plant, plant_prep_end,
  load_m3, rejected, reject_side, reject_cause,
  slump_pass, slump_test_time, slump_test_location,
  measurement_mode, measured_stage, is_partial,
  stage_notes, notes, data_source
) VALUES
-- Day 1 (Mon 2026-04-07) — 3 trips, baseline week
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-07','TR-14','Ahmed','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-07 07:05:00+03','2026-04-07 07:11:00+03','2026-04-07 07:15:00+03','2026-04-07 07:18:00+03',
 '2026-04-07 07:42:00+03','2026-04-07 07:55:00+03','2026-04-07 08:25:00+03','2026-04-07 08:30:00+03',
 '2026-04-07 08:55:00+03','2026-04-07 09:10:00+03',
 7.0,false,NULL,NULL, true,'2026-04-07 07:08:00+03','plant', 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-07','TR-22','Khalid','King Fahd Rd Sector C','road_pavement','Ali','Riyadh North',
 '2026-04-07 08:30:00+03','2026-04-07 08:36:00+03','2026-04-07 08:41:00+03','2026-04-07 08:44:00+03',
 '2026-04-07 08:58:00+03','2026-04-07 09:02:00+03','2026-04-07 09:22:00+03','2026-04-07 09:27:00+03',
 '2026-04-07 09:42:00+03','2026-04-07 09:55:00+03',
 6.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-07','TR-31','Mohammed','Al Khor Warehouse Slab','industrial','Mohammed','Riyadh North',
 '2026-04-07 10:15:00+03','2026-04-07 10:20:00+03','2026-04-07 10:24:00+03','2026-04-07 10:27:00+03',
 '2026-04-07 10:48:00+03','2026-04-07 10:52:00+03','2026-04-07 11:15:00+03','2026-04-07 11:20:00+03',
 '2026-04-07 11:40:00+03','2026-04-07 11:55:00+03',
 7.2,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
-- Day 2 (Tue 2026-04-08) — 3 trips, dispatch SOP rollout day
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-08','TR-11','Saleh','Villa Compound Sector D','ground_pour','Louis','Riyadh North',
 '2026-04-08 07:10:00+03','2026-04-08 07:17:00+03','2026-04-08 07:21:00+03','2026-04-08 07:24:00+03',
 '2026-04-08 07:40:00+03','2026-04-08 07:44:00+03','2026-04-08 07:59:00+03','2026-04-08 08:03:00+03',
 '2026-04-08 08:20:00+03','2026-04-08 08:35:00+03',
 6.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-08','TR-14','Ahmed','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-08 09:00:00+03','2026-04-08 09:08:00+03','2026-04-08 09:13:00+03','2026-04-08 09:16:00+03',
 '2026-04-08 09:41:00+03','2026-04-08 09:55:00+03','2026-04-08 10:28:00+03','2026-04-08 10:33:00+03',
 '2026-04-08 11:00:00+03','2026-04-08 11:15:00+03',
 7.0,false,NULL,NULL, true,'2026-04-08 09:45:00+03','site', 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-08','TR-40','Yousef','King Fahd Rd Sector C','road_pavement','Ali','Riyadh North',
 '2026-04-08 13:25:00+03','2026-04-08 13:31:00+03','2026-04-08 13:35:00+03','2026-04-08 13:38:00+03',
 '2026-04-08 13:52:00+03','2026-04-08 13:56:00+03','2026-04-08 14:12:00+03','2026-04-08 14:16:00+03',
 '2026-04-08 14:30:00+03','2026-04-08 14:43:00+03',
 7.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
-- Day 3 (Wed 2026-04-09) — 2 trips, one rejected
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-09','TR-22','Khalid','Al Khor Warehouse Slab','industrial','Mohammed','Riyadh North',
 '2026-04-09 07:20:00+03','2026-04-09 07:26:00+03','2026-04-09 07:30:00+03','2026-04-09 07:33:00+03',
 '2026-04-09 07:54:00+03','2026-04-09 07:58:00+03','2026-04-09 08:20:00+03','2026-04-09 08:25:00+03',
 '2026-04-09 08:46:00+03','2026-04-09 09:02:00+03',
 7.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-09','TR-31','Mohammed','Villa Compound Sector D','ground_pour','Louis','Riyadh North',
 '2026-04-09 10:40:00+03','2026-04-09 10:46:00+03','2026-04-09 10:50:00+03','2026-04-09 10:53:00+03',
 '2026-04-09 11:10:00+03','2026-04-09 11:14:00+03',NULL,NULL,
 NULL,NULL,
 6.0,true,'customer_side','Slump loss during transit, site rejected at arrival', false,'2026-04-09 11:15:00+03','site', 'full',NULL,true, NULL,'Rejected at site — load returned to plant; surplus used for plant apron pour.','direct_observation'),
-- Day 4 (Thu 2026-04-10) — 3 trips
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-10','TR-11','Saleh','Highway 40 km 47','road_pavement','Ali','Riyadh North',
 '2026-04-10 07:05:00+03','2026-04-10 07:11:00+03','2026-04-10 07:15:00+03','2026-04-10 07:18:00+03',
 '2026-04-10 07:40:00+03','2026-04-10 07:44:00+03','2026-04-10 08:04:00+03','2026-04-10 08:08:00+03',
 '2026-04-10 08:30:00+03','2026-04-10 08:43:00+03',
 7.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-10','TR-14','Ahmed','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-10 09:10:00+03','2026-04-10 09:16:00+03','2026-04-10 09:20:00+03','2026-04-10 09:23:00+03',
 '2026-04-10 09:52:00+03','2026-04-10 10:08:00+03','2026-04-10 10:42:00+03','2026-04-10 10:47:00+03',
 '2026-04-10 11:15:00+03','2026-04-10 11:30:00+03',
 7.0,false,NULL,NULL, true,'2026-04-10 09:54:00+03','plant', 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-10','TR-28','Fahad','Riyadh Metro Line 6','bridge_deck','Mohammed','Riyadh North',
 '2026-04-10 13:30:00+03','2026-04-10 13:38:00+03','2026-04-10 13:44:00+03','2026-04-10 13:47:00+03',
 '2026-04-10 14:12:00+03','2026-04-10 14:35:00+03','2026-04-10 15:20:00+03','2026-04-10 15:27:00+03',
 '2026-04-10 15:55:00+03','2026-04-10 16:12:00+03',
 6.5,false,NULL,NULL, true,'2026-04-10 13:41:00+03','plant', 'full',NULL,false, NULL,NULL,'direct_observation'),
-- Day 5 (Fri 2026-04-11) — single-stage sampling day (pouring only)
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-11','TR-22','Khalid','Al Khor Warehouse Slab','industrial','Louis','Riyadh North',
 NULL,NULL,NULL,NULL, NULL,'2026-04-11 08:15:00+03','2026-04-11 08:38:00+03',NULL, NULL,NULL,
 7.0,false,NULL,NULL, NULL,NULL,NULL, 'single','pouring',true, NULL,'Single-stage: measuring only pouring duration for 4 loads at Al Khor to baseline site-side pump rate.','direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-11','TR-40','Yousef','Al Khor Warehouse Slab','industrial','Louis','Riyadh North',
 NULL,NULL,NULL,NULL, NULL,'2026-04-11 09:10:00+03','2026-04-11 09:32:00+03',NULL, NULL,NULL,
 7.0,false,NULL,NULL, NULL,NULL,NULL, 'single','pouring',true, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-11','TR-11','Saleh','Al Khor Warehouse Slab','industrial','Louis','Riyadh North',
 NULL,NULL,NULL,NULL, NULL,'2026-04-11 10:05:00+03','2026-04-11 10:30:00+03',NULL, NULL,NULL,
 7.5,false,NULL,NULL, NULL,NULL,NULL, 'single','pouring',true, NULL,NULL,'direct_observation'),
-- Day 6 (Sat 2026-04-12) — 3 trips, outlier trip
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-12','TR-14','Ahmed','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-12 07:20:00+03','2026-04-12 07:27:00+03','2026-04-12 07:31:00+03','2026-04-12 07:34:00+03',
 '2026-04-12 08:00:00+03','2026-04-12 08:15:00+03','2026-04-12 08:50:00+03','2026-04-12 08:55:00+03',
 '2026-04-12 09:25:00+03','2026-04-12 09:40:00+03',
 7.0,false,NULL,NULL, true,'2026-04-12 08:20:00+03','site', 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-12','TR-28','Fahad','King Fahd Rd Sector C','road_pavement','Mohammed','Riyadh North',
 '2026-04-12 10:00:00+03','2026-04-12 10:06:00+03','2026-04-12 10:10:00+03','2026-04-12 10:13:00+03',
 '2026-04-12 10:28:00+03','2026-04-12 10:32:00+03','2026-04-12 10:48:00+03','2026-04-12 10:53:00+03',
 '2026-04-12 11:10:00+03','2026-04-12 11:23:00+03',
 7.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-12','TR-31','Mohammed','Villa Compound Sector D','ground_pour','Louis','Riyadh North',
 '2026-04-12 13:00:00+03','2026-04-12 13:08:00+03','2026-04-12 13:12:00+03','2026-04-12 13:15:00+03',
 '2026-04-12 13:32:00+03','2026-04-12 16:48:00+03','2026-04-12 17:12:00+03','2026-04-12 17:18:00+03',
 '2026-04-12 17:40:00+03','2026-04-12 17:55:00+03',
 6.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false,
 '{"site_wait": "Pump truck broke down on arrival, waited 3h 10m for replacement."}'::jsonb,
 'Outlier — pump truck breakdown at site caused 190-min site_wait. Included in review queue.','direct_observation'),
-- Day 7 (Sun 2026-04-13) — 2 trips, end of week 1
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-13','TR-11','Saleh','Villa Compound Sector D','ground_pour','Ali','Riyadh North',
 '2026-04-13 07:35:00+03','2026-04-13 07:41:00+03','2026-04-13 07:45:00+03','2026-04-13 07:48:00+03',
 '2026-04-13 08:04:00+03','2026-04-13 08:08:00+03','2026-04-13 08:22:00+03','2026-04-13 08:26:00+03',
 '2026-04-13 08:42:00+03','2026-04-13 08:57:00+03',
 6.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-13','TR-22','Khalid','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-13 09:50:00+03','2026-04-13 09:57:00+03','2026-04-13 10:01:00+03','2026-04-13 10:04:00+03',
 '2026-04-13 10:30:00+03','2026-04-13 10:42:00+03','2026-04-13 11:15:00+03','2026-04-13 11:20:00+03',
 '2026-04-13 11:48:00+03','2026-04-13 12:03:00+03',
 7.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
-- Day 8 (Mon 2026-04-14) — 3 trips, week 2 begins with demurrage enforcement
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-14','TR-14','Ahmed','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-14 07:00:00+03','2026-04-14 07:06:00+03','2026-04-14 07:10:00+03','2026-04-14 07:13:00+03',
 '2026-04-14 07:38:00+03','2026-04-14 07:48:00+03','2026-04-14 08:18:00+03','2026-04-14 08:23:00+03',
 '2026-04-14 08:48:00+03','2026-04-14 09:02:00+03',
 7.0,false,NULL,NULL, true,'2026-04-14 07:08:00+03','plant', 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-14','TR-40','Yousef','Highway 40 km 47','road_pavement','Mohammed','Riyadh North',
 '2026-04-14 08:15:00+03','2026-04-14 08:21:00+03','2026-04-14 08:25:00+03','2026-04-14 08:28:00+03',
 '2026-04-14 08:48:00+03','2026-04-14 08:52:00+03','2026-04-14 09:10:00+03','2026-04-14 09:14:00+03',
 '2026-04-14 09:34:00+03','2026-04-14 09:47:00+03',
 7.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-14','TR-28','Fahad','Riyadh Metro Line 6','bridge_deck','Mohammed','Riyadh North',
 '2026-04-14 11:20:00+03','2026-04-14 11:27:00+03','2026-04-14 11:32:00+03','2026-04-14 11:35:00+03',
 '2026-04-14 12:00:00+03','2026-04-14 12:22:00+03','2026-04-14 13:05:00+03','2026-04-14 13:12:00+03',
 '2026-04-14 13:38:00+03','2026-04-14 13:54:00+03',
 6.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
-- Day 9 (Tue 2026-04-15) — 2 trips
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-15','TR-11','Saleh','Villa Compound Sector D','ground_pour','Louis','Riyadh North',
 '2026-04-15 07:10:00+03','2026-04-15 07:15:00+03','2026-04-15 07:19:00+03','2026-04-15 07:22:00+03',
 '2026-04-15 07:38:00+03','2026-04-15 07:42:00+03','2026-04-15 07:56:00+03','2026-04-15 08:00:00+03',
 '2026-04-15 08:16:00+03','2026-04-15 08:30:00+03',
 6.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-15','TR-31','Mohammed','Al Khor Warehouse Slab','industrial','Louis','Riyadh North',
 '2026-04-15 09:45:00+03','2026-04-15 09:51:00+03','2026-04-15 09:55:00+03','2026-04-15 09:58:00+03',
 '2026-04-15 10:18:00+03','2026-04-15 10:22:00+03','2026-04-15 10:44:00+03','2026-04-15 10:48:00+03',
 '2026-04-15 11:08:00+03','2026-04-15 11:23:00+03',
 7.2,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
-- Day 10 (Wed 2026-04-16) — 3 trips, reject on high-rise
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-16','TR-14','Ahmed','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-16 07:15:00+03','2026-04-16 07:22:00+03','2026-04-16 07:26:00+03','2026-04-16 07:29:00+03',
 '2026-04-16 07:54:00+03','2026-04-16 08:07:00+03','2026-04-16 08:40:00+03','2026-04-16 08:45:00+03',
 '2026-04-16 09:10:00+03','2026-04-16 09:24:00+03',
 7.0,false,NULL,NULL, true,'2026-04-16 07:24:00+03','plant', 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-16','TR-22','Khalid','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-16 10:00:00+03','2026-04-16 10:07:00+03','2026-04-16 10:11:00+03','2026-04-16 10:14:00+03',
 '2026-04-16 10:42:00+03','2026-04-16 10:58:00+03',NULL,NULL, NULL,NULL,
 7.0,true,'customer_side','Slump below 100mm on arrival, ambient 41°C, batched 09:30', false,'2026-04-16 10:44:00+03','site', 'full',NULL,true, NULL,'Rejected at site. Caused Khalid to return unused; half-load dumped at plant apron.','direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-16','TR-40','Yousef','Highway 40 km 47','road_pavement','Mohammed','Riyadh North',
 '2026-04-16 13:10:00+03','2026-04-16 13:15:00+03','2026-04-16 13:19:00+03','2026-04-16 13:22:00+03',
 '2026-04-16 13:41:00+03','2026-04-16 13:45:00+03','2026-04-16 14:02:00+03','2026-04-16 14:06:00+03',
 '2026-04-16 14:27:00+03','2026-04-16 14:41:00+03',
 7.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
-- Day 11 (Thu 2026-04-17) — 2 trips, one partial save
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-17','TR-11','Saleh','Villa Compound Sector D','ground_pour','Ali','Riyadh North',
 '2026-04-17 07:40:00+03','2026-04-17 07:46:00+03','2026-04-17 07:50:00+03','2026-04-17 07:53:00+03',
 '2026-04-17 08:09:00+03','2026-04-17 08:13:00+03','2026-04-17 08:27:00+03','2026-04-17 08:31:00+03',
 '2026-04-17 08:47:00+03','2026-04-17 09:01:00+03',
 6.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-17','TR-28','Fahad','Riyadh Metro Line 6','bridge_deck','Mohammed','Riyadh North',
 '2026-04-17 10:20:00+03','2026-04-17 10:27:00+03','2026-04-17 10:32:00+03','2026-04-17 10:35:00+03',
 '2026-04-17 11:00:00+03','2026-04-17 11:20:00+03','2026-04-17 11:58:00+03',NULL, NULL,NULL,
 6.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,true,
 '{"departure_site": "Truck dispatched to urgent second pour before return tap was logged."}'::jsonb,
 'Partial save — second-stage dispatch pulled truck before transit_back captured.','direct_observation'),
-- Day 12 (Fri 2026-04-18) — 3 trips
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-18','TR-22','Khalid','Villa Compound Sector D','ground_pour','Louis','Riyadh North',
 '2026-04-18 07:30:00+03','2026-04-18 07:36:00+03','2026-04-18 07:40:00+03','2026-04-18 07:43:00+03',
 '2026-04-18 07:59:00+03','2026-04-18 08:03:00+03','2026-04-18 08:17:00+03','2026-04-18 08:21:00+03',
 '2026-04-18 08:38:00+03','2026-04-18 08:52:00+03',
 6.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-18','TR-31','Mohammed','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-18 09:05:00+03','2026-04-18 09:12:00+03','2026-04-18 09:16:00+03','2026-04-18 09:19:00+03',
 '2026-04-18 09:43:00+03','2026-04-18 09:54:00+03','2026-04-18 10:26:00+03','2026-04-18 10:31:00+03',
 '2026-04-18 10:56:00+03','2026-04-18 11:10:00+03',
 7.0,false,NULL,NULL, true,'2026-04-18 09:14:00+03','plant', 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-18','TR-14','Ahmed','King Fahd Rd Sector C','road_pavement','Mohammed','Riyadh North',
 '2026-04-18 12:40:00+03','2026-04-18 12:45:00+03','2026-04-18 12:49:00+03','2026-04-18 12:52:00+03',
 '2026-04-18 13:07:00+03','2026-04-18 13:11:00+03','2026-04-18 13:28:00+03','2026-04-18 13:32:00+03',
 '2026-04-18 13:48:00+03','2026-04-18 14:02:00+03',
 7.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
-- Day 13 (Sat 2026-04-19) — 3 trips, marine project + second outlier
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-19','TR-40','Yousef','Al Qadisiyah Marina Extension','marine','Mohammed','Riyadh North',
 '2026-04-19 07:00:00+03','2026-04-19 07:07:00+03','2026-04-19 07:12:00+03','2026-04-19 07:15:00+03',
 '2026-04-19 07:52:00+03','2026-04-19 08:20:00+03','2026-04-19 08:58:00+03','2026-04-19 09:05:00+03',
 '2026-04-19 09:42:00+03','2026-04-19 10:00:00+03',
 6.5,false,NULL,NULL, true,'2026-04-19 07:14:00+03','plant', 'full',NULL,false,
 '{"site_wait": "Tide window narrow, crane positioning required 28 min."}'::jsonb, NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-19','TR-28','Fahad','Villa Compound Sector D','ground_pour','Louis','Riyadh North',
 '2026-04-19 09:30:00+03','2026-04-19 09:36:00+03','2026-04-19 09:40:00+03','2026-04-19 09:43:00+03',
 '2026-04-19 10:00:00+03','2026-04-19 10:04:00+03','2026-04-19 10:19:00+03','2026-04-19 10:23:00+03',
 '2026-04-19 10:40:00+03','2026-04-19 10:54:00+03',
 6.0,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-19','TR-11','Saleh','Highway 40 km 47','road_pavement','Ali','Riyadh North',
 '2026-04-19 11:00:00+03','2026-04-19 11:06:00+03','2026-04-19 11:10:00+03','2026-04-19 11:13:00+03',
 '2026-04-19 13:28:00+03','2026-04-19 13:35:00+03','2026-04-19 13:52:00+03','2026-04-19 13:56:00+03',
 '2026-04-19 14:15:00+03','2026-04-19 14:30:00+03',
 7.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false,
 '{"transit_out": "Stuck in Riyadh Ring Road traffic, detour added 2h to transit."}'::jsonb,
 'Outlier — traffic detour on Ring Road caused 135-min transit. Flagged for review.','direct_observation'),
-- Day 14 (Sun 2026-04-20) — 3 trips, end of window
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-20','TR-22','Khalid','Al Khor Warehouse Slab','industrial','Mohammed','Riyadh North',
 '2026-04-20 07:20:00+03','2026-04-20 07:26:00+03','2026-04-20 07:30:00+03','2026-04-20 07:33:00+03',
 '2026-04-20 07:52:00+03','2026-04-20 07:56:00+03','2026-04-20 08:17:00+03','2026-04-20 08:21:00+03',
 '2026-04-20 08:42:00+03','2026-04-20 08:56:00+03',
 7.2,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-20','TR-14','Ahmed','Marina Tower B3','high_rise','Ali','Riyadh North',
 '2026-04-20 09:00:00+03','2026-04-20 09:07:00+03','2026-04-20 09:11:00+03','2026-04-20 09:14:00+03',
 '2026-04-20 09:38:00+03','2026-04-20 09:50:00+03','2026-04-20 10:22:00+03','2026-04-20 10:27:00+03',
 '2026-04-20 10:52:00+03','2026-04-20 11:06:00+03',
 7.0,false,NULL,NULL, true,'2026-04-20 09:09:00+03','plant', 'full',NULL,false, NULL,NULL,'direct_observation'),
('38349219-7ddc-4932-8005-36fe508eb73a','f0d7daf0-c7db-4979-a501-bf0de19761cc',NULL,'2026-04-20','TR-31','Mohammed','Riyadh Metro Line 6','bridge_deck','Mohammed','Riyadh North',
 '2026-04-20 13:00:00+03','2026-04-20 13:07:00+03','2026-04-20 13:12:00+03','2026-04-20 13:15:00+03',
 '2026-04-20 13:40:00+03','2026-04-20 14:00:00+03','2026-04-20 14:42:00+03','2026-04-20 14:48:00+03',
 '2026-04-20 15:15:00+03','2026-04-20 15:30:00+03',
 6.5,false,NULL,NULL, NULL,NULL,NULL, 'full',NULL,false, NULL,NULL,'direct_observation');

COMMIT;

-- ============================================================
-- Verify (run these SELECTs after the script finishes):
--   SELECT COUNT(*) FROM daily_logs WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a';  -- expect 35
--   SELECT COUNT(*) FROM intervention_logs WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a';  -- expect 3
--   SELECT COUNT(*) FROM fieldlog_todos WHERE assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a';  -- expect 2
--   SELECT COUNT(*) FROM tracking_entries
--     JOIN tracking_configs ON tracking_configs.id = tracking_entries.config_id
--     WHERE tracking_configs.assessment_id = '38349219-7ddc-4932-8005-36fe508eb73a';  -- expect 3
-- ============================================================
