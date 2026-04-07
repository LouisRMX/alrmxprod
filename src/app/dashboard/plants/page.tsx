import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import PlantOverviewView, { type PlantCardData } from '@/components/plants/PlantOverviewView'
import { isSystemAdmin } from '@/lib/supabase/admin'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const dynamic = 'force-dynamic'

function trackingWeekFromDate(startedAt: string): number {
  const days = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)
  return Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
}

export default async function PlantsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = await isSystemAdmin(user.id)

  // Operators have no portfolio, send them to their tracking page
  if (!isAdmin) {
    const { data: member } = await supabase
      .from('customer_members')
      .select('role')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    const memberRole = member?.role
    if (memberRole === 'operator') redirect('/dashboard/track')
  }

  // Use admin client for system admins to bypass RLS
  const db = isAdmin ? getAdminClient() : supabase

  // ── Fetch plants + all their assessments ──────────────────────────────
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

  // ── Fetch tracking entries for all configs (for trend data) ──────────
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

  // Map configId → sorted entries[]
  const entriesByConfig: Record<string, Array<{ week_number: number; turnaround_min: number | null; dispatch_min: number | null }>> = {}
  for (const e of allEntries || []) {
    if (!entriesByConfig[e.config_id]) entriesByConfig[e.config_id] = []
    entriesByConfig[e.config_id].push(e)
  }

  // ── Fetch customer name (for non-admin users) ──────────────────────────
  let customerName: string | undefined
  if (!isAdmin) {
    const { data: membership } = await db
      .from('customer_members')
      .select('customer:customers(name)')
      .eq('user_id', user.id)
      .single()
    const cm = membership?.customer
    customerName = (Array.isArray(cm) ? cm[0] : cm)?.name ?? undefined
  }

  // ── Transform raw data → PlantCardData[] ─────────────────────────────
  const plants: PlantCardData[] = (rawPlants || []).map(plant => {
    const assessments = Array.isArray(plant.assessments) ? plant.assessments : []

    // Pick the latest assessment by date (falling back to array order)
    const sorted = [...assessments].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0
      const db = b.date ? new Date(b.date).getTime() : 0
      return db - da
    })
    const latest = sorted[0] ?? null

    if (!latest) {
      return { id: plant.id, name: plant.name, country: plant.country, assessment: null }
    }

    // Tracking week + trend entries
    const tcArr = Array.isArray(latest.tracking_configs)
      ? latest.tracking_configs
      : (latest.tracking_configs ? [latest.tracking_configs] : [])
    const tc = tcArr[0] ?? null
    const trackingWeek      = tc ? trackingWeekFromDate(tc.started_at) : null
    const baselineTurnaround: number | null = tc ? ((tc as any).baseline_turnaround ?? null) : null
    const entries           = tc ? (entriesByConfig[tc.id] ?? []) : []

    // trackingTrend: all weeks with a turnaround reading
    const trackingTrend = entries
      .filter(e => e.turnaround_min != null)
      .map(e => ({ week: e.week_number, turnaround: Number(e.turnaround_min) }))

    // trackingImprovement: delta latest vs previous (or baseline)
    const withTA = trackingTrend
    let trackingImprovement: { turnaroundDelta: number; dispatchDelta: number; weekOf: number; weekTotal: number } | null = null
    if (withTA.length >= 1) {
      const latest2    = withTA[withTA.length - 1]
      const prev       = withTA.length >= 2 ? withTA[withTA.length - 2] : null
      const baseVal    = prev?.turnaround ?? baselineTurnaround
      const turnaroundDelta = baseVal != null ? latest2.turnaround - baseVal : 0

      const withDisp   = entries.filter(e => e.dispatch_min != null)
      const latestDisp = withDisp[withDisp.length - 1]
      const prevDisp   = withDisp.length >= 2 ? withDisp[withDisp.length - 2] : null
      const dispatchDelta = latestDisp && prevDisp
        ? Number(latestDisp.dispatch_min) - Number(prevDisp.dispatch_min)
        : 0

      trackingImprovement = { turnaroundDelta, dispatchDelta, weekOf: latest2.week, weekTotal: 13 }
    }

    // Scores, handle both 'logistics' and 'fleet' key names
    const raw = latest.scores as Record<string, number | null> | null

    // Benchmark KPI data (saved separately when assessment is scored)
    const bmArr = Array.isArray((latest as any).plant_benchmarks)
      ? (latest as any).plant_benchmarks
      : ((latest as any).plant_benchmarks ? [(latest as any).plant_benchmarks] : [])
    const bm = bmArr[0] ?? null

    // Action items: derive primary status + top pending action text
    const actionItems: Array<{ id: string; text: string; status: string }> = Array.isArray((latest as any).action_items)
      ? (latest as any).action_items
      : ((latest as any).action_items ? [(latest as any).action_items] : [])

    let primaryActionStatus: 'todo' | 'in_progress' | 'done' | null = null
    if (actionItems.length > 0) {
      const hasInProgress = actionItems.some(i => i.status === 'in_progress')
      const allDone       = actionItems.every(i => i.status === 'done')
      primaryActionStatus = hasInProgress ? 'in_progress' : allDone ? 'done' : 'todo'
    }

    // Top action: prefer in_progress → first todo
    const topAction: string | null =
      actionItems.find(i => i.status === 'in_progress')?.text ??
      actionItems.find(i => i.status === 'todo')?.text ??
      null

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
        trackingTrend:       trackingTrend.length > 0 ? trackingTrend : null,
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
      <PlantOverviewView
        plants={plants}
        customerName={customerName}
      />
    </div>
  )
}
