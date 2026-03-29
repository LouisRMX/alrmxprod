import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NewAssessmentForm from './NewAssessmentForm'

export default async function NewAssessmentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'system_admin') redirect('/dashboard')

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, country, plants(id, name)')
    .order('name')

  return (
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>New assessment</h1>
      <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '24px' }}>
        Select a plant to begin the assessment
      </p>
      <NewAssessmentForm customers={customers || []} userId={user.id} />
    </div>
  )
}
