import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import CompareView from './CompareView'
import type { PlantCardData } from '@/components/plants/PlantOverviewView'
import { isSystemAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function trackingWeekFromDate(startedAt: string): number {
  const days = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)
  return Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
}

export default async function ComparePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = await isSystemAdmin(user.id)

  if (!isAdmin) {
    const { data: member } = await supabase
      .from('customer_members')
      .select('role')
      .eq('user_id', user.id)
      .limit(1)
      .single()
    if (member?.role === 'operator') redirect('/dashboard/track')
  }

  // Use service role key for admin so RLS doesn't filter out plants/data
  const db = isAdmin
    ? createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
    : supabase

  // ── Fetch plants + assessments ─────────────────────────────────────────
  const { data: rawPlants } = await db
    .from('plants')
    .select(`
      id, name, country,
      assessments(
        id, date, phase, overall, scores, bottleneck,
        ebitda_monthly, report_released,
        tracking_configs(id, started_at, baseline_turnaround),
        plant_benchmarks(turnaround_min, dispatch_min, reject_pct, util_pct),
        action_items(id, text, status)
      )
    `)
    .order('name', { ascending: true })

  // ── Fetch tracking entries for trend data ─────────────────────────────
  const configIds: string[] = []
  for (const plant of rawPlants || []) {
    const assessments = Array.isArray(plant.assessments) ? plant.assessments : []
    for (const a of assessments) {
      const tcArr = Array.isArray(a.tracking_configs)
        ? a.tracking_configs
        : (a.tracking_configs ? [a.tracking_configs] : [])
      for (const tc of tcArr) {
        if ((tc as any)?.id) configIds.push((tc as any).id)
      }
    }
  }

  const { data: allEntries } = configIds.length > 0
    ? await db
        .from('tracking_entries')
        .select('config_id, week_number, turnaround_min, dispatch_min')
        .in('config_id', configIds)
        .order('week_number', { ascending: true })
    : { data: [] }

  const entriesByConfig: Record<string, Array<{ week_number: number; turnaround_min: number | null; dispatch_min: number | null }>> = {}
  for (const e of allEntries || []) {
    if (!entriesByConfig[e.config_id]) entriesByConfig[e.config_id] = []
    entriesByConfig[e.config_id].push(e)
  }

  // ── Transform ─────────────────────────────────────────────────────────
  const plants: PlantCardData[] = (rawPlants || []).map(plant => {
    const assessments = Array.isArray(plant.assessments) ? plant.assessments : []
    const sorted = [...assessments].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0
      const db = b.date ? new Date(b.date).getTime() : 0
      return db - da
    })
    const latest = sorted[0] ?? null

    if (!latest) {
      return { id: plant.id, name: plant.name, country: plant.country, assessment: null }
    }

    const tcArr = Array.isArray(latest.tracking_configs)
      ? latest.tracking_configs
      : (latest.tracking_configs ? [latest.tracking_configs] : [])
    const tc = tcArr[0] ?? null
    const trackingWeek       = tc ? trackingWeekFromDate(tc.started_at) : null
    const baselineTurnaround: number | null = tc ? ((tc as any).baseline_turnaround ?? null) : null
    const entries            = tc ? (entriesByConfig[tc.id] ?? []) : []

    const trackingTrend = entries
      .filter(e => e.turnaround_min != null)
      .map(e => ({ week: e.week_number, turnaround: Number(e.turnaround_min) }))

    const withTA = trackingTrend
    let trackingImprovement: { turnaroundDelta: number; dispatchDelta: number; weekOf: number; weekTotal: number } | null = null
    if (withTA.length >= 1) {
      const last2  = withTA[withTA.length - 1]
      const prev   = withTA.length >= 2 ? withTA[withTA.length - 2] : null
      const baseVal = prev?.turnaround ?? baselineTurnaround
      const turnaroundDelta = baseVal != null ? last2.turnaround - baseVal : 0
      const withDisp   = entries.filter(e => e.dispatch_min != null)
      const latestDisp = withDisp[withDisp.length - 1]
      const prevDisp   = withDisp.length >= 2 ? withDisp[withDisp.length - 2] : null
      const dispatchDelta = latestDisp && prevDisp
        ? Number(latestDisp.dispatch_min) - Number(prevDisp.dispatch_min)
        : 0
      trackingImprovement = { turnaroundDelta, dispatchDelta, weekOf: last2.week, weekTotal: 13 }
    }

    const bmArr = Array.isArray((latest as any).plant_benchmarks)
      ? (latest as any).plant_benchmarks
      : ((latest as any).plant_benchmarks ? [(latest as any).plant_benchmarks] : [])
    const bm = bmArr[0] ?? null

    const actionItems: Array<{ id: string; text: string; status: string }> = Array.isArray((latest as any).action_items)
      ? (latest as any).action_items
      : ((latest as any).action_items ? [(latest as any).action_items] : [])

    let primaryActionStatus: 'todo' | 'in_progress' | 'done' | null = null
    if (actionItems.length > 0) {
      const hasInProgress = actionItems.some(i => i.status === 'in_progress')
      const allDone       = actionItems.every(i => i.status === 'done')
      primaryActionStatus = hasInProgress ? 'in_progress' : allDone ? 'done' : 'todo'
    }

    const topAction: string | null =
      actionItems.find(i => i.status === 'in_progress')?.text ??
      actionItems.find(i => i.status === 'todo')?.text ??
      null

    const raw = latest.scores as Record<string, number | null> | null

    return {
      id: plant.id,
      name: plant.name,
      country: plant.country,
      assessment: {
        id: latest.id,
        phase: latest.phase || 'workshop',
        overall: typeof latest.overall === 'number' ? latest.overall : null,
        scores: raw ? {
          prod:      raw.prod      ?? null,
          dispatch:  raw.dispatch  ?? null,
          logistics: raw.logistics ?? null,
          fleet:     raw.fleet     ?? null,
          quality:   raw.quality   ?? null,
        } : null,
        bottleneck:     latest.bottleneck ?? null,
        ebitda_monthly: latest.ebitda_monthly ?? null,
        report_released: latest.report_released ?? false,
        trackingWeek,
        trackingImprovement,
        trackingTrend:      trackingTrend.length > 0 ? trackingTrend : null,
        baselineTurnaround,
        primaryActionStatus,
        topAction,
        kpi: bm ? {
          turnaroundMin: bm.turnaround_min ?? null,
          dispatchMin:   bm.dispatch_min   ?? null,
          rejectPct:     bm.reject_pct     ?? null,
          utilPct:       bm.util_pct       ?? null,
        } : null,
      },
    }
  })

  return (
    <div style={{ flex: 1, background: 'var(--gray-50)', overflowY: 'auto' }}>
      <CompareView plants={plants} />
    </div>
  )
}
