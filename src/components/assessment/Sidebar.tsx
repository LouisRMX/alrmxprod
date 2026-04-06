'use client'

import { SECTIONS, getVisibleQs, type Phase, type Section } from '@/lib/questions'
import type { Answers } from '@/lib/calculations'

interface SidebarProps {
  currentSection: number
  onSelect: (index: number) => void
  answers: Answers
  phase: Phase
  showGps?: boolean
  gpsActive?: boolean
  onSelectGps?: () => void
  sections?: Section[]
}

export default function Sidebar({ currentSection, onSelect, answers, phase, showGps, gpsActive, onSelectGps, sections }: SidebarProps) {
  const activeSections = sections ?? SECTIONS
  return (
    <div style={{
      width: '220px',
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--white)',
      padding: '12px 0',
      overflowY: 'auto',
    }}>
      {activeSections.map((sec, i) => {
          const visibleQs = getVisibleQs(sec, phase)
          if (visibleQs.length === 0) return null

          const answeredCount = visibleQs.filter(q => {
            const v = answers[q.id]
            return v !== undefined && v !== ''
          }).length
          const allAnswered = answeredCount === visibleQs.length && visibleQs.length > 0
          const active = i === currentSection && !gpsActive

          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => onSelect(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '8px 16px',
                background: active ? 'var(--green-pale)' : 'transparent',
                border: 'none',
                borderLeft: active ? '3px solid var(--green)' : '3px solid transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
                fontSize: '12px',
                color: active ? 'var(--green)' : 'var(--gray-700)',
                fontWeight: active ? 500 : 400,
                textAlign: 'left',
                transition: 'all .1s',
              }}
            >
              <span style={{
                width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', fontWeight: 600,
                background: allAnswered ? 'var(--green-mid)' : 'var(--gray-100)',
                color: allAnswered ? 'white' : 'var(--gray-500)',
              }}>
                {allAnswered ? '✓' : i + 1}
              </span>
              <span style={{ flex: 1, lineHeight: 1.3 }}>{sec.label}</span>
              <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--gray-300)' }}>
                {answeredCount}/{visibleQs.length}
              </span>
            </button>
          )
      })}

    </div>
  )
}
