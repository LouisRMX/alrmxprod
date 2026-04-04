import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AssessmentTool from './AssessmentTool'
import { getEffectiveMemberRole, type MemberRole } from '@/lib/getEffectiveMemberRole'

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

  // Get user profile role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'system_admin'

  // Get customer member role
  let realMemberRole: MemberRole | null = null
  if (!isAdmin) {
    const { data: member } = await supabase
      .from('customer_members')
      .select('role')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    const raw = member?.role
    if (raw === 'owner' || raw === 'manager' || raw === 'operator') {
      realMemberRole = raw
    } else if (profile?.role === 'customer_admin') {
      realMemberRole = 'owner'
    } else {
      realMemberRole = 'manager'
    }
  }

  const { role: effectiveRole } = await getEffectiveMemberRole(realMemberRole, isAdmin)

  // Access control: operators can only access workshop phase
  // Owners and managers can access all phases
  if (!isAdmin && effectiveRole === 'operator') {
    if (!['workshop', 'workshop_complete'].includes(assessment.phase)) {
      redirect('/dashboard/track')
    }
  }

  // Non-admin, non-operator: owners/managers blocked from workshop-only access
  // (they should be able to see everything)

  return (
    <AssessmentTool
      assessment={assessment}
      userId={user.id}
      isAdmin={isAdmin}
      userRole={effectiveRole}
    />
  )
}
