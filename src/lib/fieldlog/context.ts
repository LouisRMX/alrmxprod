// Pure computation: takes raw trip data from RPC, returns structured context
// No Supabase dependency — all computation is client-side

export interface RawTrip {
  truck_id: string | null
  site_name: string | null
  site_type: string | null
  log_date: string
  departure_loaded: string | null
  arrival_site: string | null
  discharge_start: string | null
  discharge_end: string | null
  departure_site: string | null
  arrival_plant: string | null
  loading_start: string | null
  loading_end: string | null
  washout_end: string | null
  slump_pass: boolean | null
  load_m3: number | null
  rejected: boolean
  reject_side: string | null
}

export interface RawIntervention {
  intervention_date: string
  title: string
  description: string | null
  target_metric: string | null
}

export interface TATVariation {
  min: number
  max: number
  std_dev: number
  p25: number
  p75: number
  count: number
}

export interface ValueStream {
  loading_queue_avg: number | null    // departure_loaded to arrival_site minus transit estimate
  transit_outbound_avg: number | null // departure_loaded to arrival_site
  site_wait_avg: number | null        // arrival_site to discharge_start
  unload_avg: number | null           // discharge_start to discharge_end
  transit_return_avg: number | null   // departure_site to arrival_plant
  washout_avg: number | null          // not directly measurable from timestamps
  total_cycle_avg: number
  // Value stream classification
  va_minutes: number                  // value-adding: transit + unload
  nva_minutes: number                 // pure waste: site_wait + plant_queue
  necessary_nva_minutes: number       // necessary NVA: loading + washout (estimated)
  va_pct: number
  nva_pct: number
  necessary_nva_pct: number
}

export interface SitePerformance {
  site_name: string
  avg_site_wait: number | null
  total_deliveries: number
  reject_count: number
  pct_of_total_deliveries: number
  pct_of_total_site_wait: number
  coverage: number                    // % of trips with site_wait data
}

export interface TruckPerformance {
  truck_id: string
  avg_tat: number
  total_trips: number
  reject_count: number
  std_dev: number
  status: 'Normal' | 'Watch' | 'Outlier'
}

export interface BaselineCurrentComparison {
  baseline: {
    days: string
    avg_tat: number
    trips_per_day: number
    reject_pct: number
  }
  current: {
    days: string
    avg_tat: number
    trips_per_day: number
    reject_pct: number
  }
}

export interface InterventionEffect {
  date: string
  title: string
  target_metric: string | null
  avg_tat_before: number | null
  avg_tat_after: number | null
  approximate: boolean
}

export interface CapacityAnalysis {
  current_daily_m3: number
  achievable_daily_m3: number
  gap_daily_m3: number
  gap_monthly_m3: number
}

export interface FieldLogContext {
  total_trips_observed: number
  days_observed: number
  tat_variation: TATVariation | null
  value_stream: ValueStream | null
  site_matrix: SitePerformance[]
  truck_matrix: TruckPerformance[]
  site_concentration: {
    top_site_pct_volume: number
    top_site_pct_wait: number
    concentration_risk: boolean       // top 3 sites > 60% volume
  } | null
  baseline_current: BaselineCurrentComparison | null
  interventions: InterventionEffect[]
  capacity_analysis: CapacityAnalysis | null
}

// ── Helpers ──────────────────────────────────────────────────────────────

function diffMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 60000
  return diff > 0 && diff < 600 ? diff : null // reject > 10 hours as bad data
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const mean = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

// ── Main Builder ────────────────────────────────────────────────────────

