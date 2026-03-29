'use client'

import type { CalcResult, Answers } from '@/lib/calculations'
import { buildIssues, type Issue } from '@/lib/issues'
import ScoreLivePanel from '../ScoreLivePanel'

interface PreviewPhaseProps {
  calcResult: CalcResult
  answers: Answers
  meta?: { country?: string }
  onGenerateReport: () => void
  onBack: () => void
}

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

function IssueLine({ issue }: { issue: Issue }) {
  return (
    <div style={{
      display: 'flex', gap: '10px', padding: '10px 14px',
      background: issue.sev === 'red' ? '#FDE8E6' : '#FFF8E1',
      borderRadius: '8px', marginBottom: '8px',
      borderLeft: `3px solid ${issue.sev === 'red' ? 'var(--red)' : '#D68910'}`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--gray-900)', lineHeight: 1.4 }}>
          {issue.t}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '3px' }}>
          {issue.action}
        </div>
      </div>
      {issue.loss > 0 && (
        <div style={{ fontSize: '13px', fontWeight: 600, color: issue.sev === 'red' ? 'var(--red)' : '#B7950B', whiteSpace: 'nowrap' }}>
          {fmt(issue.loss)}/mo
        </div>
      )}
    </div>
  )
}

export default function PreviewPhase({ calcResult, answers, meta, onGenerateReport, onBack }: PreviewPhaseProps) {
  const issues = buildIssues(calcResult, answers, meta)
  const top5 = issues.slice(0, 5)
  const totalMonthly = issues.reduce((s, i) => s + i.loss, 0)

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>Live findings preview</h2>
        <p style={{ fontSize: '12px', color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Top issues identified from your data. Generate the full report for detailed recommendations.
        </p>
      </div>

      <ScoreLivePanel
        scores={calcResult.scores}
        overall={calcResult.overall}
        bottleneck={calcResult.bottleneck}
      />

      {/* Total monthly opportunity */}
      {totalMonthly > 0 && (
        <div style={{
          background: 'var(--green-light)', border: '1px solid #9FE1CB',
          borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: '16px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Total monthly opportunity
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--green)', fontFamily: 'var(--mono)', marginTop: '4px' }}>
            {fmt(totalMonthly)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '2px' }}>
            across {issues.length} finding{issues.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Top findings */}
      {top5.length > 0 ? (
        top5.map((issue, i) => <IssueLine key={i} issue={issue} />)
      ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
          No findings yet — enter more data to see results.
        </div>
      )}

      {issues.length > 5 && (
        <div style={{ fontSize: '11px', color: 'var(--gray-500)', textAlign: 'center', marginTop: '4px' }}>
          +{issues.length - 5} more finding{issues.length - 5 !== 1 ? 's' : ''} in the full report
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px', paddingBottom: '40px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '10px 18px', border: '1px solid var(--gray-300)', borderRadius: '8px',
            fontSize: '13px', cursor: 'pointer', background: 'var(--white)',
            color: 'var(--gray-500)', fontFamily: 'var(--font)',
          }}
        >
          Back to deep-dive
        </button>
        <button
          type="button"
          onClick={onGenerateReport}
          style={{
            flex: 1, padding: '11px', background: 'var(--green)', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          Generate full report
        </button>
      </div>
    </div>
  )
}
