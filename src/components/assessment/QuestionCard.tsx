'use client'

import type { Question } from '@/lib/questions'
import NumericInput from './NumericInput'
import OptionsInput from './OptionsInput'
import ObservationInput from './ObservationInput'
import LiveImpactBox from './LiveImpactBox'
import InfoPanel from './InfoPanel'
import HowToPanel from './HowToPanel'

interface QuestionCardProps {
  question: Question
  index: number
  value: string | number | undefined
  baselineValue?: string | number
  onAnswer: (id: string, value: string) => void
  liveImpact?: string[] | null
}

export default function QuestionCard({ question, index, value, baselineValue, onAnswer, liveImpact }: QuestionCardProps) {
  const isAnswered = value !== undefined && value !== ''
  const q = question

  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      marginBottom: '10px',
      overflow: 'hidden',
      transition: 'border-color .15s',
      borderLeftWidth: isAnswered ? '3px' : '1px',
      borderLeftColor: isAnswered ? 'var(--green-mid)' : 'var(--border)',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start', borderBottom: '1px solid var(--gray-50)' }}>
        <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--gray-300)', marginTop: '2px', minWidth: '24px' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, lineHeight: 1.4 }}>
            {q.label}
            {q.req && <span style={{ color: 'var(--red)', marginLeft: '2px' }}>*</span>}
          </div>
          {q.hint && (
            <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '3px', lineHeight: 1.45, fontWeight: 400 }}>
              {q.hint}
            </div>
          )}
          {q.field && (
            <div style={{
              fontSize: '11px', color: '#7a5c00', marginTop: '4px', lineHeight: 1.4,
              padding: '5px 8px', background: '#fffbf0', borderRadius: '5px', borderLeft: '2px solid #D68910',
            }}>
              {q.field}
            </div>
          )}
        </div>
        {q.info && <InfoPanel info={q.info} />}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 16px 12px' }}>
        {q.type === 'num' && (
          <NumericInput
            id={q.id}
            value={value}
            unit={q.unit}
            onChange={onAnswer}
            baselineValue={baselineValue as string | number | undefined}
          />
        )}
        {q.type === 'opts' && q.opts && (
          <OptionsInput
            id={q.id}
            options={q.opts}
            value={value as string | undefined}
            onChange={onAnswer}
            baselineValue={baselineValue as string | undefined}
          />
        )}
        {q.type === 'text' && (
          <ObservationInput
            id={q.id}
            value={value as string | undefined}
            onChange={onAnswer}
            baselineValue={baselineValue as string | undefined}
          />
        )}

        {q.howto && <HowToPanel howto={q.howto} />}

        <LiveImpactBox lines={liveImpact ?? null} />
      </div>
    </div>
  )
}
