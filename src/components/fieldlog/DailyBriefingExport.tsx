'use client'

/**
 * Weekly briefing export.
 *
 * One-click generation of an executive-style summary for the current
 * week, ready to paste into email/WhatsApp/Slack for stakeholder
 * updates. Weekly cadence is chosen over daily to avoid stakeholder
 * fatigue during the 13-week tracking period.
 *
 * Output structure (Executive first, narrative over raw data):
 *
 *   HEADLINE          one-line summary with the critical gap
 *   KEY FINDING       the #1 bottleneck with its dollar impact
 *   WHAT WE ARE DOING interventions + next week's focus (editable)
 *   BY THE NUMBERS    weekly metrics + week-over-week delta
 *
 * Data live from daily_logs aggregation, intervention_logs, and
 * outlier review queue. GCC owner/manager readable: plain language,
 * dominant stage singled out, dollar figure when a baseline + target
 * are locked, no 7-stage dump front and centre.
 */

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLogT } from '@/lib/i18n/LogLocaleContext'

const STAGE_LABEL: Record<string, string> = {
  plant_queue: 'Plant queue',
  loading: 'Loading',
  transit_out: 'Transit out',
  site_wait: 'Site waiting',
  pouring: 'Pouring',
  washout: 'Washout',
  transit_back: 'Transit back',
}

const STAGE_PLAIN: Record<string, string> = {
  plant_queue: 'time spent waiting at the plant before loading',
  loading: 'time to load the mixer',
  transit_out: 'drive time from plant to site',
  site_wait: 'time at site before pouring begins',
  pouring: 'time discharging concrete at site',
  washout: 'time cleaning the drum after pour',
  transit_back: 'drive time back to plant',
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
  week_start_date: string
  week_end_date: string
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const sMonth = s.toLocaleDateString('en-GB', { month: 'short' })
  const eMonth = e.toLocaleDateString('en-GB', { month: 'short' })
  if (sMonth === eMonth) {
    return `${s.getDate()}-${e.getDate()} ${sMonth}`
  }
  return `${s.getDate()} ${sMonth} - ${e.getDate()} ${eMonth}`
}

function arrow(delta: number): string {
  if (delta < -0.5) return '▼'
  if (delta > 0.5) return '▲'
  return '='
}

