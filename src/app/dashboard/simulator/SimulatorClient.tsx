'use client'

import { useState, useMemo } from 'react'

interface AssessmentData {
  id: string
  overall: number | null
  bottleneck: string | null
  ebitda_monthly: number | null
  answers: Record<string, string>
  scores: Record<string, number>
  plant?: { name: string; country: string; customer?: { name: string } }
}

interface SimulatorClientProps {
  assessments: AssessmentData[]
}

/* ── helpers ── */
function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1_000).toLocaleString() + 'k'
  return '$' + Math.round(n).toLocaleString()
}

function fmtRange(lo: number, hi: number): string {
  return fmtMoney(lo) + ' – ' + fmtMoney(hi)
}

function fmtVolumeRange(lo: number, hi: number): string {
  return Math.round(lo).toLocaleString() + ' – ' + Math.round(hi).toLocaleString() + ' m³'
}

function fmtVolume(n: number): string {
  return Math.round(n).toLocaleString() + ' m³'
}

function scoreColor(s: number): string {
  if (s >= 80) return '#27ae60'
  if (s >= 60) return '#D68910'
  return '#C0392B'
}

/* ── dispatch efficiency model ── */
function dispatchEfficiency(orderToDispatch: string, idleFreq?: string): number {
  const otdMap: Record<string, number> = {
    'Under 10 minutes': 0.95,
    '10 to 15 minutes': 0.90,
    '15 to 25 minutes': 0.82,
    '25 to 40 minutes': 0.70,
    'Over 40 minutes': 0.55,
  }
  let eff = 0.80
  for (const [key, val] of Object.entries(otdMap)) {
    if (orderToDispatch?.includes(key)) { eff = val; break }
  }
  if (idleFreq?.includes('Most days')) eff *= 0.90
  else if (idleFreq?.includes('few times')) eff *= 0.95
  return Math.max(0.40, Math.min(0.98, eff))
}

/* ── confidence system ── */
type Confidence = 'High' | 'Medium' | 'Low'

function calcConfidence(
  baseTurnaround: number, turnaround: number,
  baseTrucks: number, trucks: number,
  baseUtil: number, utilTarget: number,
): { level: Confidence; margin: number } {
  const changes: number[] = []
  if (baseTurnaround > 0) changes.push(Math.abs(turnaround - baseTurnaround) / baseTurnaround)
  if (baseTrucks > 0) changes.push(Math.abs(trucks - baseTrucks) / baseTrucks)
  if (baseUtil > 0) changes.push(Math.abs(utilTarget - baseUtil) / baseUtil)
  const maxChange = Math.max(...changes, 0)

  if (maxChange < 0.15) return { level: 'High', margin: 0.10 }
  if (maxChange < 0.30) return { level: 'Medium', margin: 0.20 }
  return { level: 'Low', margin: 0.30 }
}

/* ── realism check ── */
type Realism = 'Realistic' | 'Moderate' | 'Aggressive'

function calcRealism(
  baseTurnaround: number, turnaround: number,
  utilTarget: number,
  changeCount: number,
): { level: Realism; warnings: string[] } {
  const warnings: string[] = []
  let score = 0

  // Turnaround improvement >30%
  const turnaroundImprovement = baseTurnaround > 0 ? (baseTurnaround - turnaround) / baseTurnaround : 0
  if (turnaroundImprovement > 0.30) {
    warnings.push('Turnaround improvement exceeds 30%, this typically requires significant infrastructure or process changes.')
    score += 2
  } else if (turnaroundImprovement > 0.15) {
    score += 1
  }

  // Utilization >92%
  if (utilTarget > 92) {
    warnings.push('Utilization above 92% is rare in practice, plants need buffer for maintenance, changeovers, and demand variability.')
    score += 2
  }

  // Multiple large changes
  if (changeCount >= 3) {
    warnings.push('This scenario assumes improvements across multiple areas simultaneously, implementation risk is higher.')
    score += 1
  }

  const level: Realism = score >= 3 ? 'Aggressive' : score >= 1 ? 'Moderate' : 'Realistic'
  return { level, warnings: warnings.slice(0, 2) } // max 2 warnings
}

