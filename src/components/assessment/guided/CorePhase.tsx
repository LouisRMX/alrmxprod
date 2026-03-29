'use client'

import { useState } from 'react'
import { CORE_BLOCKS } from '@/lib/questions'
import { getQuestionById } from '@/lib/questions'
import { getLiveImpact } from '@/lib/live-impact'
import type { Answers, CalcResult } from '@/lib/calculations'
import QuestionCard from '../QuestionCard'

interface CorePhaseProps {
  answers: Answers
  onAnswer: (id: string, value: string) => void
  calcResult: CalcResult
  onContinue: () => void
  onSkipToFindings: () => void
}

export default function CorePhase({ answers, onAnswer, calcResult, onContinue, onSkipToFindings }: CorePhaseProps) {
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set(CORE_BLOCKS.map(b => b.id)))

  const toggleBlock = (id: string) => {
    setOpenBlocks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalCoreQs = CORE_BLOCKS.reduce((s, b) => s + b.ids.length, 0)
  const answeredCoreQs = CORE_BLOCKS.reduce((s, b) => s + b.ids.filter(id => answers[id] !== undefined && answers[id] !== '').length, 0)

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '4px' }}>Core data collection</h2>
        <p style={{ fontSize: '12px', color: 'var(--gray-500)', lineHeight: 1.5 }}>
          Answer the essential questions first. Deep-dive questions will appear based on what the numbers reveal.
        </p>
        <div style={{ fontSize: '11px', color: 'var(--gray-300)', fontFamily: 'var(--mono)', marginTop: '6px' }}>
          {answeredCoreQs} / {totalCoreQs} core questions answered
        </div>
      </div>

      {CORE_BLOCKS.map(block => {
        const isOpen = openBlocks.has(block.id)
        const blockAnswered = block.ids.filter(id => answers[id] !== undefined && answers[id] !== '').length

        return (
          <div key={block.id} style={{
            background: 'var(--white)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', marginBottom: '10px', overflow: 'hidden',
          }}>
            <button
              type="button"
              onClick={() => toggleBlock(block.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)', textAlign: 'left',
              }}
            >
              <div style={{
                width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', fontWeight: 600,
                background: blockAnswered === block.ids.length ? 'var(--green-mid)' : 'var(--gray-100)',
                color: blockAnswered === block.ids.length ? 'white' : 'var(--gray-500)',
              }}>
                {blockAnswered === block.ids.length ? '✓' : blockAnswered}
              </div>
              <span style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--gray-900)' }}>
                {block.label}
              </span>
              <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--gray-300)' }}>
                {blockAnswered}/{block.ids.length}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--gray-500)', transition: 'transform .15s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                ▾
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--gray-50)' }}>
                {block.ids.map((id, i) => {
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
              </div>
            )}
          </div>
        )
      })}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', paddingBottom: '40px' }}>
        <button
          type="button"
          onClick={onSkipToFindings}
          style={{
            padding: '10px 18px', border: '1px solid var(--gray-300)', borderRadius: '8px',
            fontSize: '13px', cursor: 'pointer', background: 'var(--white)',
            color: 'var(--gray-500)', fontFamily: 'var(--font)',
          }}
        >
          Skip to findings
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
          Continue to deep-dive
        </button>
      </div>
    </div>
  )
}
