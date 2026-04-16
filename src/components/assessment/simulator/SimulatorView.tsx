'use client'
// v4: 8 sliders across Operational / Structural / Commercial / Quality groups.
// Drops OTD (no field data for most customers). Adds TransparencyPanel that
// surfaces provenance-tagged data basis for the current customer.

import { useState, useMemo } from 'react'
import { simCalc, buildSimBaseline, type CalcResult, type SimScenario } from '@/lib/calculations'
import { renderProvenance, getProvenance, type ProvenanceMap } from '@/lib/reportProvenance'
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
  // Optional: when present, provenance and additional context come from the
  // same pipeline as the report. Falls back to calcResult-only mode otherwise.
  reportInput?: {
    plant_capacity_m3_per_hour?: number
    operating_hours_per_day?: number
    operating_days_per_year?: number
    material_cost_per_m3?: number
    avg_turnaround_min?: number
    rejection_rate_pct?: number
    trucks_assigned?: number
    number_of_plants?: number
    biggest_operational_challenge?: string
    demand_vs_capacity?: string
    dispatch_tool?: string
    provenance?: ProvenanceMap
  }
  rc?: {
    avg_load_m3?: number
    target_tat_min?: number
    contribution_margin_per_m3?: number
  }
}

// ── Provenance tag chip ──
const TAG_STYLES: Record<string, { bg: string; text: string }> = {
  Reported:    { bg: '#D4EDDA', text: '#155724' },
  Calculated:  { bg: '#E8EEF9', text: '#1E3A8A' },
  Interpreted: { bg: '#FFF3CD', text: '#856404' },
  Midpoint:    { bg: '#F4ECF7', text: '#6A1B9A' },
}

function ProvenanceTag({ tag }: { tag: string }) {
  const s = TAG_STYLES[tag] ?? TAG_STYLES.Reported
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: '3px',
      fontSize: '9px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.3px',
      background: s.bg,
      color: s.text,
      marginRight: '6px',
      verticalAlign: 'middle',
    }}>{tag}</span>
  )
}