/* ── constraint engine ── */
function simulate(
  answers: Record<string, string>,
  overrides: { turnaround: number; trucks: number; utilTarget: number; priceM3: number }
) {
  const plantCap = num(answers.plant_cap, 120)
  const opHours = num(answers.op_hours, 10)
  const opDays = num(answers.op_days, 300)
  const actualProd = num(answers.actual_prod, 2000)
  const mixerCap = num(answers.mixer_capacity, 7)
  const rejectPct = num(answers.reject_pct, 3) / 100
  const cementCost = num(answers.cement_cost, 12)

  const turnaround = overrides.turnaround
  const nTrucks = overrides.trucks
  const utilTarget = overrides.utilTarget / 100
  const priceM3 = overrides.priceM3

  const contributionM3 = Math.max(priceM3 - cementCost * 1.6, priceM3 * 0.15)

  // 1. Production-limited daily capacity
  const prodDaily = plantCap * opHours * utilTarget * (1 - rejectPct)

  // 2. Fleet-limited daily capacity
  const tripsPerTruck = (opHours * 60) / turnaround
  const totalDeliveries = tripsPerTruck * nTrucks
  const fleetDaily = totalDeliveries * mixerCap

  // 3. Dispatch efficiency
  const dispEff = dispatchEfficiency(answers.order_to_dispatch, answers.plant_idle)
  const effectiveFleetDaily = fleetDaily * dispEff

  // 4. Constraint-aware output
  const scenarioDaily = Math.min(prodDaily, effectiveFleetDaily)
  const scenarioAnnual = scenarioDaily * opDays

  // 5. Identify bottleneck
  let bottleneck: string
  if (prodDaily <= effectiveFleetDaily) {
    bottleneck = 'Production'
  } else {
    bottleneck = 'Fleet / Logistics'
  }
  if (fleetDaily > prodDaily && effectiveFleetDaily < prodDaily) {
    bottleneck = 'Dispatch'
  }

  // 6. Baseline
  const baselineAnnual = actualProd * 12

  // 7. Deltas
  const incrementalVolume = Math.max(0, scenarioAnnual - baselineAnnual)
  const revenueUpside = incrementalVolume * priceM3
  const contributionUpside = incrementalVolume * contributionM3

  return {
    scenarioDaily: Math.round(scenarioDaily),
    scenarioAnnual: Math.round(scenarioAnnual),
    baselineAnnual: Math.round(baselineAnnual),
    incrementalVolume: Math.round(incrementalVolume),
    revenueUpside: Math.round(revenueUpside),
    contributionUpside: Math.round(contributionUpside),
    contributionM3: Math.round(contributionM3),
    bottleneck,
    prodDaily: Math.round(prodDaily),
    fleetDaily: Math.round(fleetDaily),
    effectiveFleetDaily: Math.round(effectiveFleetDaily),
    dispEff,
  }
}

/* ── warning engine ── */
function generateWarnings(
  result: ReturnType<typeof simulate>,
  baseTrucks: number, trucks: number,
  basePrice: number, priceM3: number,
): string[] {
  const warnings: string[] = []

  if (trucks > baseTrucks && result.bottleneck === 'Production') {
    warnings.push('Adding trucks provides limited benefit, production capacity is the binding constraint.')
  }
  if (result.bottleneck === 'Fleet / Logistics' && result.dispEff < 0.75) {
    warnings.push('Dispatch inefficiencies restrict effective fleet throughput, improving coordination may be more impactful than adding trucks.')
  }
  if (result.bottleneck === 'Production' && result.effectiveFleetDaily > result.prodDaily * 1.5) {
    warnings.push('Fleet capacity significantly exceeds production, some trucks may be underutilized.')
  }
  if (priceM3 !== basePrice) {
    warnings.push('Revenue impact is sensitive to price assumptions, treat as directional estimate.')
  }

  return warnings.slice(0, 2)
}

/* ── recommendation engine ── */
function generateRecommendation(result: ReturnType<typeof simulate>, dispEff: number): string {
  if (result.bottleneck === 'Production') {
    return 'Focus on increasing plant utilization and reducing unplanned stops before investing in fleet expansion. Production capacity is the primary constraint, additional trucks or dispatch improvements will not increase output until production throughput improves.'
  }
  if (result.bottleneck === 'Dispatch') {
    return 'Prioritise dispatch coordination improvements, upgrading dispatch tools, reducing order-to-dispatch time, and implementing route clustering. These changes typically require lower investment than fleet expansion and directly increase effective throughput.'
  }
  // Fleet / Logistics
  if (dispEff < 0.80) {
    return 'Improve dispatch efficiency before adding trucks. Current coordination losses reduce effective fleet capacity by ' + Math.round((1 - dispEff) * 100) + '%. Fixing dispatch first maximizes the return from your existing fleet.'
  }
  return 'Consider reducing turnaround time through site layout improvements, scheduling optimization, or adding trucks if turnaround is already near benchmark levels.'
}

