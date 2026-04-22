-- Extend intervention_library with site-type + TAT-component targeting.
--
-- site_type_applicability: which site_types the intervention benefits most.
--   ['any'] = universal (applies regardless of site mix)
--   specific list = only surface when plant's site mix contains these types
--
-- tat_component_target: which TAT component the intervention primarily acts on.
--   Used by the plan generator to match interventions to diagnosed excess.
--   'none' = intervention doesn't target a TAT component (e.g. inventory,
--            pure quality, capacity). Still valid library items.
--
-- Idempotent: safe to re-run.

-- Add columns if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'intervention_library'
      AND column_name = 'site_type_applicability'
  ) THEN
    ALTER TABLE public.intervention_library
      ADD COLUMN site_type_applicability text[] DEFAULT ARRAY['any']::text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'intervention_library'
      AND column_name = 'tat_component_target'
  ) THEN
    -- Values: plant_dwell | loading | weighbridge | transit_out | site_wait
    --         | unload | washout | transit_back | plant_prep | multi | none
    ALTER TABLE public.intervention_library
      ADD COLUMN tat_component_target text DEFAULT 'multi';
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_intervention_library_tat_component
  ON public.intervention_library (tat_component_target);

COMMENT ON COLUMN public.intervention_library.site_type_applicability IS
  'Array of site_type values this intervention benefits, or [''any''] for universal. '
  'Used by plan generator to prioritise interventions matching the plant site mix.';

COMMENT ON COLUMN public.intervention_library.tat_component_target IS
  'Which TAT component the intervention primarily reduces. Used with the '
  'plant_site_type_percentiles view to match interventions to diagnosed excess.';
