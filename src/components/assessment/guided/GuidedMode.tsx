'use client'

import { useState } from 'react'
import type { Answers, CalcResult } from '@/lib/calculations'
import PhaseBar, { type GuidedPhase } from './PhaseBar'
import CorePhase from './CorePhase'
import DepthPhase from './DepthPhase'
import PreviewPhase from './PreviewPhase'

interface GuidedModeProps {
  answers: Answers
  onAnswer: (id: string, value: string) => void
  calcResult: CalcResult
  meta?: { country?: string }
  onSwitchToFullMode: () => void
  onGenerateReport: () => void
}

export default function GuidedMode({ answers, onAnswer, calcResult, meta, onSwitchToFullMode, onGenerateReport }: GuidedModeProps) {
  const [phase, setPhase] = useState<GuidedPhase>('core')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PhaseBar currentPhase={phase} />

      {/* Switch to full mode link */}
      <div style={{ padding: '8px 20px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onSwitchToFullMode}
          style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: '11px', color: 'var(--green)', cursor: 'pointer',
            fontFamily: 'var(--font)', textDecoration: 'underline',
          }}
        >
          Switch to full question set
        </button>
      </div>

      {phase === 'core' && (
        <CorePhase
          answers={answers}
          onAnswer={onAnswer}
          calcResult={calcResult}
          onContinue={() => setPhase('depth')}
          onSkipToFindings={() => setPhase('preview')}
        />
      )}

      {phase === 'depth' && (
        <DepthPhase
          answers={answers}
          onAnswer={onAnswer}
          calcResult={calcResult}
          meta={meta}
          onContinue={() => setPhase('preview')}
          onBack={() => setPhase('core')}
        />
      )}

      {phase === 'preview' && (
        <PreviewPhase
          calcResult={calcResult}
          answers={answers}
          meta={meta}
          onGenerateReport={onGenerateReport}
          onBack={() => setPhase('depth')}
        />
      )}
    </div>
  )
}
