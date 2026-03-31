import { describe, it, expect } from 'vitest'
import { calc, type Answers } from '../calculations'
import { buildIssues, type Issue } from '../issues'

// ── Helper: reuse same baseline answers as calculations.test.ts ─────────────

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return {
    price_m3: 58,
    cement_cost: 25,
    aggregate_cost: 8,
    admix_cost: 5,
    plant_cap: 134,
    op_hours: 10,
    op_days: 300,
    actual_prod: 3000,
    working_days_month: 25,
    n_trucks: 32,
    mixer_capacity: 7,
    turnaround: 97,
    deliveries_day: 40,
    delivery_radius: 15,
    dispatch_tool: 'Spreadsheet combined with WhatsApp',
    order_to_dispatch: '15 to 25 minutes — acceptable',
    route_clustering: 'Usually — informal grouping most of the time',
    plant_idle: 'Occasionally — a few times per week',
    order_notice: '4 to 24 hours — day-of or day-before',
    reject_pct: 4,
    quality_control: 'Usually done — most trucks, informal recording',
    batch_calibration: '1 to 2 years ago',
    surplus_concrete: '0.2 to 0.5 m³ — moderate',
    prod_data_source: 'System records — read from batch computer or dispatch system',
    ...overrides,
  }
}

function getIssues(overrides: Partial<Answers> = {}, meta?: { country?: string }) {
  const a = makeAnswers(overrides)
  const r = calc(a, { season: 'peak' })
  return buildIssues(r, a, meta)
}

function findIssue(issues: Issue[], fragment: string) {
  return issues.find(i => i.t.toLowerCase().includes(fragment.toLowerCase()))
}

// ── Bottleneck findings ─────────────────────────────────────────────────────

describe('Bottleneck findings', () => {
  it('turnaround above target generates turnaround issue', () => {
    const issues = getIssues({ turnaround: 120 })
    const ta = findIssue(issues, 'turnaround')
    expect(ta).toBeDefined()
    expect(ta!.loss).toBeGreaterThan(0)
    expect(ta!.category).toBe('bottleneck')
  })

  it('turnaround at or below target generates no turnaround issue', () => {
    // radius 15 → TARGET_TA = 60 + 15*1.5 = 82.5 → clamped 83. turnaround 80 < 83.
    const issues = getIssues({ turnaround: 80, delivery_radius: 15 })
    const ta = findIssue(issues, 'turnaround')
    expect(ta).toBeUndefined()
  })

  it('low production utilization generates capacity gap issue', () => {
    const issues = getIssues({ actual_prod: 1000 }) // very low
    const cap = findIssue(issues, 'running at')
    expect(cap).toBeDefined()
    expect(cap!.category).toBe('bottleneck')
    expect(cap!.loss).toBeGreaterThan(0)
  })

  it('hidden deliveries generate fleet underutilization issue', () => {
    const issues = getIssues({ deliveries_day: 10 }) // very low vs fleet capacity
    const hidden = findIssue(issues, 'unrealised')
    expect(hidden).toBeDefined()
    expect(hidden!.category).toBe('bottleneck')
  })

  it('dispatch score < 65 generates dispatch bottleneck issue', () => {
    const issues = getIssues({
      dispatch_tool: 'Phone calls and a whiteboard or paper list',
      order_to_dispatch: 'Over 40 minutes — critical bottleneck',
      route_clustering: 'Rarely or never',
      plant_idle: 'Every day — always waiting for trucks',
    })
    const disp = findIssue(issues, 'dispatch score')
    expect(disp).toBeDefined()
    expect(disp!.category).toBe('bottleneck')
  })

  it('fleet availability < 85% generates availability issue', () => {
    const issues = getIssues({ truck_availability: 20, n_trucks: 32 })
    const fleet = findIssue(issues, 'fleet availability')
    expect(fleet).toBeDefined()
    expect(fleet!.category).toBe('bottleneck')
  })
})

// ── Independent findings ────────────────────────────────────────────────────

