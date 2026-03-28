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
function fmtRange(lo: number, hi: number): string { return fmtMoney(lo) + ' – ' + fmtMoney(hi) }
function fmtVolume(n: number): string { return Math.round(n).toLocaleString() + ' m³' }
function fmtVolumeRange(lo: number, hi: number): string { return Math.round(lo).toLocaleString() + ' – ' + Math.round(hi).toLocaleString() + ' m³' }

/* ── dispatch efficiency ── */
function dispatchEfficiency(otd: string, idle?: string): number {
  const map: Record<string, number> = { 'Under 10': 0.95, '10 to 15': 0.90, '15 to 25': 0.82, '25 to 40': 0.70, 'Over 40': 0.55 }
  let eff = 0.80
  for (const [k, v] of Object.entries(map)) { if (otd?.includes(k)) { eff = v; break } }
  if (idle?.includes('Most days')) eff *= 0.90
  else if (idle?.includes('few times')) eff *= 0.95
  return Math.max(0.40, Math.min(0.98, eff))
}

/* ── confidence ── */
type Confidence = 'High' | 'Medium' | 'Low'
function calcConfidence(bT: number, t: number, bTr: number, tr: number, bU: number, u: number): { level: Confidence; margin: number } {
  const c = [bT > 0 ? Math.abs(t - bT) / bT : 0, bTr > 0 ? Math.abs(tr - bTr) / bTr : 0, bU > 0 ? Math.abs(u - bU) / bU : 0]
  const m = Math.max(...c)
  if (m < 0.15) return { level: 'High', margin: 0.10 }
  if (m < 0.30) return { level: 'Medium', margin: 0.20 }
  return { level: 'Low', margin: 0.30 }
}

/* ── realism ── */
type Realism = 'Realistic' | 'Moderate' | 'Aggressive'
function calcRealism(bT: number, t: number, u: number, cc: number): { level: Realism; warnings: string[] } {
  const w: string[] = []; let s = 0
  const imp = bT > 0 ? (bT - t) / bT : 0
  if (imp > 0.30) { w.push('Turnaround improvement >30% — requires significant changes.'); s += 2 } else if (imp > 0.15) s += 1
  if (u > 92) { w.push('Utilization >92% is rare — buffer needed for maintenance.'); s += 2 }
  if (cc >= 3) { w.push('Multiple simultaneous improvements — higher implementation risk.'); s += 1 }
  return { level: s >= 3 ? 'Aggressive' : s >= 1 ? 'Moderate' : 'Realistic', warnings: w.slice(0, 2) }
}

/* ── constraint engine ── */
function simulate(a: Record<string, string>, o: { turnaround: number; trucks: number; utilTarget: number; priceM3: number }) {
  const cap = num(a.plant_cap, 120), hrs = num(a.op_hours, 10), days = num(a.op_days, 300)
  const prod = num(a.actual_prod, 2000), mix = num(a.mixer_capacity, 7)
  const rej = num(a.reject_pct, 3) / 100, cem = num(a.cement_cost, 12)
  const contribM3 = Math.max(o.priceM3 - cem * 1.6, o.priceM3 * 0.15)
  const prodDaily = cap * hrs * (o.utilTarget / 100) * (1 - rej)
  const trips = (hrs * 60) / o.turnaround
  const fleetDaily = trips * o.trucks * mix
  const dEff = dispatchEfficiency(a.order_to_dispatch, a.plant_idle)
  const effFleet = fleetDaily * dEff
  const scenDaily = Math.min(prodDaily, effFleet)
  const scenAnnual = scenDaily * days
  const baseAnnual = prod * 12
  let bn = prodDaily <= effFleet ? 'Production' : 'Fleet / Logistics'
  if (fleetDaily > prodDaily && effFleet < prodDaily) bn = 'Dispatch'
  const incr = Math.max(0, scenAnnual - baseAnnual)
  return {
    scenarioAnnual: Math.round(scenAnnual), baselineAnnual: Math.round(baseAnnual),
    incrementalVolume: Math.round(incr), revenueUpside: Math.round(incr * o.priceM3),
    contributionUpside: Math.round(incr * contribM3), contributionM3: Math.round(contribM3),
    bottleneck: bn, prodDaily: Math.round(prodDaily), effectiveFleetDaily: Math.round(effFleet), dispEff: dEff,
  }
}

