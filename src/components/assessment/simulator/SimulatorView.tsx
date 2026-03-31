'use client'
// v2
import { useState, useMemo } from 'react'
import { simCalc, type CalcResult, type SimBaseline, type SimScenario } from '@/lib/calculations'
import Slider from './Slider'

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

interface SimulatorViewProps {
  calcResult: CalcResult
}

export default function SimulatorView({ calcResult }: SimulatorViewProps) {
  const r = calcResult

  // Build baseline from calc result
  const baseline: SimBaseline = useMemo(() => ({
    cap: r.cap,
    opH: r.opH,
    opD: r.opD,
    mixCap: r.mixCap,
    turnaround: r.ta,
    trucks: r.trucks,
    util: Math.round(r.util * 100),
    price: r.price,
    contrib: r.contrib,
    TARGET_TA: r.TARGET_TA,
    dispatchScore: r.scores.dispatch ?? 50,
    qualityScore: r.scores.quality ?? 50,
  }), [r])

  const [sTurnaround, setSTurnaround] = useState(r.ta || 90)
  const [sTrucks, setSTrucks] = useState(r.trucks || 10)
  const [sUtil, setSUtil] = useState(Math.round(r.util * 100) || 70)
  const [sPrice, setSPrice] = useState(r.price || 65)
  const [sOTD, setSOTD] = useState(r.dispatchMin ?? 15)

  const scenario: SimScenario = useMemo(() => ({
    turnaround: sTurnaround,
    trucks: sTrucks,
    util: sUtil,
    price: sPrice,
    otd: sOTD,
  }), [sTurnaround, sTrucks, sUtil, sPrice, sOTD])

  const result = useMemo(() => {
    if (baseline.cap === 0) return null
    return simCalc(baseline, scenario)
  }, [baseline, scenario])

  const resetAll = () => {
    setSTurnaround(r.ta || 90)
    setSTrucks(r.trucks || 10)
    setSUtil(Math.round(r.util * 100) || 70)
    setSPrice(r.price || 65)
    setSOTD(r.dispatchMin ?? 15)
  }

  if (!result || baseline.cap === 0) {
    return (
      <div style={{ flex: 1, padding: '40px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '14px' }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--gray-700)', marginBottom: '8px' }}>
          Simulator requires assessment data
        </div>
        <div>Complete the Assessment tab first — the simulator uses your plant capacity, fleet, and pricing data to model scenarios.</div>
      </div>
    )
  }

  const deltaPositive = result.deltaVol > 0

  // Realism warnings
  const simWarnings: string[] = []
  if (sTurnaround < r.TARGET_TA * 0.7) simWarnings.push(`Turnaround ${sTurnaround} min is ${Math.round((1 - sTurnaround / (r.TARGET_TA || 80)) * 100)}% below regional target — unlikely without major route changes.`)
  if (sUtil > 95) simWarnings.push('Utilisation above 95% is unrealistic — even best-practice plants peak at 92%.')
  if (sTrucks > (r.trucks || 10) * 1.5) simWarnings.push(`Fleet expanded ${Math.round((sTrucks / (r.trucks || 10) - 1) * 100)}% — requires significant capital investment.`)
  if (sPrice > (r.price || 65) * 1.3) simWarnings.push(`Price ${Math.round((sPrice / (r.price || 65) - 1) * 100)}% above current — verify market will accept this.`)
  if (sOTD < 8) simWarnings.push('Order-to-dispatch under 8 min requires dedicated dispatch software and pre-staged batching.')

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 500 }}>Scenario simulator</h2>
        <button
          type="button"
          onClick={resetAll}
          style={{
            padding: '4px 12px', border: '1px solid var(--gray-300)', borderRadius: '6px',
            fontSize: '11px', color: 'var(--gray-500)', background: 'var(--white)',
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          Reset to baseline
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left: Sliders */}
        <div>
          <Slider label="Turnaround" value={sTurnaround} min={40} max={180} step={1} baselineValue={r.ta || 90} unit="min" onChange={setSTurnaround} />
          <Slider label="Trucks" value={sTrucks} min={1} max={Math.max(r.trucks * 2, 20)} step={1} baselineValue={r.trucks || 10} unit="" onChange={setSTrucks} />
          <Slider label="Utilisation" value={sUtil} min={30} max={100} step={1} baselineValue={Math.round(r.util * 100) || 70} unit="%" onChange={setSUtil} />
          {result.maxUtilPct > sUtil ? (
            <div style={{ fontSize: '11px', color: 'var(--phase-complete)', marginTop: '-6px', marginBottom: '8px', paddingLeft: '2px' }}>
              Fleet supports up to {result.maxUtilPct}% at current turnaround — consider raising utilisation
            </div>
          ) : result.maxUtilPct < sUtil ? (
            <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '-6px', marginBottom: '8px', paddingLeft: '2px' }}>
              Fleet capacity limits utilisation to {result.maxUtilPct}% at current turnaround
            </div>
          ) : null}
          <Slider label="Price" value={sPrice} min={20} max={200} step={1} baselineValue={r.price || 65} unit="$/m³" onChange={setSPrice} />
          <Slider label="Dispatch Time" value={sOTD} min={5} max={60} step={1} baselineValue={r.dispatchMin ?? 15} unit="min" onChange={setSOTD} />
        </div>

        {/* Right: Results */}
        <div>
          {simWarnings.length > 0 && (
            <div style={{
              background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
              borderRadius: '8px', padding: '10px 14px', marginBottom: '12px',
            }}>
              {simWarnings.map((w, i) => (
                <div key={i} style={{ fontSize: '11px', color: 'var(--warning-dark)', lineHeight: 1.5, marginBottom: i < simWarnings.length - 1 ? '4px' : 0 }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
          {/* Volume delta */}
          <div style={{
            background: deltaPositive ? 'var(--green-light)' : result.deltaVol < 0 ? '#FDE8E6' : 'var(--gray-100)',
            border: `1px solid ${deltaPositive ? 'var(--tooltip-border)' : result.deltaVol < 0 ? 'var(--error-border)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)', padding: '16px', marginBottom: '12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px' }}>
              Annual volume change
            </div>
            <div style={{
              fontSize: '26px', fontWeight: 600, fontFamily: 'var(--mono)', marginTop: '4px',
              color: deltaPositive ? 'var(--green)' : result.deltaVol < 0 ? 'var(--red)' : 'var(--gray-500)',
            }}>
              {result.deltaVol > 0 ? '+' : ''}{result.deltaVol.toLocaleString()} m³
            </div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '4px' }}>
              Scenario: {result.scenarioAnnual.toLocaleString()} m³/year
            </div>
          </div>

          {/* Financial impact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px' }}>Revenue</div>
              <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--mono)', color: result.revenueUpside > 0 ? 'var(--green)' : 'var(--gray-500)', marginTop: '2px' }}>
                {result.revenueUpside > 0 ? '+' : ''}{fmt(result.revenueUpside)}
              </div>
            </div>
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px' }}>Contribution</div>
              <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--mono)', color: result.contribUpside > 0 ? 'var(--green)' : 'var(--gray-500)', marginTop: '2px' }}>
                {result.contribUpside > 0 ? '+' : ''}{fmt(result.contribUpside)}
              </div>
            </div>
          </div>

          {/* Bottleneck + constraint */}
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '12px', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '8px' }}>
              Constraint analysis
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '80px' }}>Bottleneck:</span>
              <span style={{
                fontSize: '12px', fontWeight: 500,
                padding: '2px 8px', borderRadius: '4px',
                background: result.scenarioBottleneck === 'Production' ? '#E8F8F5' : 'var(--error-bg)',
                color: result.scenarioBottleneck === 'Production' ? 'var(--green)' : 'var(--red)',
              }}>
                {result.scenarioBottleneck}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '80px' }}>Production:</span>
              <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>{Math.round(result.prodDaily).toLocaleString()} m³/day</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '80px' }}>Fleet cap:</span>
              <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>{Math.round(result.effFleetDaily).toLocaleString()} m³/day</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '80px' }}>Disp. eff.:</span>
              <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>{Math.round(result.dispEff * 100)}%</span>
            </div>
          </div>

          {/* Scenario scores */}
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '12px',
          }}>
            <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '8px' }}>
              Scenario scores
            </div>
            {[
              { label: 'Production', value: result.sProdScore },
              { label: 'Fleet', value: result.sFleetScore },
              { label: 'Dispatch', value: result.sDispScore },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '70px' }}>{s.label}</span>
                <div style={{ flex: 1, height: '6px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${s.value}%`, height: '6px', borderRadius: '3px',
                    background: s.value >= 80 ? 'var(--green-mid)' : s.value >= 60 ? 'var(--warning)' : 'var(--red)',
                  }} />
                </div>
                <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', fontWeight: 500, width: '30px', textAlign: 'right' }}>
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
