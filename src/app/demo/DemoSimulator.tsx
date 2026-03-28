'use client'

import { useState, useMemo } from 'react'

/* ── Demo plant data (from assessment-tool.html DEMO_ASSESSMENTS) ── */
interface DemoPlant {
  id: string; plant: string; company: string; overall: number
  bottleneck: string; ebitdaMonthly: number
  scores: { prod: number; dispatch: number; fleet: number; logistics: number; quality: number }
  turnaround: number; utilPct: number; price: number; contrib: number; nTrucks: number
}

const DEMO_PLANTS: DemoPlant[] = [
  {id:"2024",plant:"Plant 25 — Qassim North",company:"Al-Cem Readymix",overall:79,bottleneck:"Dispatch",ebitdaMonthly:597425,scores:{prod:85,dispatch:72,fleet:80,logistics:80,quality:72},turnaround:102,utilPct:78,price:75,contrib:26,nTrucks:38},
  {id:"2005",plant:"Plant 6 — Jeddah North",company:"Al-Cem Readymix",overall:62,bottleneck:"Dispatch",ebitdaMonthly:567981,scores:{prod:62,dispatch:55,fleet:68,logistics:68,quality:60},turnaround:104,utilPct:57,price:70,contrib:24,nTrucks:28},
  {id:"2012",plant:"Plant 13 — Medina Central",company:"Al-Cem Readymix",overall:64,bottleneck:"Production",ebitdaMonthly:529500,scores:{prod:55,dispatch:65,fleet:72,logistics:72,quality:62},turnaround:99,utilPct:51,price:70,contrib:24,nTrucks:24},
  {id:"2006",plant:"Plant 7 — Jeddah South",company:"Al-Cem Readymix",overall:63,bottleneck:"Production",ebitdaMonthly:528601,scores:{prod:58,dispatch:60,fleet:72,logistics:72,quality:57},turnaround:96,utilPct:53,price:72,contrib:25,nTrucks:26},
  {id:"2000",plant:"Plant 1 — Riyadh North",company:"Al-Cem Readymix",overall:50,bottleneck:"Dispatch",ebitdaMonthly:266587,scores:{prod:55,dispatch:30,fleet:65,logistics:65,quality:48},turnaround:97,utilPct:51,price:58,contrib:20,nTrucks:20},
  {id:"2001",plant:"Plant 2 — Riyadh South",company:"Al-Cem Readymix",overall:52,bottleneck:"Dispatch",ebitdaMonthly:248635,scores:{prod:48,dispatch:35,fleet:72,logistics:72,quality:50},turnaround:77,utilPct:44,price:64,contrib:21,nTrucks:24},
  {id:"2034",plant:"Plant 35 — Medina South",company:"Al-Cem Readymix",overall:89,bottleneck:"Dispatch",ebitdaMonthly:301546,scores:{prod:89,dispatch:87,fleet:91,logistics:91,quality:86},turnaround:80,utilPct:82,price:70,contrib:24,nTrucks:36},
  {id:"2033",plant:"Plant 34 — Mecca Ring Road",company:"Al-Cem Readymix",overall:94,bottleneck:"Dispatch",ebitdaMonthly:15572,scores:{prod:95,dispatch:92,fleet:94,logistics:94,quality:90},turnaround:82,utilPct:87,price:63,contrib:22,nTrucks:42},
]

/* ── helpers ── */
function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1_000).toLocaleString() + 'k'
  return '$' + Math.round(n).toLocaleString()
}
function fmtRange(lo: number, hi: number): string { return fmtMoney(lo) + ' – ' + fmtMoney(hi) }
function fmtVolume(n: number): string { return Math.round(n).toLocaleString() + ' m³' }
function fmtVolumeRange(lo: number, hi: number): string { return Math.round(lo).toLocaleString() + ' – ' + Math.round(hi).toLocaleString() + ' m³' }
function scoreColor(s: number): string { return s >= 80 ? '#27ae60' : s >= 60 ? '#D68910' : '#C0392B' }

/* ── confidence ── */
type Confidence = 'High' | 'Medium' | 'Low'
function calcConfidence(base: DemoPlant, turnaround: number, utilTarget: number): { level: Confidence; margin: number } {
  const changes = [
    Math.abs(turnaround - base.turnaround) / base.turnaround,
    Math.abs(utilTarget - base.utilPct) / Math.max(base.utilPct, 1),
  ]
  const max = Math.max(...changes)
  if (max < 0.15) return { level: 'High', margin: 0.10 }
  if (max < 0.30) return { level: 'Medium', margin: 0.20 }
  return { level: 'Low', margin: 0.30 }
}

