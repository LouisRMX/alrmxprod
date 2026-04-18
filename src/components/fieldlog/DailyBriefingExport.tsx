'use client'

/**
 * Daily briefing export.
 *
 * One-click generation of a text summary of the day's tracking data,
 * ready to paste into email/WhatsApp/Slack for stakeholder updates.
 *
 * Content pulled live from:
 *   - daily_logs for today's trip count + median TAT + rejects
 *   - get_weekly_kpis_from_daily_logs for week stats + stage breakdown
 *   - intervention_logs for this week's interventions
 *   - review queue count (flagged outliers)
 *   - tracking_configs for onsite start date (to compute "Day N")
 *
 * Output is editable markdown-style plain text. Analyst can tweak
 * before copying to clipboard.
 */

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const STAGE_LABEL: Record<string, string> = {
  plant_queue: 'Plant queue',
  loading: 'Loading',
  transit_out: 'Transit out',
  site_wait: 'Site wait',
  pouring: 'Pouring',
  washout: 'Washout',
  transit_back: 'Transit back',
}

interface Props {
  assessmentId: string
}

interface WeeklyAggregate {
  week_number: number
  trip_count: number
  avg_tat_min: number | null
  reject_pct: number | null
  reject_count: number
  avg_plant_queue_min: number | null
  avg_loading_min: number | null
  avg_transit_out_min: number | null
  avg_site_wait_min: number | null
  avg_pouring_min: number | null
  avg_washout_min: number | null
  avg_transit_back_min: number | null
  unique_trucks: number
  avg_trips_per_truck_per_day: number | null
  outliers_excluded_count: number
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export default function DailyBriefingExport({ assessmentId }: Props) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [briefing, setBriefing] = useState('')

