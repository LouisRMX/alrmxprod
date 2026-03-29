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

  // Normalize report from array (Supabase join) to single object
  const reportArr = assessment.report as unknown[]
  assessment.report = Array.isArray(reportArr) ? reportArr[0] || null : reportArr

  // Normalize plant from array to single object
  const plantArr = assessment.plant as unknown[]
  assessment.plant = Array.isArray(plantArr) ? plantArr[0] || null : plantArr

  // Normalize analyst from array to single object
  const analystArr = assessment.analyst as unknown[]
  assessment.analyst = Array.isArray(analystArr) ? analystArr[0] || null : analystArr

  // Get user role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'system_admin'

  // Customer users can only access workshop phase — block access to onsite/complete
  if (!isAdmin && !['workshop', 'workshop_complete'].includes(assessment.phase)) {
    redirect('/dashboard/reports')
  }

  return <AssessmentTool assessment={assessment} userId={user.id} isAdmin={isAdmin} />
}
