'use client'

import { SECTIONS, getVisibleQs, type Phase, type Section } from '@/lib/questions'
import type { CalcResult, Answers } from '@/lib/calculations'
import { getLiveImpact } from '@/lib/live-impact'
import QuestionCard from './QuestionCard'
import ProgressBar from './ProgressBar'

interface SectionViewProps {
  sectionIndex: number
  answers: Answers
  phase: Phase
  onAnswer: (id: string, value: string) => void
  onNext: () => void
  onBack: () => void
  onViewResults: () => void
  calcResult: CalcResult
  baseline?: Answers
  sections?: Section[]
}

export default function SectionView({ sectionIndex, answers, phase, onAnswer, onNext, onBack, onViewResults, calcResult, baseline, sections }: SectionViewProps) {
  const activeSections = sections ?? SECTIONS
  const section = activeSections[sectionIndex]
  if (!section) return null

  const visibleQs = getVisibleQs(section, phase)
  const answeredCount = visibleQs.filter(q => answers[q.id] !== undefined && answers[q.id] !== '').length
  const totalSections = activeSections.length
  const isFirst = sectionIndex === 0
  const isLast = sectionIndex === totalSections - 1

  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '16px 20px',
      paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* Section header */}
      <div style={{ marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '6px' }}>{section.label}</h2>
        <ProgressBar answered={answeredCount} total={visibleQs.length} />
      </div>

      {/* Questions */}
      {visibleQs.map((q, i) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={i}
          value={answers[q.id]}
          baselineValue={baseline?.[q.id]}
          onAnswer={onAnswer}
          liveImpact={getLiveImpact(q.id, calcResult, answers)}
        />
      ))}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '6px', paddingBottom: '40px' }}>
        {!isFirst && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '10px 18px', border: '1px solid var(--gray-300)', borderRadius: '8px',
              fontSize: '13px', cursor: 'pointer', background: 'var(--white)',
              color: 'var(--gray-500)', fontFamily: 'var(--font)',
            }}
          >
            ← Back
          </button>
        )}
        <button
          type="button"
          onClick={isLast ? onViewResults : onNext}
          style={{
            flex: 1, padding: '11px', background: 'var(--green)', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          {isLast ? 'View results' : 'Next section'}
        </button>
      </div>
    </div>
  )
}
