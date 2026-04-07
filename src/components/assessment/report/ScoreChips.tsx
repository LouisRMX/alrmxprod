'use client'

import type { CalcScores } from '@/lib/calculations'

interface ScoreChipsProps {
  scores: CalcScores
  overall: number | null
  bottleneck: string | null
}

function chipColor(v: number | null): { bg: string; fg: string; border: string } {
  if (v === null) return { bg: 'var(--gray-100)', fg: 'var(--gray-500)', border: 'var(--gray-300)' }
  if (v >= 80) return { bg: 'var(--green-light)', fg: 'var(--green)', border: 'var(--tooltip-border)' }
  if (v >= 60) return { bg: 'var(--warning-bg)', fg: 'var(--warning-dark)', border: 'var(--warning-border)' }
  return { bg: 'var(--error-bg)', fg: 'var(--red)', border: 'var(--error-border)' }
}

function Chip({ label, value, isBottleneck }: { label: string; value: number | null; isBottleneck: boolean }) {
  const c = chipColor(value)
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: '8px',
      padding: '10px 14px', textAlign: 'center', position: 'relative',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--gray-500)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.3px' }}>
        {label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--mono)', color: c.fg, marginTop: '2px' }}>
        {value !== null ? value : '-'}
      </div>
      {isBottleneck && (
        <div style={{
          position: 'absolute', top: '-6px', right: '-4px',
          padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 600,
          background: 'var(--red)', color: 'white',
        }}>
          Bottleneck
        </div>
      )}
    </div>
  )
}

export default function ScoreChips({ scores, overall, bottleneck }: ScoreChipsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '16px' }}>
      <Chip label="Production" value={scores.prod} isBottleneck={bottleneck === 'Production'} />
      <Chip label="Dispatch" value={scores.dispatch} isBottleneck={bottleneck === 'Dispatch'} />
      <Chip label="Fleet" value={scores.logistics} isBottleneck={bottleneck === 'Fleet'} />
      <Chip label="Quality" value={scores.quality} isBottleneck={bottleneck === 'Quality'} />
      <Chip label="Overall" value={overall} isBottleneck={false} />
    </div>
  )
}
