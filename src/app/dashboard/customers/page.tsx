import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AddCustomerForm from './AddCustomerForm'

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: customers } = await supabase
    .from('customers')
    .select('*, plants(count)')
    .order('created_at', { ascending: false })

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
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

      {/* Customer list */}
      <div style={{ marginTop: '24px', background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {!customers || customers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
            No customers yet. Add your first customer above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                {['Customer', 'Country', 'Contact', 'Plants', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', fontSize: '11px', fontWeight: '500',
                    color: 'var(--gray-500)', textAlign: 'left',
                    textTransform: 'uppercase', letterSpacing: '.4px'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < customers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500' }}>{c.name}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)' }}>{c.country}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--gray-700)' }}>{c.contact_name || '—'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>{c.contact_email || ''}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)' }}>
                    {(c.plants as unknown as { count: number }[])?.[0]?.count || 0}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--green)', cursor: 'pointer', fontWeight: '500' }}>
                    Manage →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
