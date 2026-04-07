'use client'

import Link from 'next/link'

interface ActionItem {
  type: 'write_report' | 'stale_tracking' | 'release_report'
  assessmentId: string
  plantName: string
  detail: string
}

interface ActionItemsProps {
  assessments: {
    id: string
    phase: string | null
    overall: number | null
    report_released: boolean | null
    plant: { name: string } | { name: string }[] | null
    tracking_config: { id: string; started_at: string } | { id: string; started_at: string }[] | null
    report: { executive?: string | null; diagnosis?: string | null; actions?: string | null } | null |
            { executive?: string | null; diagnosis?: string | null; actions?: string | null }[]
  }[]
  lastLogged: Record<string, string>
}

function plantName(p: ActionItemsProps['assessments'][0]['plant']): string {
  if (!p) return '—'
  const obj = Array.isArray(p) ? p[0] : p
  return obj?.name || '—'
}

function getConfig(tc: ActionItemsProps['assessments'][0]['tracking_config']) {
  if (!tc) return null
  return Array.isArray(tc) ? tc[0] ?? null : tc
}

function getReport(r: ActionItemsProps['assessments'][0]['report']) {
  if (!r) return null
  return Array.isArray(r) ? r[0] ?? null : r
}

export default function ActionItems({ assessments, lastLogged }: ActionItemsProps) {
  const now = Date.now()
  const items: ActionItem[] = []

  for (const a of assessments) {
    const pName = plantName(a.plant)
    const report = getReport(a.report)
    const tc = getConfig(a.tracking_config)
    const hasReport = !!(report?.executive || report?.diagnosis || report?.actions)

    // 1. Write report — onsite + scored + no report yet
    if (a.phase === 'onsite' && a.overall !== null && !hasReport) {
      items.push({
        type: 'write_report',
        assessmentId: a.id,
        plantName: pName,
        detail: `Score ${a.overall}/100. Report not written.`,
      })
    }

    // 2. Stale tracking — active program, last entry >14 days ago
    if (tc) {
      const lastEntry = lastLogged[tc.id]
      const refDate = lastEntry ? new Date(lastEntry).getTime() : new Date(tc.started_at).getTime()
      const daysSince = Math.floor((now - refDate) / 86_400_000)
      const week = Math.min(13, Math.max(1, Math.ceil((Math.floor((now - new Date(tc.started_at).getTime()) / 86_400_000) + 1) / 7)))
      if (daysSince > 14 && week < 13) {
        items.push({
          type: 'stale_tracking',
          assessmentId: a.id,
          plantName: pName,
          detail: lastEntry
            ? `No data logged in ${daysSince} days`
            : `Tracking started. No entries yet.`,
        })
      }
    }

    // 3. Release report — report written, not yet released
    if (hasReport && !a.report_released) {
      items.push({
        type: 'release_report',
        assessmentId: a.id,
        plantName: pName,
        detail: 'Report written. Not visible to client yet.',
      })
    }
  }

  if (items.length === 0) return null

  const CFG = {
    write_report:   { dot: '#cc3333', label: 'Write report',   cta: 'Open →' },
    stale_tracking: { dot: '#d68910', label: 'Follow up',      cta: 'View →' },
    release_report: { dot: '#0F6E56', label: 'Ready to release', cta: 'Release →' },
  } as const

  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', marginBottom: '20px', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px', background: 'var(--gray-50)',
        borderBottom: '1px solid var(--border)',
        fontSize: '11px', fontWeight: 700, color: 'var(--gray-500)',
        textTransform: 'uppercase', letterSpacing: '.6px',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#cc3333', display: 'inline-block' }} />
        {items.length} action{items.length !== 1 ? 's' : ''} needed
      </div>
      {items.map((item, i) => {
        const cfg = CFG[item.type]
        return (
          <div key={`${item.assessmentId}-${item.type}`} style={{
            display: 'grid', gridTemplateColumns: '8px 1fr auto auto',
            alignItems: 'center', gap: '12px',
            padding: '12px 16px',
            borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            {/* Status dot */}
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />

            {/* Plant + detail */}
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)' }}>
                {item.plantName}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--gray-400)', marginLeft: '8px' }}>
                {item.detail}
              </span>
            </div>

            {/* Action label */}
            <span style={{
              fontSize: '10px', fontWeight: 700, color: cfg.dot,
              background: cfg.dot + '18',
              padding: '2px 7px', borderRadius: '4px',
              whiteSpace: 'nowrap',
            }}>
              {cfg.label}
            </span>

            {/* CTA link */}
            <Link
              href={`/dashboard/assess/${item.assessmentId}`}
              style={{
                fontSize: '12px', fontWeight: 600, color: 'var(--green)',
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              {cfg.cta}
            </Link>
          </div>
        )
      })}
    </div>
  )
}
