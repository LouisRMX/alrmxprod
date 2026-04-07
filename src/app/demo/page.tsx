import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import DemoView from './DemoView'
import type { MemberRole } from '@/lib/getEffectiveMemberRole'

export const dynamic = 'force-dynamic'

export default async function DemoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirect=demo')

  // Only system_admin can use viewAs role override
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'system_admin'

  const cookieStore = await cookies()
  const raw = isAdmin ? cookieStore.get('viewAs')?.value : undefined
  // Non-admin users see the owner experience by default. The demo is for plant owners.
  // Admins without a viewAs override see full access (null = all tabs visible).
  const userRole: MemberRole | null = isAdmin
    ? (raw === 'owner' || raw === 'manager' || raw === 'operator' ? raw : null)
    : (raw === 'owner' || raw === 'manager' || raw === 'operator' ? raw : 'owner')
  const isOverridden = raw === 'owner' || raw === 'manager' || raw === 'operator'

  return (
    <Suspense>
      <DemoView userRole={userRole} isOverridden={isOverridden} />
    </Suspense>
  )
}
