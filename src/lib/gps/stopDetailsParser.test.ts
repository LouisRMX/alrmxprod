import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseStopDetailsFiles,
  filterOutRegion,
  classifyTrucksByRegion,
  RIYADH_BBOX,
  type ParseInput,
} from './stopDetailsParser'

// Stop Details exports from the OMIX engagement. Paths are absolute because
// the raw export lives outside the repo (sensitive customer data). The test
// skips when not available locally, so CI is unaffected.
const OMIX_ROOT = 'C:\\Users\\lsh29\\Desktop\\OMIX\\GPS_DATA\\STOP DATA'
const MAKKAH = { centerLat: 21.25, centerLon: 39.81, radiusKm: 50 }

function gatherXlsRecursive(dir: string, acc: string[]) {
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) gatherXlsRecursive(full, acc)
      else if (name.toLowerCase().endsWith('.xls')) acc.push(full)
    }
  } catch {
    // directory missing in CI, test will skip
  }
}

function loadInputs(): ParseInput[] {
  const paths: string[] = []
  gatherXlsRecursive(OMIX_ROOT, paths)
  paths.sort()
  return paths.map(p => ({
    filename: p.split(/[\\/]/).pop() ?? p,
    bytes: readFileSync(p),
  }))
}

describe('Stop Details parser — OMIX export (Jan 1 – Feb 12 2026)', () => {
  const inputs = loadInputs()
  const skip = inputs.length === 0

  it('finds all 11 Stop Details files in the expected folder structure', () => {
    if (skip) return
    expect(inputs.length).toBe(11)
  })

  it('parses every file with zero rejections and zero out-of-bounds events', () => {
    if (skip) return
    const result = parseStopDetailsFiles(inputs)
    expect(result.filesRejected).toEqual([])
    for (const file of result.filesAccepted) {
      expect(file.eventsOutOfBounds).toBe(0)
      expect(file.filenamePeriod).not.toBeNull()
      expect(file.headerPeriod).not.toBeNull()
    }
  })

  it('parses 25,010 events total across the 43-day window', () => {
    if (skip) return
    const result = parseStopDetailsFiles(inputs)
    expect(result.events.length).toBe(25010)
  })

  it('identifies ~100 distinct trucks, dominated by mixer-trucks', () => {
    if (skip) return
    const result = parseStopDetailsFiles(inputs)
    const byType = new Map<string, Set<string>>()
    for (const e of result.events) {
      if (!byType.has(e.truckType)) byType.set(e.truckType, new Set())
      byType.get(e.truckType)!.add(e.truckId)
    }
    // OMIX pre-assessment reported 87 trucks total fleet. Data shows 100
    // distinct IDs because some trucks visit multiple plate-number variants
    // in the source string; we key by TM-prefix-id which is stable.
    const mixers = byType.get('mixer_truck')?.size ?? 0
    const pumps = byType.get('pump_truck')?.size ?? 0
    const other = byType.get('other')?.size ?? 0
    expect(mixers).toBeGreaterThanOrEqual(75)
    expect(mixers).toBeLessThanOrEqual(85)
    expect(pumps).toBeGreaterThanOrEqual(10)
    expect(pumps).toBeLessThanOrEqual(20)
    expect(mixers + pumps + other).toBeGreaterThanOrEqual(95)
    expect(mixers + pumps + other).toBeLessThanOrEqual(105)
  })

  it('rejects MD5-duplicate files without ingesting their events', () => {
    if (skip) return
    const first = inputs[0]
    const doubled: ParseInput[] = [
      first,
      { ...first, filename: first.filename + '.copy' },
    ]
    const result = parseStopDetailsFiles(doubled)
    expect(result.filesAccepted.length).toBe(1)
    expect(result.filesRejected.length).toBe(1)
    expect(result.filesRejected[0].reason).toBe('md5_duplicate')
    expect(result.filesRejected[0].duplicateOf).toBe(first.filename)
  })

  it('rejects a file whose filename period does not match its header period', () => {
    if (skip) return
    // Synthesize a tampered filename. Header says Jan 1-4 but filename says Jan 5-8.
    const original = inputs[0]
    const tampered: ParseInput = {
      filename: 'STOP_DETAILS_01_05_26-01_08_26.xls',
      bytes: original.bytes,
    }
    const result = parseStopDetailsFiles([tampered])
    expect(result.filesAccepted.length).toBe(0)
    expect(result.filesRejected[0].reason).toBe('filename_header_mismatch')
  })

  it('Makkah-region filter removes trucks primarily operating there, per-truck scope', () => {
    if (skip) return
    const result = parseStopDetailsFiles(inputs)
    const filtered = filterOutRegion(result.events, MAKKAH)
    // Expect ~7-10 trucks dedicated to Makkah. Filter is per-truck: if a
    // truck is classified as Makkah-scope, ALL its events are removed (even
    // stops made outside the 50km circle, e.g. en route, service visits).
    expect(filtered.droppedTruckIds.length).toBeGreaterThanOrEqual(5)
    expect(filtered.droppedTruckIds.length).toBeLessThanOrEqual(12)
    // Kept events are the Riyadh-scope fleet. Makkah-trucks are a minority
    // so the overwhelming majority of events should survive.
    expect(filtered.kept.length).toBeGreaterThan(result.events.length * 0.85)
  })

  it('positive Riyadh-bbox filter classifies trucks as in_scope / out_of_scope / outlier', () => {
    if (skip) return
    const result = parseStopDetailsFiles(inputs)
    const classified = classifyTrucksByRegion(result.events, RIYADH_BBOX)

    // Expect roughly: 93 in-scope Riyadh trucks, 6 Makkah-dominated,
    // 1 long-haul outlier (matches prior manual audit).
    expect(classified.summary.trucksInScope).toBeGreaterThanOrEqual(90)
    expect(classified.summary.trucksInScope).toBeLessThanOrEqual(96)
    expect(classified.summary.trucksOutOfScope).toBeGreaterThanOrEqual(4)
    expect(classified.summary.trucksOutOfScope).toBeLessThanOrEqual(8)
    expect(classified.summary.trucksOutliers).toBeGreaterThanOrEqual(1)
    expect(classified.summary.trucksOutliers).toBeLessThanOrEqual(3)

    // Kept events must all be from in-scope trucks.
    const inScopeIds = new Set(
      classified.truckProfiles
        .filter(p => p.classification === 'in_scope')
        .map(p => p.truckId),
    )
    for (const e of classified.kept) {
      expect(inScopeIds.has(e.truckId)).toBe(true)
    }

    // Outlier profiles carry a descriptive note for UI display.
    const outliers = classified.truckProfiles.filter(p => p.classification === 'outlier')
    for (const o of outliers) {
      expect(o.note).toMatch(/mixed|% in scope/)
    }
  })
})