  const generate = useCallback(async () => {
    setLoading(true)
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    // Fetch tracking config for onsite day computation + plant info
    const { data: cfg } = await supabase
      .from('tracking_configs')
      .select('id, started_at')
      .eq('assessment_id', assessmentId)
      .maybeSingle()

    const { data: assessmentData } = await supabase
      .from('assessments')
      .select('phase, plant:plants(name, country)')
      .eq('id', assessmentId)
      .maybeSingle()

    const plantRow = (assessmentData?.plant ?? null) as { name?: string; country?: string } | { name?: string; country?: string }[] | null
    const plant = Array.isArray(plantRow) ? (plantRow[0] ?? null) : plantRow
    const plantName: string = plant?.name ?? 'Plant'
    const phase: string = (assessmentData?.phase as string) ?? 'tracking'

    // Day N counter based on tracking start
    let dayLabel = todayStr
    if (cfg?.started_at) {
      const days = Math.floor(
        (today.getTime() - new Date(cfg.started_at as string).getTime()) / 86_400_000
      ) + 1
      dayLabel = `Day ${days} · ${todayStr}`
    }

    // Today's trips
    const { data: todayTrips } = await supabase
      .from('daily_logs')
      .select('plant_queue_start, departure_loaded, arrival_plant, rejected, review_status')
      .eq('assessment_id', assessmentId)
      .eq('log_date', todayStr)

    const todayRowsIncluded = (todayTrips ?? []).filter(r =>
      r.review_status !== 'flagged' && r.review_status !== 'reviewed_exclude'
    )
    const todayCount = todayRowsIncluded.length
    const todayTats = todayRowsIncluded
      .map(r => {
        const start = r.plant_queue_start ?? r.departure_loaded
        if (!start || !r.arrival_plant) return null
        const diff = (new Date(r.arrival_plant).getTime() - new Date(start).getTime()) / 60000
        return diff > 0 && diff < 720 ? diff : null
      })
      .filter((v): v is number => v !== null)
    const todayMedianTat = median(todayTats)
    const todayRejectCount = todayRowsIncluded.filter(r => r.rejected).length

    // Current week aggregate
    const { data: aggregates } = await supabase.rpc('get_weekly_kpis_from_daily_logs', {
      p_assessment_id: assessmentId,
    })
    const sortedAggs = ((aggregates ?? []) as WeeklyAggregate[]).sort(
      (a, b) => b.week_number - a.week_number
    )
    const currentWeek = sortedAggs[0] ?? null

    // Interventions this week
    const oneWeekAgo = new Date(today.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
    const { data: interventions } = await supabase
      .from('intervention_logs')
      .select('intervention_date, title, target_metric, implemented_by')
      .eq('assessment_id', assessmentId)
      .gte('intervention_date', oneWeekAgo)
      .order('intervention_date', { ascending: false })

    // Outliers pending review
    const { data: outliers } = await supabase.rpc('get_outliers_for_review', {
      p_assessment_id: assessmentId,
    })
    const outliersPending = ((outliers ?? []) as Array<{ review_status: string }>)
      .filter(o => o.review_status === 'flagged' || o.review_status === 'normal')
      .length

    // ── Format briefing ──
    const lines: string[] = []

    lines.push(`${plantName} · ${phase === 'onsite' ? 'Onsite diagnostic' : 'Tracking'}`)
    lines.push(dayLabel)
    lines.push('')

    lines.push('TODAY')
    if (todayCount === 0) {
      lines.push('No trips logged today yet.')
    } else {
      lines.push(`• ${todayCount} trips logged`)
      if (todayMedianTat != null) {
        lines.push(`• Median TAT: ${Math.round(todayMedianTat)} min`)
      }
      if (todayRejectCount > 0) {
        const pct = Math.round((todayRejectCount / todayCount) * 100)
        lines.push(`• ${todayRejectCount} rejects (${pct}%)`)
      }
    }
    lines.push('')

    if (currentWeek && currentWeek.trip_count > 0) {
      lines.push(`THIS WEEK (Week ${currentWeek.week_number})`)
      lines.push(`• ${currentWeek.trip_count} trips logged`)
      if (currentWeek.avg_tat_min != null) {
        lines.push(`• Avg TAT: ${Math.round(currentWeek.avg_tat_min)} min`)
      }
      if (currentWeek.reject_pct != null && currentWeek.reject_count > 0) {
        lines.push(`• Rejects: ${currentWeek.reject_count} (${Math.round(currentWeek.reject_pct)}%)`)
      }
      if (currentWeek.unique_trucks > 0) {
        lines.push(`• ${currentWeek.unique_trucks} unique trucks observed`)
      }
      if (currentWeek.avg_trips_per_truck_per_day != null) {
        lines.push(`• ${currentWeek.avg_trips_per_truck_per_day.toFixed(1)} trips/truck/day`)
      }
      if (currentWeek.outliers_excluded_count > 0) {
        lines.push(`• ${currentWeek.outliers_excluded_count} outliers excluded (auto-flagged for review)`)
      }
      lines.push('')

      // Stage breakdown. Highlight dominant stages.
      const stages = [
        { key: 'plant_queue', val: currentWeek.avg_plant_queue_min },
        { key: 'loading', val: currentWeek.avg_loading_min },
        { key: 'transit_out', val: currentWeek.avg_transit_out_min },
        { key: 'site_wait', val: currentWeek.avg_site_wait_min },
        { key: 'pouring', val: currentWeek.avg_pouring_min },
        { key: 'washout', val: currentWeek.avg_washout_min },
        { key: 'transit_back', val: currentWeek.avg_transit_back_min },
      ].filter(s => s.val != null) as Array<{ key: string; val: number }>

      if (stages.length > 0) {
        lines.push('STAGE BREAKDOWN (week avg)')
        const totalMin = stages.reduce((a, s) => a + s.val, 0)
        for (const s of stages) {
          const pct = totalMin > 0 ? Math.round((s.val / totalMin) * 100) : 0
          const marker = pct >= 25 ? ' ← dominant' : ''
          lines.push(`• ${STAGE_LABEL[s.key] ?? s.key}: ${s.val.toFixed(0)} min (${pct}%)${marker}`)
        }
        lines.push('')
      }
    }

    if (interventions && interventions.length > 0) {
      lines.push('INTERVENTIONS (last 7 days)')
      for (const iv of interventions as Array<{ intervention_date: string; title: string; target_metric: string | null; implemented_by: string | null }>) {
        const dateShort = new Date(iv.intervention_date).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short'
        })
        const parts = [`${dateShort}`, iv.title]
        if (iv.target_metric) parts.push(`[${iv.target_metric}]`)
        if (iv.implemented_by) parts.push(`by ${iv.implemented_by}`)
        lines.push(`• ${parts.join(' · ')}`)
      }
      lines.push('')
    }

    if (outliersPending > 0) {
      lines.push('REVIEW QUEUE')
      lines.push(`• ${outliersPending} trip${outliersPending !== 1 ? 's' : ''} flagged as outlier, awaiting review`)
      lines.push('')
    }

    lines.push('NEXT STEP')
    lines.push('[Add your notes here]')

    setBriefing(lines.join('\n'))
    setLoading(false)
  }, [supabase, assessmentId])

  const handleOpen = () => {
    setOpen(true)
    generate()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(briefing)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = briefing
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        style={{
          padding: '8px 14px', background: '#fff',
          border: '1px solid #0F6E56', color: '#0F6E56',
          borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        📋 Daily briefing
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '12px',
              padding: '20px', width: '100%', maxWidth: '640px',
              maxHeight: '90vh', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>Daily briefing</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                  Edit if needed, then copy to clipboard and paste into your stakeholder update.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', fontSize: '20px',
                  cursor: 'pointer', color: '#888', lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
                Generating...
              </div>
            ) : (
              <textarea
                value={briefing}
                onChange={e => setBriefing(e.target.value)}
                style={{
                  width: '100%', minHeight: '400px',
                  padding: '12px', border: '1px solid #ddd', borderRadius: '8px',
                  fontSize: '13px', fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                  resize: 'vertical', lineHeight: 1.5,
                }}
              />
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleCopy}
                disabled={loading || !briefing}
                style={{
                  padding: '10px 18px', background: '#0F6E56', color: '#fff',
                  border: 'none', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600,
                  cursor: loading || !briefing ? 'not-allowed' : 'pointer',
                  minHeight: '44px', opacity: loading || !briefing ? 0.6 : 1,
                }}
              >
                Copy to clipboard
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={loading}
                style={{
                  padding: '10px 18px', background: '#fff', color: '#333',
                  border: '1px solid #ddd', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  minHeight: '44px',
                }}
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
