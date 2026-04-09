-- Persist validated diagnosis as JSON snapshot
-- Rendered by DecisionView and Word report from this snapshot, not from live recomputation
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS validated_diagnosis jsonb;
