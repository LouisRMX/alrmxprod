'use client'

import { useState, useMemo } from 'react'
import type { CalcResult, Answers } from '@/lib/calculations'
import { buildValidatedDiagnosis, type ValidatedDiagnosis } from '@/lib/diagnosis-pipeline'
import { useIsMobile } from '@/hooks/useIsMobile'

function fmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000).toLocaleString() + 'k'
  return '$' + Math.round(n)
}

function fmtFull(n: number): string {
  return '$' + Math.round(n).toLocaleString()
}

interface DecisionViewProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  phase?: string
  savedDiagnosis?: ValidatedDiagnosis | null
}

export default function DecisionView({ calcResult, answers, meta, phase, savedDiagnosis }: DecisionViewProps) {
  const isMobile = useIsMobile()
  const r = calcResult
  const [showCalcDetail, setShowCalcDetail] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)

  const vd = useMemo(
    () => savedDiagnosis || buildValidatedDiagnosis(r, answers, meta),
    [savedDiagnosis, r, answers, meta]
  )

  const isValidated = phase === 'complete' || phase === 'onsite'
  const isPre = !isValidated

  // Separate throughput from leakage
  const throughputLoss = vd.main_driver.amount
  const leakageItems = vd.loss_breakdown_detail.filter(l =>
    l.classification === 'additive' && l.dimension !== vd.main_driver.dimension
  )
  const totalLeakage = leakageItems.reduce((s, l) => s + l.amount, 0)
  const totalLoss = throughputLoss + totalLeakage

  const confidence = vd.confidence === 'high' ? 'High'
    : vd.confidence === 'medium-high' ? 'Medium-High'
    : isPre ? 'Preliminary' : 'Medium'

  const excessMin = Math.max(0, vd.tat_actual - vd.tat_target)
  const constraint = vd.primary_constraint

  // TAT breakdown (validated only)
  const tatComponents = vd.tat_breakdown && isValidated ? vd.tat_breakdown : null
  const primaryComponent = tatComponents
    ? tatComponents.reduce((max, c) => (c.actual - c.benchmark > (max.actual - max.benchmark) ? c : max), tatComponents[0])
    : null

  return (
    <div style={{
      flex: 1, overflow: 'auto',
      padding: isMobile ? '20px 16px' : '36px 40px',
      maxWidth: '800px',
    }}>

      {/* ═══ DEMAND-CONSTRAINED ═══ */}
      {vd.demand_constrained ? (
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#c96a00', marginBottom: '20px' }}>
            Demand-constrained
          </div>
          <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: 700, color: 'var(--gray-900)', lineHeight: 1.3, marginBottom: '16px' }}>
            Your plant has capacity, but the order book does not fill it.
          </div>
          <div style={{ fontSize: '15px', color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: '20px' }}>
            Growing demand is the priority before optimizing operations. Plant utilization is {vd.utilization_pct}%.
          </div>
          {vd.cost_only_savings > 0 && (
            <div style={{
              background: 'var(--gray-50)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '16px 20px', marginBottom: '20px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Operational savings potential
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: '#c96a00' }}>
                {fmtFull(vd.cost_only_savings)}/month
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '4px' }}>
                Fuel and variable cost reduction from turnaround improvement. Not recoverable revenue.
              </div>
            </div>
          )}
          {totalLeakage > 0 && (
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '16px 20px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                Independent leakage
              </div>
              {leakageItems.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{l.dimension}</span>
                  <span style={{ fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--gray-700)' }}>{fmt(l.amount)}/mo</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '20px' }}>
            {isValidated ? 'Validated on-site.' : 'Based on reported data. On-site validation will confirm.'}
          </div>
        </div>
      ) : (
        <div>
          {/* ═══ 1. EXECUTIVE SUMMARY ═══ */}
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: isValidated ? 'var(--green)' : '#c96a00', marginBottom: '20px' }}>
            {isValidated ? 'Validated diagnosis' : 'Preliminary diagnosis'}
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: isMobile ? '32px' : '42px', fontWeight: 800, lineHeight: 1.1, color: '#C0392B' }}>
              {vd.total_loss_range ? `${fmtFull(vd.total_loss_range.lo)}–${fmtFull(vd.total_loss_range.hi)}` : fmtFull(totalLoss)}/month
            </div>
            <div style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 500, color: 'var(--gray-500)', marginTop: '6px' }}>
              in profit is not being captured.
            </div>
          </div>

          {/* Split: throughput + leakage */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '14px', color: 'var(--gray-700)' }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#C0392B' }}>{fmt(throughputLoss)}</span> from constrained output <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>({constraint})</span>
            </div>
            {totalLeakage > 0 && (
              <div style={{ fontSize: '14px', color: 'var(--gray-700)' }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#c96a00' }}>{fmt(totalLeakage)}</span> from operational leakage
              </div>
            )}
          </div>

          {/* Primary issue + action */}
          <div style={{
            background: 'var(--gray-50)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '16px 20px', marginBottom: '24px',
          }}>
            <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '6px' }}>
              <strong style={{ color: 'var(--gray-700)' }}>Primary issue:</strong> {constraint} is limiting throughput{excessMin > 0 ? ` (TAT ${vd.tat_actual} min vs ${vd.tat_target} min target)` : ''}.
            </div>
            {vd.actions.length > 0 && (
              <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>
                <strong style={{ color: 'var(--gray-700)' }}>Action:</strong> {vd.actions[0].text}
              </div>
            )}
          </div>

          {/* Confidence + proof */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '28px' }}>
            <span style={{
              fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
              background: confidence === 'High' ? 'var(--green-light)' : '#FFF8ED',
              color: confidence === 'High' ? 'var(--green)' : '#c96a00',
            }}>
              Confidence: {confidence}
            </span>
            <button
              onClick={() => setShowCalcDetail(!showCalcDetail)}
              style={{ fontSize: '11px', color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'underline', padding: 0 }}
            >
              {showCalcDetail ? 'Hide details' : 'How this is calculated'}
            </button>
          </div>

          {/* ═══ PROOF LAYER ═══ */}
          {showCalcDetail && (
            <div style={{
              background: 'var(--gray-50)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '18px 22px', marginBottom: '24px',
              fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.7,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--gray-700)', marginBottom: '14px', fontSize: '14px' }}>How this estimate was calculated</div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: '6px' }}>Inputs</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
                  <span>Plant capacity: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>{vd.plant_capacity_m3hr} m³/hr</strong></span>
                  <span>Utilization: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>{vd.utilization_pct}%</strong> (target 85%)</span>
                  <span>Turnaround: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>{vd.tat_actual} min</strong> (target {vd.tat_target} min)</span>
                  <span>Trucks: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>{vd.trucks_total}</strong> ({vd.trucks_effective} effective)</span>
                  <span>Margin: <strong style={{ fontFamily: 'var(--mono)', color: 'var(--gray-700)' }}>${vd.margin_per_m3}/m³</strong></span>
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: '4px' }}>Evidence</div>
                {vd.observed_signals.slice(0, 2).map((s, i) => (
                  <div key={i} style={{ marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', background: 'var(--green-light)', padding: '1px 6px', borderRadius: '3px', marginRight: '6px' }}>Observed</span>{s}
                  </div>
                ))}
                {vd.inferred_signals.slice(0, 1).map((s, i) => (
                  <div key={i}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#c96a00', background: '#FFF8ED', padding: '1px 6px', borderRadius: '3px', marginRight: '6px' }}>Inferred</span>{s}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: '4px' }}>What would improve this estimate</div>
                <div style={{ color: 'var(--gray-400)' }}>{vd.case_specific_missing_data.join(' · ') || 'No critical data gaps.'}</div>
              </div>
            </div>
          )}

          {/* ═══ 2. PROFIT BREAKDOWN ═══ */}
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '12px', overflow: 'hidden', marginBottom: '24px',
          }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Profit breakdown</div>
            </div>

            {/* Throughput */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)' }}>Constrained output</div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Active constraint: {constraint}</div>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: '#C0392B' }}>{fmt(throughputLoss)}/mo</div>
              </div>
            </div>

            {/* Leakage items */}
            {leakageItems.map((l, i) => (
              <div key={i} style={{ padding: '12px 20px', borderBottom: i < leakageItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: '14px', color: 'var(--gray-700)' }}>{l.dimension}</div>
                  <div style={{ fontSize: '14px', fontFamily: 'var(--mono)', fontWeight: 600, color: '#c96a00' }}>{fmt(l.amount)}/mo</div>
                </div>
              </div>
            ))}

            {/* Total */}
            <div style={{ padding: '14px 20px', background: '#FFF3F3', borderTop: '1px solid #FCC' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gray-900)' }}>Total monthly loss</div>
                <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#C0392B' }}>{fmt(totalLoss)}/mo</div>
              </div>
            </div>
          </div>

          {/* Recovery opportunities (separate from loss) */}
          {vd.recovery_opportunities.length > 0 && (
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '14px 20px', marginBottom: '24px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                Recovery opportunities (not included in loss)
              </div>
              {vd.recovery_opportunities.map((ro, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{ro.label}</span>
                  <span style={{ fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--green)' }}>+{fmt(ro.amount)}/mo</span>
                </div>
              ))}
            </div>
          )}

          {/* ═══ 3. CONSTRAINT SECTION ═══ */}
          {constraint === 'Fleet' && excessMin > 0 && (
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '18px 20px', marginBottom: '24px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                Constraint: Fleet
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Turnaround</div>
                  <div style={{ fontSize: '16px', fontFamily: 'var(--mono)', fontWeight: 700, color: '#C0392B' }}>{vd.tat_actual} min</div>
                  <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>target {vd.tat_target} min</div>
                </div>
                {vd.performance_gaps.deliveries_per_truck && (
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Deliveries/truck/day</div>
                    <div style={{ fontSize: '16px', fontFamily: 'var(--mono)', fontWeight: 700, color: '#C0392B' }}>{vd.performance_gaps.deliveries_per_truck.actual}</div>
                    <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>target {vd.performance_gaps.deliveries_per_truck.target}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Lost volume</div>
                  <div style={{ fontSize: '16px', fontFamily: 'var(--mono)', fontWeight: 700, color: '#c96a00' }}>{vd.lost_volume_m3.toLocaleString()} m³/mo</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Impact</div>
                  <div style={{ fontSize: '16px', fontFamily: 'var(--mono)', fontWeight: 700, color: '#C0392B' }}>{fmt(throughputLoss)}/mo</div>
                </div>
              </div>

              {/* TAT breakdown if available */}
              {tatComponents && (
                <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {tatComponents.map(c => {
                    const excess = Math.max(0, c.actual - c.benchmark)
                    const isPrim = c === primaryComponent && excess > 0
                    return (
                      <div key={c.label} style={{
                        padding: '10px', borderRadius: '8px',
                        border: `1px solid ${isPrim ? 'var(--red)' : excess > 0 ? '#f5cba0' : 'var(--border)'}`,
                        background: isPrim ? '#fff3f3' : excess > 0 ? '#fffaf5' : 'var(--gray-50)',
                      }}>
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '4px' }}>{c.label}</div>
                        <div style={{ fontSize: '14px', fontFamily: 'var(--mono)', fontWeight: 700, color: excess > 0 ? (isPrim ? 'var(--red)' : '#c96a00') : 'var(--gray-600)' }}>{c.actual}m</div>
                        {excess > 0 && <div style={{ fontSize: '10px', color: isPrim ? 'var(--red)' : '#c96a00' }}>+{excess} excess</div>}
                        {isPrim && <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--red)', marginTop: '2px' }}>▲ PRIMARY</div>}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Mechanism */}
              <div style={{ marginTop: '14px', fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.6 }}>
                {vd.mechanism_detail}
              </div>
            </div>
          )}

          {constraint === 'Production' && (
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '18px 20px', marginBottom: '24px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                Constraint: Production
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Utilization</div>
                  <div style={{ fontSize: '16px', fontFamily: 'var(--mono)', fontWeight: 700, color: '#C0392B' }}>{vd.utilization_pct}%</div>
                  <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>target 85%</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>Output</div>
                  <div style={{ fontSize: '16px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gray-700)' }}>{vd.actual_monthly_m3.toLocaleString()} m³/mo</div>
                </div>
              </div>
              <div style={{ marginTop: '14px', fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.6 }}>
                {vd.mechanism_detail}
              </div>
            </div>
          )}

          {/* ═══ 5. ACTIONS ═══ */}
          {vd.actions.length > 0 && (
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '12px', overflow: 'hidden', marginBottom: '24px',
            }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--gray-50)' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prioritized actions</div>
              </div>

              {vd.actions.slice(0, showMoreActions ? undefined : 3).map((a, i) => (
                <div key={i} style={{
                  padding: '14px 20px',
                  borderBottom: i < (showMoreActions ? vd.actions.length : Math.min(3, vd.actions.length)) - 1 ? '1px solid var(--border)' : 'none',
                  background: i === 0 ? 'var(--green-pale)' : 'var(--white)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: i === 0 ? 600 : 400, color: 'var(--gray-900)' }}>
                        {i + 1}. {a.text}
                      </div>
                      {a.detail && <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>{a.detail}</div>}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--gray-400)', flexShrink: 0 }}>
                      {a.time_horizon === 'this_week' ? 'This week' : a.time_horizon === 'this_month' ? 'This month' : 'Later'}
                    </span>
                  </div>
                </div>
              ))}

              {vd.actions.length > 3 && !showMoreActions && (
                <div style={{ padding: '10px 20px' }}>
                  <button onClick={() => setShowMoreActions(true)} style={{ fontSize: '12px', color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    + {vd.actions.length - 3} more
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Combined recovery range */}
          {vd.combined_recovery_range.lo > 0 && (
            <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '20px' }}>
              Combined recovery potential: <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--green)' }}>{fmt(vd.combined_recovery_range.lo)}–{fmt(vd.combined_recovery_range.hi)}/month</span> within 90 days
            </div>
          )}

          {/* Footer */}
          <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
            {isValidated ? 'Validated on-site.' : 'Based on reported data. On-site validation will confirm.'}
            <br /><span style={{ color: 'var(--gray-300)' }}>Visible to owner + manager only</span>
          </div>
        </div>
      )}
    </div>
  )
}
