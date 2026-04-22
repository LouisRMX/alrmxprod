'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { SECTIONS, type Phase, type Section } from '@/lib/questions'
import { calc, type Answers, type CalcResult, type CalcOverrides } from '@/lib/calculations'
import { buildIssues } from '@/lib/issues'
import ModeTabs, { type AssessmentMode } from './ModeTabs'
import Sidebar from './Sidebar'
import SectionView from './SectionView'
import GuidedMode from './guided/GuidedMode'
import ReportView from './report/ReportView'
import OwnerReportView from './report/OwnerReportView'
import SimulatorView from './simulator/SimulatorView'
import DecisionView from './decision/DecisionView'
import { buildValidatedDiagnosis } from '@/lib/diagnosis-pipeline'
import TrackingTab from './tracking/TrackingTab'
import GpsUploadView from '@/components/gps-upload/GpsUploadView'
import { createClient } from '@/lib/supabase/client'
import FieldLogView from '@/components/fieldlog/FieldLogView'
import InterventionPlanView from './InterventionPlanView'
import FieldGuideView from './FieldGuideView'
import UploadAssessmentData from './UploadAssessmentData'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSetChatContext } from '@/context/ChatContext'
import { mapToReportInput, calculateReport } from '@/lib/reportCalculations'

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
      truckUtilAnnual: number | null
      m3PerDriverHour: number | null
      avgLoadM3: number | null
    }
    validatedDiagnosis?: Record<string, unknown> | null
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
  // Focus actions curated by admin, shown to manager in report banner
  focusActions?: string[] | null
  // Follow-up: override the default question sections
  customSections?: Section[]
  // Follow-up: baseline data for comparison in report view
  baselineData?: { answers: Answers; date: string }
  // Saved diagnosis snapshot from database (if available)
  savedDiagnosis?: Record<string, unknown> | null
  // Plant ID for field log (daily_logs table requires it)
  plantId?: string
}

