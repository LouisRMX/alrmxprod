'use client'

import type { CalcScores } from '@/lib/calculations'

interface ScoreLivePanelProps {
  scores: CalcScores
  overall: number | null
  bottleneck: string | null
}

function scoreColor(v: number | null): string {
  if (v === null) return 'var(--gray-300)'
  if (v >= 80) return 'var(--green-mid)'
  if (v >= 60) return '#D68910'
  return 'var(--red)'
}

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
      <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '80px', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '8px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
        {value !== null && (
          <div style={{
            width: `${value}%`, height: '8px', borderRadius: '4px',
            background: scoreColor(value), transition: 'width .5s, background .4s',
          }} />
        )}
      </div>
      <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'var(--mono)', width: '38px', textAlign: 'right', color: scoreColor(value) }}>
        {value !== null ? value : '—'}
      </span>
    </div>
  )
}

export default function ScoreLivePanel({ scores, overall, bottleneck }: ScoreLivePanelProps) {
  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      marginBottom: '16px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--gray-300)', marginBottom: '10px' }}>
        Live scores
      </div>
      <ScoreRow label="Production" value={scores.prod} />
      <ScoreRow label="Dispatch" value={scores.dispatch} />
      <ScoreRow label="Fleet" value={scores.logistics} />
      <ScoreRow label="Quality" value={scores.quality} />
      <div style={{ borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '8px' }}>
        <ScoreRow label="Overall" value={overall} />
      </div>
      {bottleneck && (
        <div style={{
          display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
          fontSize: '11px', fontWeight: 500,
          background: '#FDE8E6', color: 'var(--red)', marginTop: '4px',
        }}>
          Bottleneck: {bottleneck}
        </div>
      )}
    </div>
  )
}