export function buildFieldLogContext(
  trips: RawTrip[],
  interventions: RawIntervention[] = [],
  calcTrace?: { target_daily_m3: number; working_days_month: number } | null,
): FieldLogContext | null {
  if (!trips || trips.length < 3) return null

  // Compute TAT for each trip
  const tripsWithTAT = trips.map(t => ({
    ...t,
    tat: diffMinutes(t.departure_loaded, t.arrival_plant),
    outbound: diffMinutes(t.departure_loaded, t.arrival_site),
    site_wait: diffMinutes(t.arrival_site, t.discharge_start),
    unload: diffMinutes(t.discharge_start, t.discharge_end),
    return_transit: diffMinutes(t.departure_site, t.arrival_plant),
  }))

  const validTATs = tripsWithTAT.filter(t => t.tat != null).map(t => t.tat!)
  const sortedTATs = [...validTATs].sort((a, b) => a - b)

  // Distinct log dates
  const distinctDates = Array.from(new Set(trips.map(t => t.log_date))).sort()

  // ── TAT Variation ──
  const tat_variation: TATVariation | null = validTATs.length >= 3 ? {
    min: Math.round(sortedTATs[0]),
    max: Math.round(sortedTATs[sortedTATs.length - 1]),
    std_dev: Math.round(stdDev(validTATs) * 10) / 10,
    p25: Math.round(percentile(sortedTATs, 0.25)),
    p75: Math.round(percentile(sortedTATs, 0.75)),
    count: validTATs.length,
  } : null

  // ── Value Stream ──
  const outbounds = tripsWithTAT.map(t => t.outbound).filter(v => v != null) as number[]
  const siteWaits = tripsWithTAT.map(t => t.site_wait).filter(v => v != null) as number[]
  const unloads = tripsWithTAT.map(t => t.unload).filter(v => v != null) as number[]
  const returns = tripsWithTAT.map(t => t.return_transit).filter(v => v != null) as number[]

  const avgTAT = avg(validTATs)
  const avgOutbound = outbounds.length > 0 ? avg(outbounds) : null
  const avgSiteWait = siteWaits.length > 0 ? avg(siteWaits) : null
  const avgUnload = unloads.length > 0 ? avg(unloads) : null
  const avgReturn = returns.length > 0 ? avg(returns) : null

  // VA = transit outbound + unload + transit return
  const va = (avgOutbound ?? 0) + (avgUnload ?? 0) + (avgReturn ?? 0)
  // NVA (pure waste) = site wait
  const nva = avgSiteWait ?? 0
  // Necessary NVA = total cycle - VA - NVA (loading, washout, weighbridge)
  const necessaryNva = Math.max(0, avgTAT - va - nva)

  const totalVSM = va + nva + necessaryNva
  const value_stream: ValueStream | null = validTATs.length >= 3 ? {
    loading_queue_avg: necessaryNva > 0 ? Math.round(necessaryNva * 10) / 10 : null,
    transit_outbound_avg: avgOutbound ? Math.round(avgOutbound * 10) / 10 : null,
    site_wait_avg: avgSiteWait ? Math.round(avgSiteWait * 10) / 10 : null,
    unload_avg: avgUnload ? Math.round(avgUnload * 10) / 10 : null,
    transit_return_avg: avgReturn ? Math.round(avgReturn * 10) / 10 : null,
    washout_avg: null, // not measurable from timestamps
    total_cycle_avg: Math.round(avgTAT * 10) / 10,
    va_minutes: Math.round(va * 10) / 10,
    nva_minutes: Math.round(nva * 10) / 10,
    necessary_nva_minutes: Math.round(necessaryNva * 10) / 10,
    va_pct: totalVSM > 0 ? Math.round(va / totalVSM * 1000) / 10 : 0,
    nva_pct: totalVSM > 0 ? Math.round(nva / totalVSM * 1000) / 10 : 0,
    necessary_nva_pct: totalVSM > 0 ? Math.round(necessaryNva / totalVSM * 1000) / 10 : 0,
  } : null

  // ── Site Matrix ──
  const siteGroups: Record<string, typeof tripsWithTAT> = {}
  for (const t of tripsWithTAT) {
    const key = t.site_name || 'Unknown'
    if (!siteGroups[key]) siteGroups[key] = []
    siteGroups[key].push(t)
  }

  const totalTrips = trips.length
  const totalSiteWait = siteWaits.reduce((s, v) => s + v, 0)

  const site_matrix: SitePerformance[] = Object.entries(siteGroups)
    .map(([name, siteTrips]) => {
      const siteWaitValues = siteTrips.map(t => t.site_wait).filter(v => v != null) as number[]
      const siteSiteWaitTotal = siteWaitValues.reduce((s, v) => s + v, 0)
      return {
        site_name: name,
        avg_site_wait: siteWaitValues.length > 0 ? Math.round(avg(siteWaitValues)) : null,
        total_deliveries: siteTrips.length,
        reject_count: siteTrips.filter(t => t.rejected).length,
        pct_of_total_deliveries: Math.round(siteTrips.length / totalTrips * 1000) / 10,
        pct_of_total_site_wait: totalSiteWait > 0 ? Math.round(siteSiteWaitTotal / totalSiteWait * 1000) / 10 : 0,
        coverage: siteTrips.length > 0 ? Math.round(siteWaitValues.length / siteTrips.length * 100) : 0,
      }
    })
    .sort((a, b) => b.total_deliveries - a.total_deliveries)

  // ── Site Concentration ──
  const top3Volume = site_matrix.slice(0, 3).reduce((s, si) => s + si.pct_of_total_deliveries, 0)
  const topSiteWait = site_matrix.length > 0 ? site_matrix.sort((a, b) => b.pct_of_total_site_wait - a.pct_of_total_site_wait)[0].pct_of_total_site_wait : 0
  const topSiteVolume = site_matrix.length > 0 ? site_matrix.sort((a, b) => b.pct_of_total_deliveries - a.pct_of_total_deliveries)[0].pct_of_total_deliveries : 0

  const site_concentration = site_matrix.length >= 2 ? {
    top_site_pct_volume: topSiteVolume,
    top_site_pct_wait: topSiteWait,
    concentration_risk: top3Volume > 60,
  } : null

  // Re-sort site_matrix by deliveries (was sorted by wait above)
  site_matrix.sort((a, b) => b.total_deliveries - a.total_deliveries)

  // ── Truck Matrix ──
  const truckGroups: Record<string, typeof tripsWithTAT> = {}
  for (const t of tripsWithTAT) {
    const key = t.truck_id || 'Unknown'
    if (!truckGroups[key]) truckGroups[key] = []
    truckGroups[key].push(t)
  }

  const fleetAvgTAT = avg(validTATs)

  const truck_matrix: TruckPerformance[] = Object.entries(truckGroups)
    .map(([id, truckTrips]) => {
      const truckTATs = truckTrips.map(t => t.tat).filter(v => v != null) as number[]
      const truckAvg = avg(truckTATs)
      const ratio = fleetAvgTAT > 0 ? truckAvg / fleetAvgTAT : 1
      return {
        truck_id: id,
        avg_tat: Math.round(truckAvg),
        total_trips: truckTrips.length,
        reject_count: truckTrips.filter(t => t.rejected).length,
        std_dev: Math.round(stdDev(truckTATs) * 10) / 10,
        status: (ratio > 1.3 ? 'Outlier' : ratio > 1.1 ? 'Watch' : 'Normal') as 'Normal' | 'Watch' | 'Outlier',
      }
    })
    .sort((a, b) => b.avg_tat - a.avg_tat)

  // ── Baseline / Current Comparison ──
  let baseline_current: BaselineCurrentComparison | null = null
  if (distinctDates.length >= 5) {
    const baselineDates = distinctDates.slice(0, 3)
    const currentDates = distinctDates.slice(-3)

    const baselineTrips = tripsWithTAT.filter(t => baselineDates.includes(t.log_date))
    const currentTrips = tripsWithTAT.filter(t => currentDates.includes(t.log_date))

    const baselineTATs = baselineTrips.map(t => t.tat).filter(v => v != null) as number[]
    const currentTATs = currentTrips.map(t => t.tat).filter(v => v != null) as number[]

    if (baselineTATs.length >= 2 && currentTATs.length >= 2) {
      baseline_current = {
        baseline: {
          days: `Day 1-3 (${baselineDates[0]} to ${baselineDates[2]})`,
          avg_tat: Math.round(avg(baselineTATs)),
          trips_per_day: Math.round(baselineTrips.length / baselineDates.length * 10) / 10,
          reject_pct: baselineTrips.length > 0
            ? Math.round(baselineTrips.filter(t => t.rejected).length / baselineTrips.length * 1000) / 10
            : 0,
        },
        current: {
          days: `Latest (${currentDates[0]} to ${currentDates[2]})`,
          avg_tat: Math.round(avg(currentTATs)),
          trips_per_day: Math.round(currentTrips.length / currentDates.length * 10) / 10,
          reject_pct: currentTrips.length > 0
            ? Math.round(currentTrips.filter(t => t.rejected).length / currentTrips.length * 1000) / 10
            : 0,
        },
      }
    }
  }

  // ── Interventions with before/after ──
  const interventionEffects: InterventionEffect[] = interventions.map(intv => {
    const date = intv.intervention_date
    const before = tripsWithTAT.filter(t => t.log_date < date && t.tat != null)
    const after = tripsWithTAT.filter(t => t.log_date > date && t.tat != null)

    // Use last 3 days before and first 3 days after
    const beforeDates = Array.from(new Set(before.map(t => t.log_date))).sort().slice(-3)
    const afterDates = Array.from(new Set(after.map(t => t.log_date))).sort().slice(0, 3)

    const beforeTATs = before.filter(t => beforeDates.includes(t.log_date)).map(t => t.tat!)
    const afterTATs = after.filter(t => afterDates.includes(t.log_date)).map(t => t.tat!)

    return {
      date,
      title: intv.title,
      target_metric: intv.target_metric,
      avg_tat_before: beforeTATs.length >= 2 ? Math.round(avg(beforeTATs)) : null,
      avg_tat_after: afterTATs.length >= 2 ? Math.round(avg(afterTATs)) : null,
      approximate: beforeTATs.length < 5 || afterTATs.length < 5,
    }
  })

  // ── Capacity Analysis ──
  const avgDailyM3 = distinctDates.length > 0
    ? trips.reduce((s, t) => s + (t.load_m3 ?? 0), 0) / distinctDates.length
    : 0
  const achievable = calcTrace?.target_daily_m3 ?? 0

  const capacity_analysis: CapacityAnalysis | null = avgDailyM3 > 0 ? {
    current_daily_m3: Math.round(avgDailyM3),
    achievable_daily_m3: Math.round(achievable),
    gap_daily_m3: Math.round(Math.max(0, achievable - avgDailyM3)),
    gap_monthly_m3: Math.round(Math.max(0, achievable - avgDailyM3) * (calcTrace?.working_days_month ?? 22)),
  } : null

  return {
    total_trips_observed: trips.length,
    days_observed: distinctDates.length,
    tat_variation,
    value_stream,
    site_matrix,
    truck_matrix,
    site_concentration,
    baseline_current,
    interventions: interventionEffects,
    capacity_analysis,
  }
}
