import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AssessmentTool from './AssessmentTool'

export default async function AssessmentPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: assessment } = await supabase
    .from('assessments')
    .select(`
      *,
      plant:plants(
        name, country,
        customer:customers(name, contact_email)
      ),
      analyst:profiles(full_name),
      report:reports(*)
    `)
    .eq('id', id)
    .single()

  if (!assessment) notFound()

  // Get user role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  // Customer users can only access workshop phase — block access to onsite
  if (!isAdmin && assessment.phase !== 'workshop') {
    redirect('/dashboard/portfolio')
  }

  return <AssessmentTool assessment={assessment} userId={user.id} isAdmin={isAdmin} />
}
