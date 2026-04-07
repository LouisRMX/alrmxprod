'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { SECTIONS, type Phase, type Section } from '@/lib/questions'
import { calc, type Answers, type CalcResult, type CalcOverrides } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import ModeTabs, { type AssessmentMode } from './ModeTabs'
import Sidebar from './Sidebar'
import SectionView from './SectionView'
import ScoreLivePanel from './ScoreLivePanel'
import GuidedMode from './guided/GuidedMode'
import ReportView from './report/ReportView'
import OwnerReportView from './report/OwnerReportView'
import SimulatorView from './simulator/SimulatorView'
import TrackingTab from './tracking/TrackingTab'
import GpsUploadView from '@/components/gps-upload/GpsUploadView'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSetChatContext } from '@/context/ChatContext'

export interface DemoBannerProps {
  show: boolean
  regenCount: number
  maxRegen: number
  onRegenerate: () => void
  onReset: () => void
}

interface AssessmentShellProps {
  initialAnswers: Answers
  phase: Phase
  season?: string
  country?: string
  plant?: string
  date?: string
  assessmentId: string
  customerId?: string
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
    // Anonymized fields for market benchmarking
    benchmark?: {
      radius: number
      trucks: number
      turnaroundMin: number
      dispatchMin: number | null
      rejectPct: number
      delDay: number
      utilPct: number
    }
  }) => void
  baseline?: Answers
  requestMode?: AssessmentMode
  // Role-based access control for customer users
  userRole?: 'owner' | 'manager' | 'operator' | null
  // Demo-specific: called whenever any answer changes
  onAnswersChange?: (answers: Answers) => void
  // Demo-specific: drives the regenerate banner in the report tab
  demoBanner?: DemoBannerProps
  // Extra tab injected before the standard tabs (e.g. "All plants" in demo)
  extraTab?: { label: string; shortLabel: string; onClick: () => void }
  // When true, the internal ModeTabs row is not rendered (parent renders its own)
  hideModeTabs?: boolean
  // Focus actions curated by admin — shown to manager in report banner
  focusActions?: string[] | null
  // Follow-up: override the default question sections
  customSections?: Section[]
  // Follow-up: baseline data for comparison in report view
  baselineData?: { answers: Answers; date: string }
}