/* ── recommendation ── */
function getRecommendation(bn: string, dEff: number): string {
  if (bn === 'Production') return 'Increase plant utilization and reduce unplanned stops before fleet investment.'
  if (bn === 'Dispatch') return 'Upgrade dispatch coordination — lower investment, higher impact than adding trucks.'
  if (dEff < 0.80) return 'Fix dispatch efficiency first (' + Math.round((1 - dEff) * 100) + '% fleet capacity lost to coordination).'
  return 'Reduce turnaround via site layout or scheduling. Consider adding trucks if already near benchmark.'
}

/* ── warnings ── */
function getWarnings(r: ReturnType<typeof simulate>, bTr: number, tr: number, bP: number, p: number): string[] {
  const w: string[] = []
  if (tr > bTr && r.bottleneck === 'Production') w.push('Adding trucks has limited impact — production is the constraint.')
  if (r.bottleneck === 'Fleet / Logistics' && r.dispEff < 0.75) w.push('Dispatch inefficiency limits fleet — fix coordination first.')
  if (p !== bP) w.push('Revenue is sensitive to price assumptions.')
  return w.slice(0, 2)
}

/* ── colors ── */
const C = { bg: '#0F1115', panel: '#161A22', text: '#FFFFFF', muted: '#A0A6B1', dim: '#6B7280', green: '#22C55E', red: '#EF4444', blue: '#3B82F6', border: '#1E2330' }

