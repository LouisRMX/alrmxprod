'use client'

import type { CalcResult, Answers } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'

interface ComparisonBannerProps {
  baselineCalcResult: CalcResult
  baselineAnswers: Answers
  followupCalcResult: CalcResult
  followupAnswers: Answers
  baselineDate: string
  followupDate: string
}

function totalLossFrom(calcResult: CalcResult, answers: Answers): number {
  const issues = buildIssues(calcResult, answers)
  const bottleneckIssues = issues.filter(i => i.category === 'bottleneck' && i.loss > 0)
  const bottleneckLoss = bottleneckIssues.length > 0 ? Math.max(...bottleneckIssues.map(i => i.loss)) : 0
  const independentLoss = issues.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
  return bottleneckLoss + independentLoss
}

interface MetricRow {
  label: string
  before: number | null
  after: number | null
  unit: string
  lowerIsBetter: boolean
}

export default function ComparisonBanner({
  baselineCalcResult,
  baselineAnswers,
  followupCalcResult,
  followupAnswers,
  baselineDate,
  followupDate,
}: ComparisonBannerProps) {
  const lossAfter = totalLossFrom(followupCalcResult, followupAnswers)
  const lossBefore = totalLossFrom(baselineCalcResult, baselineAnswers)
  const recovered = Math.max(0, lossBefore - lossAfter)

  const metrics: MetricRow[] = [
    {
      label: 'Turnaround',
      before: baselineCalcResult.ta > 0 ? baselineCalcResult.ta : null,
      after: followupCalcResult.ta > 0 ? followupCalcResult.ta : null,
      unit: 'min',
      lowerIsBetter: true,
    },
    {
      label: 'Dispatch time',
      before: baselineCalcResult.dispatchMin ?? null,
      after: followupCalcResult.dispatchMin ?? null,
      unit: 'min',
      lowerIsBetter: true,
    },
    {
      label: 'Deliveries/day',
      before: baselineCalcResult.delDay > 0 ? Math.round(baselineCalcResult.delDay) : null,
      after: followupCalcResult.delDay > 0 ? Math.round(followupCalcResult.delDay) : null,
      unit: '',
      lowerIsBetter: false,
    },
    {
      label: 'Reject rate',
      before: baselineCalcResult.rejectPct > 0 ? baselineCalcResult.rejectPct : null,
      after: followupCalcResult.rejectPct > 0 ? followupCalcResult.rejectPct : null,
      unit: '%',
      lowerIsBetter: true,
    },
  ].filter(m => m.before !== null || m.after !== null)

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{
      background: '#f0fdf4',
      border: '1px solid #86efac',
      borderRadius: '10px',
      padding: '16px 20px',
      marginBottom: '20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#15803d' }}>
            60-Day Follow-up Results
          </div>
          <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '2px' }}>
            Baseline: {fmtDate(baselineDate)} · Follow-up: {fmtDate(followupDate)}
          </div>
        </div>
        {recovered > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>Revenue recovered</div>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: '#15803d' }}>
              ~${Math.round(recovered / 1000)}k/month
            </div>
          </div>
        )}
      </div>

      {/* Metric rows */}
      {metrics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {metrics.map((m, i) => {
            const delta = m.before !== null && m.after !== null ? m.after - m.before : null
            const improved = delta !== null && (m.lowerIsBetter ? delta < 0 : delta > 0)
            const worsened = delta !== null && (m.lowerIsBetter ? delta > 0 : delta < 0)
            const deltaColor = improved ? '#15803d' : worsened ? '#dc2626' : '#6b7280'

            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <span style={{ width: '110px', color: '#374151', fontWeight: 500, flexShrink: 0 }}>{m.label}</span>
                <span style={{ color: '#6b7280' }}>
                  {m.before !== null ? `${m.before}${m.unit}` : '-'}
                </span>
                <span style={{ color: '#9ca3af', fontSize: '11px' }}>→</span>
                <span style={{ color: '#374151', fontWeight: 600 }}>
                  {m.after !== null ? `${m.after}${m.unit}` : '—'}
                </span>
                {delta !== null && (
                  <span style={{ fontSize: '11px', color: deltaColor, fontWeight: 600 }}>
                    ({delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10}{m.unit})
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {recovered === 0 && lossBefore > 0 && lossAfter >= lossBefore && (
        <div style={{ fontSize: '11px', color: '#b45309', marginTop: '10px' }}>
          Loss figure has not decreased. Check if the key actions were implemented and verify input values.
        </div>
      )}
    </div>
  )
}
