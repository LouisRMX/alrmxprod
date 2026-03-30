'use client'

export type AssessmentMode = 'questions' | 'report' | 'simulator' | 'track'

interface ModeTabsProps {
  activeMode: AssessmentMode
  onSwitch: (mode: AssessmentMode) => void
}

const TABS: { mode: AssessmentMode; label: string }[] = [
  { mode: 'questions', label: 'Assessment' },
  { mode: 'report', label: 'Report' },
  { mode: 'simulator', label: 'Simulator' },
  { mode: 'track', label: '90-day Track' },
]

export default function ModeTabs({ activeMode, onSwitch }: ModeTabsProps) {
  return (
    <div style={{
      display: 'flex', gap: '0', borderBottom: '1px solid var(--border)',
      background: 'var(--white)', padding: '0 16px',
    }}>
      {TABS.map(tab => {
        const active = activeMode === tab.mode
        return (
          <button
            key={tab.mode}
            type="button"
            onClick={() => onSwitch(tab.mode)}
            style={{
              padding: '10px 16px',
              fontSize: '12px',
              fontWeight: active ? 500 : 400,
              fontFamily: 'var(--font)',
              color: active ? 'var(--green)' : 'var(--gray-500)',
              background: 'none',
              border: 'none',
              borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