/* ── component ── */
export default function SimulatorClient({ assessments }: SimulatorClientProps) {
  const [selectedId, setSelectedId] = useState<string>(assessments[0]?.id || '')
  const selected = assessments.find(a => a.id === selectedId)
  const ans = (selected?.answers || {}) as Record<string, string>

  const parseTurnaround = (raw: string) => {
    if (raw.includes('Under 60')) return 55; if (raw.includes('60 to 75')) return 68
    if (raw.includes('75 to 90')) return 83; if (raw.includes('90 to 120')) return 105
    if (raw.includes('Over 120')) return 135; const n = num(raw); return n > 0 ? n : 90
  }
  const bT = parseTurnaround(ans.turnaround || '')
  const bTr = num(ans.n_trucks, 20)
  const bP = num(ans.price_m3, 50)
  const bU = Math.min(92, Math.round((num(ans.actual_prod, 2000) / Math.max(1, num(ans.plant_cap, 120) * num(ans.op_hours, 10) * 30)) * 100))

  const [turnaround, setTurnaround] = useState(bT)
  const [trucks, setTrucks] = useState(bTr)
  const [utilTarget, setUtilTarget] = useState(Math.max(bU, 30))
  const [priceM3, setPriceM3] = useState(bP)

  const reset = (id?: string) => {
    if (id) setSelectedId(id)
    const a = assessments.find(x => x.id === (id || selectedId))
    if (!a) return
    const an = (a.answers || {}) as Record<string, string>
    setTurnaround(parseTurnaround(an.turnaround || ''))
    setTrucks(num(an.n_trucks, 20))
    setPriceM3(num(an.price_m3, 50))
    setUtilTarget(Math.max(Math.min(92, Math.round((num(an.actual_prod, 2000) / Math.max(1, num(an.plant_cap, 120) * num(an.op_hours, 10) * 30)) * 100)), 30))
  }

  const cc = useMemo(() => [turnaround !== bT, trucks !== bTr, utilTarget !== Math.max(bU, 30), priceM3 !== bP].filter(Boolean).length, [turnaround, trucks, utilTarget, priceM3, bT, bTr, bU, bP])
  const result = useMemo(() => selected ? simulate(ans, { turnaround, trucks, utilTarget, priceM3 }) : null, [selected, ans, turnaround, trucks, utilTarget, priceM3])
  const conf = useMemo(() => calcConfidence(bT, turnaround, bTr, trucks, bU, utilTarget), [bT, turnaround, bTr, trucks, bU, utilTarget])
  const real = useMemo(() => calcRealism(bT, turnaround, utilTarget, cc), [bT, turnaround, utilTarget, cc])
  const warnings = useMemo(() => result ? getWarnings(result, bTr, trucks, bP, priceM3) : [], [result, bTr, trucks, bP, priceM3])
  const allWarnings = [...real.warnings, ...warnings].slice(0, 2)
  const recommendation = useMemo(() => result ? getRecommendation(result.bottleneck, result.dispEff) : '', [result])

  const isPositive = (result?.incrementalVolume || 0) > 0
  const hasChanges = cc > 0
  const m = conf.margin

  // Evaluation
  const evaluation = !hasChanges ? 'Neutral' : isPositive ? (real.level === 'Aggressive' ? 'Neutral' : 'Positive') : 'Negative'
  const evalColor = evaluation === 'Positive' ? C.green : evaluation === 'Negative' ? C.red : C.blue
  const confColor = { High: C.green, Medium: '#F59E0B', Low: C.red }[conf.level]
  const realColor = { Realistic: C.green, Moderate: '#F59E0B', Aggressive: C.red }[real.level]

  // Insight text
  const insight = useMemo(() => {
    if (!result || !hasChanges) return 'Adjust the sliders to model improvement scenarios.'
    const parts: string[] = []
    if (turnaround !== bT) parts.push(`turnaround ${bT} → ${turnaround} min`)
    if (trucks !== bTr) parts.push(`trucks ${bTr} → ${trucks}`)
    if (utilTarget !== Math.max(bU, 30)) parts.push(`utilization → ${utilTarget}%`)
    let t = `Changing ${parts.join(', ')} `
    if (isPositive) t += `increases effective output. ${result.bottleneck} is now the limiting factor at ${result.bottleneck === 'Production' ? fmtVolume(result.prodDaily) + '/day' : fmtVolume(result.effectiveFleetDaily) + '/day'}.`
    else t += `does not increase output — the constraint remains unchanged.`
    if (result.dispEff < 0.80) t += ` Dispatch efficiency at ${Math.round(result.dispEff * 100)}% — ${Math.round((1 - result.dispEff) * 100)}% of fleet capacity lost.`
    return t
  }, [result, hasChanges, turnaround, trucks, utilTarget, bT, bTr, bU, isPositive])

  if (!assessments.length) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: C.muted, fontSize: '14px' }}>
          <div style={{ marginBottom: '8px', fontWeight: '500', color: C.text }}>No completed assessments</div>
          Complete an assessment with scores to use the Simulator.
        </div>
      </div>
    )
  }

  if (!selected || !result) return null

  const sliderCss = `
    input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: ${C.border}; outline: none; cursor: pointer; }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${C.text}; border: 2px solid ${C.panel}; cursor: pointer; }
    input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: ${C.text}; border: 2px solid ${C.panel}; cursor: pointer; }
  `

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter', -apple-system, sans-serif", color: C.text }}>
      <style>{sliderCss}</style>

      <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '16px', height: '100vh', display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* ── SELECTOR ── */}
        <select value={selectedId} onChange={e => { reset(e.target.value) }} style={{
          width: '100%', padding: '8px 12px', fontSize: '13px', background: C.panel, color: C.text,
          border: `1px solid ${C.border}`, borderRadius: '8px', fontFamily: 'inherit', cursor: 'pointer'
        }}>
          {assessments.map(a => (
            <option key={a.id} value={a.id}>{a.plant?.name || '—'} — {a.plant?.customer?.name || '—'} — {a.overall}/100</option>
          ))}
        </select>

        {/* ── BASELINE BAR ── */}
        <div style={{
          background: C.panel, borderRadius: '10px', padding: '12px 24px',
          display: 'flex', alignItems: 'center', gap: '32px', border: `1px solid ${C.border}`
        }}>
          {[
            { label: 'SCORE', value: `${selected.overall}/100` },
            { label: 'ANNUAL VOLUME', value: fmtVolume(result.baselineAnnual) },
            { label: 'BOTTLENECK', value: selected.bottleneck || '—' },
            { label: 'COST OF INACTION', value: fmtMoney(selected.ebitda_monthly || 0) + '/mo' },
          ].map(k => (
            <div key={k.label} style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
              <span style={{ fontSize: '15px', fontWeight: '600' }}>{k.value}</span>
            </div>
          ))}
        </div>

        {/* ── MAIN 3-COLUMN GRID ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 340px', gap: '12px', flex: 1, minHeight: 0 }}>

          {/* ── LEFT: INPUTS ── */}
          <div style={{ background: C.panel, borderRadius: '10px', padding: '20px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Scenario Inputs</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: 1 }}>
              {/* Turnaround */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: C.muted }}>Turnaround</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: turnaround < bT ? C.green : turnaround > bT ? C.red : C.text }}>{turnaround} min</span>
                </div>
                <input type="range" min={30} max={180} step={5} value={turnaround} onChange={e => setTurnaround(+e.target.value)} />
                <div style={{ fontSize: '10px', color: C.dim, marginTop: '4px' }}>baseline: {bT}</div>
              </div>

              {/* Trucks */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: C.muted }}>Trucks</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: trucks > bTr ? C.green : trucks < bTr ? C.red : C.text }}>{trucks}</span>
                </div>
                <input type="range" min={1} max={Math.max(60, bTr * 2)} step={1} value={trucks} onChange={e => setTrucks(+e.target.value)} />
                <div style={{ fontSize: '10px', color: C.dim, marginTop: '4px' }}>baseline: {bTr}</div>
              </div>

              {/* Utilization */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: C.muted }}>Utilization</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: utilTarget > bU ? C.green : utilTarget < bU ? C.red : C.text }}>{utilTarget}%</span>
                </div>
                <input type="range" min={10} max={95} step={1} value={utilTarget} onChange={e => setUtilTarget(+e.target.value)} />
                <div style={{ fontSize: '10px', color: C.dim, marginTop: '4px' }}>baseline: {bU}%</div>
              </div>

              {/* Price */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: C.muted }}>Price/m³ <span style={{ fontSize: '9px', fontStyle: 'italic' }}>*</span></span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: priceM3 !== bP ? C.blue : C.text }}>${priceM3}</span>
                </div>
                <input type="range" min={Math.max(10, Math.round(bP * 0.5))} max={Math.round(bP * 2)} step={1} value={priceM3} onChange={e => setPriceM3(+e.target.value)} />
                <div style={{ fontSize: '10px', color: C.dim, marginTop: '4px' }}>baseline: ${bP}</div>
              </div>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: C.dim, fontStyle: 'italic' }}>* assumption</span>
              <button onClick={() => reset()} style={{
                fontSize: '11px', color: C.muted, background: 'none', border: `1px solid ${C.border}`,
                borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit'
              }}>
                Reset ↺
              </button>
            </div>
          </div>

          {/* ── CENTER: IMPACT ── */}
          <div style={{ background: C.panel, borderRadius: '10px', padding: '24px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

            {/* Primary impact */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Impact</div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: C.muted, marginBottom: '4px' }}>Δ Annual output</div>
                <div style={{ fontSize: '32px', fontWeight: '700', color: isPositive ? C.green : hasChanges ? C.red : C.dim }}>
                  {hasChanges ? (isPositive ? '+' : '') + fmtVolumeRange(result.incrementalVolume * (1 - m), result.incrementalVolume * (1 + m)) : '—'}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: C.muted, marginBottom: '4px' }}>Δ Revenue</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: isPositive ? C.green : hasChanges ? C.red : C.dim }}>
                  {hasChanges && isPositive ? '+' + fmtRange(result.revenueUpside * (1 - m), result.revenueUpside * (1 + m)) : '—'}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', color: C.muted, marginBottom: '4px' }}>Δ Contribution</div>
                <div style={{ fontSize: '20px', fontWeight: '600', color: isPositive ? C.green : C.dim }}>
                  {hasChanges && isPositive ? '+' + fmtRange(result.contributionUpside * (1 - m), result.contributionUpside * (1 + m)) : '—'}
                </div>
                <div style={{ fontSize: '10px', color: C.dim, marginTop: '2px' }}>${result.contributionM3}/m³ assumed</div>
              </div>
            </div>

            {/* Limiting factor */}
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#1A1E28', border: `1px solid ${C.border}`, marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Limiting factor</div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: C.red }}>{result.bottleneck}</div>
              <div style={{ fontSize: '11px', color: C.dim, marginTop: '2px' }}>
                Prod: {fmtVolume(result.prodDaily)}/day · Fleet: {fmtVolume(result.effectiveFleetDaily)}/day · Dispatch: {Math.round(result.dispEff * 100)}%
              </div>
            </div>

            {/* Meta */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: confColor + '20', color: confColor, fontWeight: '600' }}>
                {conf.level} confidence
              </span>
              <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: realColor + '20', color: realColor, fontWeight: '600' }}>
                {real.level}
              </span>
            </div>
          </div>

          {/* ── RIGHT: INSIGHT & DECISION ── */}
          <div style={{ background: C.panel, borderRadius: '10px', padding: '20px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>

            {/* Insight */}
            <div>
              <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Insight</div>
              <div style={{ fontSize: '12px', lineHeight: '1.6', color: C.muted }}>{insight}</div>
            </div>

            {/* Evaluation */}
            <div>
              <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Evaluation</div>
              <span style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '4px', background: evalColor + '20', color: evalColor, fontWeight: '600' }}>
                {evaluation}
              </span>
            </div>

            {/* Recommendation */}
            <div>
              <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Recommended priority</div>
              <div style={{ fontSize: '12px', lineHeight: '1.6', color: C.text, fontWeight: '500' }}>{recommendation}</div>
            </div>

            {/* Warnings */}
            {allWarnings.length > 0 && (
              <div>
                <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Warnings</div>
                {allWarnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '11px', lineHeight: '1.5', color: '#F59E0B', marginBottom: '4px' }}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── MINI COMPARISON BAR ── */}
        <div style={{
          background: C.panel, borderRadius: '8px', padding: '10px 24px',
          display: 'flex', gap: '24px', alignItems: 'center', border: `1px solid ${C.border}`, fontSize: '12px'
        }}>
          {[
            { label: 'Turnaround', from: bT, to: turnaround, unit: ' min', lower: true },
            { label: 'Trucks', from: bTr, to: trucks, unit: '', lower: false },
            { label: 'Utilization', from: bU, to: utilTarget, unit: '%', lower: false },
            { label: 'Bottleneck', from: selected.bottleneck || '—', to: result.bottleneck, unit: '', isText: true },
          ].map(item => {
            const changed = String(item.from) !== String(item.to)
            const color = !changed ? C.dim : ('isText' in item && item.isText) ? (changed ? C.blue : C.dim) : (item.lower ? (item.to < item.from ? C.green : item.to > item.from ? C.red : C.dim) : (item.to > item.from ? C.green : item.to < item.from ? C.red : C.dim))
            return (
              <div key={item.label} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ color: C.dim }}>{item.label}:</span>
                <span style={{ color: C.muted }}>{item.from}{item.unit}</span>
                <span style={{ color: C.dim }}>→</span>
                <span style={{ color, fontWeight: changed ? '600' : '400' }}>{item.to}{item.unit}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
