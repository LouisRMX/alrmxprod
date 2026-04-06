'use client'

import { useIsMobile } from '@/hooks/useIsMobile'

export type AssessmentMode = 'questions' | 'report' | 'simulator' | 'track' | 'gps' | 'trips' | 'submit'

interface ModeTabsProps {
  activeMode: AssessmentMode
  onSwitch: (mode: AssessmentMode) => void
  allowedModes?: AssessmentMode[]
  extraTab?: { label: string; shortLabel: string; onClick: () => void; active?: boolean }
}

const TABS: { mode: AssessmentMode; label: string; shortLabel: string }[] = [
  { mode: 'questions', label: 'Assessment', shortLabel: 'Questions' },
  { mode: 'report',    label: 'Report',     shortLabel: 'Report' },
  { mode: 'simulator', label: 'Simulator',  shortLabel: 'Sim' },
  { mode: 'track',     label: '90-day Track', shortLabel: 'Track' },
  { mode: 'gps',       label: 'GPS Data',   shortLabel: 'GPS' },
  { mode: 'trips',     label: 'Trips',      shortLabel: 'Trips' },
]

export default function ModeTabs({ activeMode, onSwitch, allowedModes, extraTab }: ModeTabsProps) {
  const isMobile = useIsMobile()

  const visibleTabs = allowedModes
    ? TABS.filter(t => allowedModes.includes(t.mode))
    : TABS

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: isMobile ? '9px 10px' : '10px 16px',
    fontSize: isMobile ? '11px' : '12px',
    fontWeight: active ? 500 : 400,
    fontFamily: 'var(--font)',
    color: active ? 'var(--green)' : 'var(--gray-500)',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all .15s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  })

  // If only one standard tab and no extraTab, don't render tab bar at all
  if (visibleTabs.length <= 1 && !extraTab) return null

  return (
    <div style={{
      display: 'flex', gap: '0', borderBottom: '1px solid var(--border)',
      background: 'var(--white)', padding: isMobile ? '0 4px' : '0 16px',
      overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
      flexShrink: 0,
    }}>
      {extraTab && (
        <button
          type="button"
          onClick={extraTab.onClick}
          style={tabStyle(extraTab.active ?? false)}
        >
          {isMobile ? extraTab.shortLabel : extraTab.label}
        </button>
      )}
      {visibleTabs.map(tab => {
        const active = activeMode === tab.mode
        return (
          <button
            key={tab.mode}
            type="button"
            onClick={() => onSwitch(tab.mode)}
            style={tabStyle(active)}
          >
            {isMobile ? tab.shortLabel : tab.label}
          </button>
        )
      })}
    </div>
  )
}
