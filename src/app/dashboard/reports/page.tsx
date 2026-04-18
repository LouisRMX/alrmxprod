import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { isSystemAdmin } from '@/lib/supabase/admin'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

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

  const isAdmin = await isSystemAdmin(user.id)

  // Admins use service role to bypass RLS; customers use regular client (RLS scopes to their plants)
  const db = isAdmin ? getAdminClient() : supabase

  // Admins see all assessments with reports; customers see their own
  const { data: assessments } = await db
    .from('assessments')
    .select(`
      *,
      plant:plants(name, country, customer:customers(name)),
      analyst:profiles(full_name),
      report:reports(executive)
    `)
    .order('created_at', { ascending: false })

  // Normalize report from array (Supabase join) to single object
  const normalized = (assessments || []).map(a => {
    const reportArr = a.report as unknown[]
    const report = Array.isArray(reportArr) ? reportArr[0] || null : reportArr
    const plantArr = a.plant as unknown[]
    const plant = Array.isArray(plantArr) ? plantArr[0] || null : plantArr
    const analystArr = a.analyst as unknown[]
    const analyst = Array.isArray(analystArr) ? analystArr[0] || null : analystArr
    return { ...a, report, plant, analyst }
  })

  // Filter to only assessments that have a report (for admins)
  const withReports = isAdmin
    ? normalized.filter(a => (a.report as { executive?: string })?.executive)
    : normalized

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)', maxWidth: '900px', margin: '0 auto', overflowX: 'hidden' }}>
      <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>
        {isAdmin ? 'Reports' : 'My Reports'}
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '24px' }}>
        {isAdmin ? 'All generated assessment reports' : 'Assessment reports for your plants'}
      </p>

      {withReports.length === 0 ? (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '48px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--gray-700)', marginBottom: '8px' }}>
            No reports yet
          </div>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
            {isAdmin
              ? 'Reports will appear here after generating them from an assessment.'
              : 'Your consultant will share reports here after each plant visit.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {withReports.map(a => (
            <div key={a.id} style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '12px',
            }}>
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '15px', fontWeight: '500' }}>
                    {(a.plant as { name: string })?.name}
                  </div>
                  {isAdmin && (a.plant as { customer?: { name: string } })?.customer?.name && (
                    <span style={{ fontSize: '11px', color: 'var(--gray-400)', background: 'var(--gray-50)', padding: '2px 8px', borderRadius: '4px' }}>
                      {(a.plant as { customer: { name: string } }).customer.name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--gray-500)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{a.date ? new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}</span>
                  {isAdmin && (a.analyst as { full_name: string })?.full_name && (
                    <span>· {(a.analyst as { full_name: string }).full_name}</span>
                  )}
                </div>
                {(a.report as { executive?: string })?.executive && (
                  <div style={{
                    fontSize: '12px', color: 'var(--gray-600)', marginTop: '8px',
                    lineHeight: '1.5',
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {(a.report as { executive: string }).executive}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
                {a.overall !== null && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: a.bottleneck ? '#c96a00' : 'var(--gray-400)' }}>
                      {a.bottleneck || '-'}
                    </div>
                  </div>
                )}
                <Link href={`/dashboard/assess/${a.id}`} style={{
                  padding: '10px 16px', background: 'var(--green)', color: '#fff',
                  borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                  textDecoration: 'none', whiteSpace: 'nowrap', minHeight: '44px',
                  display: 'inline-flex', alignItems: 'center',
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