/* ── insight generator ── */
function generateInsight(
  baseline: { annual: number; bottleneck: string | null },
  result: ReturnType<typeof simulate>,
  overrides: { turnaround: number; trucks: number; utilTarget: number; priceM3: number },
  baseAnswers: Record<string, string>,
  confidence: Confidence,
  margin: number,
): string {
  const changes: string[] = []
  const baseTurnaround = num(baseAnswers.turnaround, 90)
  const baseTrucks = num(baseAnswers.n_trucks, 20)

  if (overrides.turnaround !== baseTurnaround) {
    changes.push(`turnaround time from ${baseTurnaround} to ${overrides.turnaround} minutes`)
  }
  if (overrides.trucks !== baseTrucks) {
    const diff = overrides.trucks - baseTrucks
    changes.push(`fleet size by ${diff > 0 ? '+' : ''}${diff} trucks (${baseTrucks} → ${overrides.trucks})`)
  }
  if (overrides.utilTarget !== Math.min(92, Math.round((num(baseAnswers.actual_prod, 2000) / Math.max(1, num(baseAnswers.plant_cap, 120) * num(baseAnswers.op_hours, 10) * 30)) * 100))) {
    changes.push(`utilization target to ${overrides.utilTarget}%`)
  }

  if (changes.length === 0) return 'Adjust the sliders above to model improvement scenarios.'

  const changeTxt = changes.join(' and ')
  const lo = Math.round(result.incrementalVolume * (1 - margin))
  const hi = Math.round(result.incrementalVolume * (1 + margin))
  const revLo = Math.round(result.revenueUpside * (1 - margin))
  const revHi = Math.round(result.revenueUpside * (1 + margin))

  let txt = `Changing ${changeTxt} could increase annual output by approximately ${fmtVolumeRange(lo, hi)}, equivalent to ${fmtRange(revLo, revHi)} in additional revenue.`

  // Bottleneck shift insight
  if (result.bottleneck !== baseline.bottleneck && baseline.bottleneck) {
    txt += `\n\nThe primary bottleneck shifts from ${baseline.bottleneck} to ${result.bottleneck}, indicating that the original constraint has been relieved but a new one emerges.`
  } else {
    txt += `\n\n${result.bottleneck} remains the primary constraint, further gains require addressing this area directly.`
  }

  // Dispatch insight
  if (result.dispEff < 0.80) {
    txt += ` Dispatch efficiency is at ${Math.round(result.dispEff * 100)}%, meaning ${Math.round((1 - result.dispEff) * 100)}% of theoretical fleet capacity is lost to coordination inefficiencies.`
  }

  // Confidence note
  if (confidence === 'Low') {
    txt += '\n\nNote: This scenario involves significant changes from baseline, treat estimates as directional ranges, not precise forecasts.'
  }

  return txt
}

