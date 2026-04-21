import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import AddCustomerForm from './AddCustomerForm'
import CustomerList from './CustomerList'
import { isSystemAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!await isSystemAdmin(user.id)) redirect('/dashboard')

  const admin = getAdminClient()
  const { data: customers } = await admin
    .from('customers')
    .select('*, plants(count)')
    .order('created_at', { ascending: false })

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)', maxWidth: '900px', margin: '0 auto', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '600' }}>Customers</h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>
            Manage customer accounts and plant access
          </p>
        </div>
      </div>

      {/* Add customer form */}
      <AddCustomerForm userId={user.id} />

      {/* Customer list (responsive: table on desktop, card stack on mobile) */}
      <div style={{ marginTop: '24px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <CustomerList
          customers={(customers ?? []).map(c => ({
            id: c.id,
            name: c.name,
            country: c.country,
            contact_name: c.contact_name,
            contact_email: c.contact_email,
            plants: c.plants as unknown as { count: number }[],
          }))}
        />
      </div>
    </div>
  )
}
