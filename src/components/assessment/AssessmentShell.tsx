'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { SECTIONS, type Phase } from '@/lib/questions'
import { calc, type Answers, type CalcResult } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import ModeTabs, { type AssessmentMode } from './ModeTabs'
import Sidebar from './Sidebar'
import SectionView from './SectionView'
import ScoreLivePanel from './ScoreLivePanel'
import GuidedMode from './guided/GuidedMode'
import ReportView from './report/ReportView'
import SimulatorView from './simulator/SimulatorView'
import TrackingTab from './tracking/TrackingTab'

interface AssessmentShellProps {
  initialAnswers: Answers
  phase: Phase
  season?: string
  country?: string
  plant?: string
  date?: string
  assessmentId: string
  report?: { executive?: string; diagnosis?: string; actions?: string } | null
  reportReleased?: boolean
  isAdmin?: boolean
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

export default function AssessmentShell({ initialAnswers, phase, season, country, plant, date, assessmentId, report, reportReleased, isAdmin, onSave, baseline }: AssessmentShellProps) {
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
      // Compute totalLoss with correct bottleneck logic (max of overlapping, not sum)
      const iss = buildIssues(result, updatedAnswers, { country: country || '' })
      const bnLoss = Math.max(0, ...iss.filter(i => i.category === 'bottleneck' && i.loss > 0).map(i => i.loss))
      const indLoss = iss.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
      onSave({
        answers: updatedAnswers,
        scores: result.scores,
        overall: result.overall,
        bottleneck: result.bottleneck,
        ebitdaMonthly: bnLoss + indLoss,
        hiddenRevMonthly: result.hiddenRevMonthly,
      })
    }, 1000)
  }, [onSave, country])

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
              onViewResults={() => setMode('report')}
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
          reportReleased={reportReleased}
          isAdmin={isAdmin}
        />
      )}

      {mode === 'simulator' && (
        <SimulatorView calcResult={calcResult} />
      )}

      {mode === 'track' && (() => {
        // Compute dispatch baseline from dropdown answer
        const DISPATCH_MAP: Record<string, number> = {
          'Under 15 minutes — fast response': 12,
          '15 to 25 minutes — acceptable': 20,
          '25 to 40 minutes — slow': 32,
          'Over 40 minutes — critical bottleneck': 45,
        }
        const baselineDispatchMin = DISPATCH_MAP[answers.order_to_dispatch as string] ?? null

        // Financial coefficients: $/month per 1-unit improvement
        const coeffTurnaround = calcResult.excessMin > 0
          ? Math.round(calcResult.turnaroundLeakMonthly / calcResult.excessMin)
          : 0
        const coeffReject = calcResult.rejectPct > 0
          ? Math.round(calcResult.rejectLeakMonthly / calcResult.rejectPct)
          : 0

        // Baseline monthly loss from issues engine
        const iss = buildIssues(calcResult, answers, { country: country || '' })
        const bnLoss = Math.max(0, ...iss.filter(i => i.category === 'bottleneck' && i.loss > 0).map(i => i.loss))
        const indLoss = iss.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
        const baselineMonthlyLoss = bnLoss + indLoss

        return (
          <TrackingTab
            assessmentId={assessmentId}
            isAdmin={isAdmin ?? false}
            baselineTurnaround={answers.turnaround ? Number(answers.turnaround) : null}
            baselineRejectPct={answers.reject_pct ? Number(answers.reject_pct) : null}
            baselineDispatchMin={baselineDispatchMin}
            coeffTurnaround={coeffTurnaround}
            coeffReject={coeffReject}
            baselineMonthlyLoss={baselineMonthlyLoss}
            targetTA={calcResult.TARGET_TA}
          />
        )
      })()}
    </div>
  )
}
