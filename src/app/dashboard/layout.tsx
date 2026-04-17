import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NavBar from '@/components/NavBar'
import DevRoleSwitcher from '@/components/DevRoleSwitcher'
import { getEffectiveMemberRole, type MemberRole } from '@/lib/getEffectiveMemberRole'
import { isSystemAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get profile with role (via RLS-aware client for display data)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Use service role to bypass RLS for admin check — RLS on profiles table is unreliable
  const isAdmin = await isSystemAdmin(user.id)

  // Get customer member role (for customer_admin / customer_user)
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
      // Legacy: customer_admin without a member row → treat as owner
      realMemberRole = 'owner'
    } else {
      // Legacy: customer_user without a member row → treat as manager
      realMemberRole = 'manager'
    }
  }

  const { role: effectiveRole, isOverridden } = await getEffectiveMemberRole(realMemberRole, isAdmin)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', overflowX: 'hidden' }}>
      <NavBar user={user} profile={profile} memberRole={effectiveRole} isAdmin={isAdmin} />
      <main className="dashboard-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {children}
      </main>
      {/* Always mounted, component fetches own role client-side and hides if not system_admin */}
      <DevRoleSwitcher viewAs={effectiveRole} isOverridden={isOverridden} />
    </div>
  )
}
