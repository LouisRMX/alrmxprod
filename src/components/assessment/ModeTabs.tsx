'use client'

import { useIsMobile } from '@/hooks/useIsMobile'

export type AssessmentMode = 'questions' | 'results' | 'tracking' | 'gps' | 'fieldlog' | 'fieldguide' | 'submit'

interface ExtraTab { label: string; shortLabel: string; onClick: () => void; active?: boolean }

interface ModeTabsProps {
  activeMode: AssessmentMode
  onSwitch: (mode: AssessmentMode) => void
  allowedModes?: AssessmentMode[]
  extraTab?: ExtraTab
  extraTabs?: ExtraTab[]
}

const TABS: { mode: AssessmentMode; label: string; shortLabel: string }[] = [
  { mode: 'questions', label: 'Assessment',   shortLabel: 'Questions' },
  { mode: 'results',   label: 'Results',      shortLabel: 'Results' },
  { mode: 'tracking',  label: 'Tracking',     shortLabel: 'Tracking' },
  { mode: 'fieldlog',  label: 'Field Log',    shortLabel: 'Log' },
  { mode: 'fieldguide',label: 'Field Guide',  shortLabel: 'Guide' },
]

export default function ModeTabs({ activeMode, onSwitch, allowedModes, extraTab, extraTabs }: ModeTabsProps) {
  const isMobile = useIsMobile()

  const visibleTabs = allowedModes
    ? TABS.filter(t => allowedModes.includes(t.mode))
    : TABS

  // Normalise: extraTabs takes priority; fall back to single extraTab
  const leadingTabs: ExtraTab[] = extraTabs ?? (extraTab ? [extraTab] : [])

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

  // If only one standard tab and no extra tabs, don't render tab bar at all
  if (visibleTabs.length <= 1 && leadingTabs.length === 0) return null

  return (
    <div style={{
      display: 'flex', gap: '0', borderBottom: '1px solid var(--border)',
      background: 'var(--white)', padding: isMobile ? '0 4px' : '0 16px',
      overflowX: 'auto', WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
      flexShrink: 0,
    }}>
      {leadingTabs.map(tab => (
        <button
          key={tab.label}
          type="button"
          onClick={tab.onClick}
          style={tabStyle(tab.active ?? false)}
        >
          {isMobile ? tab.shortLabel : tab.label}
        </button>
      ))}
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