export default function SimulatorView({ calcResult, readOnly, reportInput, rc }: SimulatorViewProps) {
  const r = calcResult
  const isMobile = useIsMobile()
  const [showInfo, setShowInfo] = useState(false)
  const [showTransparency, setShowTransparency] = useState(true)

  // Build baseline via shared helper (keeps simulator in sync with report pipeline)
  const baseline = useMemo(() => buildSimBaseline(r, reportInput, rc), [r, reportInput, rc])

  // ── Slider state ──
  // Operational
  const [sTurnaround, setSTurnaround] = useState(baseline.turnaround || 90)
  const [sRadius, setSRadius] = useState(baseline.deliveryRadius || 15)
  // Structural
  const [sTrucks, setSTrucks] = useState(baseline.trucks || 10)
  const [sAvgLoad, setSAvgLoad] = useState(baseline.avgLoadM3 || 7)
  // Commercial
  const [sPrice, setSPrice] = useState(baseline.price || 65)
  const [sMaterialCost, setSMaterialCost] = useState(baseline.materialCost || 35)
  // Quality
  const [sReject, setSReject] = useState(baseline.rejectPct || 0)

  // ── TAT value-stream breakdown (advanced) ──
  // Components sum to plant/site handling time (= TAT − travel).
  // Initialized proportionally from customer's current handling time using
  // GCC ready-mix benchmark ratios. Owner can adjust to reflect reality.
  const [showAdvancedTAT, setShowAdvancedTAT] = useState(false)
  const initialHandling = Math.max(30, (baseline.turnaround || 90) - (baseline.deliveryRadius || 15) * 3)
  // Benchmark ratios for plant/site handling components (sum = 1.00)
  const BENCHMARK_RATIOS = {
    plantQueue: 0.14,    // waiting to load at plant
    weighbridge: 0.04,   // weighing in + out
    loading: 0.23,       // concrete batched and loaded into mixer
    siteQueue: 0.21,     // waiting at site to pour
    unloading: 0.29,     // actual pour/discharge
    washout: 0.09,       // clean drum after pour
  }
  const [sPlantQueue, setSPlantQueue] = useState(Math.round(initialHandling * BENCHMARK_RATIOS.plantQueue))
  const [sWeighbridge, setSWeighbridge] = useState(Math.round(initialHandling * BENCHMARK_RATIOS.weighbridge))
  const [sLoading, setSLoading] = useState(Math.round(initialHandling * BENCHMARK_RATIOS.loading))
  const [sSiteQueue, setSSiteQueue] = useState(Math.round(initialHandling * BENCHMARK_RATIOS.siteQueue))
  const [sUnloading, setSUnloading] = useState(Math.round(initialHandling * BENCHMARK_RATIOS.unloading))
  const [sWashout, setSWashout] = useState(Math.round(initialHandling * BENCHMARK_RATIOS.washout))

  // Sum of components = current handling time
  const handlingSum = sPlantQueue + sWeighbridge + sLoading + sSiteQueue + sUnloading + sWashout

  // When a component changes, update TAT = handling + travel
  const handleComponentChange = (setter: (v: number) => void, newValue: number, oldValue: number) => {
    setter(newValue)
    const delta = newValue - oldValue
    setSTurnaround(prev => Math.max(60, prev + delta))
  }

  const scenario: SimScenario = useMemo(() => ({
    turnaround: sTurnaround,
    deliveryRadius: sRadius,
    trucks: sTrucks,
    avgLoadM3: sAvgLoad,
    price: sPrice,
    materialCost: sMaterialCost,
    rejectPct: sReject,
  }), [sTurnaround, sRadius, sTrucks, sAvgLoad, sPrice, sMaterialCost, sReject])

  /**
   * Radius change handler: couples TAT to radius so the radius slider has
   * real volume/financial impact. When radius changes, the travel portion
   * of TAT changes proportionally (3 min per km, round-trip at 1.5 min/km).
   * Plant/site handling time is assumed constant.
   *
   * The customer can still manually move the TAT slider further to simulate
   * pure operational improvements on top of the geographic change.
   */
  const handleRadiusChange = (newRadius: number) => {
    const travelDelta = (newRadius - sRadius) * 3
    setSRadius(newRadius)
    setSTurnaround(prev => Math.max(60, Math.round(prev + travelDelta)))
  }

  const result = useMemo(() => {
    if (baseline.cap === 0) return null
    return simCalc(baseline, scenario)
  }, [baseline, scenario])

  const sContrib = useMemo(() => Math.max(0, sPrice - sMaterialCost), [sPrice, sMaterialCost])

  // ── Marginal values: contribution impact of 1-unit improvement per slider ──
  const marginalTA = useMemo(() => {
    if (!result || sTurnaround <= 41) return 0
    const r2 = simCalc(baseline, { ...scenario, turnaround: sTurnaround - 1 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sTurnaround])

  const marginalRadius = useMemo(() => {
    if (!result || sRadius <= 3) return 0
    // Coupled: reducing radius by 1 km also reduces TAT by 3 min (travel only)
    const r2 = simCalc(baseline, {
      ...scenario,
      deliveryRadius: sRadius - 1,
      turnaround: Math.max(60, sTurnaround - 3),
    })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sRadius, sTurnaround])

  const marginalTrucks = useMemo(() => {
    if (!result) return 0
    const r2 = simCalc(baseline, { ...scenario, trucks: sTrucks + 1 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sTrucks])

  const marginalLoad = useMemo(() => {
    if (!result || sAvgLoad >= 10) return 0
    const r2 = simCalc(baseline, { ...scenario, avgLoadM3: sAvgLoad + 0.5 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sAvgLoad])

  const marginalPrice = useMemo(() => {
    if (!result) return 0
    const r2 = simCalc(baseline, { ...scenario, price: sPrice + 1 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sPrice])

  const marginalMaterial = useMemo(() => {
    if (!result) return 0
    const r2 = simCalc(baseline, { ...scenario, materialCost: sMaterialCost - 1 })
    return r2.contribUpside - result.contribUpside
  }, [baseline, scenario, result, sMaterialCost])

  const marginalReject = useMemo(() => {
    if (!result || sReject <= 0.1) return 0
    const r2 = simCalc(baseline, { ...scenario, rejectPct: Math.max(0, sReject - 0.5) })
    return (r2.rejectDelta - result.rejectDelta) * 12  // annualise for consistency
  }, [baseline, scenario, result, sReject])

  // ── Dynamic insight text ──
  const insight = useMemo(() => {
    if (!result) return ''
    if (result.scenarioBottleneck === 'Fleet / Logistics') {
      const gap = Math.round(result.prodDaily - result.effFleetDaily)
      const targetTA = result.prodDaily > 0
        ? Math.max(40, Math.round(baseline.opH * 60 * sTrucks * sAvgLoad / result.prodDaily))
        : sTurnaround
      return `Fleet is the active constraint, delivering ${Math.round(result.effFleetDaily)} m³/day but plant can produce ${Math.round(result.prodDaily)} m³/day (${gap} m³/day idle capacity). Reducing turnaround to ~${targetTA} min unlocks that gap without adding trucks.`
    }
    return `Plant is running at full capacity (${Math.round(result.prodDaily)} m³/day), adding trucks or cutting turnaround will not increase output from here. Use the Price slider to grow revenue on existing volume, or invest in plant capacity expansion.`
  }, [result, baseline, sTurnaround, sTrucks, sAvgLoad])

  const resetAll = () => {
    setSTurnaround(baseline.turnaround || 90)
    setSRadius(baseline.deliveryRadius || 15)
    setSTrucks(baseline.trucks || 10)
    setSAvgLoad(baseline.avgLoadM3 || 7)
    setSPrice(baseline.price || 65)
    setSMaterialCost(baseline.materialCost || 35)
    setSReject(baseline.rejectPct || 0)
    // Reset TAT breakdown to benchmark ratios of baseline handling
    const h = Math.max(30, (baseline.turnaround || 90) - (baseline.deliveryRadius || 15) * 3)
    setSPlantQueue(Math.round(h * BENCHMARK_RATIOS.plantQueue))
    setSWeighbridge(Math.round(h * BENCHMARK_RATIOS.weighbridge))
    setSLoading(Math.round(h * BENCHMARK_RATIOS.loading))
    setSSiteQueue(Math.round(h * BENCHMARK_RATIOS.siteQueue))
    setSUnloading(Math.round(h * BENCHMARK_RATIOS.unloading))
    setSWashout(Math.round(h * BENCHMARK_RATIOS.washout))
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
  if (sTurnaround < baseline.TARGET_TA * 0.7) simWarnings.push(`Turnaround ${sTurnaround} min is ${Math.round((1 - sTurnaround / (baseline.TARGET_TA || 80)) * 100)}% below regional target, unlikely without major route changes.`)
  if (result.sUtil > 95) simWarnings.push('Utilisation above 95% is unrealistic, the physical ceiling is 92% of nameplate.')
  if (sTrucks > (baseline.trucks || 10) * 1.5) simWarnings.push(`Fleet expanded ${Math.round((sTrucks / (baseline.trucks || 10) - 1) * 100)}%, requires significant capital investment.`)
  if (sPrice > (baseline.price || 65) * 1.3) simWarnings.push(`Price ${Math.round((sPrice / (baseline.price || 65) - 1) * 100)}% above current, verify market will accept this.`)
  if (sMaterialCost < baseline.materialCost * 0.85) simWarnings.push(`Material cost ${Math.round((1 - sMaterialCost / baseline.materialCost) * 100)}% below current, verify sourcing contracts can support this.`)

  const MARGINAL_THRESHOLD = 500

  // ── Group styling ──
  const groupStyle: React.CSSProperties = {
    background: 'var(--white)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px 14px',
    marginBottom: '12px',
  }
  const groupTitle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--gray-500)',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  }

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
            onClick={() => setShowTransparency(v => !v)}
            title="Toggle data basis panel"
            style={{
              padding: '4px 10px',
              border: '1px solid var(--gray-300)',
              borderRadius: '6px',
              fontSize: '11px',
              color: 'var(--gray-600)',
              background: showTransparency ? 'var(--gray-100)' : 'var(--white)',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            {showTransparency ? 'Hide data basis' : 'Show data basis'}
          </button>
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

      <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '16px' }}>
        Drag sliders to model operational improvements, revenue impact updates in real time
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '12px' : '24px' }}>
        {/* Left: Sliders in 4 groups */}
        <div>
          {/* ── OPERATIONAL ── */}
          <div style={groupStyle}>
            <div style={groupTitle}>Operational</div>

            <Slider label="Turnaround time" value={sTurnaround} min={60} max={240} step={1} baselineValue={baseline.turnaround || 90} unit="min" onChange={setSTurnaround} />
            {marginalTA > MARGINAL_THRESHOLD && (
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
                −1 min → +{fmtMarginal(marginalTA / 12)}/mo contribution
              </div>
            )}

            {/* ── Advanced: TAT value-stream breakdown ── */}
            <button
              type="button"
              onClick={() => setShowAdvancedTAT(v => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '11px', color: 'var(--green)', padding: '4px 0',
                marginTop: '-6px', marginBottom: '8px', fontFamily: 'var(--font)',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <span style={{ transition: 'transform 0.15s', transform: showAdvancedTAT ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', fontSize: '10px' }}>▸</span>
              {showAdvancedTAT ? 'Hide' : 'Break down'} turnaround into value-stream components
            </button>

            {showAdvancedTAT && (() => {
              const travel = sRadius * 3
              const sumMismatch = Math.abs(handlingSum + travel - sTurnaround) > 1
              return (
                <div style={{
                  background: 'var(--gray-50)', border: '1px solid var(--gray-100)',
                  borderRadius: '6px', padding: '10px 12px', marginBottom: '12px',
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '8px', fontWeight: 600 }}>
                    TAT breakdown (plant + site handling)
                  </div>

                  <BreakdownSlider label="Plant queue" hint="Wait to enter loading bay"
                    value={sPlantQueue} onChange={v => handleComponentChange(setSPlantQueue, v, sPlantQueue)} />
                  <BreakdownSlider label="Weighbridge" hint="Weigh in and out"
                    value={sWeighbridge} onChange={v => handleComponentChange(setSWeighbridge, v, sWeighbridge)} />
                  <BreakdownSlider label="Loading" hint="Batching and loading the mixer"
                    value={sLoading} onChange={v => handleComponentChange(setSLoading, v, sLoading)} />
                  <BreakdownSlider label="Site queue" hint="Wait at site to pour"
                    value={sSiteQueue} onChange={v => handleComponentChange(setSSiteQueue, v, sSiteQueue)} />
                  <BreakdownSlider label="Unloading / pour" hint="Actual concrete discharge"
                    value={sUnloading} onChange={v => handleComponentChange(setSUnloading, v, sUnloading)} />
                  <BreakdownSlider label="Washout" hint="Clean drum after pour"
                    value={sWashout} onChange={v => handleComponentChange(setSWashout, v, sWashout)} />

                  <div style={{
                    marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--gray-200)',
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px', fontSize: '11px',
                  }}>
                    <span style={{ color: 'var(--gray-600)' }}>Handling subtotal</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{handlingSum} min</span>
                    <span style={{ color: 'var(--gray-600)' }}>Transport round-trip ({sRadius} km × 1.5 min/km × 2 ways)</span>
                    <span style={{ fontFamily: 'var(--mono)' }}>{travel} min</span>
                    <span style={{ color: 'var(--gray-800)', fontWeight: 600, borderTop: '1px solid var(--gray-200)', paddingTop: '4px', marginTop: '2px' }}>Total TAT</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)', borderTop: '1px solid var(--gray-200)', paddingTop: '4px', marginTop: '2px' }}>{handlingSum + travel} min</span>
                  </div>

                  {sumMismatch && (
                    <div style={{
                      marginTop: '8px', padding: '6px 8px',
                      background: '#FFF4E5', border: '1px solid #FAD7A0',
                      borderRadius: '4px', fontSize: '10px', color: '#7a5a00', lineHeight: 1.5,
                    }}>
                      ⚠ TAT slider shows {sTurnaround} min but components sum to {handlingSum + travel} min. Adjust a component or the TAT slider to reconcile.
                    </div>
                  )}
                </div>
              )
            })()}

            <Slider label="Delivery radius" value={sRadius} min={3} max={50} step={1} baselineValue={baseline.deliveryRadius || 15} unit="km" onChange={handleRadiusChange} />
            {marginalRadius > MARGINAL_THRESHOLD && (
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
                −1 km → +{fmtMarginal(marginalRadius / 12)}/mo contribution
              </div>
            )}

          </div>

          {/* ── STRUCTURAL ── */}
          <div style={groupStyle}>
            <div style={groupTitle}>Structural</div>

            <Slider label="Fleet size" value={sTrucks} min={1} max={Math.max(baseline.trucks * 2, 20)} step={1} baselineValue={baseline.trucks || 10} unit="trucks" onChange={setSTrucks} />
            {marginalTrucks > MARGINAL_THRESHOLD && (
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
                +1 truck → +{fmtMarginal(marginalTrucks / 12)}/mo contribution
              </div>
            )}

            <Slider label="Avg load per trip" value={sAvgLoad} min={5} max={10} step={0.1} baselineValue={baseline.avgLoadM3 || 7} unit="m³" onChange={setSAvgLoad} />
            {marginalLoad > MARGINAL_THRESHOLD && (
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
                +0.5 m³ → +{fmtMarginal(marginalLoad / 12)}/mo contribution
              </div>
            )}
          </div>

          {/* ── COMMERCIAL ── */}
          <div style={groupStyle}>
            <div style={groupTitle}>Commercial</div>

            <Slider label="Selling price" value={sPrice} min={20} max={150} step={0.5} baselineValue={baseline.price || 65} unit="$/m³" onChange={setSPrice} />
            {Math.abs(marginalPrice) > MARGINAL_THRESHOLD && (
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
                +$1/m³ → +{fmtMarginal(marginalPrice / 12)}/mo contribution
              </div>
            )}

            <Slider label="Material cost" value={sMaterialCost} min={10} max={100} step={0.5} baselineValue={baseline.materialCost || 35} unit="$/m³" onChange={setSMaterialCost} />
            {marginalMaterial > MARGINAL_THRESHOLD && (
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
                −$1/m³ → +{fmtMarginal(marginalMaterial / 12)}/mo contribution
              </div>
            )}

            {/* Derived contribution margin */}
            <div style={{
              marginTop: '6px', padding: '8px 10px',
              background: 'var(--gray-50)', border: '1px solid var(--gray-100)',
              borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '11px', color: 'var(--gray-600)' }}>Contribution margin</span>
              <span style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'var(--mono)', color: sContrib > 0 ? 'var(--green)' : 'var(--red)' }}>
                ${sContrib.toFixed(2)}/m³
              </span>
            </div>
          </div>

          {/* ── QUALITY ── */}
          <div style={groupStyle}>
            <div style={groupTitle}>Quality</div>

            <Slider label="Rejection rate" value={sReject} min={0} max={10} step={0.1} baselineValue={baseline.rejectPct || 0} unit="%" onChange={setSReject} />
            {marginalReject > MARGINAL_THRESHOLD && (
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '-10px', marginBottom: '10px', textAlign: 'right' }}>
                −0.5pp → +{fmtMarginal(marginalReject / 12)}/mo savings
              </div>
            )}
          </div>
        </div>

        {/* Right: Results + Transparency */}
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

          {/* ── HERO: Contribution impact (matches report's $X/mo framing) ── */}
          {(() => {
            const contribMonthly = Math.round(result.contribUpside / 12)
            const contribQuarterly = Math.round(result.contribUpside / 4)
            const contribPositive = result.contribUpside > 0
            return (
              <div style={{
                background: contribPositive ? 'var(--green-light)' : result.contribUpside < 0 ? '#FDE8E6' : 'var(--gray-100)',
                border: `1px solid ${contribPositive ? 'var(--tooltip-border)' : result.contribUpside < 0 ? 'var(--error-border)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '16px', marginBottom: '12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px' }}>
                  Monthly contribution impact
                </div>
                <div style={{
                  fontSize: '26px', fontWeight: 600, fontFamily: 'var(--mono)', marginTop: '4px',
                  color: contribPositive ? 'var(--green)' : result.contribUpside < 0 ? 'var(--red)' : 'var(--gray-500)',
                }}>
                  {contribMonthly > 0 ? '+' : ''}{fmt(contribMonthly)}/mo
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '6px', display: 'flex', justifyContent: 'center', gap: '14px' }}>
                  <span>Quarterly: {contribQuarterly > 0 ? '+' : ''}{fmt(contribQuarterly)}</span>
                  <span>Annual: {result.contribUpside > 0 ? '+' : ''}{fmt(result.contribUpside)}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px' }}>
                  At ${sContrib.toFixed(2)}/m³ contribution margin (${sPrice.toFixed(2)} − ${sMaterialCost.toFixed(2)})
                </div>
              </div>
            )
          })()}

          {/* Secondary cards: volume change + revenue impact */}
          {(() => {
            const deltaMonthly = Math.round(result.deltaVol / 12)
            const deltaQuarterly = Math.round(result.deltaVol / 4)
            const revenueMonthly = Math.round(result.revenueUpside / 12)
            const revenueQuarterly = Math.round(result.revenueUpside / 4)
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div style={{
                  background: 'var(--white)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '12px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px' }}>Volume change</div>
                  <div style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--mono)', color: deltaPositive ? 'var(--green)' : result.deltaVol < 0 ? 'var(--red)' : 'var(--gray-500)', marginTop: '4px' }}>
                    {deltaMonthly > 0 ? '+' : ''}{deltaMonthly.toLocaleString()} m³/mo
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gray-500)', marginTop: '4px', lineHeight: 1.5 }}>
                    <div>{deltaQuarterly > 0 ? '+' : ''}{deltaQuarterly.toLocaleString()} m³/qtr</div>
                    <div>{result.deltaVol > 0 ? '+' : ''}{result.deltaVol.toLocaleString()} m³/yr</div>
                  </div>
                </div>
                <div style={{
                  background: 'var(--white)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '12px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px' }}>Revenue impact</div>
                  <div style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--mono)', color: result.revenueUpside > 0 ? 'var(--green)' : result.revenueUpside < 0 ? 'var(--red)' : 'var(--gray-500)', marginTop: '4px' }}>
                    {revenueMonthly > 0 ? '+' : ''}{fmt(revenueMonthly)}/mo
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gray-500)', marginTop: '4px', lineHeight: 1.5 }}>
                    <div>{revenueQuarterly > 0 ? '+' : ''}{fmt(revenueQuarterly)}/qtr</div>
                    <div>{result.revenueUpside > 0 ? '+' : ''}{fmt(result.revenueUpside)}/yr</div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Rejection delta (only shown when slider moved) */}
          {Math.abs(result.rejectDelta) > 500 && (
            <div style={{
              background: result.rejectDelta > 0 ? 'var(--green-light)' : '#FDE8E6',
              border: `1px solid ${result.rejectDelta > 0 ? 'var(--tooltip-border)' : 'var(--error-border)'}`,
              borderRadius: '8px', padding: '10px 12px', marginBottom: '12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '11px', color: 'var(--gray-600)' }}>Rejection savings vs baseline</span>
              <span style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'var(--mono)', color: result.rejectDelta > 0 ? 'var(--green)' : 'var(--red)' }}>
                {result.rejectDelta > 0 ? '+' : ''}{fmt(result.rejectDelta)}/mo
              </span>
            </div>
          )}

          {/* Constraint analysis */}
          {(() => {
            // ── Trip counters: derived from TAT + trucks + op hours ──
            // Baseline: what the reported TAT produces
            const baselineDelsPerTruck = baseline.turnaround > 0 ? (baseline.opH * 60 / baseline.turnaround) : 0
            const baselineFleetTrips = baselineDelsPerTruck * baseline.trucks
            // Scenario: live values
            const scenarioDelsPerTruck = scenario.turnaround > 0 ? (baseline.opH * 60 / scenario.turnaround) : 0
            const scenarioFleetTrips = scenarioDelsPerTruck * scenario.trucks
            // Monthly counts
            const opDaysMonth = Math.round(baseline.opD / 12)
            const baselineMonthlyTrips = Math.round(baselineFleetTrips * opDaysMonth)
            const scenarioMonthlyTrips = Math.round(scenarioFleetTrips * opDaysMonth)
            const deltaMonthlyTrips = scenarioMonthlyTrips - baselineMonthlyTrips
            const tripsColour = deltaMonthlyTrips > 0 ? 'var(--green)' : deltaMonthlyTrips < 0 ? 'var(--red)' : 'var(--gray-600)'

            return (
              <div style={{
                background: 'var(--white)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '12px',
              }}>
                <div style={{ fontSize: '10px', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '8px' }}>
                  Constraint analysis
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '130px' }}>Bottleneck:</span>
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
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '130px' }}>Utilisation:</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 600, color: result.sUtil >= 88 ? 'var(--green)' : result.sUtil >= 70 ? 'var(--warning)' : 'var(--red)' }}>{result.sUtil}%</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '130px' }}>Target TAT:</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>{result.scenarioTargetTA} min</span>
                </div>

                {/* ── Trip metrics ── */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', marginBottom: '4px', paddingTop: '8px', borderTop: '1px solid var(--gray-100)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '130px' }}>Trips/truck/day:</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>
                    <span style={{ color: 'var(--gray-500)' }}>{baselineDelsPerTruck.toFixed(1)}</span>
                    <span style={{ margin: '0 6px', color: 'var(--gray-400)' }}>→</span>
                    <span style={{ fontWeight: 600 }}>{scenarioDelsPerTruck.toFixed(1)}</span>
                    <span style={{ marginLeft: '8px', color: tripsColour, fontWeight: 600 }}>
                      ({deltaMonthlyTrips > 0 ? '+' : ''}{(scenarioDelsPerTruck - baselineDelsPerTruck).toFixed(1)})
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '130px' }}>Fleet trips/day:</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>
                    <span style={{ color: 'var(--gray-500)' }}>{Math.round(baselineFleetTrips).toLocaleString()}</span>
                    <span style={{ margin: '0 6px', color: 'var(--gray-400)' }}>→</span>
                    <span style={{ fontWeight: 600 }}>{Math.round(scenarioFleetTrips).toLocaleString()}</span>
                    <span style={{ marginLeft: '8px', color: tripsColour, fontWeight: 600 }}>
                      ({Math.round(scenarioFleetTrips - baselineFleetTrips) > 0 ? '+' : ''}{Math.round(scenarioFleetTrips - baselineFleetTrips).toLocaleString()})
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '130px' }}>Fleet trips/month:</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>
                    <span style={{ color: 'var(--gray-500)' }}>{baselineMonthlyTrips.toLocaleString()}</span>
                    <span style={{ margin: '0 6px', color: 'var(--gray-400)' }}>→</span>
                    <span style={{ fontWeight: 600 }}>{scenarioMonthlyTrips.toLocaleString()}</span>
                    <span style={{ marginLeft: '8px', color: tripsColour, fontWeight: 600 }}>
                      ({deltaMonthlyTrips > 0 ? '+' : ''}{deltaMonthlyTrips.toLocaleString()})
                    </span>
                  </span>
                </div>

                {/* ── Daily output (kept for context) ── */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', marginBottom: '4px', paddingTop: '8px', borderTop: '1px solid var(--gray-100)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '130px' }}>Production (plant):</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>{Math.round(result.prodDaily).toLocaleString()} m³/day</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '130px' }}>Fleet cap:</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>{Math.round(result.effFleetDaily).toLocaleString()} m³/day</span>
                </div>

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
            )
          })()}

          {/* ── TRANSPARENCY PANEL ── */}
          {showTransparency && (
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '12px', marginTop: '12px',
            }}>
              <div style={{
                fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
                color: 'var(--gray-500)', marginBottom: '10px',
              }}>
                Data basis for this simulation
              </div>

              <TransparencyRow label="Plant capacity"
                value={`${baseline.cap} m³/hr${baseline.numberOfPlants > 1 ? ` (${baseline.numberOfPlants} plants)` : ''}`}
                provenance={getProvenance(baseline.provenance, 'plant_capacity_m3_per_hour')} />
              <TransparencyRow label="Operating hours"
                value={`${baseline.opH} hrs/day`}
                provenance={getProvenance(baseline.provenance, 'operating_hours_per_day')} />
              <TransparencyRow label="Operating days"
                value={`${baseline.opD} /year`}
                provenance={getProvenance(baseline.provenance, 'operating_days_per_year')} />
              <TransparencyRow label="Trucks assigned"
                value={`${baseline.trucks}`}
                provenance={getProvenance(baseline.provenance, 'trucks_assigned')} />
              <TransparencyRow label="Turnaround time"
                value={`${baseline.turnaround} min`}
                provenance={getProvenance(baseline.provenance, 'avg_turnaround_min')} />
              <TransparencyRow label="Delivery radius"
                value={`${baseline.deliveryRadius} km`}
                provenance={getProvenance(baseline.provenance, 'avg_delivery_radius')} />
              <TransparencyRow label="Avg load per trip"
                value={`${baseline.avgLoadM3.toFixed(2)} m³`}
                provenance={getProvenance(baseline.provenance, 'avg_load_m3')} />
              <TransparencyRow label="Rejection rate"
                value={`${baseline.rejectPct}%`}
                provenance={getProvenance(baseline.provenance, 'rejection_rate_pct')} />
              <TransparencyRow label="Selling price"
                value={`$${baseline.price.toFixed(2)}/m³`}
                provenance={{ type: 'reported' }} />
              <TransparencyRow label="Material cost"
                value={`$${baseline.materialCost.toFixed(2)}/m³`}
                provenance={{ type: 'reported' }} />
              <TransparencyRow label="Contribution margin"
                value={`$${baseline.contrib.toFixed(2)}/m³`}
                provenance={{ type: 'calculated', formula: `$${baseline.price.toFixed(2)} − $${baseline.materialCost.toFixed(2)}` }} />
              <TransparencyRow label="Current utilisation"
                value={`${baseline.util}%`}
                provenance={{ type: 'calculated', formula: 'actual output ÷ plant capacity' }} />

              {baseline.dispatchTool && (
                <TransparencyRow label="Dispatch tool"
                  value={baseline.dispatchTool}
                  provenance={{ type: 'reported' }}
                  qualitative />
              )}
              {baseline.truckBanHours != null && (
                <TransparencyRow label="Truck ban"
                  value={`${baseline.truckBanHours} hrs/day (regulatory)`}
                  provenance={{ type: 'reported' }}
                  qualitative />
              )}
              <TransparencyRow label="Demand status"
                value={
                  baseline.demandStatus === 'constrained' ? 'Outpaces delivery (volume sellable)'
                  : baseline.demandStatus === 'weak' ? 'Below capacity'
                  : 'Matched to capacity'
                }
                provenance={{ type: 'reported' }}
                qualitative />
            </div>
          )}
        </div>
      </div>

      {/* ── Info modal (legacy calculation breakdown retained for v3 parity) ── */}
      {showInfo && (
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

            <div style={{ fontSize: '11px', color: 'var(--gray-600)', lineHeight: 1.7 }}>
              <p style={{ marginBottom: '10px' }}>
                <strong>Scenario fleet:</strong> {sTrucks} trucks × ({baseline.opH}h × 60 ÷ {sTurnaround} min) × {sAvgLoad.toFixed(2)} m³ = {Math.round(result.effFleetDaily).toLocaleString()} m³/day.
              </p>
              <p style={{ marginBottom: '10px' }}>
                <strong>Plant ceiling:</strong> {baseline.cap} m³/hr × 92% × {baseline.opH} hr = {Math.round(result.prodDaily).toLocaleString()} m³/day.
              </p>
              <p style={{ marginBottom: '10px' }}>
                <strong>Scenario output:</strong> min(fleet, plant) = {Math.round(result.effFleetDaily < result.prodDaily ? result.effFleetDaily : result.prodDaily).toLocaleString()} m³/day × {baseline.opD} days = {result.scenarioAnnual.toLocaleString()} m³/yr.
              </p>
              <p style={{ marginBottom: '10px' }}>
                <strong>Scenario target TAT:</strong> 60 min handling + ({sRadius} km × 1.5 min/km × 2) = {result.scenarioTargetTA} min.
              </p>
              <p style={{ marginBottom: '10px' }}>
                <strong>Scenario contribution:</strong> ${sPrice.toFixed(2)} − ${sMaterialCost.toFixed(2)} = ${sContrib.toFixed(2)}/m³.
              </p>
              <p style={{ marginBottom: '10px' }}>
                <strong>Contribution upside:</strong> {result.scenarioAnnual.toLocaleString()} × ${sContrib.toFixed(2)} − baseline total = {result.contribUpside >= 0 ? '+' : ''}{fmt(result.contribUpside)}/yr.
              </p>
              <p style={{ marginBottom: '10px' }}>
                <strong>Rejection impact:</strong> at {sReject}% vs baseline {baseline.rejectPct}%, monthly delta = {result.rejectDelta >= 0 ? '+' : ''}{fmt(result.rejectDelta)}/mo in material cost.
              </p>
            </div>

            <div style={{
              background: 'var(--gray-50)', border: '1px solid var(--gray-100)',
              borderRadius: '8px', padding: '12px 14px', marginTop: '16px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '4px' }}>
                Why the report and simulator may differ
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-500)', lineHeight: 1.6 }}>
                The report shows what the plant actually produced last month. The simulator models what the plant <em>could</em> produce at the current slider settings, continuously. Use the simulator to compare scenarios against each other, not as an exact prediction.
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

// ── TAT breakdown component slider ─────────────────────────────────────────
function BreakdownSlider({ label, hint, value, onChange }: {
  label: string
  hint: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
        <div>
          <span style={{ fontSize: '11px', color: 'var(--gray-700)', fontWeight: 500 }}>{label}</span>
          <span style={{ fontSize: '10px', color: 'var(--gray-400)', marginLeft: '6px' }}>{hint}</span>
        </div>
        <span style={{ fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--gray-800)' }}>{value} min</span>
      </div>
      <input
        type="range"
        min={0}
        max={60}
        step={1}
        value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: '100%', accentColor: 'var(--green)' }}
      />
    </div>
  )
}

// ── Transparency row ────────────────────────────────────────────────────────
function TransparencyRow({
  label, value, provenance, qualitative,
}: {
  label: string
  value: string
  provenance: import('@/lib/reportProvenance').ProvenanceEntry
  qualitative?: boolean
}) {
  const rendered = renderProvenance(provenance)
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr auto',
      gap: '8px', padding: '6px 0', alignItems: 'baseline',
      borderBottom: '1px solid var(--gray-100)',
    }}>
      <span style={{ fontSize: '11px', color: 'var(--gray-500)' }}>{label}</span>
      <span style={{ fontSize: '11px', color: 'var(--gray-800)', fontFamily: qualitative ? 'var(--font)' : 'var(--mono)' }}>
        {value}
      </span>
      <span>
        <ProvenanceTag tag={rendered.tag} />
      </span>
    </div>
  )
}
