import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

function scoreColor(s: number | null) {
  if (s === null) return '#c8c8c8'
  if (s >= 80) return '#27ae60'
  if (s >= 60) return '#D68910'
  return '#C0392B'
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Admins go to portfolio
  if (profile?.role === 'admin') redirect('/dashboard/portfolio')

  // Customers see their own reports
  const { data: assessments } = await supabase
    .from('assessments')
    .select(`
      *,
      plant:plants(name, country),
      report:reports(executive)
    `)
    .order('created_at', { ascending: false })

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>My Reports</h1>
      <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '24px' }}>
        Assessment reports for your plants
      </p>

      {!assessments || assessments.length === 0 ? (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '48px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--gray-700)', marginBottom: '8px' }}>
            No reports yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            Your consultant will share reports here after each plant visit.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {assessments.map(a => (
            <div key={a.id} style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '4px' }}>
                  {(a.plant as { name: string })?.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>
                  {a.date ? new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                </div>
                {(a.report as { executive?: string })?.executive && (
                  <div style={{
                    fontSize: '12px', color: 'var(--gray-600)', marginTop: '8px',
                    maxWidth: '500px', lineHeight: '1.5',
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {(a.report as { executive: string }).executive}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0, marginLeft: '16px' }}>
                {a.overall !== null && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'var(--mono)', color: scoreColor(a.overall) }}>
                      {a.overall}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)' }}>/100</div>
                  </div>
                )}
                <Link href={`/dashboard/assess/${a.id}`} style={{
                  padding: '8px 16px', background: 'var(--green)', color: '#fff',
                  borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                  textDecoration: 'none'
                }}>
                  View report →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
