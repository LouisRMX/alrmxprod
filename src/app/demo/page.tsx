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

  // Read viewAs cookie so demo respects role switching
  const cookieStore = await cookies()
  const raw = cookieStore.get('viewAs')?.value
  const userRole: MemberRole | null =
    raw === 'owner' || raw === 'manager' || raw === 'operator' ? raw : null
  const isOverridden = userRole !== null

  return (
    <Suspense>
      <DemoView userRole={userRole} isOverridden={isOverridden} />
    </Suspense>
  )
}
