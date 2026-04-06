'use client'

import { useState, useMemo } from 'react'
import { calcLossRange, type CalcResult, type Answers } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import { useIsMobile } from '@/hooks/useIsMobile'
import { SummaryPDFButton } from './ExportPDF'
import ComparisonBanner from './ComparisonBanner'
import type { Phase } from '@/lib/questions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OwnerReportViewProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  reportReleased?: boolean
  isAdmin?: boolean
  phase?: Phase
  focusActions?: string[] | null
  baselineData?: { answers: Answers; calcResult: CalcResult; date: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtK = (n: number) => '$' + Math.round(n / 1000) + 'k'

function rootCauseLine(calcResult: CalcResult, bottleneck: string | null): string {
  switch (bottleneck) {
    case 'dispatch':
      return `Order-to-dispatch ${calcResult.dispatchMin ?? '?'} min vs 15 min target`
    case 'fleet':
      return `Turnaround ${Math.round(calcResult.ta)} min vs ${calcResult.TARGET_TA} min target`
    case 'quality':
      return `Rejection rate ${calcResult.rejectPct}%`
    case 'prod':
      return `Utilisation ${Math.round((calcResult.util ?? 0) * 100)}% vs ${Math.round((calcResult.utilisationTarget ?? 0.85) * 100)}% target`
    default:
      return ''
  }
}

const DIMENSION_LABELS: Record<string, string> = {
  dispatch: 'Dispatch',
  fleet:    'Fleet',
  quality:  'Quality',
  prod:     'Production',
}

const PHASE_LABELS: Record<string, string> = {
  workshop: 'Pre-assessment',
  onsite:   'On-site',
  complete: 'Complete',
}

// ── Read-only report text panel ───────────────────────────────────────────────

function ReportTextPanel({
  report,
  onClose,
}: {
  report: { executive?: string; diagnosis?: string; actions?: string }
  onClose: () => void
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 499,
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(600px, 100vw)',
        background: 'var(--white)', borderLeft: '1px solid var(--border)',
        zIndex: 500, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-900)' }}>
            Full Report
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--gray-400)', padding: '4px', borderRadius: '6px',
              fontSize: '18px', lineHeight: 1, display: 'flex', alignItems: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {report.executive && (
            <section>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '10px' }}>
                Executive Summary
              </div>
              <div style={{ fontSize: '14px', color: 'var(--gray-700)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {report.executive}
              </div>
            </section>
          )}
          {report.diagnosis && (
            <section>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '10px' }}>
                Root Cause Diagnosis
              </div>
              <div style={{ fontSize: '14px', color: 'var(--gray-700)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {report.diagnosis}
              </div>
            </section>
          )}
          {report.actions && (
            <section>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '10px' }}>
                Action Plan
              </div>
              <div style={{ fontSize: '14px', color: 'var(--gray-700)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {report.actions}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OwnerReportView({
  calcResult,
  answers,
  meta,
  report,
  reportReleased,
  isAdmin,
  phase,
  focusActions,
  baselineData,
}: OwnerReportViewProps) {
  const [reportOpen, setReportOpen] = useState(false)
  const isMobile = useIsMobile()

  // Issues + derived values
  const issues = useMemo(
    () => buildIssues(calcResult, answers, { country: meta?.country || '' }),
    [calcResult, answers, meta?.country]
  )

  const { bnLoss, totalLoss } = useMemo(() => {
    const bn  = Math.max(0, ...issues.filter(i => i.category === 'bottleneck' && i.loss > 0).map(i => i.loss))
    const ind = issues.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
    return { bnLoss: bn, totalLoss: bn + ind }
  }, [issues])

  // Top 3 priority actions (carry dimension for label)
  const boardItems = useMemo(() => {
    if (focusActions?.filter(Boolean).length) {
      return focusActions.filter(Boolean).map(text => ({ text, lossMonthly: 0, dimension: null as string | null }))
    }
    const withAction = issues.filter(i => i.action && i.loss > 0)
    return [
      ...withAction.filter(i => i.category === 'bottleneck').sort((a, b) => b.loss - a.loss),
      ...withAction.filter(i => i.category !== 'bottleneck').sort((a, b) => b.loss - a.loss),
    ].slice(0, 3).map(i => ({
      text: i.goal ?? i.action!,
      lossMonthly: i.loss,
      dimension: i.dimension ?? null,
    }))
  }, [issues, focusActions])

  // Trend line: compare current total loss against baseline
  const baselineTotalLoss = useMemo(() => {
    if (!baselineData) return null
    const bIssues = buildIssues(baselineData.calcResult, baselineData.answers, { country: meta?.country || '' })
    const bBn  = Math.max(0, ...bIssues.filter(i => i.category === 'bottleneck' && i.loss > 0).map(i => i.loss))
    const bInd = bIssues.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
    return bBn + bInd
  }, [baselineData, meta?.country])

  const { low, mid, high } = calcLossRange(totalLoss)
  const dailyMid = Math.round(mid / 30)

  const bottleneck  = calcResult.bottleneck ?? null
  const bnLabel     = bottleneck ? (DIMENSION_LABELS[bottleneck] ?? bottleneck) : null
  const bnScore     = bottleneck ? (calcResult.scores?.[bottleneck as keyof typeof calcResult.scores] ?? null) : null
  const rootCause   = rootCauseLine(calcResult, bottleneck)

  const hasReportText = reportReleased && (report?.executive || report?.diagnosis || report?.actions)
  const hasPendingReport = !reportReleased && !(report?.executive || report?.diagnosis || report?.actions)

  const phaseLabel = phase ? (PHASE_LABELS[phase] ?? phase) : null
  const phaseColor = phase ? `var(--phase-${phase}, var(--green))` : 'var(--green)'

  // Trend vs baseline
  const trendDelta = baselineTotalLoss != null ? totalLoss - baselineTotalLoss : null
  const trendDate  = baselineData?.date ?? null

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {meta?.plant && (
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--gray-900)' }}>
              {meta.plant}
            </span>
          )}
          {meta?.country && (
            <span style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
              {meta.country}
            </span>
          )}
          {phaseLabel && (
            <span style={{
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em',
              padding: '2px 8px', borderRadius: '4px',
              background: phaseColor + '1a',
              color: phaseColor,
              border: `1px solid ${phaseColor}40`,
              textTransform: 'uppercase',
            }}>
              {phaseLabel}
            </span>
          )}
          {meta?.date && (
            <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>
              {meta.date}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <SummaryPDFButton
            calcResult={calcResult}
            answers={answers}
            meta={meta}
            focusActions={boardItems.map(i => i.text)}
          />
          {hasReportText && (
            <button
              onClick={() => setReportOpen(true)}
              style={{
                padding: '7px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                background: 'var(--white)', border: '1px solid var(--border)',
                color: 'var(--gray-700)', cursor: 'pointer', fontFamily: 'var(--font)',
                whiteSpace: 'nowrap',
              }}
            >
              View Report →
            </button>
          )}
        </div>
      </div>

      {/* Main grid: gap card + actions card */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr',
        gap: '16px',
        alignItems: 'start',
      }}>

        {/* Left: Performance gap card */}
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '24px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '12px' }}>
            Performance gap
          </div>

          {totalLoss > 0 ? (
            <>
              {/* Big number */}
              <div style={{ fontSize: '2.6rem', fontWeight: 700, color: '#1a6644', lineHeight: 1.1 }}>
                {fmtK(low)}&ndash;{fmtK(high)}
                <span style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--gray-500)', marginLeft: '6px' }}>/ month</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gray-400)', marginTop: '4px', marginBottom: '8px' }}>
                midpoint {fmtK(mid)} &nbsp;·&nbsp; {fmtK(dailyMid) + ' / day'}
              </div>

              {/* Trend line */}
              {trendDelta !== null && (
                <div style={{
                  fontSize: '12px', fontWeight: 500, marginBottom: '20px',
                  color: trendDelta < -5000 ? '#1a6644' : 'var(--gray-400)',
                }}>
                  {trendDelta < -5000
                    ? `Down ${fmtK(Math.abs(trendDelta))} / month since ${trendDate}`
                    : `No significant change since ${trendDate}`}
                </div>
              )}

              {/* Primary bottleneck */}
              {bnLabel && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Primary bottleneck
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gray-900)' }}>{bnLabel}</span>
                    {bnScore != null && (
                      <span style={{
                        fontSize: '12px', fontWeight: 600, padding: '2px 8px',
                        borderRadius: '5px', background: 'var(--gray-100)', color: 'var(--gray-700)',
                      }}>
                        {bnScore}
                      </span>
                    )}
                  </div>
                  {rootCause && (
                    <div style={{ fontSize: '13px', color: 'var(--gray-500)' }}>{rootCause}</div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: '14px', color: 'var(--gray-500)', padding: '12px 0' }}>
              No significant performance gap identified.
            </div>
          )}

        </div>

        {/* Right: Priority actions card */}
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '24px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em', color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '16px' }}>
            Priority actions
          </div>

          {boardItems.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--gray-400)' }}>
              Complete the assessment to see priority actions.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {boardItems.map((item, idx) => {
                const { low: aLow, high: aHigh } = item.lossMonthly > 0 ? calcLossRange(item.lossMonthly) : { low: 0, high: 0 }
                const dimLabel = item.dimension && item.dimension !== 'Other'
                  ? item.dimension + ' improvement'
                  : null
                return (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    {/* Number circle */}
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                      background: idx === 0 ? 'var(--green)' : 'var(--gray-100)',
                      color: idx === 0 ? '#fff' : 'var(--gray-500)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 700, marginTop: '1px',
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: 'var(--gray-800)', lineHeight: 1.4, fontWeight: 500 }}>
                        {item.text}
                      </div>
                      {dimLabel && (
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '2px' }}>
                          {dimLabel}
                        </div>
                      )}
                      {item.lossMonthly > 0 && (
                        <div style={{
                          display: 'inline-block', marginTop: '5px',
                          fontSize: '11px', fontWeight: 600,
                          padding: '2px 7px', borderRadius: '4px',
                          background: '#f0faf5', color: '#1a6644',
                          border: '1px solid #b6e2ce',
                        }}>
                          {fmtK(aLow)}&ndash;{fmtK(aHigh)}/mo
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pre-release note */}
          {hasPendingReport && (
            <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--gray-400)', fontStyle: 'italic' }}>
              Full report pending consultant review.
            </div>
          )}
        </div>
      </div>

      {/* Comparison banner (follow-up assessments) */}
      {baselineData && (
        <ComparisonBanner
          baselineCalcResult={baselineData.calcResult}
          baselineAnswers={baselineData.answers}
          followupCalcResult={calcResult}
          followupAnswers={answers}
          baselineDate={baselineData.date}
          followupDate={meta?.date || new Date().toISOString().split('T')[0]}
        />
      )}

      {/* Read-only report text panel */}
      {reportOpen && report && (
        <ReportTextPanel
          report={report}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  )
}
