import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { detectGpsFormat } from './detectFormat'
import { autoMapColumns, type CanonicalField } from './autoMapper'
import { normalizeRows } from './normalizer'
import { computeMetrics } from './metricsEngine'

const SAMPLES_DIR = join(process.cwd(), 'samples', 'gps')

function loadCsv(filename: string) {
  const text = readFileSync(join(SAMPLES_DIR, filename), 'utf8')
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[]
  const headers = Object.keys(records[0] ?? {})
  return { records, headers }
}

function runPipeline(filename: string, timezone = 'AST') {
  const { records, headers } = loadCsv(filename)
  const format = detectGpsFormat(headers, records.slice(0, 100))
  const mapping = autoMapColumns(headers, format.type)
  const norm = normalizeRows(records, mapping.mapping, timezone)
  const metrics = computeMetrics(norm.events, norm.rowsTotal, norm.rowsParsed, 15)
  return { format, mapping, norm, metrics }
}

describe('GPS pipeline smoke tests', () => {
  it('Ctrack geofence log parses as Type B with paired times', () => {
    const { format, mapping, norm, metrics } = runPipeline('ctrack_geofence_log.csv')
    expect(format.type).toBe('B')
    expect(mapping.mapping['truck_id']).toBeTruthy()
    expect(mapping.mapping['stop_start_time']).toBeTruthy()
    expect(mapping.mapping['stop_end_time']).toBeTruthy()
    expect(norm.rowsParsed).toBeGreaterThan(30)
    expect(metrics.fleet.trucksAnalyzed).toBe(3)
    expect(metrics.turnaround.avg.available).toBe(true)
    // Sanity: avg TAT in realistic range (60-300 min)
    const avgTa = metrics.turnaround.avg.value
    expect(avgTa).toBeGreaterThan(60)
    expect(avgTa).toBeLessThan(300)
  })

  it('Wialon event stream parses as Type A with speed + lat/lon', () => {
    const { format, mapping, norm } = runPipeline('wialon_event_stream.csv')
    expect(format.type).toBe('A')
    expect(mapping.mapping['truck_id']).toBeTruthy()
    expect(mapping.mapping['event_timestamp']).toBeTruthy()
    expect(mapping.mapping['speed']).toBeTruthy()
    expect(mapping.mapping['latitude']).toBeTruthy()
    expect(mapping.mapping['longitude']).toBeTruthy()
    expect(norm.rowsParsed).toBeGreaterThan(40)
  })

  it('Teltonika trip summary parses as Type C with trip IDs', () => {
    const { format, mapping, norm, metrics } = runPipeline('teltonika_trip_summary.csv')
    expect(format.type).toBe('C')
    expect(mapping.mapping['truck_id']).toBeTruthy()
    expect(mapping.mapping['stop_start_time']).toBeTruthy()
    expect(mapping.mapping['stop_end_time']).toBeTruthy()
    expect(norm.rowsParsed).toBeGreaterThan(20)
    expect(metrics.fleet.trucksAnalyzed).toBe(3)
  })

  it('normalizer records parse errors without throwing on malformed rows', () => {
    const headers = ['truck_id', 'event_timestamp', 'stop_start_time', 'stop_end_time']
    const rows: Record<string, string>[] = [
      { truck_id: 'T1', event_timestamp: '2026-04-01 06:00:00', stop_start_time: 'not-a-date', stop_end_time: '2026-04-01 07:00:00' },
      { truck_id: 'T1', event_timestamp: '2026-04-01 08:00:00', stop_start_time: '2026-04-01 08:30:00', stop_end_time: '2026-04-01 09:00:00' },
    ]
    const mapping = autoMapColumns(headers, 'B')
    const norm = normalizeRows(rows, mapping.mapping, 'AST')
    // Bad timestamp becomes null, row still normalized (doesn't throw)
    expect(norm.events.length).toBe(2)
    expect(norm.events[0].stopStartTime).toBeNull()
    expect(norm.events[1].stopStartTime).toBeInstanceOf(Date)
  })

  it('forceMapping flag would skip auto-detect short-circuit (contract check)', () => {
    // This asserts the autoMapper still exposes a requiresManualMapping flag
    // the analyze route uses when forceMapping=true is passed in.
    const { mapping } = runPipeline('ctrack_geofence_log.csv')
    expect(typeof mapping.requiresManualMapping).toBe('boolean')
    expect(Array.isArray(mapping.fieldMatches)).toBe(true)
  })
})

describe('GPS pipeline — chunked rollback safety', () => {
  it('normalizer produces stable event count across runs (deterministic)', () => {
    const run1 = runPipeline('ctrack_geofence_log.csv')
    const run2 = runPipeline('ctrack_geofence_log.csv')
    expect(run1.norm.rowsParsed).toBe(run2.norm.rowsParsed)
    expect(run1.metrics.turnaround.avg.value).toBe(run2.metrics.turnaround.avg.value)
  })
})

// Compile-time check that the CanonicalField type is stable for the analyze route
const _fieldCheck: CanonicalField = 'truck_id'
void _fieldCheck
