import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import DashboardShell from '../dashboard/DashboardShell'
import type { MemberRole } from '@/lib/getEffectiveMemberRole'
import type { ReactNode } from 'react'

export default async function DemoLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If not authenticated, render children without the chat widget
  if (!user) return <>{children}</>

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'system_admin'

  // Respect the dev role-switcher cookie so admins can test as different roles
  const cookieStore = await cookies()
  const raw = isAdmin ? cookieStore.get('viewAs')?.value : undefined
  const userRole: MemberRole | null =
    raw === 'owner' || raw === 'manager' || raw === 'operator' ? raw : null

  return (
    <DashboardShell userRole={userRole} isAdmin={isAdmin}>
      {children}
    </DashboardShell>
  )
}
