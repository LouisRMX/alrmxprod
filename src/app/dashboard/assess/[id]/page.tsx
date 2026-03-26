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

  return <AssessmentTool assessment={assessment} userId={user.id} />
}
