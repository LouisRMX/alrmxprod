-- Fix: report_versions table was created without RLS (Supabase security alert)
ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_admin_all" ON public.report_versions
  FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'system_admin');

CREATE POLICY "members_select" ON public.report_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM reports r
      JOIN assessments a ON a.id = r.assessment_id
      JOIN plants p ON p.id = a.plant_id
      JOIN customer_members cm ON cm.customer_id = p.customer_id
      WHERE r.id = report_versions.report_id
        AND cm.user_id = auth.uid()
    )
  );
