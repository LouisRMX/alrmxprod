-- Focus actions: up to 3 freetext actions set by system_admin
-- when releasing the report. Shown to manager role as "Your focus board".
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS focus_actions text[] DEFAULT NULL;
