import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveMemberRole, type MemberRole } from '@/lib/getEffectiveMemberRole'
import { isSystemAdmin } from '@/lib/supabase/admin'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = await isSystemAdmin(user.id)

  // Check effective role, admin may have a viewAs cookie active
  const { role: effectiveRole } = await getEffectiveMemberRole(null, isAdmin)

  // Admin with active viewAs override → behave as that role
  if (isAdmin && effectiveRole !== null) {
    if (effectiveRole === 'operator') redirect('/dashboard/track')
    redirect('/dashboard/plants')
  }

  // Admin with no override → portfolio
  if (isAdmin) redirect('/dashboard/portfolio')

  // Customer roles, get real member role
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
  } else {
    realMemberRole = 'manager'
  }

  const { role: customerEffectiveRole } = await getEffectiveMemberRole(realMemberRole, false)

  if (customerEffectiveRole === 'operator') redirect('/dashboard/track')
  redirect('/dashboard/plants')
}
