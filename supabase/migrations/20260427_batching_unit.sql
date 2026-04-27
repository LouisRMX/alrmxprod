-- Add batching_unit text column to daily_logs.
--
-- Purpose: a single physical plant typically has 2-3 batching units (the
-- stationary mixers that actually batch the concrete). When the observer
-- knows which unit loaded a given truck, capturing it here lets us see
-- per-unit loading time, queue depth, and reject rate. Inconsistent units
-- inside the same plant are a common quick win that origin_plant alone
-- cannot surface.
--
-- Optional by design: if the observer leaves it blank, the trip rolls up
-- to the plant level via origin_plant exactly as before. We never force
-- the observer to pick a unit they cannot identify.
--
-- Nullable because legacy rows won't have it and observers can skip it.

alter table public.daily_logs
  add column if not exists batching_unit text;

comment on column public.daily_logs.batching_unit is
  'Specific batching unit the truck was loaded on, scoped to origin_plant. Free-text label chosen by the observer (e.g. "Unit 1", "BU-A"). NULL means the measurement rolls up to origin_plant only. Used for per-unit slicing when one plant has multiple batching units.';