export default function AssessmentShell({ initialAnswers, phase, season, country, plant, date, assessmentId, customerId, report, reportReleased, isAdmin, userRole, onSave, baseline, requestMode, onAnswersChange, demoBanner, extraTab, hideModeTabs, focusActions, customSections, baselineData }: AssessmentShellProps) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers)
  const [currentSection, setCurrentSection] = useState(0)
  // Owner starts on report (they have no questions tab)
  // Operator starts on questions
  // Everyone else starts on questions
  const [mode, setMode] = useState<AssessmentMode>(
    userRole === 'owner' ? 'report' : 'questions'
  )
  const [guidedMode, setGuidedMode] = useState(phase === 'onsite' && Object.keys(initialAnswers).length < 20)
  const [overrides, setOverrides] = useState<CalcOverrides>({})
  const isMobile = useIsMobile()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Role-based access control
  // owner    = view report + simulator + track (read-only)
  // manager  = full access (all tabs + editing)
  // operator = questions + track (data input only)
  // null/admin = full access
  const allowedModes = useMemo((): AssessmentMode[] => {
    if (userRole === 'owner')    return ['report', 'simulator', 'track']
    if (userRole === 'operator') return ['questions', 'track']
    return ['questions', 'report', 'simulator', 'track', 'gps']
  }, [userRole])

  const canEdit = !userRole || userRole === 'manager' || userRole === 'operator'
  const showSidebar = canEdit
  const showScorePanel = (isAdmin || userRole === 'manager' || userRole === 'operator') && !isMobile

  // Allow parent to imperatively switch tabs (e.g. "Set up tracking" CTA)
  useEffect(() => {
    if (requestMode) setMode(requestMode)
  }, [requestMode])

  const meta = useMemo(() => ({ season }), [season])
  const calcResult: CalcResult = useMemo(() => calc(answers, meta, overrides), [answers, meta, overrides])

  // Push current assessment context to the global chat assistant
  useSetChatContext({
    pageType: 'assessment',
    plantName: plant,
    plantCountry: country,
    assessmentId,
    assessmentPhase: phase,
    overall: calcResult.overall,
    scores: {
      prod:     calcResult.scores.prod,
      dispatch: calcResult.scores.dispatch,
      fleet:    calcResult.scores.fleet,
      quality:  calcResult.scores.quality,
    },
    bottleneck:       calcResult.bottleneck,
    ebitdaMonthly:    calcResult.capLeakMonthly + calcResult.turnaroundLeakMonthly
                      + calcResult.rejectLeakMonthly + calcResult.partialLeakMonthly
                      + calcResult.surplusLeakMonthly,
    hiddenRevMonthly: calcResult.hiddenRevMonthly,
    turnaroundMin:    calcResult.ta,
    targetTA:         calcResult.TARGET_TA,
    dispatchMin:      calcResult.dispatchMin,
    rejectPct:        calcResult.rejectPct,
    trucks:           calcResult.trucks,
  })

  const baselineCalcResult: CalcResult | null = useMemo(
    () => baselineData ? calc(baselineData.answers, meta) : null,
    [baselineData, meta]
  )

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
        benchmark: result.overall !== null ? {
          radius:       result.radius,
          trucks:       result.trucks,
          turnaroundMin: Math.round(result.ta),
          dispatchMin:  result.dispatchMin ?? null,
          rejectPct:    result.rejectPct,
          delDay:       result.delDay,
          utilPct:      Math.round(result.util * 100),
        } : undefined,
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
      onAnswersChange?.(next)
      return next
    })
  }, [meta, triggerSave, onAnswersChange])

  const activeSections = customSections ?? SECTIONS

  const handleNextSection = useCallback(() => {
    setCurrentSection(prev => Math.min(prev + 1, activeSections.length - 1))
    window.scrollTo(0, 0)
  }, [activeSections])

  const handleBackSection = useCallback(() => {
    setCurrentSection(prev => Math.max(prev - 1, 0))
    window.scrollTo(0, 0)
  }, [])


  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {!hideModeTabs && <ModeTabs activeMode={mode} onSwitch={setMode} allowedModes={allowedModes} extraTab={extraTab} />}


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

      {(mode === 'questions' || mode === 'gps') && !guidedMode && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar — hidden on mobile, hidden for owner role */}
          {showSidebar && !isMobile && (
            <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--white)' }}>
              <Sidebar
                currentSection={currentSection}
                onSelect={(i) => { setCurrentSection(i); setMode('questions') }}
                answers={answers}
                phase={phase}
                sections={customSections}
              />
              {phase === 'workshop' && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0', background: 'var(--white)' }}>
                  <button
                    type="button"
                    onClick={() => setMode('gps')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      width: '100%', padding: '8px 16px',
                      background: mode === 'gps' ? 'var(--info-bg)' : 'transparent',
                      border: 'none',
                      borderLeft: mode === 'gps' ? '3px solid var(--phase-workshop)' : '3px solid transparent',
                      cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '12px',
                      color: mode === 'gps' ? 'var(--phase-workshop)' : 'var(--gray-500)',
                      fontWeight: mode === 'gps' ? 500 : 400,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
                      background: mode === 'gps' ? 'var(--phase-workshop)' : 'var(--gray-100)',
                      color: mode === 'gps' ? 'white' : 'var(--gray-400)',
                    }}>⊕</span>
                    <span style={{ flex: 1, lineHeight: 1.3 }}>GPS Fleet Data</span>
                    <span style={{
                      fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
                      background: 'var(--info-bg)', border: '1px solid var(--info-border)',
                      color: 'var(--phase-workshop)', fontWeight: 500,
                    }}>opt</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Main content area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {mode === 'questions' && (
              <>
                {/* Live scores — hidden for owner (they don't edit), shown for others */}
                {showScorePanel && (
                  <div style={{ padding: '12px 20px 0' }}>
                    <ScoreLivePanel
                      scores={calcResult.scores}
                      overall={calcResult.overall}
                      bottleneck={calcResult.bottleneck}
                    />
                  </div>
                )}

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
                  sections={customSections}
                />
              </>
            )}

            {mode === 'gps' && (
              <GpsUploadView
                assessmentId={assessmentId}
                isAdmin={isAdmin}
              />
            )}

          </div>
        </div>
      )}

      {mode === 'report' && userRole === 'owner' && (
        <OwnerReportView
          calcResult={calcResult}
          answers={answers}
          meta={{ country, plant, date }}
          report={report ?? null}
          reportReleased={reportReleased}
          isAdmin={isAdmin}
          phase={phase}
          focusActions={focusActions}
          baselineData={baselineData && baselineCalcResult ? { ...baselineData, calcResult: baselineCalcResult } : undefined}
        />
      )}

      {mode === 'report' && userRole !== 'owner' && (
        <ReportView
          calcResult={calcResult}
          answers={answers}
          meta={{ country, plant, date }}
          report={report ?? null}
          assessmentId={assessmentId}
          customerId={customerId ?? ''}
          reportReleased={reportReleased}
          isAdmin={isAdmin}
          overrides={overrides}
          onOverrideChange={setOverrides}
          phase={phase}
          onSwitchToTracking={() => setMode('track')}
          demoBanner={demoBanner}
          userRole={userRole}
          focusActions={focusActions}
          baselineData={baselineData && baselineCalcResult ? { ...baselineData, calcResult: baselineCalcResult } : undefined}
        />
      )}

      {mode === 'simulator' && (
        <SimulatorView calcResult={calcResult} readOnly={userRole === 'owner'} />
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
        // Use cost-only turnaround figure when plant is demand-constrained
        const taLeak = calcResult.demandSufficient === false
          ? calcResult.turnaroundLeakMonthlyCostOnly
          : calcResult.turnaroundLeakMonthly
        const coeffTurnaround = calcResult.excessMin > 0
          ? Math.round(taLeak / calcResult.excessMin)
          : 0
        const coeffReject = calcResult.rejectPct > 0
          ? Math.round(calcResult.rejectLeakMonthly / calcResult.rejectPct)
          : 0
        const dispatchGap = (calcResult.dispatchMin ?? 15) - 15
        const coeffDispatch = dispatchGap > 0
          ? Math.round(taLeak * 0.22 / dispatchGap)
          : 800

        // Baseline monthly loss from issues engine
        const iss = buildIssues(calcResult, answers, { country: country || '' })
        const bnLoss = Math.max(0, ...iss.filter(i => i.category === 'bottleneck' && i.loss > 0).map(i => i.loss))
        const indLoss = iss.filter(i => i.category === 'independent').reduce((s, i) => s + i.loss, 0)
        const baselineMonthlyLoss = bnLoss + indLoss

        return (
          <TrackingTab
            assessmentId={assessmentId}
            isAdmin={isAdmin ?? false}
            viewOnly={userRole === 'owner'}
            perMinTACoeff={calcResult.perMinTACoeff}
            baselineTurnaround={(() => {
              const TURNAROUND_MAP: Record<string, number> = {
                'Under 80 minutes — benchmark performance': 72,
                '80 to 100 minutes — acceptable':           90,
                '100 to 125 minutes — slow':                112,
                'Over 125 minutes — critical bottleneck':   140,
              }
              const raw = answers.turnaround as string
              return raw ? (TURNAROUND_MAP[raw] ?? (Number(raw) || null)) : null
            })()}
            baselineRejectPct={answers.reject_pct ? Number(answers.reject_pct) : null}
            baselineDispatchMin={baselineDispatchMin}
            coeffTurnaround={coeffTurnaround}
            coeffReject={coeffReject}
            coeffDispatch={coeffDispatch}
            baselineMonthlyLoss={baselineMonthlyLoss}
            targetTA={calcResult.TARGET_TA}
          />
        )
      })()}

    </div>
  )
}
