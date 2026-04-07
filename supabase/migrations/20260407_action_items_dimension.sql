-- Add dimension tag to action_items for cross-plant comparison drill-down
ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS dimension text;
