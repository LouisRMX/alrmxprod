import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import DeleteButton from './DeleteButton'
import ActionItems from './ActionItems'
import { isSystemAdmin } from '@/lib/supabase/admin'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function scoreColor(s: number | null) {
  if (s === null) return 'var(--gray-300)'
  if (s >= 80) return 'var(--phase-complete)'
  if (s >= 60) return 'var(--warning)'
  return 'var(--red)'
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
          { label: 'Average score', value: avgScore ? `${avgScore}/100` : '-' },
          { label: 'Total EBITDA gap', value: fmt(totalEbitda) + '/mo' },
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

      {/* Assessments list */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {!assessments || assessments.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--gray-500)' }}>
            <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}>No assessments yet</div>
            <div style={{ fontSize: '13px', marginBottom: '20px' }}>Start your first plant assessment to see results here.</div>
            <Link href="/dashboard/assess/new" style={{
              padding: '10px 20px', background: 'var(--green)', color: '#fff',
              borderRadius: '8px', fontSize: '13px', fontWeight: '500', textDecoration: 'none'
            }}>
              Start first assessment →
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                {['Plant', 'Customer', 'Date', 'Phase', 'Score', 'EBITDA gap', 'Tracking', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', fontSize: '11px', fontWeight: '500',
                    color: 'var(--gray-500)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '.4px'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessments.map((a, i) => (
                <tr key={a.id} style={{
                  borderBottom: i < assessments.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background .1s'
                }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--gray-900)' }}>
                      {(a.plant as { name: string })?.name || '-'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>{a.plant?.country}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-700)' }}>
                    {(a.plant as { customer?: { name: string } })?.customer?.name || '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--gray-500)', fontFamily: 'var(--mono)' }}>
                    {a.date ? new Date(a.date).toLocaleDateString('en-GB') : '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {(() => {
                      const p = a.phase || 'workshop'
                      const cfg: Record<string, { label: string; bg: string; color: string }> = {
                        workshop: { label: 'Workshop', bg: 'var(--phase-workshop-bg)', color: 'var(--phase-workshop)' },
                        onsite: { label: 'On-site', bg: 'var(--phase-onsite-bg)', color: 'var(--phase-onsite)' },
                        complete: { label: 'Complete', bg: 'var(--phase-complete-bg)', color: 'var(--phase-complete)' },
                      }
                      const c = cfg[p] || cfg.workshop
                      return (
                        <span style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                          background: c.bg, color: c.color
                        }}>
                          {c.label}
                        </span>
                      )
                    })()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {a.overall !== null ? (
                      <span style={{
                        fontSize: '15px', fontWeight: '700', fontFamily: 'var(--mono)',
                        color: scoreColor(a.overall)
                      }}>
                        {a.overall}
                      </span>
                    ) : <span style={{ color: 'var(--gray-300)' }}>-</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>
                    {fmt(a.ebitda_monthly)}<span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>/mo</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {(() => {
                      const tc = Array.isArray(a.tracking_config) ? a.tracking_config[0] : a.tracking_config
                      if (!tc) return <span style={{ color: 'var(--gray-300)', fontSize: '13px' }}>-</span>
                      const days = Math.floor((Date.now() - new Date(tc.started_at).getTime()) / 86_400_000)
                      const week = Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
                      const done = week >= 13
                      return (
                        <span style={{
                          padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                          background: done ? 'var(--phase-complete-bg)' : 'var(--phase-onsite-bg)',
                          color: done ? 'var(--phase-complete)' : 'var(--phase-onsite)',
                        }}>
                          {done ? '✓ Done' : `Wk ${week}/13`}
                        </span>
                      )
                    })()}
                  </td>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href={`/dashboard/assess/${a.id}`} style={{
                      fontSize: '12px', color: 'var(--green)', textDecoration: 'none', fontWeight: '500'
                    }}>
                      View →
                    </Link>
                    <DeleteButton assessmentId={a.id} plantName={(a.plant as { name: string })?.name || '-'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
