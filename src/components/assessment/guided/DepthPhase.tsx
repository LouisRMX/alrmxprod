'use client'

import { useState } from 'react'
import { getGuidedTriggers } from '@/lib/guided'
import type { Answers, CalcResult } from '@/lib/calculations'
import TriggerGroup from './TriggerGroup'

interface DepthPhaseProps {
  answers: Answers
  onAnswer: (id: string, value: string) => void
  calcResult: CalcResult
  meta?: { country?: string }
  onContinue: () => void
  onBack: () => void
}

export default function DepthPhase({ answers, onAnswer, calcResult, meta, onContinue, onBack }: DepthPhaseProps) {
  const triggers = getGuidedTriggers(calcResult, answers, meta)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(triggers.slice(0, 2).map(t => t.id)))
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const skipGroup = (id: string) => {
    setSkipped(prev => new Set(prev).add(id))
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const visibleTriggers = triggers.filter(t => !skipped.has(t.id))

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>Deep-dive questions</h2>
        <p style={{ fontSize: '12px', color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Based on your core answers, these areas need further investigation. Skip any that are not relevant.
        </p>
      </div>

      {visibleTriggers.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gray-500)', fontSize: '13px' }}>
          No deep-dive triggers, core data looks complete. Continue to findings.
        </div>
      ) : (
        visibleTriggers.map(trigger => (
          <TriggerGroup
            key={trigger.id}
            trigger={trigger}
            answers={answers}
            onAnswer={onAnswer}
            calcResult={calcResult}
            isOpen={openGroups.has(trigger.id)}
            onToggle={() => toggleGroup(trigger.id)}
            onSkip={() => skipGroup(trigger.id)}
          />
        ))
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', paddingBottom: '40px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '10px 18px', border: '1px solid var(--gray-300)', borderRadius: '8px',
            fontSize: '13px', cursor: 'pointer', background: 'var(--white)',
            color: 'var(--gray-500)', fontFamily: 'var(--font)',
          }}
        >
          Back to core
        </button>
        <button
          type="button"
          onClick={onContinue}
          style={{
            flex: 1, padding: '11px', background: 'var(--green)', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          Show live findings
        </button>
      </div>
    </div>
  )
}
