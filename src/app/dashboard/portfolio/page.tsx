import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import ActionItems from './ActionItems'
import PortfolioList, { type PortfolioRow } from './PortfolioList'
import { isSystemAdmin } from '@/lib/supabase/admin'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function fmt(n: number | null) {
  if (!n) return '-'
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'k'
  return '$' + Math.round(n)
}

export default async function PortfolioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!await isSystemAdmin(user.id)) redirect('/dashboard/reports')

  const admin = getAdminClient()

  // Get all assessments with plant, customer info, tracking status, and report
  const { data: assessments } = await admin
    .from('assessments')
    .select(`
      *,
      plant:plants(
        name, country,
        customer:customers(name)
      ),
      analyst:profiles(full_name),
      tracking_config:tracking_configs(id, started_at),
      report:reports(executive, diagnosis, actions)
    `)
    .order('created_at', { ascending: false })

  // Latest tracking entry per config (for staleness check)
  const configIds = (assessments || [])
    .map(a => Array.isArray(a.tracking_config) ? a.tracking_config[0]?.id : (a.tracking_config as { id: string } | null)?.id)
    .filter(Boolean) as string[]

  const { data: latestEntries } = configIds.length > 0
    ? await admin
        .from('tracking_entries')
        .select('config_id, logged_at')
        .in('config_id', configIds)
        .order('logged_at', { ascending: false })
    : { data: [] }

  // Map configId → last logged_at
  const lastLogged: Record<string, string> = {}
  for (const e of latestEntries || []) {
    if (!lastLogged[e.config_id]) lastLogged[e.config_id] = e.logged_at
  }

  const total = assessments?.length || 0
  const avgScore = total > 0
    ? Math.round((assessments || []).reduce((s, a) => s + (a.overall || 0), 0) / total)
    : null
  const totalEbitda = (assessments || []).reduce((s, a) => s + (a.ebitda_monthly || 0), 0)

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)', maxWidth: '1100px', margin: '0 auto', overflowX: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--gray-900)' }}>Portfolio</h1>
          <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>All plant assessments</p>
        </div>
        <Link href="/dashboard/assess/new" style={{
          padding: '10px 20px', background: 'var(--green)', color: '#fff',
          borderRadius: '8px', fontSize: '13px', fontWeight: '500',
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px'
        }}>
          + New assessment
        </Link>
      </div>

      {/* Action items */}
      <ActionItems assessments={assessments || []} lastLogged={lastLogged} />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total assessments', value: total.toString() },
          { label: 'Assessments completed', value: total > 0 ? `${total}` : '-' },
          { label: 'Total monthly loss', value: fmt(totalEbitda) + '/mo' },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 20px'
          }}>
            <div style={{ fontSize: '11px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--gray-900)' }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Assessments list (responsive: table on desktop, card stack on mobile) */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <PortfolioList
          rows={(assessments ?? []) as unknown as PortfolioRow[]}
        />
      </div>
    </div>
  )
}
