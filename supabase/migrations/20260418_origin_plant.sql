-- Add origin_plant text column to daily_logs.
--
-- Purpose: with Model A (one virtual "Operations" plant per customer),
-- we still need to distinguish trips from physically different batching
-- plants. Observer picks "Plant 1" / "Plant 2" etc. before starting a
-- trip, and the value is recorded here for per-plant slicing later.
--
-- Nullable because legacy rows won't have it and single-plant customers
-- never need it.

alter table public.daily_logs
  add column if not exists origin_plant text;

comment on column public.daily_logs.origin_plant is
  'Physical plant the trip originated from. Free-text label chosen by the observer (e.g. "Plant 1 Riyadh Central"). Used for per-plant filtering when an assessment covers multiple sites with shared fleet.';
