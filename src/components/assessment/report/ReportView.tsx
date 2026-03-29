'use client'

import type { CalcResult, Answers } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import ScoreChips from './ScoreChips'
import FindingCard from './FindingCard'
import AICopilot from './AICopilot'

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

interface ReportViewProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string; plant?: string; date?: string }
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  assessmentId: string
}

export default function ReportView({ calcResult, answers, meta, report, assessmentId }: ReportViewProps) {
  const issues = buildIssues(calcResult, answers, meta)
  const totalLoss = issues.reduce((s, i) => s + i.loss, 0)

  // Build context for AI generation
  const aiContext = {
    plant: meta?.plant || '',
    country: meta?.country || '',
    date: meta?.date || '',
    scores: calcResult.scores,
    overall: calcResult.overall,
    bottleneck: calcResult.bottleneck,
    ebitdaMonthly: calcResult.capLeakMonthly + calcResult.turnaroundLeakMonthly + calcResult.rejectLeakMonthly,
    utilPct: Math.round(calcResult.util * 100),
    turnaround: calcResult.ta,
    issues: issues.slice(0, 8).map(i => ({ t: i.t, loss: i.loss, sev: i.sev })),
    answers,
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', paddingBottom: '60px' }}>
      {/* Score overview */}
      <ScoreChips
        scores={calcResult.scores}
        overall={calcResult.overall}
        bottleneck={calcResult.bottleneck}
      />

      {/* Headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        <div style={{
          background: totalLoss > 0 ? '#FDE8E6' : 'var(--gray-100)',
          border: `1px solid ${totalLoss > 0 ? '#F5B7B1' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', padding: '14px 16px',
        }}>
          <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px' }}>
            Cost of inaction
          </div>
          <div style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--mono)', color: totalLoss > 0 ? 'var(--red)' : 'var(--gray-500)', marginTop: '2px' }}>
            {totalLoss > 0 ? fmt(totalLoss) + '/mo' : '—'}
          </div>
        </div>
        <div style={{
          background: calcResult.hiddenRevMonthly > 0 ? 'var(--green-light)' : 'var(--gray-100)',
          border: `1px solid ${calcResult.hiddenRevMonthly > 0 ? '#9FE1CB' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', padding: '14px 16px',
        }}>
          <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px' }}>
            Hidden revenue
          </div>
          <div style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--mono)', color: calcResult.hiddenRevMonthly > 0 ? 'var(--green)' : 'var(--gray-500)', marginTop: '2px' }}>
            {calcResult.hiddenRevMonthly > 0 ? fmt(calcResult.hiddenRevMonthly) + '/mo' : '—'}
          </div>
        </div>
      </div>

      {/* AI Report sections */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px', color: 'var(--gray-900)' }}>
          AI Report
        </h3>
        <AICopilot
          report={report}
          assessmentId={assessmentId}
          context={aiContext}
        />
      </div>

      {/* Findings */}
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 500, marginBottom: '10px', color: 'var(--gray-900)' }}>
          Findings ({issues.length})
        </h3>
        {issues.length > 0 ? (
          issues.map((issue, i) => (
            <FindingCard key={i} issue={issue} index={i} />
          ))
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
            No findings yet — enter assessment data to see results.
          </div>
        )}
      </div>
    </div>
  )
}
