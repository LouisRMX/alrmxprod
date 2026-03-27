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
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: customer } = await supabase
    .from('customers').select('*').eq('id', id).single()
  if (!customer) redirect('/dashboard/customers')

  const { data: plants } = await supabase
    .from('plants')
    .select('*, assessments(count)')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  return <CustomerDetail customer={customer} plants={plants || []} />
}
