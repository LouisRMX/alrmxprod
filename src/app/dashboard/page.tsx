import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveMemberRole, type MemberRole } from '@/lib/getEffectiveMemberRole'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const profileRole = profile?.role
  const isAdmin = profileRole === 'system_admin'

  if (isAdmin) {
    redirect('/dashboard/portfolio')
  }

  // Get customer member role
  let realMemberRole: MemberRole | null = null
  const { data: member } = await supabase
    .from('customer_members')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  const raw = member?.role
  if (raw === 'owner' || raw === 'manager' || raw === 'operator') {
    realMemberRole = raw
  } else if (profileRole === 'customer_admin') {
    realMemberRole = 'owner'
  } else {
    realMemberRole = 'manager'
  }

  const { role: effectiveRole } = await getEffectiveMemberRole(realMemberRole, false)

  if (effectiveRole === 'operator') {
    redirect('/dashboard/track')
  } else if (effectiveRole === 'owner') {
    redirect('/dashboard/plants')
  } else {
    // manager — redirect to plants overview (they need to pick an assessment)
    redirect('/dashboard/plants')
  }
}
