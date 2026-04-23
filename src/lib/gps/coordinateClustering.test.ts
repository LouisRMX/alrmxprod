import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseStopDetailsFiles,
  filterOutRegion,
  type ParseInput,
} from './stopDetailsParser'
import {
  clusterByCoordinate,
  identifyPlantCandidates,
  classifyOperatingDays,
  summariseOperatingDays,
} from './coordinateClustering'

const OMIX_ROOT = 'C:\\Users\\lsh29\\Desktop\\OMIX\\GPS_DATA\\STOP DATA'
const MAKKAH = { centerLat: 21.25, centerLon: 39.81, radiusKm: 50 }

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

describe('Coordinate clustering — OMIX data', () => {
  const inputs = load()
  const skip = inputs.length === 0

  it('produces the same top-2 clusters previously identified as Malham/Derab candidates', () => {
    if (skip) return
    const { events } = parseStopDetailsFiles(inputs)
    const { kept } = filterOutRegion(events, MAKKAH)
    const clusters = clusterByCoordinate(kept)
    // Top 2 after Makkah filter should be around (24.98, 46.61) and (24.49, 46.74)
    // (confirmed by previous audit + other-chat's local validation).
    const top2Keys = clusters.slice(0, 2).map(c => c.clusterKey).sort()
    expect(top2Keys).toContain('24.98,46.61')
    expect(top2Keys).toContain('24.49,46.74')
  })

  it('top clusters are dominated by mixer-truck stops', () => {
    if (skip) return
    const { events } = parseStopDetailsFiles(inputs)
    const { kept } = filterOutRegion(events, MAKKAH)
    const clusters = clusterByCoordinate(kept)
    // Plants are >80% mixer stops (pumps don't load, they stay on-site).
    for (const c of clusters.slice(0, 2)) {
      expect(c.mixerShare).toBeGreaterThanOrEqual(0.80)
    }
  })

  it('identifies top-2 clusters as high-confidence plant candidates', () => {
    if (skip) return
    const { events } = parseStopDetailsFiles(inputs)
    const { kept } = filterOutRegion(events, MAKKAH)
    const clusters = clusterByCoordinate(kept)
    const candidates = identifyPlantCandidates(clusters)
    const highConfidence = candidates.filter(c => c.confidence === 'high')
    expect(highConfidence.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Operating-day classification — OMIX data', () => {
  const inputs = load()
  const skip = inputs.length === 0

  it('excludes Fridays even when fleet activity happens to be high', () => {
    if (skip) return
    const { events } = parseStopDetailsFiles(inputs)
    const { kept } = filterOutRegion(events, MAKKAH)
    const days = classifyOperatingDays(kept, 80)
    for (const d of days) {
      if (d.dayOfWeek === 'Fri') {
        expect(d.isOperating).toBe(false)
        expect(d.disqualifiedBy).toBe('friday')
      }
    }
  })

  it('produces at least 4 operating weeks from 43 calendar days', () => {
    if (skip) return
    const { events } = parseStopDetailsFiles(inputs)
    const { kept } = filterOutRegion(events, MAKKAH)
    const days = classifyOperatingDays(kept, 80)
    const summary = summariseOperatingDays(days)
    expect(summary.totalDays).toBe(43)
    // 6 fridays in a 43-day span starting Jan 1.
    expect(summary.fridays).toBe(6)
    // Remaining 37 days. Some will be disqualified as low-activity
    // (Saturdays with reduced ops, early-close Thursdays, public holidays).
    // Expect at least 25 full operating days (~4 operating weeks).
    expect(summary.operatingDays).toBeGreaterThanOrEqual(25)
    // Validate that low-activity + fridays + operating + (other) = total
    expect(
      summary.operatingDays + summary.fridays + summary.lowActivityDays,
    ).toBe(summary.totalDays)
  })

  it('low-activity days (e.g. public holidays) are excluded even if not Friday', () => {
    if (skip) return
    const { events } = parseStopDetailsFiles(inputs)
    const { kept } = filterOutRegion(events, MAKKAH)
    const days = classifyOperatingDays(kept, 80)
    // Some non-Friday days should have low activity (e.g. Jan 1 or public
    // holidays in early Jan). The audit saw min=2 events on one day — that
    // would be disqualified as low_fleet_activity.
    const lowActivity = days.filter(d => d.disqualifiedBy === 'low_fleet_activity')
    expect(lowActivity.length).toBeGreaterThanOrEqual(1)
  })
})
