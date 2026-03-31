import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CustomerDetail from './CustomerDetail'

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'system_admin') redirect('/dashboard')

  const { data: customer } = await supabase
    .from('customers').select('*').eq('id', id).single()
  if (!customer) redirect('/dashboard/customers')

  const { data: plants } = await supabase
    .from('plants')
    .select('*, assessments(count)')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  const { data: membersRaw } = await supabase
    .from('customer_members')
    .select('id, user_id, role, created_at, profile:profiles(full_name, email)')
    .eq('customer_id', id)

  const members = (membersRaw || []).map(m => ({
    ...m,
    profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
  }))

  return <CustomerDetail customer={customer} plants={plants || []} members={members} />
}