/* ── component ── */
export default function SimulatorClient({ assessments }: SimulatorClientProps) {
  const [selectedId, setSelectedId] = useState<string>(assessments[0]?.id || '')
  const selected = assessments.find(a => a.id === selectedId)
  const baseAnswers = (selected?.answers || {}) as Record<string, string>

  // Parse baseline turnaround from option text
  const baseTurnaroundRaw = baseAnswers.turnaround || ''
  const baseTurnaround = (() => {
    if (baseTurnaroundRaw.includes('Under 60')) return 55
    if (baseTurnaroundRaw.includes('60 to 75')) return 68
    if (baseTurnaroundRaw.includes('75 to 90')) return 83
    if (baseTurnaroundRaw.includes('90 to 120')) return 105
    if (baseTurnaroundRaw.includes('Over 120')) return 135
    const n = num(baseTurnaroundRaw)
    return n > 0 ? n : 90
  })()

  const baseTrucks = num(baseAnswers.n_trucks, 20)
  const basePrice = num(baseAnswers.price_m3, 50)
  const baseUtil = Math.min(92, Math.round(
    (num(baseAnswers.actual_prod, 2000) / Math.max(1, num(baseAnswers.plant_cap, 120) * num(baseAnswers.op_hours, 10) * 30)) * 100
  ))

  const [turnaround, setTurnaround] = useState(baseTurnaround)
  const [trucks, setTrucks] = useState(baseTrucks)
  const [utilTarget, setUtilTarget] = useState(Math.max(baseUtil, 60))
  const [priceM3, setPriceM3] = useState(basePrice)

  const resetSliders = (id: string) => {
    setSelectedId(id)
    const a = assessments.find(x => x.id === id)
    if (!a) return
    const ans = (a.answers || {}) as Record<string, string>
    const tr = ans.turnaround || ''
    const t = tr.includes('Under 60') ? 55 : tr.includes('60 to 75') ? 68 : tr.includes('75 to 90') ? 83 : tr.includes('90 to 120') ? 105 : tr.includes('Over 120') ? 135 : 90
    setTurnaround(t)
    setTrucks(num(ans.n_trucks, 20))
    setPriceM3(num(ans.price_m3, 50))
    setUtilTarget(Math.max(Math.min(92, Math.round((num(ans.actual_prod, 2000) / Math.max(1, num(ans.plant_cap, 120) * num(ans.op_hours, 10) * 30)) * 100)), 60))
  }

  // Count changes from baseline
  const changeCount = useMemo(() => {
    let c = 0
    if (turnaround !== baseTurnaround) c++
    if (trucks !== baseTrucks) c++
    if (utilTarget !== Math.max(baseUtil, 60)) c++
    if (priceM3 !== basePrice) c++
    return c
  }, [turnaround, trucks, utilTarget, priceM3, baseTurnaround, baseTrucks, baseUtil, basePrice])

  const result = useMemo(() => {
    if (!selected) return null
    return simulate(baseAnswers, { turnaround, trucks, utilTarget, priceM3 })
  }, [selected, baseAnswers, turnaround, trucks, utilTarget, priceM3])

  const confidence = useMemo(() =>
    calcConfidence(baseTurnaround, turnaround, baseTrucks, trucks, baseUtil, utilTarget),
    [baseTurnaround, turnaround, baseTrucks, trucks, baseUtil, utilTarget]
  )

  const realism = useMemo(() =>
    calcRealism(baseTurnaround, turnaround, utilTarget, changeCount),
    [baseTurnaround, turnaround, utilTarget, changeCount]
  )

  const warnings = useMemo(() => {
    if (!result) return []
    return generateWarnings(result, baseTrucks, trucks, basePrice, priceM3)
  }, [result, baseTrucks, trucks, basePrice, priceM3])

  const recommendation = useMemo(() => {
    if (!result) return ''
    return generateRecommendation(result, result.dispEff)
  }, [result])

  const insight = useMemo(() => {
    if (!selected || !result) return ''
    return generateInsight(
      { annual: result.baselineAnnual, bottleneck: selected.bottleneck },
      result, { turnaround, trucks, utilTarget, priceM3 },
      baseAnswers, confidence.level, confidence.margin
    )
  }, [selected, result, turnaround, trucks, utilTarget, priceM3, baseAnswers, confidence])

  if (assessments.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--gray-700)', marginBottom: '8px' }}>
          No completed assessments
        </div>
        <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
          Complete a plant assessment with scores to use the Scenario Simulator.
        </div>
      </div>
    )
  }

  const sliderStyle = {
    width: '100%', height: '6px', borderRadius: '3px',
    appearance: 'none' as const, background: '#e0e0e0', outline: 'none', cursor: 'pointer',
  }

  const confColor = { High: '#27ae60', Medium: '#D68910', Low: '#C0392B' }[confidence.level]
  const realismColor = { Realistic: '#27ae60', Moderate: '#D68910', Aggressive: '#C0392B' }[realism.level]

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--gray-900)' }}>Scenario Simulator</h1>
        <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>
          Test improvement scenarios and estimate recovery potential
        </p>
      </div>

      {/* Assessment selector */}
      <div style={{
        background: 'var(--white)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '20px'
      }}>
        <label style={{ fontSize: '11px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '6px' }}>
          Select assessment
        </label>
        <select
          value={selectedId}
          onChange={e => resetSliders(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', fontSize: '14px',
            border: '1px solid var(--border)', borderRadius: '6px',
            fontFamily: 'var(--font)', color: 'var(--gray-900)', background: 'var(--white)'
          }}
        >
          {assessments.map(a => (
            <option key={a.id} value={a.id}>
              {a.plant?.name || '-'}, {a.plant?.customer?.name || '-'}, Score: {a.overall}/100, {a.bottleneck || '-'}
            </option>
          ))}
        </select>
      </div>

      {selected && result && (
        <>
          {/* Baseline snapshot */}
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)', marginBottom: '12px' }}>
              Baseline, {selected.plant?.name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {[
                { label: 'Overall score', value: `${selected.overall}/100`, color: scoreColor(selected.overall || 0) },
                { label: 'Bottleneck', value: selected.bottleneck || '-', color: '#C0392B' },
                { label: 'Annual volume', value: fmtVolume(result.baselineAnnual), color: 'var(--gray-900)' },
                { label: 'EBITDA gap', value: fmtMoney(selected.ebitda_monthly || 0) + '/mo', color: '#C0392B' },
              ].map(kpi => (
                <div key={kpi.label}>
                  <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>
                    {kpi.label}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: kpi.color }}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sliders + confidence/realism badges */}
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)' }}>
                Scenario controls
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                  background: confColor + '18', color: confColor, border: `1px solid ${confColor}40`
                }}>
                  Confidence: {confidence.level}
                </span>
                <span style={{
                  padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                  background: realismColor + '18', color: realismColor, border: `1px solid ${realismColor}40`
                }}>
                  {realism.level}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              {/* Turnaround */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Turnaround time</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--mono)', color: turnaround < baseTurnaround ? '#27ae60' : 'var(--gray-900)' }}>
                    {turnaround} min
                  </span>
                </div>
                <input type="range" min={30} max={180} step={5} value={turnaround}
                  onChange={e => setTurnaround(Number(e.target.value))} style={sliderStyle} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-400)', marginTop: '4px' }}>
                  <span>30 min</span>
                  <span style={{ color: 'var(--gray-500)', fontWeight: '500' }}>baseline: {baseTurnaround}</span>
                  <span>180 min</span>
                </div>
              </div>

              {/* Trucks */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Number of trucks</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--mono)', color: trucks > baseTrucks ? '#27ae60' : 'var(--gray-900)' }}>
                    {trucks}
                  </span>
                </div>
                <input type="range" min={1} max={Math.max(80, baseTrucks * 2)} step={1} value={trucks}
                  onChange={e => setTrucks(Number(e.target.value))} style={sliderStyle} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-400)', marginTop: '4px' }}>
                  <span>1</span>
                  <span style={{ color: 'var(--gray-500)', fontWeight: '500' }}>baseline: {baseTrucks}</span>
                  <span>{Math.max(80, baseTrucks * 2)}</span>
                </div>
              </div>

              {/* Utilization target */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Utilization target</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--mono)', color: utilTarget > baseUtil ? '#27ae60' : 'var(--gray-900)' }}>
                    {utilTarget}%
                  </span>
                </div>
                <input type="range" min={10} max={95} step={1} value={utilTarget}
                  onChange={e => setUtilTarget(Number(e.target.value))} style={sliderStyle} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-400)', marginTop: '4px' }}>
                  <span>10%</span>
                  <span style={{ color: 'var(--gray-500)', fontWeight: '500' }}>baseline: {baseUtil}%</span>
                  <span>95%</span>
                </div>
              </div>

              {/* Price (marked as assumption) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>
                    Price per m³ <span style={{ fontSize: '10px', color: 'var(--gray-400)', fontStyle: 'italic' }}>(assumption)</span>
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--mono)', color: priceM3 !== basePrice ? '#2471A3' : 'var(--gray-900)' }}>
                    ${priceM3}
                  </span>
                </div>
                <input type="range" min={Math.max(10, Math.round(basePrice * 0.5))} max={Math.round(basePrice * 2)} step={1} value={priceM3}
                  onChange={e => setPriceM3(Number(e.target.value))} style={sliderStyle} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-400)', marginTop: '4px' }}>
                  <span>${Math.max(10, Math.round(basePrice * 0.5))}</span>
                  <span style={{ color: 'var(--gray-500)', fontWeight: '500' }}>baseline: ${basePrice}</span>
                  <span>${Math.round(basePrice * 2)}</span>
                </div>
              </div>
            </div>

            {/* Realism warnings */}
            {realism.warnings.length > 0 && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {realism.warnings.map((w, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: '6px', fontSize: '12px', lineHeight: '1.5',
                    background: '#FEF9E7', border: '1px solid #F9E79F', color: '#7D6608',
                  }}>
                    ⚠️ {w}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Impact panel */}
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)' }}>
                Scenario impact
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic' }}>
                Assumed contribution: ${result.contributionM3}/m³
              </div>
            </div>

            {/* Comparison table with ranges */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['', 'Baseline', 'Scenario (est. range)', 'Delta'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', fontSize: '11px', fontWeight: '600',
                      color: 'var(--gray-500)', textAlign: h === '' ? 'left' : 'right',
                      textTransform: 'uppercase', letterSpacing: '.4px'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const m = confidence.margin
                  const rows = [
                    {
                      label: 'Annual output',
                      baseline: fmtVolume(result.baselineAnnual),
                      scenario: result.incrementalVolume > 0
                        ? fmtVolumeRange(result.scenarioAnnual * (1 - m), result.scenarioAnnual * (1 + m))
                        : fmtVolume(result.scenarioAnnual),
                      delta: result.incrementalVolume > 0
                        ? '+' + fmtVolumeRange(result.incrementalVolume * (1 - m), result.incrementalVolume * (1 + m))
                        : '-',
                      positive: result.incrementalVolume > 0
                    },
                    {
                      label: 'Revenue upside',
                      baseline: '-',
                      scenario: result.revenueUpside > 0
                        ? fmtRange(result.revenueUpside * (1 - m), result.revenueUpside * (1 + m))
                        : '-',
                      delta: result.revenueUpside > 0
                        ? '+' + fmtRange(result.revenueUpside * (1 - m), result.revenueUpside * (1 + m))
                        : '-',
                      positive: result.revenueUpside > 0
                    },
                    {
                      label: 'Contribution upside',
                      baseline: '-',
                      scenario: result.contributionUpside > 0
                        ? fmtRange(result.contributionUpside * (1 - m), result.contributionUpside * (1 + m))
                        : '-',
                      delta: result.contributionUpside > 0
                        ? '+' + fmtRange(result.contributionUpside * (1 - m), result.contributionUpside * (1 + m))
                        : '-',
                      positive: result.contributionUpside > 0
                    },
                    {
                      label: 'Primary bottleneck',
                      baseline: selected.bottleneck || '-',
                      scenario: result.bottleneck,
                      delta: result.bottleneck !== selected.bottleneck ? '↻ Shifted' : 'No change',
                      positive: result.bottleneck !== selected.bottleneck
                    },
                  ]
                  return rows.map((row, i) => (
                    <tr key={row.label} style={{ borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--gray-700)', fontWeight: '500' }}>
                        {row.label}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-500)', textAlign: 'right' }}>
                        {row.baseline}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-900)', textAlign: 'right', fontWeight: '600' }}>
                        {row.scenario}
                      </td>
                      <td style={{
                        padding: '10px 12px', fontSize: '13px', fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: '600',
                        color: row.positive ? '#27ae60' : 'var(--gray-400)'
                      }}>
                        {row.delta}
                      </td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>

            {/* Constraint breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Production capacity', value: fmtVolume(result.prodDaily) + '/day', active: result.bottleneck === 'Production' },
                { label: 'Fleet capacity (effective)', value: fmtVolume(result.effectiveFleetDaily) + '/day', active: result.bottleneck === 'Fleet / Logistics' || result.bottleneck === 'Dispatch' },
                { label: 'Dispatch efficiency', value: Math.round(result.dispEff * 100) + '%', active: result.bottleneck === 'Dispatch' },
              ].map(c => (
                <div key={c.label} style={{
                  padding: '12px', borderRadius: '8px',
                  border: c.active ? '2px solid #C0392B' : '1px solid var(--border)',
                  background: c.active ? '#FDF2F2' : 'var(--gray-50)',
                }}>
                  <div style={{ fontSize: '10px', color: c.active ? '#C0392B' : 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>
                    {c.label} {c.active && '← constraint'}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--mono)', color: c.active ? '#C0392B' : 'var(--gray-700)' }}>
                    {c.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Operational warnings */}
            {warnings.length > 0 && (
              <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', borderRadius: '6px', fontSize: '12px', lineHeight: '1.5',
                    background: '#FDEDEC', border: '1px solid #F5B7B1', color: '#922B21',
                  }}>
                    ⚠️ {w}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Insight panel */}
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)', marginBottom: '12px' }}>
              Analysis
            </div>
            <div style={{
              fontSize: '13px', lineHeight: '1.7', color: 'var(--gray-700)', whiteSpace: 'pre-line'
            }}>
              {insight}
            </div>
          </div>

          {/* Recommended priority */}
          <div style={{
            background: '#E8F8F5', border: '1px solid #A3E4D7',
            borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1A5276', marginBottom: '8px' }}>
              Recommended priority
            </div>
            <div style={{ fontSize: '13px', lineHeight: '1.7', color: '#1A5276' }}>
              {recommendation}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
