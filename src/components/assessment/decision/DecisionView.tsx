'use client'

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

  const isValidated = phase === 'complete' || phase === 'onsite'
  const isPre = !isValidated

  const withDiagnosis = issues.filter(i => i.diagnosis && i.loss > 0)
  const primary = withDiagnosis[0] ?? null

  // Loss totals
  const totalLoss = r.turnaroundLeakMonthly + r.capLeakMonthly + r.rejectLeakMonthly +
    (r.partialLeakMonthly || 0) + (r.surplusLeakMonthly || 0)
  const excessMin = r.excessMin || 0

  // Loss breakdown by dimension
  const lossByDim: { label: string; loss: number; primary: boolean }[] = []
  const dimTotals: Record<string, number> = {}
  for (const issue of issues) {
    if (issue.loss > 0 && issue.dimension) {
      dimTotals[issue.dimension] = (dimTotals[issue.dimension] || 0) + issue.loss
    }
  }
  const primaryDim = primary?.dimension || null
  for (const [dim, loss] of Object.entries(dimTotals).sort((a, b) => b[1] - a[1])) {
    lossByDim.push({ label: dim === 'Fleet' ? 'Logistics' : dim, loss, primary: dim === primaryDim })
  }

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

  // Verdict cause: decisive, no hedging
  function verdictCause(): string {
    if (!primary?.diagnosis) return `turnaround is ${excessMin} min above target`
    const raw = primary.diagnosis.mechanism
      .replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
    return raw.split('.')[0].replace(/\blikely\b\s*/gi, '').replace(/\s+/g, ' ').trim().toLowerCase()
  }

  // Identified cause label
  const causeLabel = primary?.dimension === 'Fleet' && primary?.diagnosis?.tatComponent === 'site'
    ? 'SITE WAITING' : primary?.dimension === 'Fleet' ? 'FLEET TURNAROUND'
    : primary?.dimension?.toUpperCase() || 'TURNAROUND'

  // Mechanism: 3 sentences max
  function diagnosisMechanism(): string {
    if (!primary?.diagnosis) return ''
    const raw = primary.diagnosis.mechanism
      .replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
    const sentences = raw.split('.').map(s => s.trim()).filter(Boolean).slice(0, 3)
    if (primary.diagnosis.strength === 'observed') {
      return sentences.map(s => s.replace(/\blikely\b\s*/gi, '').replace(/\s+/g, ' ').trim()).join('. ') + '.'
    }
    return sentences.join('. ') + '.'
  }

  // Observed vs inferred evidence lines
  const observedLine = primary?.diagnosis?.observed
    ? primary.diagnosis.observed.split('.').filter(s => s.trim()).slice(0, 2).join('.') + '.'
    : null
  const inferredLine = primary?.diagnosis
    ? primary.diagnosis.mechanism.replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '').split('.').filter(s => s.trim())[1]
    : null

  // Actions from primary only
  const primaryActions: { text: string; detail: string; priority: 'start' | 'next' | 'later' }[] = []
  if (primary?.diagnosis) {
    const steps = primary.diagnosis.action.split(/Step \d+:\s*/).filter(Boolean)
    for (const step of steps) {
      const lines = step.split(/\.\s+/).filter(Boolean)
      const text = lines[0]?.trim() || step.trim()
      const detail = lines.slice(1).join('. ').trim()
      if (text && !primaryActions.some(a => a.text === text)) {
        const priority: 'start' | 'next' | 'later' =
          primaryActions.length === 0 ? 'start' :
          primaryActions.length < 3 ? 'next' : 'later'
        primaryActions.push({ text, detail, priority })
      }
    }
  }
  const actions = primaryActions.slice(0, 4)

  const demandConstrained = r.demandSufficient === false
  const confidence = primary?.diagnosis?.strength === 'observed' ? 'HIGH' : isPre ? 'PRELIMINARY' : 'MEDIUM'
  const confidenceColor = confidence === 'HIGH' ? 'var(--green)' : confidence === 'PRELIMINARY' ? '#c96a00' : '#c96a00'

  return (
    <div style={{
      flex: 1, overflow: 'auto',
      padding: isMobile ? '20px 16px' : '36px 40px',
      maxWidth: '800px',
    }}>

      {demandConstrained ? (
        /* Demand-constrained variant */
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 600, color: '#c96a00', lineHeight: 1.4, marginBottom: '12px' }}>
            Your plant has capacity, but the order book does not fill it.
            Growing demand is the priority before optimizing operations.
          </div>
          {r.ta > r.TARGET_TA && (
            <div style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
              Turnaround: {r.ta} min → {r.TARGET_TA} min target ({excessMin} min excess)
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── (A) PRIMARY MESSAGE ── */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{
              fontSize: isMobile ? '28px' : '38px', fontWeight: 800, lineHeight: 1.2,
              color: 'var(--gray-900)', marginBottom: '0',
            }}>
              <span style={{ color: '#C0392B' }}>
                {isPre ? fmtRange(totalLoss) : fmtFull(totalLoss)}/month
              </span>{' '}
              is lost because {verdictCause()}.
            </div>
          </div>

          {/* ── (B) BREAKDOWN + CONFIDENCE ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            flexWrap: 'wrap', gap: '12px',
            marginBottom: '32px', paddingBottom: '24px',
            borderBottom: '1px solid var(--border)',
          }}>
            {/* Loss breakdown */}
            <div>
              <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginBottom: '6px' }}>Total loss breakdown:</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                {lossByDim.map((d, i) => (
                  <span key={d.label} style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                    {i > 0 && <span style={{ color: 'var(--gray-300)', marginRight: '4px' }}>·</span>}
                    <span style={{
                      fontSize: d.primary ? '16px' : '14px',
                      fontWeight: d.primary ? 700 : 500,
                      fontFamily: 'var(--mono)',
                      color: d.primary ? '#C0392B' : 'var(--gray-500)',
                    }}>
                      {d.label} {fmt(d.loss)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            {/* Confidence */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', letterSpacing: '0.5px' }}>CONFIDENCE:</span>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                  background: confidence === 'HIGH' ? 'var(--green-light)' : '#FFF8ED',
                  color: confidenceColor,
                }}>{confidence}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '4px' }}>
                {isPre ? 'Based on reported data' : primary?.diagnosis?.strength === 'observed' ? 'Validated on-site' : 'Based on operational data'}
              </div>
            </div>
          </div>

          {/* ── (C) IDENTIFIED CAUSE ── */}
          {primary?.diagnosis && (
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '14px' }}>
                Identified cause: <span style={{ color: '#C0392B' }}>{causeLabel}</span>
              </div>

              {/* Mechanism */}
              <div style={{
                display: 'flex', gap: '10px', alignItems: 'flex-start',
                marginBottom: '16px',
              }}>
                <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '2px' }}>⚡</span>
                <div style={{ fontSize: '15px', color: 'var(--gray-700)', lineHeight: 1.6 }}>
                  {diagnosisMechanism()}
                </div>
              </div>

              {/* Evidence: observed + inferred */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', paddingLeft: '6px' }}>
                {observedLine && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                      background: 'var(--green-light)', color: 'var(--green)', flexShrink: 0, marginTop: '2px',
                    }}>Observed</span>
                    <span style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.5 }}>{observedLine}</span>
                  </div>
                )}
                {inferredLine && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                      background: '#FFF8ED', color: '#c96a00', flexShrink: 0, marginTop: '2px',
                    }}>Inferred</span>
                    <span style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.5 }}>{inferredLine.trim()}.</span>
                  </div>
                )}
              </div>

              {/* TAT context */}
              {r.ta > r.TARGET_TA && (
                <div style={{ fontSize: '14px', color: 'var(--gray-500)', paddingLeft: '6px' }}>
                  → Turnaround: {r.ta} min vs {r.TARGET_TA} min target ({excessMin} min excess)
                </div>
              )}
            </div>
          )}

          {/* ── TAT Breakdown (validated + data only) ── */}
          {tatComponents && (
            <div style={{ marginBottom: '28px', paddingBottom: '24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
                {tatComponents.map(c => {
                  const excess = Math.max(0, c.actual - c.benchmark)
                  const isPrim = c === primaryComponent && excess > 0
                  const pct = r.ta > 0 ? (c.actual / r.ta) * 100 : 0
                  return (
                    <div key={c.label} style={{
                      border: `1.5px solid ${isPrim ? 'var(--red)' : excess > 0 ? '#f5cba0' : 'var(--border)'}`,
                      borderRadius: '10px', padding: '14px',
                      background: isPrim ? '#fff3f3' : excess > 0 ? '#fffaf5' : 'var(--gray-50)',
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--gray-500)', marginBottom: '8px' }}>{c.label}</div>
                      <div style={{ height: '6px', background: 'var(--gray-100)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: excess > 0 ? (isPrim ? 'var(--red)' : '#d97706') : 'var(--green)' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--mono)', color: excess > 0 ? (isPrim ? 'var(--red)' : '#c96a00') : 'var(--gray-700)' }}>{c.actual} min</span>
                        {excess > 0
                          ? <span style={{ fontSize: '11px', fontWeight: 600, color: isPrim ? 'var(--red)' : '#c96a00' }}>+{excess}</span>
                          : <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>ok</span>
                        }
                      </div>
                      {isPrim && (
                        <div style={{ marginTop: '6px', fontSize: '10px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                          ▲ Primary driver
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── (E) ACTIONS ── */}
          {actions.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--gray-900)', marginBottom: '14px' }}>
                Actions to take:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {actions.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: '16px', padding: '14px 18px',
                    background: i === 0 ? 'var(--green-pale)' : 'var(--gray-50)',
                    border: `1px solid ${i === 0 ? 'var(--green-light)' : 'var(--border)'}`,
                    borderRadius: '10px',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', color: 'var(--gray-900)' }}>
                        <strong>{i + 1}.</strong>{' '}
                        <span style={{ fontWeight: i === 0 ? 600 : 400 }}>{a.text}</span>
                      </div>
                      {a.detail && <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '2px' }}>{a.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ fontSize: '12px', color: 'var(--gray-400)', lineHeight: 1.5 }}>
            {isPre ? 'Based on reported data. On-site validation will confirm exact impact.' : 'Validated on-site.'}
            <br />
            <span style={{ color: 'var(--gray-300)' }}>Visible to owner + manager only</span>
          </div>
        </>
      )}
    </div>
  )
}
