import { describe, it, expect } from 'vitest'
import {
  parseNumberOrRange,
  parseTrips,
  renderProvenance,
  getProvenance,
} from './reportProvenance'

describe('parseNumberOrRange', () => {
  it('reports a plain integer as reported with no raw', () => {
    const r = parseNumberOrRange(14)
    expect(r.value).toBe(14)
    expect(r.provenance.type).toBe('reported')
    expect(r.provenance.raw).toBeUndefined()
  })

  it('reports a clean numeric string as reported with no raw', () => {
    const r = parseNumberOrRange('14')
    expect(r.value).toBe(14)
    expect(r.provenance.type).toBe('reported')
    expect(r.provenance.raw).toBeUndefined()
  })

  it('reports a decimal string as reported', () => {
    const r = parseNumberOrRange('1.5')
    expect(r.value).toBe(1.5)
    expect(r.provenance.type).toBe('reported')
  })

  it('preserves raw when number has trailing unit text', () => {
    const r = parseNumberOrRange('14 hours')
    expect(r.value).toBe(14)
    expect(r.provenance.type).toBe('reported')
    expect(r.provenance.raw).toBe('14 hours')
  })

  it('parses a hyphen range and returns midpoint', () => {
    const r = parseNumberOrRange('12-16')
    expect(r.value).toBe(14)
    expect(r.provenance.type).toBe('midpoint')
    expect(r.provenance.min).toBe(12)
    expect(r.provenance.max).toBe(16)
    expect(r.provenance.raw).toBe('12-16')
  })

  it('parses "12 to 16" as range', () => {
    const r = parseNumberOrRange('12 to 16')
    expect(r.value).toBe(14)
    expect(r.provenance.type).toBe('midpoint')
  })

  it('parses en-dash range', () => {
    const r = parseNumberOrRange('12\u201316')
    expect(r.value).toBe(14)
    expect(r.provenance.type).toBe('midpoint')
  })

  it('parses range with units on both sides (5km-45km)', () => {
    const r = parseNumberOrRange('5km-45km')
    expect(r.value).toBe(25)
    expect(r.provenance.type).toBe('midpoint')
    expect(r.provenance.min).toBe(5)
    expect(r.provenance.max).toBe(45)
  })

  it('parses percentage range (1-2%)', () => {
    const r = parseNumberOrRange('1-2%')
    expect(r.value).toBe(1.5)
    expect(r.provenance.type).toBe('midpoint')
    expect(r.provenance.min).toBe(1)
    expect(r.provenance.max).toBe(2)
  })

  it('parses hours range (12-16 hours)', () => {
    const r = parseNumberOrRange('12-16 hours')
    expect(r.value).toBe(14)
    expect(r.provenance.type).toBe('midpoint')
  })

  it('falls back to interpreted for empty input', () => {
    const r = parseNumberOrRange('', 10)
    expect(r.value).toBe(10)
    expect(r.provenance.type).toBe('interpreted')
  })

  it('falls back to interpreted for null', () => {
    const r = parseNumberOrRange(null, 5)
    expect(r.value).toBe(5)
    expect(r.provenance.type).toBe('interpreted')
  })

  it('falls back to interpreted for unparseable strings', () => {
    const r = parseNumberOrRange('not a number', 99)
    expect(r.value).toBe(99)
    expect(r.provenance.type).toBe('interpreted')
  })

  it('handles decimal ranges (5.5-7.5)', () => {
    const r = parseNumberOrRange('5.5-7.5')
    expect(r.value).toBe(6.5)
    expect(r.provenance.type).toBe('midpoint')
  })
})

