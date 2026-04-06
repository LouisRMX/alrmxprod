-- Add checklist column to action_items for per-card step-by-step task lists
ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb;
