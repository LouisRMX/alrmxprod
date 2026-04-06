import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PlantOverviewView, { type PlantCardData } from '@/components/plants/PlantOverviewView'

export const dynamic = 'force-dynamic'

function trackingWeekFromDate(startedAt: string): number {
  const days = Math.floor((Date.now() - new Date(startedAt).getTime()) / 86_400_000)
  return Math.min(13, Math.max(1, Math.ceil((days + 1) / 7)))
}

export default async function PlantsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'system_admin'

  // Operators have no portfolio — send them to their tracking page
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

  // ── Fetch plants + all their assessments ──────────────────────────────
  const { data: rawPlants } = await supabase
    .from('plants')
    .select(`
      id, name, country,
      assessments(
        id, date, phase, overall, scores, bottleneck,
        ebitda_monthly, report_released,
        tracking_configs(id, started_at),
        plant_benchmarks(turnaround_min, dispatch_min, reject_pct, util_pct),
        action_items(id, text, status)
      )
    `)
    .order('name', { ascending: true })

  // ── Fetch customer name (for customer_admin) ──────────────────────────
  let customerName: string | undefined
  if (profile?.role === 'customer_admin') {
    const { data: membership } = await supabase
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

    // Tracking week
    const tcArr = Array.isArray(latest.tracking_configs)
      ? latest.tracking_configs
      : (latest.tracking_configs ? [latest.tracking_configs] : [])
    const tc = tcArr[0] ?? null
    const trackingWeek = tc ? trackingWeekFromDate(tc.started_at) : null

    // Scores — handle both 'logistics' and 'fleet' key names
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
