'use client'
// v3
import { useState, useMemo } from 'react'
import { simCalc, type CalcResult, type SimBaseline, type SimScenario } from '@/lib/calculations'
import Slider from './Slider'
import { useIsMobile } from '@/hooks/useIsMobile'

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

function fmtMarginal(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 100_000) return '$' + Math.round(abs / 1000) + 'k'
  if (abs >= 10_000) return '$' + Math.round(abs / 1000) + 'k'
  if (abs >= 1_000) return '$' + (abs / 1000).toFixed(1) + 'k'
  return '$' + Math.round(abs)
}

interface SimulatorViewProps {
  calcResult: CalcResult
  readOnly?: boolean
}

export default function SimulatorView({ calcResult, readOnly }: SimulatorViewProps) {
  const r = calcResult
  const isMobile = useIsMobile()
  const [showInfo, setShowInfo] = useState(false)

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
    dispatchMin: r.dispatchMin ?? 20,
    dispatchScore: r.scores.dispatch ?? 50,
    qualityScore: r.scores.quality ?? 50,
  }), [r])

  const [sTurnaround, setSTurnaround] = useState(r.ta || 90)
  const [sTrucks, setSTrucks] = useState(r.trucks || 10)
  const [sPrice, setSPrice] = useState(r.price || 65)
  const [sOTD, setSOTD] = useState(r.dispatchMin ?? 15)

  const scenario: SimScenario = useMemo(() => ({
    turnaround: sTurnaround,
    trucks: sTrucks,
    price: sPrice,
    otd: sOTD,
  }), [sTurnaround, sTrucks, sPrice, sOTD])

  const result = useMemo(() => {
    if (baseline.cap === 0) return null
    return simCalc(baseline, scenario)
  }, [baseline, scenario])

  // ── Marginal values: contribution impact of 1-unit improvement per slider ──
  const marginalTA = useMemo(() => {
    if (!result || sTurnaround <= 41) return 0
    const r2 = simCalc(baseline, { ...scenario, turnaround: sTurnaround - 1 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sTurnaround])

  const marginalTrucks = useMemo(() => {
    if (!result) return 0
    const r2 = simCalc(baseline, { ...scenario, trucks: sTrucks + 1 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sTrucks])

  const marginalPrice = useMemo(() => {
    if (!result) return 0
    const r2 = simCalc(baseline, { ...scenario, price: sPrice + 1 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sPrice])

  const marginalOTD = useMemo(() => {
    if (!result || sOTD <= 6) return 0
    const r2 = simCalc(baseline, { ...scenario, otd: sOTD - 1 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sOTD])

  // ── Info modal: intermediate calculation values ──
  const infoData = useMemo(() => {
    if (!result) return null
    const { cap, opH, opD, mixCap } = baseline

    // Scenario fleet
    const delsPerTruck = sTurnaround > 0 ? (opH * 60 / sTurnaround) : 0
    const fleetRaw = delsPerTruck * sTrucks * mixCap
    const dispEffPct = Math.round(result.dispEff * 100)
    const fleetEff = Math.round(result.effFleetDaily)

    // Scenario plant
    const nameplateDaily = Math.round(cap * opH)
    const plantCeiling = Math.round(cap * 0.92 * opH)

    // Scenario output
    const scenarioDaily = Math.round(result.scenarioAnnual / opD)

    // Baseline fleet
    const bTA = baseline.turnaround
    const bDelsPerTruck = bTA > 0 ? (opH * 60 / bTA) : 0
    const bFleetRaw = Math.round(bDelsPerTruck * baseline.trucks * mixCap)
    const bDispEff = Math.max(0.40, Math.min(0.98, 1 - baseline.dispatchMin / 100))
    const bDispEffPct = Math.round(bDispEff * 100)
    const bFleetEff = Math.round(bFleetRaw * bDispEff)

    // Baseline plant
    const bProdRate = Math.round(cap * 0.92)
    const bProdDaily = Math.round(bProdRate * opH)
    const bBaselineDaily = Math.min(bProdDaily, bFleetEff)
    const bAnnualVol = Math.round(bBaselineDaily * opD)

    // Financial
    const bVarCosts = Math.round(baseline.price - baseline.contrib)
    const sContrib = Math.round(sPrice - bVarCosts)

    return {
      // Scenario fleet
      delsPerTruck: delsPerTruck.toFixed(1), fleetRaw: Math.round(fleetRaw), dispEffPct, fleetEff,
      // Scenario plant
      nameplateDaily, plantCeiling, opH,
      // Scenario output
      scenarioDaily,
      // Baseline fleet
      bTA, bDelsPerTruck: bDelsPerTruck.toFixed(1), bFleetRaw, bDispEffPct, bFleetEff,
      // Baseline plant
      bProdRate, bProdDaily, bBaselineDaily: Math.round(bBaselineDaily),
      bAnnualVol,
      // Financial
      bVarCosts, sContrib,
    }
  }, [baseline, result, sTurnaround, sTrucks, sOTD, sPrice])

  // ── Dynamic insight text ──
  const insight = useMemo(() => {
    if (!result) return ''
    if (result.scenarioBottleneck === 'Fleet / Logistics') {
      const gap = Math.round(result.prodDaily - result.effFleetDaily)
      const dispEff = result.dispEff
      const targetTA = result.prodDaily > 0
        ? Math.max(40, Math.round(baseline.opH * 60 * sTrucks * baseline.mixCap * dispEff / result.prodDaily))
        : sTurnaround
      return `Trucks are the bottleneck, delivering ${Math.round(result.effFleetDaily)} m³/day but plant can produce ${Math.round(result.prodDaily)} m³/day (${gap} m³/day idle capacity). Reducing turnaround to ~${targetTA} min unlocks that gap without adding trucks.`
    } else {
      return `Plant is running at full capacity (${Math.round(result.prodDaily)} m³/day), adding trucks or cutting turnaround won't increase output from here. Use the Price slider to grow revenue on existing volume, or invest in plant capacity expansion.`
    }
  }, [result, baseline, sTurnaround, sTrucks])

  const resetAll = () => {
    setSTurnaround(r.ta || 90)
    setSTrucks(r.trucks || 10)
    setSPrice(r.price || 65)
    setSOTD(r.dispatchMin ?? 15)
  }

  if (!result || baseline.cap === 0) {
    return (
      <div style={{ flex: 1, padding: '40px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '14px' }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--gray-700)', marginBottom: '8px' }}>
          Simulator requires assessment data
        </div>
        <div>Complete the Assessment tab first, the simulator uses your plant capacity, fleet, and pricing data to model scenarios.</div>
      </div>
    )
  }

  const deltaPositive = result.deltaVol > 0

  // Realism warnings
  const simWarnings: string[] = []
  if (sTurnaround < r.TARGET_TA * 0.7) simWarnings.push(`Turnaround ${sTurnaround} min is ${Math.round((1 - sTurnaround / (r.TARGET_TA || 80)) * 100)}% below regional target, unlikely without major route changes.`)
  if (result.sUtil > 95) simWarnings.push('Utilisation above 95% is unrealistic, the physical ceiling is 92% of nameplate (the 85% benchmark is the recommended operating point, not the hard limit).')
  if (sTrucks > (r.trucks || 10) * 1.5) simWarnings.push(`Fleet expanded ${Math.round((sTrucks / (r.trucks || 10) - 1) * 100)}%, requires significant capital investment.`)
  if (sPrice > (r.price || 65) * 1.3) simWarnings.push(`Price ${Math.round((sPrice / (r.price || 65) - 1) * 100)}% above current, verify market will accept this.`)
  if (sOTD < 8) simWarnings.push('Order-to-dispatch under 8 min requires dedicated dispatch software and pre-staged batching.')

  const MARGINAL_THRESHOLD = 500

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '60px' }}>
      {/* Read-only notice for owners */}
      {readOnly && (
        <div style={{
          background: 'var(--info-bg)', border: '1px solid var(--info-border)',
          borderRadius: '8px', padding: '8px 14px', marginBottom: '14px',
          fontSize: '12px', color: 'var(--phase-workshop)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span>📊</span>
          <span>Exploring scenarios, assessment data is not changed</span>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 500 }}>Scenario simulator</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            title="Show calculation breakdown"
            style={{
              width: '28px', height: '28px', borderRadius: '50%',
              border: '1px solid var(--gray-300)', background: 'var(--white)',
              color: 'var(--gray-500)', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font)',
            }}
          >
            ⓘ
          </button>
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
      </div>

      {/* Intro hint */}
      <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '16px' }}>
        Drag sliders to model operational improvements, revenue impact updates in real time
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '12px' : '24px' }}>
        {/* Left: Sliders */}
        <div>
          <Slider label="Turnaround" value={sTurnaround} min={40} max={180} step={1} baselineValue={r.ta || 90} unit="min" onChange={setSTurnaround} />
          {marginalTA > MARGINAL_THRESHOLD && (
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
              −1 min → +{fmtMarginal(marginalTA)}/yr contribution
            </div>
          )}

          <Slider label="Trucks" value={sTrucks} min={1} max={Math.max(r.trucks * 2, 20)} step={1} baselineValue={r.trucks || 10} unit="" onChange={setSTrucks} />
          {marginalTrucks > MARGINAL_THRESHOLD && (
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
              +1 truck → +{fmtMarginal(marginalTrucks)}/yr contribution
            </div>
          )}

          <Slider label="Price" value={sPrice} min={20} max={200} step={1} baselineValue={r.price || 65} unit="$/m³" onChange={setSPrice} />
          {Math.abs(marginalPrice) > MARGINAL_THRESHOLD && (
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
              +$1/m³ → +{fmtMarginal(marginalPrice)}/yr contribution
            </div>
          )}

          <Slider label="Dispatch Time" value={sOTD} min={5} max={60} step={1} baselineValue={r.dispatchMin ?? 15} unit="min" onChange={setSOTD} />
          {marginalOTD > MARGINAL_THRESHOLD && (
            <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
              −1 min → +{fmtMarginal(marginalOTD)}/yr contribution
            </div>
          )}

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
              <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px' }}>Revenue impact</div>
              <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--mono)', color: result.revenueUpside > 0 ? 'var(--green)' : result.revenueUpside < 0 ? 'var(--red)' : 'var(--gray-500)', marginTop: '2px' }}>
                {result.revenueUpside > 0 ? '+' : ''}{fmt(result.revenueUpside)}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>/yr vs baseline</div>
            </div>
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px' }}>Contrib. impact</div>
              <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--mono)', color: result.contribUpside > 0 ? 'var(--green)' : result.contribUpside < 0 ? 'var(--red)' : 'var(--gray-500)', marginTop: '2px' }}>
                {result.contribUpside > 0 ? '+' : ''}{fmt(result.contribUpside)}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>/yr vs baseline</div>
            </div>
          </div>

          {/* Constraint analysis */}
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '12px',
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
              <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '80px' }}>Utilisation:</span>
              <span style={{ fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 600, color: result.sUtil >= 88 ? 'var(--green)' : result.sUtil >= 70 ? 'var(--warning)' : 'var(--red)' }}>{result.sUtil}%</span>
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

            {/* Fleet-supports indicator */}
            {result.maxUtilPct < result.sUtil ? (
              <div style={{
                marginTop: '10px', padding: '8px 10px', borderRadius: '6px',
                background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                fontSize: '11px', color: 'var(--warning-dark)', lineHeight: 1.5,
              }}>
                ⚠ Fleet limits utilisation to {result.maxUtilPct}% at this turnaround, shorten turnaround or add trucks to raise it
              </div>
            ) : result.maxUtilPct > result.sUtil ? (
              <div style={{
                marginTop: '10px', padding: '8px 10px', borderRadius: '6px',
                background: 'var(--phase-complete-bg)', border: '1px solid var(--tooltip-border)',
                fontSize: '11px', color: 'var(--phase-complete)', lineHeight: 1.5,
              }}>
                ✓ Fleet can support up to {result.maxUtilPct}% utilisation at this turnaround, plant is the binding constraint
              </div>
            ) : null}

            {/* Dynamic insight */}
            {insight && (
              <div style={{
                marginTop: '10px', paddingTop: '10px',
                borderTop: '1px solid var(--gray-100)',
                fontSize: '11px', color: 'var(--gray-600)', lineHeight: 1.6,
              }}>
                {insight}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Info modal ── */}
      {showInfo && infoData && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowInfo(false)}
        >
          <div
            style={{
              background: 'var(--white)', borderRadius: '12px', padding: '24px',
              maxWidth: '540px', width: '90%', maxHeight: '82vh', overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>Calculation breakdown</span>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Section helper */}
            {[
              {
                title: 'Fleet capacity, scenario',
                rows: [
                  [`Deliveries per truck`, `${infoData.opH}h × 60 / ${sTurnaround} min`, `${infoData.delsPerTruck} trips`],
                  [`Raw fleet volume`, `${infoData.delsPerTruck} × ${sTrucks} trucks × ${baseline.mixCap} m³/load`, `${infoData.fleetRaw} m³/day`],
                  [`Dispatch efficiency`, `1 − ${sOTD} min / 100`, `${infoData.dispEffPct}%`],
                  [`Effective fleet capacity`, `${infoData.fleetRaw} × ${infoData.dispEffPct}%`, `${infoData.fleetEff} m³/day`],
                ],
              },
              {
                title: 'Plant capacity, scenario',
                rows: [
                  [`Nameplate daily`, `${baseline.cap} m³/hr × ${infoData.opH} hr`, `${infoData.nameplateDaily} m³/day`],
                  [`Physical ceiling (92% nameplate)`, `${infoData.nameplateDaily} × 92%`, `${infoData.plantCeiling} m³/day`],
                ],
              },
              {
                title: 'Scenario output',
                rows: [
                  [`Binding constraint`, `min(fleet ${infoData.fleetEff}, plant ${infoData.plantCeiling})`, `${infoData.scenarioDaily} m³/day`],
                  [`Annual`, `${infoData.scenarioDaily} m³/day × ${baseline.opD} days`, `${result.scenarioAnnual.toLocaleString()} m³/yr`],
                ],
              },
              {
                title: 'Baseline (current state)',
                rows: [
                  [`Deliveries per truck`, `${infoData.opH}h × 60 / ${infoData.bTA} min`, `${infoData.bDelsPerTruck} trips`],
                  [`Raw fleet volume`, `${infoData.bDelsPerTruck} × ${baseline.trucks} trucks × ${baseline.mixCap} m³/load`, `${infoData.bFleetRaw} m³/day`],
                  [`Dispatch efficiency`, `1 − ${baseline.dispatchMin} min / 100`, `${infoData.bDispEffPct}%`],
                  [`Effective fleet capacity`, `${infoData.bFleetRaw} × ${infoData.bDispEffPct}%`, `${infoData.bFleetEff} m³/day`],
                  [`Plant ceiling (92% nameplate)`, `${baseline.cap} m³/hr × 92% × ${infoData.opH} hr`, `${infoData.bProdDaily} m³/day`],
                  [`Baseline output`, `min(fleet ${infoData.bFleetEff}, plant ${infoData.bProdDaily})`, `${infoData.bBaselineDaily} m³/day`],
                  [`Annual baseline`, `${infoData.bBaselineDaily} m³/day × ${baseline.opD} days`, `${infoData.bAnnualVol.toLocaleString()} m³/yr`],
                ],
              },
              {
                title: 'Revenue & contribution impact',
                rows: [
                  [`Variable costs (from assessment)`, `$${baseline.price}/m³ − $${baseline.contrib}/m³`, `$${infoData.bVarCosts}/m³`],
                  [`Scenario contribution margin`, `$${sPrice}/m³ − $${infoData.bVarCosts}/m³`, `$${infoData.sContrib}/m³`],
                  [`Revenue impact`, `${result.scenarioAnnual.toLocaleString()} × $${sPrice} − ${infoData.bAnnualVol.toLocaleString()} × $${baseline.price}`, `${result.revenueUpside >= 0 ? '+' : ''}${fmt(result.revenueUpside)}/yr`],
                  [`Contribution impact`, `${result.scenarioAnnual.toLocaleString()} × $${infoData.sContrib} − ${infoData.bAnnualVol.toLocaleString()} × $${baseline.contrib}`, `${result.contribUpside >= 0 ? '+' : ''}${fmt(result.contribUpside)}/yr`],
                ],
              },
            ].map(section => (
              <div key={section.title} style={{ marginBottom: '20px' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '.4px', color: 'var(--gray-500)', marginBottom: '8px',
                }}>
                  {section.title}
                </div>
                <div style={{ borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--gray-100)' }}>
                  {section.rows.map(([label, formula, value], i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr auto',
                      gap: '8px', padding: '7px 10px', alignItems: 'baseline',
                      background: i % 2 === 0 ? 'var(--white)' : 'var(--gray-50)',
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--gray-700)' }}>{label}</span>
                      <span style={{ fontSize: '10px', color: 'var(--gray-400)', fontFamily: 'var(--mono)' }}>{formula}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--gray-800)', textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Plain-language note on report vs simulator discrepancy */}
            <div style={{
              background: 'var(--gray-50)', border: '1px solid var(--gray-100)',
              borderRadius: '8px', padding: '12px 14px', marginTop: '4px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '4px' }}>
                Why the report and simulator may show different utilisation
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-500)', lineHeight: 1.6 }}>
                The <strong>report</strong> shows what the plant actually produced last month, based on the numbers entered in the assessment. That figure includes everything: quiet periods, machine downtime, slow days.
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-500)', lineHeight: 1.6, marginTop: '6px' }}>
                The <strong>simulator</strong> calculates what the plant <em>could</em> produce if trucks ran continuously at the current turnaround and dispatch settings. It does not know about quiet days or unexpected stops, it only models the physical capacity of the fleet.
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-500)', lineHeight: 1.6, marginTop: '6px' }}>
                This means the simulator is best used to compare scenarios against each other, not as an exact prediction of output.
              </div>
            </div>

            <div style={{ fontSize: '10px', color: 'var(--gray-400)', textAlign: 'center', marginTop: '12px' }}>
              Click anywhere outside to close
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