export default function DailyBriefingExport({ assessmentId }: Props) {
  const supabase = createClient()
  const { t } = useLogT()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [briefing, setBriefing] = useState('')
  const [mode, setMode] = useState<'executive' | 'detailed'>('executive')

  const generate = useCallback(async (selectedMode: 'executive' | 'detailed') => {
    setLoading(true)

    // Fetch plant + assessment context
    const { data: assessmentData } = await supabase
      .from('assessments')
      .select('phase, plant:plants(name, country)')
      .eq('id', assessmentId)
      .maybeSingle()

    const plantRow = (assessmentData?.plant ?? null) as { name?: string; country?: string } | { name?: string; country?: string }[] | null
    const plant = Array.isArray(plantRow) ? (plantRow[0] ?? null) : plantRow
    const plantName: string = plant?.name ?? 'Plant'

    // Weekly aggregates with outlier exclusion
    const { data: aggregates } = await supabase.rpc('get_weekly_kpis_from_daily_logs', {
      p_assessment_id: assessmentId,
    })
    const sortedAggs = ((aggregates ?? []) as WeeklyAggregate[])
      .sort((a, b) => b.week_number - a.week_number)
    const current = sortedAggs[0] ?? null
    const previous = sortedAggs[1] ?? null

    // Tracking config for baseline + coefficient only.
    // Target is intentionally NOT fetched: targets must not be displayed
    // anywhere until the analyst has confirmed a baseline AND explicitly
    // set a post-baseline target via a deliberate action. Even if a stale
    // target lives in the DB (from earlier flow versions), we don't
    // surface it here.
    const { data: cfg } = await supabase
      .from('tracking_configs')
      .select('baseline_turnaround, coeff_turnaround')
      .eq('assessment_id', assessmentId)
      .maybeSingle()
    const baseline = (cfg?.baseline_turnaround as number | null) ?? null
    const coeff = (cfg?.coeff_turnaround as number | null) ?? null

    // Interventions this week
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
    const { data: interventions } = await supabase
      .from('intervention_logs')
      .select('intervention_date, title, target_metric, implemented_by')
      .eq('assessment_id', assessmentId)
      .gte('intervention_date', sevenDaysAgo)
      .order('intervention_date', { ascending: false })

    // Outliers pending review
    const { data: outliers } = await supabase.rpc('get_outliers_for_review', {
      p_assessment_id: assessmentId,
    })
    const outliersPending = ((outliers ?? []) as Array<{ review_status: string }>)
      .filter(o => o.review_status === 'flagged' || o.review_status === 'normal')
      .length

    // ── Build ──
    const lines: string[] = []

    if (!current || current.trip_count === 0) {
      lines.push(`${plantName}`)
      lines.push(`Weekly briefing · No data logged this week`)
      lines.push('')
      lines.push('No trips have been logged in the current week.')
      lines.push('Data collection resumes once logging is active.')
      setBriefing(lines.join('\n'))
      setLoading(false)
      return
    }

    const weekRange = formatDateRange(current.week_start_date, current.week_end_date)
    const weekLabel = `Week ${current.week_number} · ${weekRange}`

    lines.push(`${plantName}`)
    lines.push(`Weekly briefing · ${weekLabel}`)
    lines.push('')

    // ── HEADLINE ──
    // Two states:
    //   1. No baseline locked: state the factual cycle time + trip count.
    //      No gap language, no dollar figures (nothing to compare against).
    //   2. Baseline locked: cycle time + delta from baseline. If coefficient
    //      is set, a dollar figure can be added since this is baseline-
    //      derived and needs no target.
    // Target is never referenced. Setting targets is a separate deliberate
    // action that happens after baseline is confirmed.
    const avgCycle = current.avg_tat_min
    const gapFromBaseline = baseline != null && avgCycle != null
      ? baseline - avgCycle
      : null

    lines.push('HEADLINE')
    if (avgCycle != null) {
      const parts: string[] = []
      parts.push(`Truck cycle averaged ${Math.round(avgCycle)} minutes across ${current.trip_count} trips this week.`)
      if (gapFromBaseline != null && gapFromBaseline > 2) {
        const monthlyValue = coeff && coeff > 0 ? Math.round(gapFromBaseline * coeff) : null
        if (monthlyValue && monthlyValue > 0) {
          parts.push(`Recovering an estimated $${monthlyValue.toLocaleString()}/month versus baseline of ${baseline} min.`)
        } else {
          parts.push(`${Math.round(gapFromBaseline)} min better than baseline of ${baseline} min.`)
        }
      } else if (baseline != null && gapFromBaseline != null && gapFromBaseline < -2) {
        parts.push(`${Math.round(-gapFromBaseline)} min slower than baseline of ${baseline} min.`)
      }
      lines.push(parts.join(' '))
    } else {
      lines.push(`${current.trip_count} trips observed this week. Cycle time not yet computable (missing timestamps).`)
    }
    lines.push('')

    // ── KEY FINDING ──
    const stages = [
      { key: 'plant_queue', val: current.avg_plant_queue_min },
      { key: 'loading', val: current.avg_loading_min },
      { key: 'transit_out', val: current.avg_transit_out_min },
      { key: 'site_wait', val: current.avg_site_wait_min },
      { key: 'pouring', val: current.avg_pouring_min },
      { key: 'washout', val: current.avg_washout_min },
      { key: 'transit_back', val: current.avg_transit_back_min },
    ].filter(s => s.val != null) as Array<{ key: string; val: number }>

    if (stages.length > 0 && avgCycle != null) {
      const totalStageMin = stages.reduce((a, s) => a + s.val, 0)
      const dominant = [...stages].sort((a, b) => b.val - a.val)[0]
      const dominantPct = totalStageMin > 0 ? Math.round((dominant.val / totalStageMin) * 100) : 0

      lines.push('KEY FINDING')
      lines.push(`${STAGE_LABEL[dominant.key]} is the largest component at ${Math.round(dominant.val)} min per trip (${dominantPct}% of cycle).`)
      lines.push(`This is ${STAGE_PLAIN[dominant.key]}.`)
      lines.push('')
    }

    // ── WHAT WE ARE DOING ──
    lines.push('WHAT WE ARE DOING')
    if (interventions && interventions.length > 0) {
      for (const iv of interventions as Array<{ intervention_date: string; title: string; target_metric: string | null; implemented_by: string | null }>) {
        const dateShort = new Date(iv.intervention_date).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short'
        })
        lines.push(`• ${dateShort}: ${iv.title}`)
      }
    } else {
      lines.push('• [Add this week\'s actions and next week\'s focus]')
    }
    lines.push('')

    // ── BY THE NUMBERS ──
    lines.push('BY THE NUMBERS')
    lines.push(`Trips: ${current.trip_count}${previous ? ` ${arrow(current.trip_count - previous.trip_count)} ${previous.trip_count} last week` : ''}`)
    if (avgCycle != null) {
      const delta = previous?.avg_tat_min != null ? Math.round(avgCycle - previous.avg_tat_min) : null
      lines.push(`Avg cycle: ${Math.round(avgCycle)} min${delta != null ? ` ${arrow(delta)} ${Math.round(previous!.avg_tat_min!)} min last week` : ''}`)
    }
    if (current.reject_pct != null) {
      const deltaR = previous?.reject_pct != null ? current.reject_pct - previous.reject_pct : null
      lines.push(`Rejects: ${current.reject_count} (${Math.round(current.reject_pct)}%)${deltaR != null ? ` ${arrow(deltaR)} ${Math.round(previous!.reject_pct!)}% last week` : ''}`)
    }
    lines.push(`Trucks in rotation: ${current.unique_trucks}`)
    if (current.avg_trips_per_truck_per_day != null) {
      lines.push(`Trips per truck per day: ${current.avg_trips_per_truck_per_day.toFixed(1)}`)
    }
    if (current.outliers_excluded_count > 0) {
      lines.push(`Outliers excluded from averages: ${current.outliers_excluded_count} (reviewed separately)`)
    }
    if (outliersPending > 0) {
      lines.push(`Trips awaiting review: ${outliersPending}`)
    }

    // ── DETAILED mode: add full stage breakdown ──
    if (selectedMode === 'detailed' && stages.length > 0) {
      lines.push('')
      lines.push('STAGE BREAKDOWN')
      const totalStageMin = stages.reduce((a, s) => a + s.val, 0)
      for (const s of stages) {
        const pct = totalStageMin > 0 ? Math.round((s.val / totalStageMin) * 100) : 0
        lines.push(`• ${STAGE_LABEL[s.key] ?? s.key}: ${s.val.toFixed(0)} min (${pct}%)`)
      }
    }

    setBriefing(lines.join('\n'))
    setLoading(false)
  }, [supabase, assessmentId])

  const handleOpen = () => {
    setOpen(true)
    generate(mode)
  }

  const handleModeChange = (m: 'executive' | 'detailed') => {
    setMode(m)
    generate(m)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(briefing)
    } catch {
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
        📋 {t('brief.button')}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>{t('brief.title')}</div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                  {t('brief.subtitle')}
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

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '4px', background: '#f4f4f4', padding: '3px', borderRadius: '8px', alignSelf: 'flex-start' }}>
              {(['executive', 'detailed'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeChange(m)}
                  style={{
                    padding: '6px 14px', background: mode === m ? '#fff' : 'transparent',
                    border: 'none', borderRadius: '6px',
                    fontSize: '12px', fontWeight: 600,
                    color: mode === m ? '#1a1a1a' : '#666',
                    cursor: 'pointer',
                    boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                  }}
                >
                  {m === 'executive' ? t('brief.executive') : t('brief.detailed')}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
                {t('brief.generating')}
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
                {t('brief.copy')}
              </button>
              <button
                type="button"
                onClick={() => generate(mode)}
                disabled={loading}
                style={{
                  padding: '10px 18px', background: '#fff', color: '#333',
                  border: '1px solid #ddd', borderRadius: '8px',
                  fontSize: '13px', fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  minHeight: '44px',
                }}
              >
                {t('brief.regenerate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
