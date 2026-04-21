-- ============================================================
-- Patch: fill missing answers on the demo assessment
--
-- The initial seed only populated the subset of answers that were
-- hardcoded in DemoView.tsx (the client-side demo). The full question
-- catalog has more questions per section. This patch adds realistic
-- values for the 25 remaining answers so Assessment tab shows every
-- section at 100% completion.
--
-- Target assessment: 38349219-7ddc-4932-8005-36fe508eb73a
-- Merges new keys into existing answers jsonb via || operator.
-- ============================================================

UPDATE public.assessments
SET answers = answers || jsonb_build_object(
  -- Section 1: Prices & costs (8 missing)
  'aggregate_days',          '5 to 10 days, adequate',
  'mix_split',               'Balanced mix, roughly equal split across strength classes',
  'silo_days',               '5 to 10 days, adequate',
  'material_stoppages',      'Once, 1 to 2 days lost',
  'ramadan_schedule',        'Partially, informal earlier start, no formal plan',
  'working_days_month',      '22',
  'high_strength_price',     '10',
  'typical_month',           'Yes, normal month, representative of typical operations',

  -- Section 2: Trucks & delivery (15 missing)
  'mixer_capacity',          '7',
  'ta_transit_min',          '35',
  'ta_site_wait_min',        '42',
  'ta_unload_min',           '22',
  'ta_washout_return_min',   '13',
  'partial_load_size',       '6.5',
  'delivery_distance_km',    '16',
  'avg_transit_min',         '17',
  'truck_availability',      '21',
  'qualified_drivers',       '22',
  'site_wait_time',          '42',
  'washout_time',            '10 to 20 minutes, standard',
  'batch_cycle_min',         '6',
  'order_to_dispatch_min',   '30',
  'washout_min',             '14',

  -- Section 4: Dispatch coordination (1 missing)
  'dispatch_peak',           'Concentrated in the morning, roughly 65% of deliveries dispatched before 10am. Afternoon demand is sporadic and driven by ad-hoc pours.',

  -- Section 5: Quality & maintenance (1 missing)
  'reject_cause_split',      'Mostly site/customer, pump delays, unreadiness, or contractor refusal (>50%)'
)
WHERE id = '38349219-7ddc-4932-8005-36fe508eb73a';
