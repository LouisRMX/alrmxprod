import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CalcResult } from '@/lib/calculations'

export interface BenchmarkData {
  n: number
  turnaround: { p25: number; p50: number; p75: number }
  dispatch:   { p25: number; p50: number; p75: number }
  reject:     { p25: number; p50: number; p75: number }
  deliveries: { p50: number }
}

export function radiusBucket(radius: number): 'short' | 'medium' | 'long' {
  if (radius < 10) return 'short'
  if (radius <= 20) return 'medium'
  return 'long'
}

export function fleetBucket(trucks: number): 'small' | 'medium' | 'large' {
  if (trucks <= 5) return 'small'
  if (trucks <= 15) return 'medium'
  return 'large'
}

/**
 * Fetches anonymized percentile data for plants comparable to the current one.
 * Comparable = same radius bucket + fleet size bucket.
 * Returns null when fewer than 3 comparable plants exist in the database.
 * Never fires for demo assessments.
 */
export function useBenchmarks(
  calcResult: CalcResult | null,
  assessmentId: string | null
): BenchmarkData | null {
  const [data, setData] = useState<BenchmarkData | null>(null)

  useEffect(() => {
    if (!calcResult?.overall || !assessmentId || assessmentId === 'demo') return

    const rb = radiusBucket(calcResult.radius)
    const fb = fleetBucket(calcResult.trucks)
    const supabase = createClient()

    supabase
      .rpc('get_plant_percentiles', {
        p_radius_bucket: rb,
        p_fleet_bucket:  fb,
        p_exclude_id:    assessmentId,
      })
      .then(({ data: bData, error }) => {
        if (error) {
          console.warn('[useBenchmarks] RPC error:', error.message)
          return
        }
        if (bData) setData(bData as BenchmarkData)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcResult?.radius, calcResult?.trucks, calcResult?.overall, assessmentId])

  return data
}
