-- ============================================================
-- Add cement_type to daily_logs
--
-- Captures whether a given load was poured with Ordinary Portland
-- (OPC) or Sulphate-Resistant Cement (SRC). Most ready-mix plants
-- run two parallel cement silos and the choice drives both pricing
-- and curing-window assumptions, so analysts need it as a slicer
-- alongside mix-strength and batching unit.
--
-- Constraint kept narrow on purpose: only the two values the GCC
-- field team uses today. If a third cement variant shows up later
-- (e.g. white cement) we extend the CHECK explicitly so a typo can
-- never silently land as a new "type".
-- ============================================================

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS cement_type text;

-- Drop a stale check constraint if a previous run installed one with
-- a different name, then add ours.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'daily_logs'
      AND constraint_name = 'daily_logs_cement_type_check'
  ) THEN
    ALTER TABLE public.daily_logs DROP CONSTRAINT daily_logs_cement_type_check;
  END IF;
END $$;

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_cement_type_check
  CHECK (cement_type IS NULL OR cement_type IN ('OPC', 'SRC'));

COMMENT ON COLUMN public.daily_logs.cement_type IS
  'Cement variant used for the load. OPC = Ordinary Portland; SRC = Sulphate-Resistant Cement. NULL when the observer did not record it. Drives slicing alongside mix_type for cost and curing-window analysis.';
