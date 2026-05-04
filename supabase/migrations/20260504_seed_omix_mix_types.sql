-- ============================================================
-- Seed default mix-types for customer OMIX
--
-- Inserts the 11 standard concrete strengths the OMIX field team uses
-- (250, 270, 350, 370, 400, 410, 420, 440, 470, 500, 550) into every
-- assessment that belongs to a customer whose name matches "OMIX".
--
-- Idempotent via the (assessment_id, kind, name, parent_name) unique
-- constraint on assessment_options. Safe to re-run; future assessments
-- created for OMIX will get the same set on the next run, or via the
-- "Seed defaults" button in the Setup options modal.
--
-- Sort order matches sort_value so 250 lands at the top and 550 at the
-- bottom of the live-timer picker.
-- ============================================================

INSERT INTO public.assessment_options
  (assessment_id, kind, name, parent_name, sort_value, sort_order)
SELECT
  a.id,
  'mix_type',
  mt.name,
  NULL,
  mt.sort_value,
  mt.sort_value::int
FROM public.assessments a
JOIN public.plants p   ON p.id = a.plant_id
JOIN public.customers c ON c.id = p.customer_id
CROSS JOIN (
  VALUES
    ('250', 250::numeric),
    ('270', 270::numeric),
    ('350', 350::numeric),
    ('370', 370::numeric),
    ('400', 400::numeric),
    ('410', 410::numeric),
    ('420', 420::numeric),
    ('440', 440::numeric),
    ('470', 470::numeric),
    ('500', 500::numeric),
    ('550', 550::numeric)
) AS mt(name, sort_value)
WHERE c.name ILIKE '%OMIX%'
ON CONFLICT (assessment_id, kind, name, parent_name) DO NOTHING;
