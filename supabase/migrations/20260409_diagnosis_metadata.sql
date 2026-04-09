-- Add metadata to diagnosis snapshot for versioning and audit
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS diagnosis_generated_at timestamptz;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS diagnosis_schema_version integer DEFAULT 1;