/* ── realism ── */
type Realism = 'Realistic' | 'Moderate' | 'Aggressive'
function calcRealism(base: DemoPlant, turnaround: number, utilTarget: number): { level: Realism; warnings: string[] } {
  const warnings: string[] = []
  let score = 0
  const improvement = (base.turnaround - turnaround) / base.turnaround
  if (improvement > 0.30) { warnings.push('Turnaround improvement exceeds 30% — typically requires significant infrastructure changes.'); score += 2 }
  else if (improvement > 0.15) score += 1
  if (utilTarget > 92) { warnings.push('Utilization above 92% is rare — plants need buffer for maintenance and demand variability.'); score += 2 }
  return { level: score >= 3 ? 'Aggressive' : score >= 1 ? 'Moderate' : 'Realistic', warnings: warnings.slice(0, 2) }
}

/* ── simulate using demo data ── */
function simulate(plant: DemoPlant, turnaround: number, trucks: number, utilTarget: number, priceM3: number) {
  // Use benchmark assumptions for demo (120 m³/hr plant, 10hrs, 300 days, 7 m³ mixer)
  const plantCap = 120
  const opHours = 10
  const opDays = 300
  const nTrucks = trucks
  const mixerCap = 7
  const rejectPct = 0.03

  const util = utilTarget / 100
  const prodDaily = plantCap * opHours * util * (1 - rejectPct)
  const tripsPerTruck = (opHours * 60) / turnaround
  const fleetDaily = tripsPerTruck * nTrucks * mixerCap
  const dispEff = plant.scores.dispatch / 100
  const effectiveFleetDaily = fleetDaily * dispEff
  const scenarioDaily = Math.min(prodDaily, effectiveFleetDaily)
  const scenarioAnnual = scenarioDaily * opDays

  // Baseline from utilPct
  const baseDaily = plantCap * opHours * (plant.utilPct / 100) * (1 - rejectPct)
  const baselineAnnual = baseDaily * opDays

  let bottleneck: string
  if (prodDaily <= effectiveFleetDaily) bottleneck = 'Production'
  else bottleneck = 'Fleet / Logistics'
  if (fleetDaily > prodDaily && effectiveFleetDaily < prodDaily) bottleneck = 'Dispatch'

  const incrementalVolume = Math.max(0, scenarioAnnual - baselineAnnual)
  const revenueUpside = incrementalVolume * priceM3
  const contributionUpside = incrementalVolume * plant.contrib

  return {
    scenarioAnnual: Math.round(scenarioAnnual),
    baselineAnnual: Math.round(baselineAnnual),
    incrementalVolume: Math.round(incrementalVolume),
    revenueUpside: Math.round(revenueUpside),
    contributionUpside: Math.round(contributionUpside),
    bottleneck,
    prodDaily: Math.round(prodDaily),
    effectiveFleetDaily: Math.round(effectiveFleetDaily),
    dispEff,
  }
}

/* ── recommendation ── */
function getRecommendation(bottleneck: string, dispEff: number): string {
  if (bottleneck === 'Production') return 'Focus on increasing plant utilization and reducing unplanned stops before investing in fleet expansion. Production capacity is the primary constraint.'
  if (bottleneck === 'Dispatch') return 'Prioritise dispatch coordination improvements — upgrading tools, reducing order-to-dispatch time, and implementing route clustering. These deliver higher returns than fleet expansion.'
  if (dispEff < 0.80) return 'Improve dispatch efficiency before adding trucks. Current coordination losses reduce effective fleet capacity by ' + Math.round((1 - dispEff) * 100) + '%.'
  return 'Consider reducing turnaround time through site layout improvements or scheduling optimization.'
}

