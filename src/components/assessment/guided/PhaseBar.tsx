'use client'

export type GuidedPhase = 'core' | 'depth' | 'preview'

interface PhaseBarProps {
  currentPhase: GuidedPhase
}

const PHASES: { id: GuidedPhase; label: string; step: number }[] = [
  { id: 'core', label: 'Core data', step: 1 },
  { id: 'depth', label: 'Deep-dive', step: 2 },
  { id: 'preview', label: 'Findings', step: 3 },
]

export default function PhaseBar({ currentPhase }: PhaseBarProps) {
  const currentIdx = PHASES.findIndex(p => p.id === currentPhase)

  return (
    <div style={{ display: 'flex', gap: '4px', padding: '12px 16px', background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
      {PHASES.map((p, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <div key={p.id} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10px', fontWeight: 600,
              background: done ? 'var(--green-mid)' : active ? 'var(--green)' : 'var(--gray-100)',
              color: done || active ? 'white' : 'var(--gray-500)',
            }}>
              {done ? '✓' : p.step}
            </div>
            <span style={{
              fontSize: '12px', fontWeight: active ? 500 : 400,
              color: active ? 'var(--green)' : done ? 'var(--gray-700)' : 'var(--gray-500)',
            }}>
              {p.label}
            </span>
            {i < PHASES.length - 1 && (
              <div style={{ flex: 1, height: '2px', background: done ? 'var(--green-mid)' : 'var(--gray-100)', marginLeft: '4px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
