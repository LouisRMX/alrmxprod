'use client'

import { useState } from 'react'
import type { CalcResult, Answers } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import { useIsMobile } from '@/hooks/useIsMobile'

function fmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000).toLocaleString() + 'k'
  return '$' + Math.round(n)
}

function fmtFull(n: number): string {
  return '$' + Math.round(n).toLocaleString()
}

function fmtRange(n: number): string {
  return `${fmtFull(Math.round(n * 0.82))}–${fmtFull(Math.round(n * 1.18))}`
}

interface DecisionViewProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  phase?: string
}

export default function DecisionView({ calcResult, answers, meta, phase }: DecisionViewProps) {
  const isMobile = useIsMobile()
  const r = calcResult
  const issues = buildIssues(r, answers, meta)
  const [showCalcDetail, setShowCalcDetail] = useState(false)
  const [showMoreActions, setShowMoreActions] = useState(false)

  const isValidated = phase === 'complete' || phase === 'onsite'
  const isPre = !isValidated

  const withDiagnosis = issues.filter(i => i.diagnosis && i.loss > 0)
  const primary = withDiagnosis[0] ?? null

  // Loss totals
  const totalLoss = r.turnaroundLeakMonthly + r.capLeakMonthly + r.rejectLeakMonthly +
    (r.partialLeakMonthly || 0) + (r.surplusLeakMonthly || 0)
  const excessMin = r.excessMin || 0

  // Loss by dimension
  const dimTotals: Record<string, number> = {}
  for (const issue of issues) {
    if (issue.loss > 0 && issue.dimension) {
      dimTotals[issue.dimension] = (dimTotals[issue.dimension] || 0) + issue.loss
    }
  }
  const sortedDims = Object.entries(dimTotals).sort((a, b) => b[1] - a[1])
  const mainDriverDim = sortedDims[0]
  const otherLoss = sortedDims.slice(1).reduce((s, [, v]) => s + v, 0)

  // Cause label
  const causeLabel = primary?.dimension === 'Fleet' && primary?.diagnosis?.tatComponent === 'site'
    ? 'Site Waiting' : primary?.dimension === 'Fleet' ? 'Fleet Turnaround'
    : primary?.dimension || 'Turnaround'

  // Operational context
  const capacityPct = r.util > 0 ? Math.round((1 - r.util) * 100) : null

  // Mechanism
  function diagnosisMechanism(): string {
    if (!primary?.diagnosis) return ''
    const raw = primary.diagnosis.mechanism
      .replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
    const sentences = raw.split('.').map(s => s.trim()).filter(Boolean).slice(0, 2)
    if (primary.diagnosis.strength === 'observed') {
      return sentences.map(s => s.replace(/\blikely\b\s*/gi, '').replace(/\s+/g, ' ').trim()).join('. ') + '.'
    }
    return sentences.join('. ') + '.'
  }

  // Evidence
  const observedLine = primary?.diagnosis?.observed
    ? primary.diagnosis.observed.split('.').filter(s => s.trim()).slice(0, 2).join('.').trim() + '.'
    : null
  const inferredSentences = primary?.diagnosis?.mechanism
    ? primary.diagnosis.mechanism.replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '').split('.').filter(s => s.trim())
    : []
  const inferredLine = inferredSentences.length > 1 ? inferredSentences[1].trim() + '.' : null

  // Actions from primary only, with estimated recovery
  const primaryActions: { text: string; detail: string }[] = []
  if (primary?.diagnosis) {
    const steps = primary.diagnosis.action.split(/Step \d+:\s*/).filter(Boolean)
    for (const step of steps) {
      const lines = step.split(/\.\s+/).filter(Boolean)
      const text = lines[0]?.trim() || step.trim()
      const detail = lines.slice(1).join('. ').trim()
      if (text && !primaryActions.some(a => a.text === text)) {
        primaryActions.push({ text, detail })
      }
    }
  }
  // Estimate recovery per action: primary action gets ~60%, second ~25%, rest ~15%
  const mainDriverLoss = mainDriverDim ? mainDriverDim[1] : totalLoss
  const recoveryEstimates = [
    Math.round(mainDriverLoss * 0.55),
    Math.round(mainDriverLoss * 0.25),
    Math.round(mainDriverLoss * 0.12),
    Math.round(mainDriverLoss * 0.08),
  ]

  const demandConstrained = r.demandSufficient === false
  const confidence = primary?.diagnosis?.strength === 'observed' ? 'High' : isPre ? 'Preliminary' : 'Medium'

  // TAT breakdown (validated + data only)
  const hasBreakdown = r.taBreakdownEntered && isValidated
  const tatComponents = hasBreakdown ? [
    { label: 'Plant-side', actual: Math.max(0, r.ta - (r.taTransitMin || 0) - (r.taSiteWaitMin || 0) - (r.taWashoutMin || 0)), benchmark: Math.max(0, r.TARGET_TA - (r.taTransitMin ? Math.min(r.taTransitMin, r.TARGET_TA * 0.3) : r.TARGET_TA * 0.2) - 35 - 12) },
    { label: 'Transit', actual: r.taTransitMin || Math.round(r.radius * 2 * 1.5) || 0, benchmark: r.taTransitMin || Math.round(r.radius * 2 * 1.5) || 0 },
    { label: 'Site', actual: r.taSiteWaitMin || 0, benchmark: 35 },
    { label: 'Washout', actual: r.taWashoutMin || 0, benchmark: 12 },
  ] : null
  const primaryComponent = tatComponents
    ? tatComponents.reduce((max, c) => (c.actual - c.benchmark > (max.actual - max.benchmark) ? c : max), tatComponents[0])
    : null

  return (
    <div style={{
      flex: 1, overflow: 'auto',
      padding: isMobile ? '20px 16px' : '36px 40px',
      maxWidth: '780px',
    }}>

      {demandConstrained ? (
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 600, color: '#c96a00', lineHeight: 1.4 }}>
            Your plant has capacity, but the order book does not fill it.
            Growing demand is the priority before optimizing operations.
          </div>
        </div>
      ) : (
        <>
          {/* ═══ (1) HEADLINE: two-step hierarchy ═══ */}
          <div style={{ marginBottom: '6px' }}>
            <div style={{
              fontSize: isMobile ? '32px' : '42px', fontWeight: 800, lineHeight: 1.1,
              color: '#C0392B',
            }}>
              {isPre ? fmtRange(totalLoss) : fmtFull(totalLoss)}/month
            </div>
            <div style={{
              fontSize: isMobile ? '20px' : '26px', fontWeight: 700, lineHeight: 1.3,
              color: 'var(--gray-900)', marginTop: '4px',
            }}>
              is being lost due to {causeLabel.toLowerCase()}.
            </div>
          </div>

          {/* ═══ (2) CONFIDENCE + (3) CONTEXT ═══ */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                background: confidence === 'High' ? 'var(--green-light)' : '#FFF8ED',
                color: confidence === 'High' ? 'var(--green)' : '#c96a00',
              }}>
                Confidence: {confidence}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
                {confidence === 'High' ? 'Validated on-site' : isPre ? 'Based on reported data' : 'Based on operational data'}
              </span>
              <button
                onClick={() => setShowCalcDetail(!showCalcDetail)}
                style={{
                  fontSize: '11px', color: 'var(--green)', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'underline',
                  padding: 0,
                }}
              >
                {showCalcDetail ? 'Hide calculation basis' : 'How this is calculated'}
              </button>
            </div>
            {capacityPct !== null && capacityPct > 5 && (
              <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
                Equivalent to ~{capacityPct}% of plant capacity at risk
              </div>
            )}
          </div>

          {/* ═══ PROOF LAYER (expandable, fully dynamic) ═══ */}
          {showCalcDetail && (() => {
            const actualDaily = r.actual > 0 ? Math.round(r.actual * r.opH) : 0
            const potentialDaily = r.cap > 0 ? Math.round(r.cap * 0.92 * r.opH) : 0
            const gapDaily = Math.max(0, potentialDaily - actualDaily)
            const gapMonthly = Math.round(gapDaily * (r.opD / 12))
            const lossFromGap = Math.round(gapMonthly * r.contribSafe)

            // Which metric deviates most
            const taGapPct = r.TARGET_TA > 0 ? Math.round(((r.ta - r.TARGET_TA) / r.TARGET_TA) * 100) : 0
            const utilGapPct = Math.round((0.85 - r.util) * 100)

            return (
              <div style={{
                background: 'var(--gray-50)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '18px 22px', marginBottom: '24px',
                fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.7,
              }}>
                <div style={{ fontWeight: 700, color: 'var(--gray-700)', marginBottom: '14px', fontSize: '14px' }}>How this estimate was calculated</div>

                {/* 1. Inputs */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: '6px' }}>Inputs from this plant</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
                    <span>Plant capacity: <strong style={{ color: 'var(--gray-700)', fontFamily: 'var(--mono)' }}>{r.cap} m³/hr</strong></span>
                    <span>Utilization: <strong style={{ color: 'var(--gray-700)', fontFamily: 'var(--mono)' }}>{Math.round(r.util * 100)}%</strong> (target 85%)</span>
                    <span>Turnaround: <strong style={{ color: 'var(--gray-700)', fontFamily: 'var(--mono)' }}>{r.ta} min</strong> (target {r.TARGET_TA} min)</span>
                    <span>Trucks: <strong style={{ color: 'var(--gray-700)', fontFamily: 'var(--mono)' }}>{r.trucks}</strong> ({r.effectiveUnits} effective)</span>
                    <span>Margin: <strong style={{ color: 'var(--gray-700)', fontFamily: 'var(--mono)' }}>${Math.round(r.contribSafe)}/m³</strong></span>
                    {r.dispatchMin ? <span>Dispatch: <strong style={{ color: 'var(--gray-700)', fontFamily: 'var(--mono)' }}>~{r.dispatchMin} min</strong> (target 15 min)</span> : null}
                  </div>
                </div>

                {/* 2. How loss is estimated */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: '6px' }}>How the loss is estimated</div>
                  <div>
                    {r.ta > r.TARGET_TA
                      ? `Because turnaround is ${r.ta} min vs the ${r.TARGET_TA}-min target, each of the ${r.effectiveUnits} trucks completes fewer cycles per day. At ${r.ta} min per cycle, a truck can do ${Math.floor((r.opH * 60) / r.ta)} trips/day instead of ${Math.floor((r.opH * 60) / r.TARGET_TA)} at target. `
                      : `Plant runs at ${Math.round(r.util * 100)}% of capacity. `
                    }
                    {actualDaily > 0 && potentialDaily > 0
                      ? `This plant produces ~${actualDaily} m³/day but could produce ~${potentialDaily} m³/day at practical capacity. That is a gap of ~${gapDaily} m³/day, or ~${gapMonthly.toLocaleString()} m³/month. `
                      : ''
                    }
                    {r.contribSafe > 0
                      ? `At $${Math.round(r.contribSafe)}/m³ contribution margin, the lost volume translates to ~${fmtFull(lossFromGap)}/month.`
                      : ''
                    }
                  </div>
                </div>

                {/* 3. Why this constraint */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: '6px' }}>Why {causeLabel.toLowerCase()} is the primary driver</div>
                  <div>
                    {causeLabel.toLowerCase().includes('dispatch')
                      ? `Turnaround exceeds target by ${taGapPct}% (${excessMin} min excess). ${r.dispatchMin ? `Order-to-truck time is ~${r.dispatchMin} min vs a 15-min target.` : ''} Without structured dispatch, trucks queue at the plant during peak periods and arrive at unprepared sites. Improving dispatch flow directly reduces queue time and site waiting, which are the two largest controllable components of turnaround.`
                      : causeLabel.toLowerCase().includes('fleet') || causeLabel.toLowerCase().includes('turnaround')
                      ? `Turnaround is ${taGapPct}% above target (${r.ta} min vs ${r.TARGET_TA} min). Each excess minute reduces the number of deliveries per truck per day. With ${r.effectiveUnits} trucks, the compounding effect is ${r.effectiveUnits} × ${excessMin} min = ${r.effectiveUnits * excessMin} truck-minutes lost per day.`
                      : causeLabel.toLowerCase().includes('site')
                      ? `Site waiting time of ${r.taSiteWaitMin} min (${r.siteWaitExcess} min above benchmark) is the largest single component of the turnaround gap. Each minute a truck waits at site with a loaded drum is a minute it cannot use for another delivery.`
                      : causeLabel.toLowerCase().includes('production')
                      ? `Plant utilization is ${Math.round(r.util * 100)}%, which is ${utilGapPct} points below the 85% operational target. The batching plant has capacity that is not being used during operating hours.`
                      : `The identified constraint accounts for the largest share of the financial gap between actual and achievable performance.`
                    }
                  </div>
                </div>

                {/* 4. Confidence */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: '6px' }}>Confidence and validation</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {observedLine && (
                      <div><span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', background: 'var(--green-light)', padding: '1px 6px', borderRadius: '3px', marginRight: '6px' }}>Observed</span>{observedLine}</div>
                    )}
                    {inferredLine && (
                      <div><span style={{ fontSize: '10px', fontWeight: 700, color: '#c96a00', background: '#FFF8ED', padding: '1px 6px', borderRadius: '3px', marginRight: '6px' }}>Inferred</span>{inferredLine}</div>
                    )}
                    <div style={{ marginTop: '4px', color: 'var(--gray-400)' }}>
                      {confidence === 'High' ? 'All key inputs validated during on-site plant visit.' : isPre ? 'Based on self-reported data (14 assessment questions). On-site validation will confirm.' : 'Based on reported operational data. Key metrics should be verified with plant records.'}
                    </div>
                  </div>
                </div>

                {/* 5. What improves accuracy */}
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--gray-600)', marginBottom: '6px' }}>What would improve this estimate</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      r.ta > r.TARGET_TA ? '3 days of truck departure timestamps' : null,
                      r.taSiteWaitMin == null ? 'Site wait timing per delivery' : null,
                      'GPS trip data (transit vs. idle split)',
                      r.dispatchMin ? 'Dispatch sequence log for peak periods' : null,
                      r.rejectPct > 1.5 ? 'Rejection tickets with cause classification' : null,
                    ].filter(Boolean).map((item, i) => (
                      <span key={i} style={{
                        fontSize: '12px', padding: '3px 10px', borderRadius: '5px',
                        background: 'var(--white)', border: '1px solid var(--border)',
                        color: 'var(--gray-500)',
                      }}>{item}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ═══ (4) LOSS BREAKDOWN (simplified) ═══ */}
          <div style={{
            marginBottom: '28px', paddingBottom: '20px',
            borderBottom: '1px solid var(--border)',
          }}>
            {mainDriverDim && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px', color: 'var(--gray-500)' }}>Main driver:</span>
                <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--mono)', color: '#C0392B' }}>
                  {mainDriverDim[0] === 'Fleet' ? 'Logistics' : mainDriverDim[0]} — {fmt(mainDriverDim[1])}/mo
                </span>
              </div>
            )}
            {otherLoss > 0 && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: 'var(--gray-500)' }}>Other losses:</span>
                <span style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
                  {fmt(otherLoss)}/mo
                </span>
              </div>
            )}
          </div>

          {/* ═══ (5) IDENTIFIED CAUSE ═══ */}
          {primary?.diagnosis && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '10px' }}>
                Identified cause: <span style={{ color: '#C0392B' }}>{causeLabel}</span>
              </div>

              <div style={{ fontSize: '14px', color: 'var(--gray-700)', lineHeight: 1.6, marginBottom: '14px' }}>
                {diagnosisMechanism()}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                {observedLine && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'var(--green-light)', color: 'var(--green)', flexShrink: 0, marginTop: '2px' }}>Observed</span>
                    <span style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.5 }}>{observedLine}</span>
                  </div>
                )}
                {inferredLine && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: '#FFF8ED', color: '#c96a00', flexShrink: 0, marginTop: '2px' }}>Inferred</span>
                    <span style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.5 }}>{inferredLine}</span>
                  </div>
                )}
              </div>

              {/* (6) Supporting evidence: TAT */}
              {r.ta > r.TARGET_TA && (
                <div style={{ fontSize: '13px', color: 'var(--gray-400)', fontStyle: 'italic' }}>
                  Supporting evidence: Turnaround is {r.ta} min vs {r.TARGET_TA} min target ({excessMin} min excess)
                </div>
              )}
            </div>
          )}

          {/* ═══ TAT Breakdown (validated + data only) ═══ */}
          {tatComponents && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px' }}>
                {tatComponents.map(c => {
                  const excess = Math.max(0, c.actual - c.benchmark)
                  const isPrim = c === primaryComponent && excess > 0
                  const pct = r.ta > 0 ? (c.actual / r.ta) * 100 : 0
                  return (
                    <div key={c.label} style={{
                      border: `1.5px solid ${isPrim ? 'var(--red)' : excess > 0 ? '#f5cba0' : 'var(--border)'}`,
                      borderRadius: '8px', padding: '12px',
                      background: isPrim ? '#fff3f3' : excess > 0 ? '#fffaf5' : 'var(--gray-50)',
                    }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', marginBottom: '6px' }}>{c.label}</div>
                      <div style={{ height: '5px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: excess > 0 ? (isPrim ? 'var(--red)' : '#d97706') : 'var(--green)' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--mono)', color: excess > 0 ? (isPrim ? 'var(--red)' : '#c96a00') : 'var(--gray-600)' }}>{c.actual}m</span>
                        {excess > 0
                          ? <span style={{ fontSize: '10px', fontWeight: 600, color: isPrim ? 'var(--red)' : '#c96a00' }}>+{excess}</span>
                          : <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 600 }}>ok</span>}
                      </div>
                      {isPrim && <div style={{ marginTop: '4px', fontSize: '9px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase' }}>▲ Primary</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══ (7+8) ACTIONS WITH RECOVERY ═══ */}
          {primaryActions.length > 0 && (
            <div style={{
              marginBottom: '24px', paddingTop: '20px',
              borderTop: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '14px' }}>
                Actions to take:
              </div>

              {primaryActions.slice(0, showMoreActions ? undefined : 2).map((a, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  gap: '16px', padding: '14px 18px', marginBottom: '8px',
                  background: i === 0 ? 'var(--green-pale)' : 'var(--gray-50)',
                  border: `1px solid ${i === 0 ? 'var(--green-light)' : 'var(--border)'}`,
                  borderRadius: '10px',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', color: 'var(--gray-900)' }}>
                      <strong>{i + 1}.</strong> <span style={{ fontWeight: i === 0 ? 600 : 400 }}>{a.text}</span>
                    </div>
                    {a.detail && <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>{a.detail}</div>}
                  </div>
                  {recoveryEstimates[i] > 0 && (
                    <div style={{
                      fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)',
                      color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      +~{fmt(recoveryEstimates[i])}/mo
                    </div>
                  )}
                </div>
              ))}

              {primaryActions.length > 2 && !showMoreActions && (
                <button
                  onClick={() => setShowMoreActions(true)}
                  style={{
                    fontSize: '12px', color: 'var(--gray-400)', background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'var(--font)', padding: '4px 0', marginTop: '4px',
                  }}
                >
                  + {primaryActions.length - 2} more actions
                </button>
              )}
            </div>
          )}

          {/* ═══ FOOTER ═══ */}
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', lineHeight: 1.5 }}>
            {isPre ? 'Based on reported data. On-site validation will confirm exact impact.' : 'Validated on-site.'}
            <br /><span style={{ color: 'var(--gray-300)' }}>Visible to owner + manager only</span>
          </div>
        </>
      )}
    </div>
  )
}
