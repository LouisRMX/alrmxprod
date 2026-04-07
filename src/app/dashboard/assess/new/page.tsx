import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NewAssessmentForm from './NewAssessmentForm'
import { isSystemAdmin } from '@/lib/supabase/admin'

export default async function NewAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ baseline_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!await isSystemAdmin(user.id)) redirect('/dashboard')

  const { baseline_id } = await searchParams

  // Load baseline plant info when creating a follow-up
  let baselinePlant: { id: string; name: string; customer_id: string; country: string } | null = null
  if (baseline_id) {
    const { data: baseline } = await supabase
      .from('assessments')
      .select('plant:plants(id, name, customer_id, country)')
      .eq('id', baseline_id)
      .single()
    if (baseline?.plant) {
      const p = Array.isArray(baseline.plant) ? baseline.plant[0] : baseline.plant
      baselinePlant = p as { id: string; name: string; customer_id: string; country: string }
    }
  }

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, country, plants(id, name)')
    .order('name')

  return (
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>
        {baseline_id ? '60-Day Follow-up Assessment' : 'New assessment'}
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '24px' }}>
        {baseline_id ? 'Record actual measured outcomes to compare against the baseline' : 'Select a plant to begin the assessment'}
      </p>
      <NewAssessmentForm
        customers={customers || []}
        userId={user.id}
        baselineId={baseline_id}
        baselinePlant={baselinePlant}
      />
    </div>
  )
}
