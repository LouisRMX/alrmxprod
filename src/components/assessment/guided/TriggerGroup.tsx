'use client'

import type { GuidedTrigger } from '@/lib/guided'
import type { Answers, CalcResult } from '@/lib/calculations'
import { getQuestionById } from '@/lib/questions'
import { getLiveImpact } from '@/lib/live-impact'
import QuestionCard from '../QuestionCard'

interface TriggerGroupProps {
  trigger: GuidedTrigger
  answers: Answers
  onAnswer: (id: string, value: string) => void
  calcResult: CalcResult
  isOpen: boolean
  onToggle: () => void
  onSkip: () => void
}

export default function TriggerGroup({ trigger, answers, onAnswer, calcResult, isOpen, onToggle, onSkip }: TriggerGroupProps) {
  const answeredCount = trigger.ids.filter(id => answers[id] !== undefined && answers[id] !== '').length

  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', marginBottom: '10px', overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font)', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '16px' }}>{trigger.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--gray-900)' }}>
            {trigger.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '2px', lineHeight: 1.4 }}>
            {trigger.why}
          </div>
        </div>
        <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--gray-300)' }}>
          {answeredCount}/{trigger.ids.length}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--gray-500)', transition: 'transform .15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          ▾
        </span>
      </button>

      {/* Body */}
      {isOpen && (
        <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--gray-50)' }}>
          {trigger.ids.map((id, i) => {
            const q = getQuestionById(id)
            if (!q) return null
            return (
              <QuestionCard
                key={id}
                question={q}
                index={i}
                value={answers[id]}
                onAnswer={onAnswer}
                liveImpact={getLiveImpact(id, calcResult, answers)}
              />
            )
          })}
          <button
            type="button"
            onClick={onSkip}
            style={{
              padding: '6px 14px', border: '1px solid var(--gray-300)', borderRadius: '6px',
              fontSize: '11px', color: 'var(--gray-500)', background: 'var(--white)',
              cursor: 'pointer', fontFamily: 'var(--font)', marginTop: '4px',
            }}
          >
            Skip this section
          </button>
        </div>
      )}
    </div>
  )
}
