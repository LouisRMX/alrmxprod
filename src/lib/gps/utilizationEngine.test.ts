import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseStopDetailsFiles,
  classifyTrucksByRegion,
  RIYADH_BBOX,
  type ParseInput,
} from './stopDetailsParser'
import {
  classifyOperatingDays,
} from './coordinateClustering'
import {
  countLoadsPerOperatingDay,
  computeUtilizationMetrics,
  computeGap,
  type PlantGeofence,
} from './utilizationEngine'

const OMIX_ROOT = 'C:\\Users\\lsh29\\Desktop\\OMIX\\GPS_DATA\\STOP DATA'

// Confirmed plant coordinates from map validation (Louis's 22:00 screenshot).
const OMIX_PLANTS: PlantGeofence[] = [
  { slug: 'malham', name: 'Malham', centroidLat: 24.98, centroidLon: 46.61, radiusM: 500 },
  { slug: 'derab', name: 'Derab', centroidLat: 24.49, centroidLon: 46.74, radiusM: 500 },
]

// OMIX pre-assessment-confirmed financials.
const OMIX_FINANCIAL = {
  m3PerLoad: 7.45,
  marginPerM3: 27.25,
  monthlyOperatingDays: 25,
}

function gather(dir: string, acc: string[]) {
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) gather(full, acc)
      else if (name.toLowerCase().endsWith('.xls')) acc.push(full)
    }
  } catch {
    // absent in CI
  }
}

function load(): ParseInput[] {
  const paths: string[] = []
  gather(OMIX_ROOT, paths)
  paths.sort()
  return paths.map(p => ({
    filename: p.split(/[\\/]/).pop() ?? p,
    bytes: readFileSync(p),
  }))
}

function fullPipeline() {
  const inputs = load()
  const { events } = parseStopDetailsFiles(inputs)
  const classified = classifyTrucksByRegion(events, RIYADH_BBOX)
  const days = classifyOperatingDays(classified.kept, classified.summary.trucksInScope)
  const perDay = countLoadsPerOperatingDay(classified.kept, OMIX_PLANTS, days)
  const metrics = computeUtilizationMetrics(perDay, days)
  return { classified, days, perDay, metrics }
}

describe('Utilization engine — OMIX data', () => {
  const skip = load().length === 0

  it('classifies plant-stops correctly using confirmed coordinates', () => {
    if (skip) return
    const { perDay } = fullPipeline()
    let totalLoads = 0
    const perPlantTotals = new Map<string, number>()
    perDay.forEach(rec => {
      totalLoads += rec.loads
      rec.perPlant.forEach((count, slug) => {
        perPlantTotals.set(slug, (perPlantTotals.get(slug) ?? 0) + count)
      })
    })
    // Should have loads at both Malham and Derab.
    expect(perPlantTotals.has('malham')).toBe(true)
    expect(perPlantTotals.has('derab')).toBe(true)
    // Malham (top cluster) should have more loads than Derab (cluster #2).
    expect(perPlantTotals.get('malham')!).toBeGreaterThan(perPlantTotals.get('derab')!)
    // Total mixer-truck plant-loads on operating days with 500m geofence.
    // Stricter than the earlier 1km-precision cluster audit (which counted
    // all truck types on all calendar days), so expect somewhat lower.
    expect(totalLoads).toBeGreaterThanOrEqual(5000)
    expect(totalLoads).toBeLessThanOrEqual(10000)
  })

  it('produces both current and demonstrated metrics for 43-day window', () => {
    if (skip) return
    const { metrics } = fullPipeline()
    expect(metrics.current.loadsPerOpDay).toBeGreaterThan(0)
    expect(metrics.demonstrated).not.toBeNull()
    expect(metrics.peak).not.toBeNull()
    expect(metrics.demonstratedWeeks.length).toBe(2)
  })

  it('demonstrated capacity is higher than current average', () => {
    if (skip) return
    const { metrics } = fullPipeline()
    // By definition: top-2 weeks > 30-day avg.
    expect(metrics.demonstrated!.loadsPerOpDay).toBeGreaterThan(metrics.current.loadsPerOpDay)
    // Peak ≥ demonstrated by construction.
    expect(metrics.peak!.loadsPerOpDay).toBeGreaterThanOrEqual(metrics.demonstrated!.loadsPerOpDay)
  })

  it('computes positive monthly USD gap in plausible range', () => {
    if (skip) return
    const { metrics } = fullPipeline()
    const gap = computeGap(metrics, OMIX_FINANCIAL)
    expect(gap).not.toBeNull()
    expect(gap!.gapLoadsPerOpDay).toBeGreaterThan(0)
    expect(gap!.monthlyValueUsd).toBeGreaterThan(0)
    // Sanity check: OMIX pre-assessment estimated ~$546k/mo full gap
    // against external target. Our self-benchmarked gap should be SMALLER
    // because demonstrated is more conservative than external target.
    // Expect gap between $50k and $500k.
    expect(gap!.monthlyValueUsd).toBeGreaterThan(50_000)
    expect(gap!.monthlyValueUsd).toBeLessThan(500_000)
  })

  it('trips-per-truck metrics align with pre-assessment range (5.0 actual)', () => {
    if (skip) return
    const { metrics } = fullPipeline()
    // Pre-assessment claimed 5.0 trips/truck/day. Our current (from GPS
    // loads only) should be in the same neighborhood — possibly lower
    // since we only count plant-stops as loads, and some loads might
    // happen at secondary facilities we haven't classified yet.
    expect(metrics.current.tripsPerTruckPerOpDay).toBeGreaterThan(1)
    expect(metrics.current.tripsPerTruckPerOpDay).toBeLessThan(10)
  })
})
