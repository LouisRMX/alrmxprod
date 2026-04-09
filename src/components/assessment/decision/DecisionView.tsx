'use client'

import type { CalcResult, Answers } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import { useIsMobile } from '@/hooks/useIsMobile'

function fmt(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k'
  return '$' + Math.round(n)
}

function fmtRange(n: number): string {
  return `${fmt(Math.round(n * 0.82))}–${fmt(Math.round(n * 1.18))}`
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

  // Primary: highest-loss issue with diagnosis. Secondary: compressed signal only.
  const withDiagnosis = issues.filter(i => i.diagnosis && i.loss > 0)
  const primary = withDiagnosis[0] ?? null
  const secondaries = withDiagnosis.slice(1).filter(i => i.dimension !== primary?.dimension)

  const totalLoss = r.turnaroundLeakMonthly + r.capLeakMonthly + r.rejectLeakMonthly +
    (r.partialLeakMonthly || 0) + (r.surplusLeakMonthly || 0)
  const excessMin = r.excessMin || 0

  // TAT breakdown: only when we have real component data AND on-site
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

  // Verdict: concrete, observable cause from first sentence of mechanism
  function buildVerdictCause(): string {
    if (!primary?.diagnosis) return `turnaround is ${excessMin} min above target`
    const mech = primary.diagnosis.mechanism
      .replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
    const firstSentence = mech.split('.')[0].toLowerCase()
    return firstSentence
  }

  // Actions: only from primary issue to keep single-threaded
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
  const actions = primaryActions.slice(0, 5)

  const demandConstrained = r.demandSufficient === false

  return (
    <div style={{
      flex: 1, overflow: 'auto',
      padding: isMobile ? '16px' : '28px 32px',
      maxWidth: '900px',
    }}>

      {/* Phase label */}
      <div style={{
        fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        color: isValidated ? 'var(--green)' : '#c96a00',
        marginBottom: '20px',
      }}>
        {isValidated ? 'Validated diagnosis' : 'Preliminary diagnosis'}
      </div>

      {/* ── Verdict ── */}
      <div style={{ marginBottom: '32px' }}>
        {demandConstrained ? (
          <>
            <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: 600, color: '#c96a00', lineHeight: 1.4, marginBottom: '10px' }}>
              Your plant has capacity, but the order book does not fill it.
              Growing demand is the priority before optimizing operations.
            </div>
            {r.ta > r.TARGET_TA && (
              <div style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
                Turnaround: {r.ta} min → {r.TARGET_TA} min target ({excessMin} min excess)
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{
              fontSize: isMobile ? '22px' : '28px', fontWeight: 700, color: 'var(--gray-900)',
              lineHeight: 1.3, marginBottom: '10px',
            }}>
              <span style={{ color: 'var(--red)' }}>
                {isPre ? fmtRange(totalLoss) : fmt(totalLoss)}/month
              </span>{' '}
              {isPre ? 'is likely being lost because ' : 'is lost because '}
              {buildVerdictCause()}.
            </div>
            <div style={{ fontSize: '14px', fontFamily: 'var(--mono)', color: 'var(--gray-500)' }}>
              Turnaround: {r.ta} min → {r.TARGET_TA} min target ({excessMin} min excess)
            </div>
          </>
        )}
      </div>

      {/* ── TAT Breakdown (on-site with data only) ── */}
      {tatComponents && (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: isMobile ? '16px' : '20px 24px',
          marginBottom: '24px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
            Truck cycle: {r.ta} min
          </div>
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
                  <div style={{ height: '8px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', background: excess > 0 ? (isPrim ? 'var(--red)' : '#d97706') : 'var(--green)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--mono)', color: excess > 0 ? (isPrim ? 'var(--red)' : '#c96a00') : 'var(--gray-700)' }}>{c.actual} min</span>
                    {excess > 0 ? <span style={{ fontSize: '11px', fontWeight: 600, color: isPrim ? 'var(--red)' : '#c96a00' }}>+{excess}</span>
                    : <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>on target</span>}
                  </div>
                  {isPrim && (
                    <div style={{ marginTop: '8px', fontSize: '10px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      ▲ Primary loss driver
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Pre-assessment TAT direction (no breakdown) ── */}
      {isPre && r.ta > r.TARGET_TA && !tatComponents && primary?.diagnosis?.tatImpactEstimate && (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: isMobile ? '16px' : '18px 24px',
          marginBottom: '24px', fontSize: '14px', color: 'var(--gray-500)', lineHeight: 1.6,
        }}>
          {primary.diagnosis.tatImpactEstimate}
        </div>
      )}

      {/* ── Diagnosis ── */}
      {primary?.diagnosis && !demandConstrained && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: isMobile ? '16px' : '20px 24px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>⚡</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gray-900)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  {primary.dimension === 'Fleet' && primary.diagnosis.tatComponent === 'site' ? 'Site waiting' :
                   primary.dimension === 'Fleet' ? 'Fleet turnaround' :
                   primary.dimension || 'Primary issue'}
                </span>
              </div>
              {isValidated && primary.diagnosis.strength === 'observed' && (
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: 'var(--green-light)', color: 'var(--green)' }}>
                  confirmed
                </span>
              )}
            </div>

            {/* Mechanism: 3 lines max, no filler */}
            <div style={{ fontSize: '14px', color: 'var(--gray-700)', lineHeight: 1.6, marginBottom: '12px' }}>
              {primary.diagnosis.mechanism
                .replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
                .split('.').filter(s => s.trim()).slice(0, 3).map(s => s.trim()).join('. ')
              }.
            </div>

            {/* Validation / Confirmation */}
            <div style={{
              fontSize: '12px', color: 'var(--gray-400)', lineHeight: 1.5,
              borderTop: '1px solid var(--border)', paddingTop: '10px',
            }}>
              {isValidated && primary.diagnosis.strength === 'observed' ? (
                <><strong style={{ color: 'var(--gray-500)' }}>Confirmed by:</strong> {primary.diagnosis.observed.split('.').slice(0, 2).join('.') + '.'}</>
              ) : (
                <><strong style={{ color: 'var(--gray-500)' }}>To validate:</strong> {primary.diagnosis.validation.split('.').slice(0, 2).join('.') + '.'}</>
              )}
            </div>
          </div>

          {/* Secondary issues: one line each, no explanation, no actions */}
          {secondaries.length > 0 && (
            <div style={{ marginTop: '10px', paddingLeft: '14px', borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {secondaries.slice(0, 2).map((s, i) => (
                <div key={i} style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
                  <strong style={{ color: 'var(--gray-500)' }}>Also contributing:</strong>{' '}
                  {s.dimension} — {fmt(s.loss)}/mo
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Actions (primary problem only) ── */}
      {actions.length > 0 && !demandConstrained && (
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: '12px', overflow: 'hidden', marginBottom: '24px',
        }}>
          {actions.filter(a => a.priority === 'start').map((a, i) => (
            <div key={i} style={{
              padding: isMobile ? '16px' : '18px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--green-pale)',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                Start here · This week
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: a.detail ? '4px' : '0' }}>
                ① {a.text}
              </div>
              {a.detail && <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{a.detail}</div>}
            </div>
          ))}

          {actions.filter(a => a.priority === 'next').length > 0 && (
            <div style={{ padding: isMobile ? '16px' : '18px 24px', borderBottom: actions.some(a => a.priority === 'later') ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                Next · This month
              </div>
              {actions.filter(a => a.priority === 'next').map((a, i) => (
                <div key={i} style={{ marginBottom: i < actions.filter(x => x.priority === 'next').length - 1 ? '10px' : '0' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: a.detail ? '2px' : '0' }}>
                    {String.fromCharCode(9313 + i)} {a.text}
                  </div>
                  {a.detail && <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{a.detail}</div>}
                </div>
              ))}
            </div>
          )}

          {actions.filter(a => a.priority === 'later').length > 0 && (
            <div style={{ padding: isMobile ? '16px' : '18px 24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-300)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                Later · Next month
              </div>
              {actions.filter(a => a.priority === 'later').map((a, i) => (
                <div key={i} style={{ marginBottom: i < actions.filter(x => x.priority === 'later').length - 1 ? '8px' : '0' }}>
                  <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{String.fromCharCode(9315 + i)} {a.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
        {isValidated ? 'Validated on-site.' : 'Based on reported data. On-site validation will confirm drivers.'}
      </div>
    </div>
  )
}
