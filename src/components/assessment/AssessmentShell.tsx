'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { SECTIONS, type Phase } from '@/lib/questions'
import { calc, type Answers, type CalcResult } from '@/lib/calculations'
import ModeTabs, { type AssessmentMode } from './ModeTabs'
import Sidebar from './Sidebar'
import SectionView from './SectionView'
import ScoreLivePanel from './ScoreLivePanel'
import GuidedMode from './guided/GuidedMode'
import ReportView from './report/ReportView'
import SimulatorView from './simulator/SimulatorView'

interface AssessmentShellProps {
  initialAnswers: Answers
  phase: Phase
  season?: string
  country?: string
  plant?: string
  date?: string
  assessmentId: string
  report?: { executive?: string; diagnosis?: string; actions?: string } | null
  onSave: (data: {
    answers: Answers
    scores: CalcResult['scores']
    overall: CalcResult['overall']
    bottleneck: CalcResult['bottleneck']
    ebitdaMonthly: number
    hiddenRevMonthly: number
  }) => void
  baseline?: Answers
}

export default function AssessmentShell({ initialAnswers, phase, season, country, plant, date, assessmentId, report, onSave, baseline }: AssessmentShellProps) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers)
  const [currentSection, setCurrentSection] = useState(0)
  const [mode, setMode] = useState<AssessmentMode>('questions')
  const [guidedMode, setGuidedMode] = useState(phase === 'onsite' && Object.keys(initialAnswers).length < 20)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const meta = useMemo(() => ({ season }), [season])
  const calcResult: CalcResult = useMemo(() => calc(answers, meta), [answers, meta])

  // Debounced autosave
  const triggerSave = useCallback((updatedAnswers: Answers, result: CalcResult) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      onSave({
        answers: updatedAnswers,
        scores: result.scores,
        overall: result.overall,
        bottleneck: result.bottleneck,
        ebitdaMonthly: result.capLeakMonthly + result.turnaroundLeakMonthly + result.rejectLeakMonthly,
        hiddenRevMonthly: result.hiddenRevMonthly,
      })
    }, 1000)
  }, [onSave])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleAnswer = useCallback((id: string, value: string) => {
    setAnswers(prev => {
      const next = { ...prev, [id]: value === '' ? undefined : value }
      // Calculate with new answers for save payload
      const result = calc(next, meta)
      triggerSave(next, result)
      return next
    })
  }, [meta, triggerSave])

  const handleNextSection = useCallback(() => {
    setCurrentSection(prev => Math.min(prev + 1, SECTIONS.length - 1))
    window.scrollTo(0, 0)
  }, [])

  const handleBackSection = useCallback(() => {
    setCurrentSection(prev => Math.max(prev - 1, 0))
    window.scrollTo(0, 0)
  }, [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <ModeTabs activeMode={mode} onSwitch={setMode} />

      {mode === 'questions' && guidedMode && (
        <GuidedMode
          answers={answers}
          onAnswer={handleAnswer}
          calcResult={calcResult}
          meta={{ country }}
          onSwitchToFullMode={() => setGuidedMode(false)}
          onGenerateReport={() => setMode('report')}
        />
      )}

      {mode === 'questions' && !guidedMode && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <Sidebar
            currentSection={currentSection}
            onSelect={setCurrentSection}
            answers={answers}
            phase={phase}
          />

          {/* Main content area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Live scores */}
            <div style={{ padding: '12px 20px 0' }}>
              <ScoreLivePanel
                scores={calcResult.scores}
                overall={calcResult.overall}
                bottleneck={calcResult.bottleneck}
              />
            </div>

            <SectionView
              sectionIndex={currentSection}
              answers={answers}
              phase={phase}
              onAnswer={handleAnswer}
              onNext={handleNextSection}
              onBack={handleBackSection}
              calcResult={calcResult}
              baseline={baseline}
            />
          </div>
        </div>
      )}

      {mode === 'report' && (
        <ReportView
          calcResult={calcResult}
          answers={answers}
          meta={{ country, plant, date }}
          report={report ?? null}
          assessmentId={assessmentId}
        />
      )}

      {mode === 'simulator' && (
        <SimulatorView calcResult={calcResult} />
      )}
    </div>
  )
}