export default function AssessmentShell({ initialAnswers, phase, season, country, plant, date, assessmentId, customerId, report, reportReleased, isAdmin, userRole, onSave, baseline, requestMode, onAnswersChange, demoBanner, extraTab, hideModeTabs, focusActions, customSections, baselineData, savedDiagnosis, plantId }: AssessmentShellProps) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers)
  const [currentSection, setCurrentSection] = useState(0)
  // Owner starts on report (they have no questions tab)
  // Operator starts on questions
  // Everyone else starts on questions
  const [mode, setMode] = useState<AssessmentMode>(
    userRole === 'owner' ? 'report' : 'questions'
  )
  const [guidedMode, setGuidedMode] = useState(phase === 'onsite' && Object.keys(initialAnswers).length < 20)
  const isPreDiagnosis = phase === 'workshop'
  const [overrides, setOverrides] = useState<CalcOverrides>({ estimatedInputs: isPreDiagnosis })
  const isMobile = useIsMobile()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabaseClient = createClient()

  // Fetch field log measured data via SECURITY DEFINER function (bypasses RLS on views)
  useEffect(() => {
    if (assessmentId === 'demo') return
    supabaseClient
      .rpc('get_field_log_stats', { p_assessment_id: assessmentId })
      .then(({ data }) => {
        if (!data || data.trip_count < 3) return  // minimum 3 trips for statistical relevance
        setOverrides(prev => ({
          ...prev,
          // When measured data exists, disable estimatedInputs so calc uses derived mixCap
          estimatedInputs: false,
          measuredTA: data.avg_tat,
          measuredTABreakdown: {
            transit: data.avg_transit ?? undefined,
            siteWait: data.avg_site_wait ?? undefined,
            unload: data.avg_unload ?? undefined,
          },
          measuredTripCount: data.trip_count,
          // Only override reject rate when we have enough trips (20+) for statistical relevance
          // 3 trips with 0 rejections doesn't mean reject rate is 0%
          measuredRejectPct: data.trip_count >= 20 ? (data.reject_pct ?? undefined) : undefined,
        }))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId, isPreDiagnosis])

  // Fetch full field log context for report generation (variation, VSM, site/truck matrix)
  const [fieldLogContext, setFieldLogContext] = useState<import('@/lib/fieldlog/context').FieldLogContext | null>(null)
  useEffect(() => {
    if (assessmentId === 'demo') return
    supabaseClient
      .rpc('get_field_log_context', { p_assessment_id: assessmentId })
      .then(({ data, error }) => {
        if (error || !data?.trips || data.trips.length < 3) return
        const { buildFieldLogContext } = require('@/lib/fieldlog/context')
        setFieldLogContext(buildFieldLogContext(data.trips, data.interventions || [], null, answers))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId])

  // Role-based access control
  // owner    = view report + simulator + track (read-only)
  // manager  = full access (all tabs + editing)
  // operator = questions + track (data input only)
  // null/admin = full access
  const allowedModes = useMemo((): AssessmentMode[] => {
    if (userRole === 'owner')    return ['report', 'decision', 'simulator', 'track']
    if (userRole === 'operator') return ['questions', 'track']
    return ['questions', 'report', 'decision', 'simulator', 'track', 'gps', 'fieldlog', 'plan', 'fieldguide']
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
      // Total loss from CalcResult fields directly (single source of truth)
      // A: Active constraint (only one): turnaroundLeak OR capLeak (never both)
      // B: Additive independent: rejectMaterialLoss + partial + surplus + breakdown
      // Demurrage excluded from total: it's a recovery opportunity, not an operational loss
      // rejectOpportunityCost excluded: overlaps with throughput (wasted cycle = lost delivery)
      const throughputLoss = result.turnaroundLeakMonthly + result.capLeakMonthly // only one is >0
      const additiveLoss = result.rejectMaterialLoss
        + result.partialLeakMonthly
        + result.surplusLeakMonthly
        + result.breakdownCostMonthly
      onSave({
        answers: updatedAnswers,
        scores: result.scores,
        overall: result.overall,
        bottleneck: result.bottleneck,
        ebitdaMonthly: throughputLoss + additiveLoss,
        hiddenRevMonthly: result.hiddenRevMonthly,
        benchmark: result.overall !== null ? {
          radius:       result.radius,
          trucks:       result.trucks,
          turnaroundMin: Math.round(result.ta),
          dispatchMin:  result.dispatchMin ?? null,
          rejectPct:    result.rejectPct,
          delDay:       result.delDay,
          utilPct:      Math.round(result.util * 100),
          truckUtilAnnual: result.trucks > 0 && result.delDay > 0
            ? Math.round(result.delDay * result.effectiveMixCap * result.opD / result.trucks)
            : null,
          m3PerDriverHour: result.trucks > 0 && result.delDay > 0 && result.opH > 0
            ? Math.round((result.delDay * result.effectiveMixCap / result.trucks / result.opH) * 10) / 10
            : null,
          avgLoadM3: result.effectiveMixCap > 0 ? Math.round(result.effectiveMixCap * 10) / 10 : null,
        } : undefined,
        validatedDiagnosis: result.overall !== null
          ? buildValidatedDiagnosis(result, updatedAnswers, { country: country || '', plant: plant || '', date: date || '' }, overrides ? { measuredTA: overrides.measuredTA, measuredTripCount: overrides.measuredTripCount } : undefined) as unknown as Record<string, unknown>
          : null,
      })
    }, 1000)
  }, [onSave, country, plant, date])

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
          {/* Sidebar, hidden on mobile, hidden for owner role */}
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
                {/* Bottleneck indicator */}
                {showScorePanel && calcResult.bottleneck && (
                  <div style={{ padding: '12px 20px 0' }}>
                    <div style={{
                      background: 'var(--error-bg)', border: '1px solid var(--error-border)',
                      borderRadius: '8px', padding: '10px 14px',
                      fontSize: '13px', color: 'var(--red)', fontWeight: 500,
                    }}>
                      ⚡ Primary constraint: {calcResult.bottleneck}
                    </div>
                  </div>
                )}

                {/* Upload plant data to prefill assessment + clear button */}
                {assessmentId !== 'demo' && (
                  <div style={{ padding: '0 20px', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <UploadAssessmentData onDataParsed={async (data) => {
                      try {
                        const resp = await fetch('/api/fieldlog/apply-assessment', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ assessmentId, answers: data }),
                        })
                        if (!resp.ok) {
                          const body = await resp.json().catch(() => ({}))
                          console.error('Apply failed:', body.error)
                          return
                        }
                        window.location.reload()
                      } catch (err) {
                        console.error('Apply failed:', err)
                      }
                    }} />
                    {Object.keys(answers).filter(k => answers[k] != null && answers[k] !== '').length > 0 && (
                      <button type="button" onClick={async () => {
                        if (!confirm('Clear all answers? This cannot be undone.')) return
                        try {
                          await fetch('/api/fieldlog/apply-assessment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ assessmentId, answers: {}, clear: true }),
                          })
                          window.location.reload()
                        } catch (err) {
                          console.error('Clear failed:', err)
                        }
                      }}
                      style={{
                        padding: '8px 14px', borderRadius: '6px', border: '1px solid #e5e7eb',
                        background: '#fff', color: '#888', fontSize: '12px', cursor: 'pointer',
                      }}>
                        Clear all answers
                      </button>
                    )}
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
          fieldLogContext={fieldLogContext}
        />
      )}

      {mode === 'decision' && (
        <DecisionView
          calcResult={calcResult}
          answers={answers}
          meta={{ country, plant, date }}
          phase={phase}
          savedDiagnosis={savedDiagnosis as import('@/lib/diagnosis-pipeline').ValidatedDiagnosis | undefined}
        />
      )}

      {mode === 'simulator' && (
        (() => {
          // Build reportInput + rc on the fly so the simulator can render
          // provenance-tagged data basis and use the same avg_load / margin
          // numbers as the generated report. Falls back gracefully if
          // buildValidatedDiagnosis output is missing.
          let simReportInput: React.ComponentProps<typeof SimulatorView>['reportInput']
          let simRc: React.ComponentProps<typeof SimulatorView>['rc']
          try {
            const dxLite = {
              tat_actual: calcResult.ta,
              reject_pct: calcResult.rejectPct ?? 0,
              management_context: String(answers.biggest_pain ?? ''),
            }
            const input = mapToReportInput(dxLite, answers as Record<string, unknown>)
            simReportInput = input
            const rcFull = calculateReport(input)
            simRc = {
              avg_load_m3: rcFull.avg_load_m3,
              target_tat_min: rcFull.target_tat_min,
              contribution_margin_per_m3: rcFull.contribution_margin_per_m3,
            }
          } catch (err) {
            console.warn('SimulatorView reportInput build failed, continuing without provenance:', err)
          }
          return <SimulatorView calcResult={calcResult} readOnly={userRole === 'owner'} reportInput={simReportInput} rc={simRc} />
        })()
      )}

      {mode === 'track' && (() => {
        // Compute dispatch baseline from dropdown answer
        const DISPATCH_MAP: Record<string, number> = {
          'Under 15 minutes, fast response': 12,
          '15 to 25 minutes, acceptable': 20,
          '25 to 40 minutes, slow': 32,
          'Over 40 minutes, critical bottleneck': 45,
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
            plant={plant}
            country={country}
            phase={phase}
            perMinTACoeff={calcResult.perMinTACoeff}
            baselineTurnaround={(() => {
              const TURNAROUND_MAP: Record<string, number> = {
                'Under 80 minutes, benchmark performance': 72,
                '80 to 100 minutes, acceptable':           90,
                '100 to 125 minutes, slow':                112,
                'Over 125 minutes, critical bottleneck':   140,
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

      {mode === 'fieldlog' && (() => {
        // Compute reported and target TAT for the Diagnostics expected-vs-measured banner.
        // Falls back silently if reportInput/rc cannot be built.
        let reportedTAT: number | null = null
        let targetTAT: number | null = null
        try {
          const dxLite = {
            tat_actual: calcResult.ta,
            reject_pct: calcResult.rejectPct ?? 0,
            management_context: String(answers.biggest_pain ?? ''),
          }
          const input = mapToReportInput(dxLite, answers as Record<string, unknown>)
          const rcFull = calculateReport(input)
          reportedTAT = input.avg_turnaround_min
          targetTAT = rcFull.target_tat_min
        } catch {
          // ignore, banner will show a fallback message
        }
        return (
          <FieldLogView
            assessmentId={assessmentId}
            plantId={plantId ?? ''}
            isAdmin={isAdmin}
            reportedTAT={reportedTAT}
            targetTAT={targetTAT}
          />
        )
      })()}

      {mode === 'plan' && plantId && assessmentId !== 'demo' && (
        <InterventionPlanView assessmentId={assessmentId} plantId={plantId} />
      )}
      {mode === 'plan' && (!plantId || assessmentId === 'demo') && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Intervention plan</div>
          <div style={{ fontSize: '13px' }}>Plan generation is available on real assessments with a plant linked. Demo mode is a preview only.</div>
        </div>
      )}

      {mode === 'fieldguide' && assessmentId !== 'demo' && (
        <FieldGuideView assessmentId={assessmentId} />
      )}
      {mode === 'fieldguide' && assessmentId === 'demo' && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Field guide</div>
          <div style={{ fontSize: '13px' }}>The field guide is scoped to a real engagement. Demo mode is a preview only.</div>
        </div>
      )}

    </div>
  )
}
