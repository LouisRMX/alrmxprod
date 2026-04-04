import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role
  if (role === 'system_admin') {
    redirect('/dashboard/portfolio')
  } else if (role === 'customer_admin') {
    redirect('/dashboard/plants')
  } else {
    // customer_user — redirect to reports (they'll see their assigned assessments)
    redirect('/dashboard/reports')
  }
}