describe('Independent findings', () => {
  it('reject_pct > 1.5 generates rejection issue', () => {
    const issues = getIssues({ reject_pct: 5 })
    const rej = findIssue(issues, 'rejected')
    expect(rej).toBeDefined()
    expect(rej!.category).toBe('independent')
    expect(rej!.loss).toBeGreaterThan(0)
  })

  it('reject_pct = 0 generates no rejection issue', () => {
    const issues = getIssues({ reject_pct: 0 })
    const rej = findIssue(issues, 'rejected')
    expect(rej).toBeUndefined()
  })

  it('cement silo under 2 days generates supply risk', () => {
    const issues = getIssues({ silo_days: 'Under 2 days — high supply risk' })
    const silo = findIssue(issues, 'cement stock under 2')
    expect(silo).toBeDefined()
    expect(silo!.sev).toBe('red')
    expect(silo!.category).toBe('independent')
  })

  it('aggregate under 2 days generates supply risk', () => {
    const issues = getIssues({ aggregate_days: 'Under 2 days — high supply risk' })
    const agg = findIssue(issues, 'aggregate stock under 2')
    expect(agg).toBeDefined()
    expect(agg!.sev).toBe('red')
  })

  it('no operator backup generates dependency issue', () => {
    const issues = getIssues({ operator_backup: 'No — only one person can run the batch plant' })
    const op = findIssue(issues, 'single-operator')
    expect(op).toBeDefined()
    expect(op!.sev).toBe('red')
    expect(op!.category).toBe('independent')
  })

  it('customer concentration > 50% generates red issue', () => {
    const issues = getIssues({ top_customer_pct: 60 })
    const conc = findIssue(issues, 'critical revenue concentration')
    expect(conc).toBeDefined()
    expect(conc!.sev).toBe('red')
  })

  it('customer concentration 30-50% generates amber issue', () => {
    const issues = getIssues({ top_customer_pct: 40 })
    const conc = findIssue(issues, 'concentration risk')
    expect(conc).toBeDefined()
    expect(conc!.sev).toBe('amber')
  })

  it('slow washout generates washout issue', () => {
    const issues = getIssues({ washout_time: '20 to 30 minutes — slow' })
    const wash = findIssue(issues, 'washout')
    expect(wash).toBeDefined()
    expect(wash!.category).toBe('independent')
  })

  it('no Ramadan schedule in GCC country generates issue', () => {
    const issues = getIssues(
      { ramadan_schedule: 'No — same schedule year-round' },
      { country: 'Saudi Arabia' }
    )
    const ram = findIssue(issues, 'ramadan')
    expect(ram).toBeDefined()
    expect(ram!.category).toBe('independent')
    expect(ram!.loss).toBeGreaterThan(0)
  })

  it('no Ramadan schedule in non-GCC country generates no issue', () => {
    const issues = getIssues(
      { ramadan_schedule: 'No — same schedule year-round' },
      { country: 'Germany' }
    )
    const ram = findIssue(issues, 'ramadan')
    expect(ram).toBeUndefined()
  })

  it('mix designs never reviewed with cement cost generates optimisation issue', () => {
    const issues = getIssues({
      mix_design_review: 'Never formally reviewed — original designs still in use',
      admix_strategy: 'Workability only — admixtures used to improve flow and placement',
    })
    const mix = findIssue(issues, 'mix designs')
    expect(mix).toBeDefined()
    expect(mix!.category).toBe('independent')
  })

  it('partial load below 80% generates issue', () => {
    const issues = getIssues({ partial_load_size: 4, mixer_capacity: 7 })
    const partial = findIssue(issues, 'average load')
    expect(partial).toBeDefined()
    expect(partial!.loss).toBeGreaterThan(0)
    expect(partial!.category).toBe('independent')
  })

  it('surplus concrete >= 0.35 generates waste issue', () => {
    const issues = getIssues({ surplus_concrete: '0.5 to 1.0 m³ — significant' })
    const surplus = findIssue(issues, 'surplus')
    expect(surplus).toBeDefined()
    expect(surplus!.category).toBe('independent')
  })
})

// ── Sorting & categories ────────────────────────────────────────────────────

describe('Sorting and categories', () => {
  it('pinned issues come first', () => {
    const issues = getIssues({ turnaround: 140, actual_prod: 800 })
    const pinned = issues.filter(i => i.pin)
    if (pinned.length > 0) {
      const firstPinnedIdx = issues.indexOf(pinned[0])
      const firstUnpinnedIdx = issues.findIndex(i => !i.pin)
      expect(firstPinnedIdx).toBeLessThan(firstUnpinnedIdx === -1 ? Infinity : firstUnpinnedIdx)
    }
  })

  it('non-pinned issues sorted by loss descending', () => {
    const issues = getIssues({ reject_pct: 5, turnaround: 130 })
    const unpinned = issues.filter(i => !i.pin && i.loss > 0)
    for (let i = 1; i < unpinned.length; i++) {
      expect(unpinned[i].loss).toBeLessThanOrEqual(unpinned[i - 1].loss)
    }
  })

  it('all issues have a category', () => {
    const issues = getIssues({ reject_pct: 5, turnaround: 130, silo_days: 'Under 2 days — high supply risk' })
    for (const issue of issues) {
      expect(['bottleneck', 'independent']).toContain(issue.category)
    }
  })
})

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('empty answers produces no issues', () => {
    const r = calc({}, { season: 'peak' })
    const issues = buildIssues(r, {})
    expect(issues).toEqual([])
  })

  it('minimal required fields produce limited issues without crash', () => {
    const a: Answers = {
      price_m3: 65,
      cement_cost: 38,
      plant_cap: 100,
      op_hours: 8,
      op_days: 280,
      actual_prod: 2000,
      n_trucks: 10,
      turnaround: 80,
      deliveries_day: 30,
      reject_pct: 1,
      dispatch_tool: 'Dedicated dispatch software with real-time tracking',
      order_to_dispatch: 'Under 15 minutes — fast response',
      prod_data_source: 'System records — read from batch computer or dispatch system',
    }
    const r = calc(a, { season: 'peak' })
    const issues = buildIssues(r, a)
    // Should not throw, may have some issues
    expect(Array.isArray(issues)).toBe(true)
  })
})
