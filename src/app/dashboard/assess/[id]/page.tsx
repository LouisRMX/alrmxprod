import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import AssessmentTool from './AssessmentTool'
import { getEffectiveMemberRole, type MemberRole } from '@/lib/getEffectiveMemberRole'
import { isSystemAdmin } from '@/lib/supabase/admin'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AssessmentPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = await isSystemAdmin(user.id)
  const db = isAdmin ? getAdminClient() : supabase

  const { data: assessment } = await db
    .from('assessments')
    .select(`
      *,
      plant:plants(
        name, country, customer_id,
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

  // Load baseline assessment when this is a follow-up
  let baselineAssessment: { id: string; date: string; answers: Record<string, unknown> } | null = null
  if (assessment.baseline_id) {
    const { data: baseline } = await db
      .from('assessments')
      .select('id, date, answers')
      .eq('id', assessment.baseline_id)
      .single()
    baselineAssessment = baseline ?? null
  }

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
      baselineAssessment={baselineAssessment}
    />
  )
}
