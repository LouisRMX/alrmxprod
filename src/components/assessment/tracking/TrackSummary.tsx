'use client'

import { createClient } from '@/lib/supabase/client'

interface SummaryConfig {
  started_at: string
  baseline_turnaround: number | null
  baseline_dispatch_min: number | null
  target_turnaround: number | null
  target_dispatch_min: number | null
  coeff_turnaround: number
  coeff_reject: number   // repurposed as coeffDispatch
  baseline_monthly_loss: number | null
}

interface SummaryEntry {
  week_number: number
  turnaround_min: number | null
  dispatch_min: number | null
  notes: string | null
}

interface TrackSummaryProps {
  assessmentId: string
  config: SummaryConfig
  entries: SummaryEntry[]
  coeffDispatch: number
  plant?: string
  country?: string
}

interface ActionItem {
  id: string
  text: string
  status: string
  value: string | null
  notes?: string | null
}

function fmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k'
  return '$' + Math.round(n)
}

function weekNumber(startedAt: string): number {
  const days = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)
  return Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
}

function progressPct(baseline: number | null, latest: number | null, target: number | null): number {
  if (baseline == null || latest == null || target == null) return 0
  if (baseline <= target) return 100
  return Math.min(100, Math.max(0, Math.round((baseline - latest) / (baseline - target) * 100)))
}

function calcMonthlyRecovery(entry: SummaryEntry, cfg: SummaryConfig, coeffDispatch: number): number {
  let r = 0
  if (entry.turnaround_min != null && cfg.baseline_turnaround != null) {
    r += Math.max(0, cfg.baseline_turnaround - entry.turnaround_min) * cfg.coeff_turnaround
  }
  if (entry.dispatch_min != null && cfg.baseline_dispatch_min != null) {
    r += Math.max(0, cfg.baseline_dispatch_min - entry.dispatch_min) * coeffDispatch
  }
  return Math.round(r)
}

