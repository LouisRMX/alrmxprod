/**
 * GCC / MENA ready-mix benchmarks
 * Sources: industry association surveys, published case studies, operator interviews.
 * Figures reflect hot-climate markets (UAE, Saudi Arabia, Bahrain, Kuwait, Qatar, Oman).
 *
 * p25 = bottom quartile (needs improvement)
 * p50 = median (acceptable)
 * p75 = top quartile (best-in-class)
 */

export interface BenchmarkBand {
  p25: number
  p50: number
  p75: number
  unit: string
  /** lower values are better (e.g. turnaround time) */
  lowerIsBetter: boolean
  label: string
}

export const GCC_BENCHMARKS: Record<string, BenchmarkBand> = {
  /** Truck turnaround — total cycle from plant departure to return */
  turnaround: {
    p25: 105,
    p50: 90,
    p75: 72,
    unit: 'min',
    lowerIsBetter: true,
    label: 'GCC turnaround',
  },

  /** Order-to-dispatch — time from order confirmation to truck departure */
  dispatch: {
    p25: 35,
    p50: 22,
    p75: 12,
    unit: 'min',
    lowerIsBetter: true,
    label: 'GCC dispatch',
  },

  /** Plant utilisation — actual production / nameplate capacity */
  utilisation: {
    p25: 72,
    p50: 82,
    p75: 91,
    unit: '%',
    lowerIsBetter: false,
    label: 'GCC utilisation',
  },

  /** Rejection / return rate — loads returned or poured-back as % of total */
  rejection: {
    p25: 5.5,
    p50: 3.2,
    p75: 1.4,
    unit: '%',
    lowerIsBetter: true,
    label: 'GCC rejection',
  },

  /** Deliveries per truck per day */
  deliveriesPerTruck: {
    p25: 3.2,
    p50: 4.5,
    p75: 6.0,
    unit: '/day',
    lowerIsBetter: false,
    label: 'GCC del/truck',
  },
}

/**
 * Returns a short benchmark string for display in KPI boxes.
 * E.g. "GCC p50: 90 min · p75: 72 min"
 */
export function benchmarkTag(key: keyof typeof GCC_BENCHMARKS): string {
  const b = GCC_BENCHMARKS[key]
  if (!b) return ''
  return `${b.label} — p50: ${b.p50}${b.unit} · p75: ${b.p75}${b.unit}`
}

/**
 * Live benchmark data shape (matches BenchmarkData from useBenchmarks hook).
 * Duplicated here to avoid a circular import — hook imports from lib/benchmarks.
 */
export interface LiveBenchmarkData {
  n: number
  turnaround: { p25: number; p50: number; p75: number }
  dispatch:   { p25: number; p50: number; p75: number }
  reject:     { p25: number; p50: number; p75: number }
  deliveries: { p50: number }
}

/**
 * Returns a benchmark tag using live database percentiles when available,
 * falling back to static GCC benchmarks when not.
 *
 * Live data shown when N ≥ 3 comparable plants exist.
 * Displayed as: "N similar plants — median: X min · top 25%: Y min"
 */
export function liveBenchmarkTag(
  key: keyof typeof GCC_BENCHMARKS,
  live: LiveBenchmarkData | null
): string {
  const b = GCC_BENCHMARKS[key]
  if (!b) return ''

  if (!live || live.n < 3) {
    // Fall back to static GCC benchmarks
    return benchmarkTag(key)
  }

  const n = live.n
  const label = `${n} similar plant${n === 1 ? '' : 's'}`

  switch (key) {
    case 'turnaround':
      return `${label} — median: ${live.turnaround.p50}${b.unit} · top 25%: ${live.turnaround.p25}${b.unit}`
    case 'dispatch':
      return `${label} — median: ${live.dispatch.p50}${b.unit} · top 25%: ${live.dispatch.p25}${b.unit}`
    case 'rejection':
      return `${label} — median: ${live.reject.p50}${b.unit} · top 25%: ${live.reject.p25}${b.unit}`
    case 'deliveriesPerTruck':
      return `${label} — median: ${live.deliveries.p50}${b.unit}`
    case 'utilisation':
      // No utilisation data in live benchmarks — fall back to static
      return benchmarkTag(key)
    default:
      return benchmarkTag(key)
  }
}

/**
 * Returns which GCC quartile the value sits in.
 * 'top' = p75 or better, 'mid' = p50–p75, 'low' = below p50, 'bottom' = below p25
 */
export function gcQuartile(
  key: keyof typeof GCC_BENCHMARKS,
  value: number
): 'top' | 'mid' | 'low' | 'bottom' {
  const b = GCC_BENCHMARKS[key]
  if (!b) return 'mid'
  const { p25, p50, p75, lowerIsBetter } = b
  if (lowerIsBetter) {
    if (value <= p75) return 'top'
    if (value <= p50) return 'mid'
    if (value <= p25) return 'low'
    return 'bottom'
  } else {
    if (value >= p75) return 'top'
    if (value >= p50) return 'mid'
    if (value >= p25) return 'low'
    return 'bottom'
  }
}
