import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import CustomerDetail from './CustomerDetail'
import { isSystemAdmin } from '@/lib/supabase/admin'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!await isSystemAdmin(user.id)) redirect('/dashboard')

  const admin = getAdminClient()

  const { data: customer } = await admin
    .from('customers').select('*').eq('id', id).single()
  if (!customer) redirect('/dashboard/customers')

  const { data: plants } = await admin
    .from('plants')
    .select('*, assessments(count)')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  const { data: membersRaw } = await admin
    .from('customer_members')
    .select('id, user_id, role, created_at, profile:profiles(full_name, email)')
    .eq('customer_id', id)

  const members = (membersRaw || []).map(m => ({
    ...m,
    profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
  }))

  return <CustomerDetail customer={customer} plants={plants || []} members={members} />
}