function generateHTML(
  plant: string,
  country: string,
  config: SummaryConfig,
  latestEntry: SummaryEntry | null,
  completedActions: ActionItem[],
  coeffDispatch: number,
): string {
  const currentWeek = weekNumber(config.started_at)
  const startDate = new Date(config.started_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const baseTA = config.baseline_turnaround
  const baseDis = config.baseline_dispatch_min
  const targetTA = config.target_turnaround
  const targetDis = config.target_dispatch_min
  const latestTA = latestEntry?.turnaround_min ?? null
  const latestDis = latestEntry?.dispatch_min ?? null
  const baselineLoss = config.baseline_monthly_loss ?? 0

  const taPct = progressPct(baseTA, latestTA, targetTA)
  const disPct = progressPct(baseDis, latestDis, targetDis)
  const monthlyRecovery = latestEntry ? calcMonthlyRecovery(latestEntry, config, coeffDispatch) : 0
  const currentLoss = Math.max(0, baselineLoss - monthlyRecovery)
  const annualRecovery = monthlyRecovery * 12

  function bar(pct: number, color: string): string {
    return `
      <div style="height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;margin-top:6px">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:4px"></div>
      </div>`
  }

  function metricBox(label: string, before: number | null, now: number | null, target: number | null, unit: string, color: string): string {
    const pct = progressPct(before, now, target)
    const delta = before != null && now != null ? before - now : null
    const targetHit = target != null && now != null && now <= target
    return `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;flex:1">
        <div style="font-size:11px;font-weight:600;letter-spacing:.6px;color:#6b7280;text-transform:uppercase;margin-bottom:12px">${label}</div>
        <div style="display:flex;align-items:flex-end;gap:14px;margin-bottom:4px">
          <div>
            <div style="font-size:10px;color:#9ca3af;margin-bottom:2px">BEFORE</div>
            <div style="font-size:22px;font-weight:300;color:#374151">${before ?? '—'}<span style="font-size:12px;color:#9ca3af;margin-left:2px">${unit}</span></div>
          </div>
          <div style="font-size:18px;color:#d1d5db;padding-bottom:4px">→</div>
          <div>
            <div style="font-size:10px;color:#9ca3af;margin-bottom:2px">NOW</div>
            <div style="font-size:28px;font-weight:700;color:#111827">${now ?? '—'}<span style="font-size:12px;color:#9ca3af;margin-left:2px">${unit}</span></div>
          </div>
          <div>
            <div style="font-size:10px;color:#9ca3af;margin-bottom:2px">TARGET</div>
            <div style="font-size:22px;font-weight:300;color:#374151">${target ?? '—'}<span style="font-size:12px;color:#9ca3af;margin-left:2px">${unit}</span></div>
          </div>
        </div>
        ${bar(pct, color)}
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          <span style="font-size:12px;color:${color};font-weight:500">${delta != null && delta > 0 ? `▼ ${delta} min saved` : targetHit ? '✓ target hit' : '—'}</span>
          <span style="font-size:12px;color:#6b7280">${pct}% toward target${targetHit ? ' ✓' : ''}</span>
        </div>
      </div>`
  }

  const actionsHTML = completedActions.length > 0
    ? completedActions.map(a => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #f3f4f6">
          <div style="width:18px;height:18px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
            <span style="color:#059669;font-size:10px;font-weight:700">✓</span>
          </div>
          <div>
            <div style="font-size:13px;color:#111827">${a.text}</div>
            ${a.notes ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${a.notes}</div>` : ''}
          </div>
        </div>`).join('')
    : '<div style="font-size:13px;color:#9ca3af;padding:10px 0">No completed actions recorded yet.</div>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${plant}: 90-Day Progress Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111827; }
  @page { size: A4; margin: 0; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div style="max-width:760px;margin:0 auto;padding:40px 40px 48px">

  <!-- Header -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #111827">
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.8px;color:#6b7280;text-transform:uppercase;margin-bottom:6px">90-Day Progress Report</div>
      <div style="font-size:26px;font-weight:700;color:#111827">${plant}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:3px">${country}</div>
    </div>
    <div style="text-align:right">
      <div style="display:inline-block;background:#1a5c38;color:#fff;border-radius:6px;padding:4px 12px;font-size:11px;font-weight:600;letter-spacing:.4px;margin-bottom:8px">
        WEEK ${currentWeek} OF 12
      </div>
      <div style="font-size:12px;color:#6b7280">Started: ${startDate}</div>
      <div style="font-size:12px;color:#6b7280">Report date: ${today}</div>
    </div>
  </div>

  <!-- Performance results -->
  <div style="margin-bottom:28px">
    <div style="font-size:12px;font-weight:600;letter-spacing:.6px;color:#374151;text-transform:uppercase;margin-bottom:14px">Performance Results</div>
    <div style="display:flex;gap:16px">
      ${metricBox('Turnaround time', baseTA, latestTA, targetTA, 'min', '#1a5c38')}
      ${metricBox('Dispatch time', baseDis, latestDis, targetDis, 'min', '#1a5c38')}
    </div>
  </div>

  <!-- Financial impact -->
  <div style="margin-bottom:28px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 22px">
    <div style="font-size:12px;font-weight:600;letter-spacing:.6px;color:#374151;text-transform:uppercase;margin-bottom:14px">Financial Recovery</div>
    <div style="display:flex;gap:0">
      <div style="flex:1;border-right:1px solid #bbf7d0;padding-right:20px">
        <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Monthly recovery</div>
        <div style="font-size:32px;font-weight:700;color:#1a5c38">${fmt(monthlyRecovery)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">vs. baseline loss of ${fmt(baselineLoss)}/mo</div>
      </div>
      <div style="flex:1;padding-left:20px;border-right:1px solid #bbf7d0;padding-right:20px">
        <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Current est. loss</div>
        <div style="font-size:32px;font-weight:700;color:#374151">${fmt(currentLoss)}<span style="font-size:14px;color:#6b7280;font-weight:400">/mo</span></div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">down from ${fmt(baselineLoss)}/mo</div>
      </div>
      <div style="flex:1;padding-left:20px">
        <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Annual estimate</div>
        <div style="font-size:32px;font-weight:700;color:#374151">${fmt(annualRecovery)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">if current pace holds</div>
      </div>
    </div>
  </div>

  <!-- Completed actions -->
  <div style="margin-bottom:32px">
    <div style="font-size:12px;font-weight:600;letter-spacing:.6px;color:#374151;text-transform:uppercase;margin-bottom:14px">Key Actions Completed</div>
    <div>${actionsHTML}</div>
  </div>

  <!-- Footer -->
  <div style="padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:11px;color:#9ca3af">${today}</div>
    <div style="font-size:11px;color:#9ca3af">Confidential</div>
  </div>

</div>

<div class="no-print" style="position:fixed;bottom:20px;right:20px">
  <button onclick="window.print()" style="background:#1a5c38;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
    Save as PDF
  </button>
</div>

</body>
</html>`
}

// Demo mock actions removed — demo uses same flow as real assessments

export default function TrackSummaryButton({ assessmentId, config, entries, coeffDispatch, plant, country }: TrackSummaryProps) {
  const supabase = createClient()

  async function handleOpen() {
    const latestEntry = [...entries].sort((a, b) => b.week_number - a.week_number)[0] ?? null

    let completedActions: ActionItem[] = []
    if (assessmentId !== 'demo') {
      const { data } = await supabase
        .from('action_items')
        .select('id, text, status, value, notes')
        .eq('assessment_id', assessmentId)
        .eq('status', 'done')
        .order('updated_at', { ascending: false })
        .limit(5)
      completedActions = (data ?? []) as ActionItem[]
    }

    const html = generateHTML(
      plant || 'Plant',
      country || '',
      config,
      latestEntry,
      completedActions,
      coeffDispatch,
    )

    const win = window.open('', '_blank', 'width=860,height=700')
    if (!win) return
    win.document.write(html)
    win.document.close()
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      style={{
        fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font)',
        color: 'var(--green)', background: 'var(--success-bg)',
        border: '1px solid var(--success-border)',
        borderRadius: '6px', padding: '5px 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '5px',
        flexShrink: 0,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Export summary
    </button>
  )
}