describe('parseTrips', () => {
  it('handles total_monthly unit with clean number', () => {
    const r = parseTrips(10875, 'total_monthly', 87, 25)
    expect(r.total_monthly).toBe(10875)
    expect(r.provenance.type).toBe('reported')
  })

  it('interprets per_truck_per_day and computes total', () => {
    const r = parseTrips('5', 'per_truck_per_day', 87, 25)
    expect(r.total_monthly).toBe(5 * 87 * 25)
    expect(r.provenance.type).toBe('interpreted')
    expect(r.provenance.interpretation).toContain('trips/truck/day')
    expect(r.provenance.raw).toBe('5')
  })

  it('matches the Al-Omran "5 Trips" case exactly', () => {
    const r = parseTrips('5 Trips', 'per_truck_per_day', 87, 25)
    expect(r.total_monthly).toBe(10875)
    expect(r.provenance.type).toBe('interpreted')
    expect(r.provenance.raw).toBe('5 Trips')
    expect(r.provenance.interpretation).toContain('10,875')
  })

  it('interprets per_truck_per_week and computes total', () => {
    const r = parseTrips('25', 'per_truck_per_week', 87, 25)
    expect(r.total_monthly).toBeGreaterThan(0)
    expect(r.provenance.type).toBe('interpreted')
    expect(r.provenance.interpretation).toContain('trips/truck/week')
  })
})

describe('renderProvenance', () => {
  it('renders undefined as Reported with no description', () => {
    const r = renderProvenance(undefined)
    expect(r.tag).toBe('Reported')
    expect(r.description).toBe('')
  })

  it('renders plain reported with no description', () => {
    const r = renderProvenance({ type: 'reported' })
    expect(r.tag).toBe('Reported')
    expect(r.description).toBe('')
  })

  it('renders reported with raw answer', () => {
    const r = renderProvenance({ type: 'reported', raw: '14 hours' })
    expect(r.tag).toBe('Reported')
    expect(r.description).toContain('14 hours')
  })

  it('renders midpoint with range', () => {
    const r = renderProvenance({ type: 'midpoint', raw: '12-16 hours', min: 12, max: 16 })
    expect(r.tag).toBe('Midpoint')
    expect(r.description).toContain('12-16 hours')
  })

  it('renders calculated with formula', () => {
    const r = renderProvenance({ type: 'calculated', formula: '81,049 m\u00B3 \u00D7 $27.25' })
    expect(r.tag).toBe('Calculated')
    expect(r.description).toContain('81,049')
  })

  it('renders interpreted with raw and interpretation', () => {
    const r = renderProvenance({
      type: 'interpreted',
      raw: '5 Trips',
      interpretation: 'Interpreted as trips/truck/day',
    })
    expect(r.tag).toBe('Interpreted')
    expect(r.description).toContain('5 Trips')
    expect(r.description).toContain('trips/truck/day')
  })

  it('includes to_verify_on_site flag when set', () => {
    const r = renderProvenance({
      type: 'interpreted',
      raw: '5 plants, 90 m3/hr',
      interpretation: '5 \u00D7 90 reported',
      to_verify_on_site: true,
    })
    expect(r.description).toContain('To verify on-site')
  })
})

describe('getProvenance', () => {
  it('returns reported default for missing field', () => {
    const entry = getProvenance({}, 'any_field')
    expect(entry.type).toBe('reported')
  })

  it('returns reported default for undefined map', () => {
    const entry = getProvenance(undefined, 'any_field')
    expect(entry.type).toBe('reported')
  })

  it('returns entry when field exists', () => {
    const entry = getProvenance(
      { foo: { type: 'midpoint', min: 1, max: 2 } },
      'foo'
    )
    expect(entry.type).toBe('midpoint')
  })
})

describe('integration: Al-Omran inputs', () => {
  it('operating hours 12-16 becomes midpoint 14', () => {
    const r = parseNumberOrRange('12-16 hours')
    expect(r.value).toBe(14)
    expect(r.provenance.type).toBe('midpoint')
  })

  it('rejection rate 1-2% becomes midpoint 1.5', () => {
    const r = parseNumberOrRange('1-2%')
    expect(r.value).toBe(1.5)
    expect(r.provenance.type).toBe('midpoint')
  })

  it('delivery radius 5km-45km becomes midpoint 25', () => {
    const r = parseNumberOrRange('5km-45km')
    expect(r.value).toBe(25)
    expect(r.provenance.type).toBe('midpoint')
    expect(r.provenance.min).toBe(5)
    expect(r.provenance.max).toBe(45)
  })

  it('trip toggle: 5 trips/truck/day × 87 trucks × 25 days = 10,875', () => {
    const r = parseTrips(5, 'per_truck_per_day', 87, 25)
    expect(r.total_monthly).toBe(10875)
  })
})