/* ── component ── */
export default function DemoSimulator() {
  const [selectedId, setSelectedId] = useState(DEMO_PLANTS[0].id)
  const plant = DEMO_PLANTS.find(p => p.id === selectedId) || DEMO_PLANTS[0]

  const [turnaround, setTurnaround] = useState(plant.turnaround)
  const [trucks, setTrucks] = useState(plant.nTrucks)
  const [utilTarget, setUtilTarget] = useState(plant.utilPct)
  const [priceM3, setPriceM3] = useState(plant.price)

  const resetSliders = (id: string) => {
    setSelectedId(id)
    const p = DEMO_PLANTS.find(x => x.id === id) || DEMO_PLANTS[0]
    setTurnaround(p.turnaround)
    setTrucks(p.nTrucks)
    setUtilTarget(p.utilPct)
    setPriceM3(p.price)
  }

  const result = useMemo(() => simulate(plant, turnaround, trucks, utilTarget, priceM3), [plant, turnaround, trucks, utilTarget, priceM3])
  const confidence = useMemo(() => {
    const changes = [
      Math.abs(turnaround - plant.turnaround) / plant.turnaround,
      Math.abs(trucks - plant.nTrucks) / Math.max(plant.nTrucks, 1),
      Math.abs(utilTarget - plant.utilPct) / Math.max(plant.utilPct, 1),
    ]
    const max = Math.max(...changes)
    if (max < 0.15) return { level: 'High' as Confidence, margin: 0.10 }
    if (max < 0.30) return { level: 'Medium' as Confidence, margin: 0.20 }
    return { level: 'Low' as Confidence, margin: 0.30 }
  }, [plant, turnaround, trucks, utilTarget])
  const realism = useMemo(() => calcRealism(plant, turnaround, utilTarget), [plant, turnaround, utilTarget])

  const confColor = { High: '#27ae60', Medium: '#D68910', Low: '#C0392B' }[confidence.level]
  const realismColor = { Realistic: '#27ae60', Moderate: '#D68910', Aggressive: '#C0392B' }[realism.level]

  const sliderStyle = { width: '100%', height: '6px', borderRadius: '3px', appearance: 'none' as const, background: '#e0e0e0', outline: 'none', cursor: 'pointer' }

  // Warnings
  const warnings: string[] = []
  if (trucks > plant.nTrucks && result.bottleneck === 'Production') warnings.push('Adding trucks provides limited benefit — production capacity is the binding constraint.')
  if (result.bottleneck === 'Production' && result.effectiveFleetDaily > result.prodDaily * 1.5) warnings.push('Fleet capacity significantly exceeds production — some trucks may be underutilized.')
  if (priceM3 !== plant.price) warnings.push('Revenue impact is sensitive to price assumptions — treat as directional estimate.')

  // Insight
  const m = confidence.margin
  let insight = ''
  const changes: string[] = []
  if (turnaround !== plant.turnaround) changes.push(`turnaround from ${plant.turnaround} to ${turnaround} min`)
  if (trucks !== plant.nTrucks) { const diff = trucks - plant.nTrucks; changes.push(`fleet size by ${diff > 0 ? '+' : ''}${diff} trucks (${plant.nTrucks} → ${trucks})`) }
  if (utilTarget !== plant.utilPct) changes.push(`utilization from ${plant.utilPct}% to ${utilTarget}%`)
  if (changes.length === 0) {
    insight = 'Adjust the sliders above to model improvement scenarios.'
  } else {
    insight = `Changing ${changes.join(' and ')} could increase annual output by approximately ${fmtVolumeRange(result.incrementalVolume * (1 - m), result.incrementalVolume * (1 + m))}, equivalent to ${fmtRange(result.revenueUpside * (1 - m), result.revenueUpside * (1 + m))} in additional revenue.`
    if (result.bottleneck !== plant.bottleneck) {
      insight += `\n\nThe bottleneck shifts from ${plant.bottleneck} to ${result.bottleneck}, indicating the original constraint has been relieved.`
    } else {
      insight += `\n\n${result.bottleneck} remains the primary constraint — further gains require addressing this area.`
    }
    if (result.dispEff < 0.80) insight += ` Dispatch efficiency at ${Math.round(result.dispEff * 100)}% means ${Math.round((1 - result.dispEff) * 100)}% of fleet capacity is lost to coordination.`
    if (confidence.level === 'Low') insight += '\n\nNote: Large changes from baseline — treat as directional ranges.'
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: 'var(--gray-900)' }}>Scenario Simulator</h1>
        <p style={{ fontSize: '13px', color: 'var(--gray-500)', marginTop: '2px' }}>Test improvement scenarios using demo plant data</p>
      </div>

      {/* Plant selector */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '20px' }}>
        <label style={{ fontSize: '11px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: '6px' }}>Select plant</label>
        <select value={selectedId} onChange={e => resetSliders(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px', fontFamily: 'var(--font)', color: 'var(--gray-900)', background: 'var(--white)' }}>
          {DEMO_PLANTS.map(p => (
            <option key={p.id} value={p.id}>{p.plant} — Score: {p.overall}/100 — {p.bottleneck}</option>
          ))}
        </select>
      </div>

      {/* Baseline */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)', marginBottom: '12px' }}>Baseline — {plant.plant}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
          {[
            { label: 'Overall score', value: `${plant.overall}/100`, color: scoreColor(plant.overall) },
            { label: 'Bottleneck', value: plant.bottleneck, color: '#C0392B' },
            { label: 'Annual volume', value: fmtVolume(result.baselineAnnual), color: 'var(--gray-900)' },
            { label: 'EBITDA gap', value: fmtMoney(plant.ebitdaMonthly) + '/mo', color: '#C0392B' },
          ].map(kpi => (
            <div key={kpi.label}>
              <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>{kpi.label}</div>
              <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)' }}>Scenario controls</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: confColor + '18', color: confColor, border: `1px solid ${confColor}40` }}>Confidence: {confidence.level}</span>
            <span style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', background: realismColor + '18', color: realismColor, border: `1px solid ${realismColor}40` }}>{realism.level}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Turnaround */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Turnaround time</span>
              <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--mono)', color: turnaround < plant.turnaround ? '#27ae60' : 'var(--gray-900)' }}>{turnaround} min</span>
            </div>
            <input type="range" min={30} max={180} step={5} value={turnaround} onChange={e => setTurnaround(Number(e.target.value))} style={sliderStyle} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-400)', marginTop: '4px' }}>
              <span>30 min</span><span style={{ color: 'var(--gray-500)', fontWeight: '500' }}>baseline: {plant.turnaround}</span><span>180 min</span>
            </div>
          </div>

          {/* Trucks */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Number of trucks</span>
              <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--mono)', color: trucks > plant.nTrucks ? '#27ae60' : 'var(--gray-900)' }}>{trucks}</span>
            </div>
            <input type="range" min={1} max={Math.max(80, plant.nTrucks * 2)} step={1} value={trucks} onChange={e => setTrucks(Number(e.target.value))} style={sliderStyle} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-400)', marginTop: '4px' }}>
              <span>1</span><span style={{ color: 'var(--gray-500)', fontWeight: '500' }}>baseline: {plant.nTrucks}</span><span>{Math.max(80, plant.nTrucks * 2)}</span>
            </div>
          </div>

          {/* Utilization */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Utilization target</span>
              <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--mono)', color: utilTarget > plant.utilPct ? '#27ae60' : 'var(--gray-900)' }}>{utilTarget}%</span>
            </div>
            <input type="range" min={10} max={95} step={1} value={utilTarget} onChange={e => setUtilTarget(Number(e.target.value))} style={sliderStyle} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-400)', marginTop: '4px' }}>
              <span>10%</span><span style={{ color: 'var(--gray-500)', fontWeight: '500' }}>baseline: {plant.utilPct}%</span><span>95%</span>
            </div>
          </div>

          {/* Price (assumption) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-600)' }}>Price per m³ <span style={{ fontSize: '10px', color: 'var(--gray-400)', fontStyle: 'italic' }}>(assumption)</span></span>
              <span style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'var(--mono)', color: priceM3 !== plant.price ? '#2471A3' : 'var(--gray-900)' }}>${priceM3}</span>
            </div>
            <input type="range" min={Math.max(10, Math.round(plant.price * 0.5))} max={Math.round(plant.price * 2)} step={1} value={priceM3} onChange={e => setPriceM3(Number(e.target.value))} style={sliderStyle} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-400)', marginTop: '4px' }}>
              <span>${Math.max(10, Math.round(plant.price * 0.5))}</span><span style={{ color: 'var(--gray-500)', fontWeight: '500' }}>baseline: ${plant.price}</span><span>${Math.round(plant.price * 2)}</span>
            </div>
          </div>
        </div>

        {realism.warnings.length > 0 && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {realism.warnings.map((w, i) => (
              <div key={i} style={{ padding: '10px 14px', borderRadius: '6px', fontSize: '12px', lineHeight: '1.5', background: '#FEF9E7', border: '1px solid #F9E79F', color: '#7D6608' }}>⚠️ {w}</div>
            ))}
          </div>
        )}
      </div>

      {/* Impact */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)' }}>Scenario impact</div>
          <div style={{ fontSize: '11px', color: 'var(--gray-400)', fontStyle: 'italic' }}>Assumed contribution: ${plant.contrib}/m³</div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['', 'Baseline', 'Scenario (est. range)', 'Delta'].map(h => (
                <th key={h} style={{ padding: '8px 12px', fontSize: '11px', fontWeight: '600', color: 'var(--gray-500)', textAlign: h === '' ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Annual output', baseline: fmtVolume(result.baselineAnnual), scenario: result.incrementalVolume > 0 ? fmtVolumeRange(result.scenarioAnnual * (1 - m), result.scenarioAnnual * (1 + m)) : fmtVolume(result.scenarioAnnual), delta: result.incrementalVolume > 0 ? '+' + fmtVolumeRange(result.incrementalVolume * (1 - m), result.incrementalVolume * (1 + m)) : '—', positive: result.incrementalVolume > 0 },
              { label: 'Revenue upside', baseline: '—', scenario: result.revenueUpside > 0 ? fmtRange(result.revenueUpside * (1 - m), result.revenueUpside * (1 + m)) : '—', delta: result.revenueUpside > 0 ? '+' + fmtRange(result.revenueUpside * (1 - m), result.revenueUpside * (1 + m)) : '—', positive: result.revenueUpside > 0 },
              { label: 'Contribution upside', baseline: '—', scenario: result.contributionUpside > 0 ? fmtRange(result.contributionUpside * (1 - m), result.contributionUpside * (1 + m)) : '—', delta: result.contributionUpside > 0 ? '+' + fmtRange(result.contributionUpside * (1 - m), result.contributionUpside * (1 + m)) : '—', positive: result.contributionUpside > 0 },
              { label: 'Primary bottleneck', baseline: plant.bottleneck, scenario: result.bottleneck, delta: result.bottleneck !== plant.bottleneck ? '↻ Shifted' : 'No change', positive: result.bottleneck !== plant.bottleneck },
            ].map((row, i) => (
              <tr key={row.label} style={{ borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--gray-700)', fontWeight: '500' }}>{row.label}</td>
                <td style={{ padding: '10px 12px', fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-500)', textAlign: 'right' }}>{row.baseline}</td>
                <td style={{ padding: '10px 12px', fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--gray-900)', textAlign: 'right', fontWeight: '600' }}>{row.scenario}</td>
                <td style={{ padding: '10px 12px', fontSize: '13px', fontFamily: 'var(--mono)', textAlign: 'right', fontWeight: '600', color: row.positive ? '#27ae60' : 'var(--gray-400)' }}>{row.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Constraint boxes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Production capacity', value: fmtVolume(result.prodDaily) + '/day', active: result.bottleneck === 'Production' },
            { label: 'Fleet capacity (effective)', value: fmtVolume(result.effectiveFleetDaily) + '/day', active: result.bottleneck === 'Fleet / Logistics' || result.bottleneck === 'Dispatch' },
            { label: 'Dispatch efficiency', value: Math.round(result.dispEff * 100) + '%', active: result.bottleneck === 'Dispatch' },
          ].map(c => (
            <div key={c.label} style={{ padding: '12px', borderRadius: '8px', border: c.active ? '2px solid #C0392B' : '1px solid var(--border)', background: c.active ? '#FDF2F2' : 'var(--gray-50)' }}>
              <div style={{ fontSize: '10px', color: c.active ? '#C0392B' : 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '4px' }}>{c.label} {c.active && '← constraint'}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--mono)', color: c.active ? '#C0392B' : 'var(--gray-700)' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {warnings.length > 0 && (
          <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {warnings.map((w, i) => (
              <div key={i} style={{ padding: '10px 14px', borderRadius: '6px', fontSize: '12px', lineHeight: '1.5', background: '#FDEDEC', border: '1px solid #F5B7B1', color: '#922B21' }}>⚠️ {w}</div>
            ))}
          </div>
        )}
      </div>

      {/* Insight */}
      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--gray-700)', marginBottom: '12px' }}>Analysis</div>
        <div style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--gray-700)', whiteSpace: 'pre-line' }}>{insight}</div>
      </div>

      {/* Recommendation */}
      <div style={{ background: '#E8F8F5', border: '1px solid #A3E4D7', borderRadius: 'var(--radius)', padding: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1A5276', marginBottom: '8px' }}>Recommended priority</div>
        <div style={{ fontSize: '13px', lineHeight: '1.7', color: '#1A5276' }}>{getRecommendation(result.bottleneck, result.dispEff)}</div>
      </div>
    </div>
  )
}
