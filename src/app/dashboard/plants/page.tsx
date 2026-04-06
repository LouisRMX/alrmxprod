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
        plant_benchmarks(turnaround_min, dispatch_min, reject_pct, util_pct)
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
