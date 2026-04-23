'use client'

/**
 * Results surface — consolidates Decision (summary), Report (full deliverable),
 * and Simulator (what-if) under one top-level tab. The three existing views
 * are mounted unchanged as sub-tabs; this wrapper only adds the sub-tab bar
 * and orchestrates prop passthrough.
 *
 * Default sub-tab by role:
 *   - owner        → 'summary'   (quick internal read)
 *   - others       → 'report'    (the deliverable, primary focus)
 *
 * Owners don't get the 'whatif' sub-tab — SimulatorView stays mounted but
 * the tab is gated in the sub-tab bar.
 */

import { useMemo, useState } from 'react'
import type { CalcResult, Answers, CalcOverrides } from '@/lib/calculations'
import type { Phase } from '@/lib/questions'
import type { ValidatedDiagnosis } from '@/lib/diagnosis-pipeline'
import type { FieldLogContext } from '@/lib/fieldlog/context'
import type { DemoBannerProps } from '@/components/assessment/AssessmentShell'
import { useIsMobile } from '@/hooks/useIsMobile'
import { mapToReportInput, calculateReport } from '@/lib/reportCalculations'

import ReportView from './../report/ReportView'
import OwnerReportView from './../report/OwnerReportView'
import DecisionView from './../decision/DecisionView'
import SimulatorView from './../simulator/SimulatorView'
import InterventionPlanView from './../InterventionPlanView'

export type ResultsSubTab = 'summary' | 'report' | 'plan' | 'whatif'

interface BaselineData {
  answers: Answers
  date: string
  calcResult: CalcResult
}

interface ResultsViewProps {
  // Core assessment data
  calcResult: CalcResult
  answers: Answers
  meta: { country?: string; plant?: string; date?: string }
  phase: Phase

  // Report-only
  report: { executive?: string; diagnosis?: string; actions?: string } | null
  assessmentId: string
  customerId: string
  reportReleased?: boolean
  isAdmin?: boolean
  overrides: CalcOverrides
  onOverrideChange: (o: CalcOverrides) => void
  onSwitchToTracking: () => void
  demoBanner?: DemoBannerProps
  userRole?: 'owner' | 'manager' | 'operator' | null
  focusActions?: string[] | null
  baselineData?: BaselineData
  fieldLogContext: FieldLogContext | null

  // Summary (DecisionView)
  savedDiagnosis?: ValidatedDiagnosis

  // Plan (InterventionPlanView) — requires plantId and non-demo assessment
  plantId?: string

  // Initial sub-tab (from parent — e.g. when switching from Questions)
  initialSubTab?: ResultsSubTab
}

export default function ResultsView(props: ResultsViewProps) {
  const isMobile = useIsMobile()
  const isOwner = props.userRole === 'owner'

  // Default landing tab per role: owners land on the concise summary,
  // everyone else on the full report deliverable.
  const defaultTab: ResultsSubTab = props.initialSubTab ?? (isOwner ? 'summary' : 'report')
  const [subTab, setSubTab] = useState<ResultsSubTab>(defaultTab)

  // Sub-tabs visible to this role. Owners don't get Plan (in-progress
  // planning tool) or What-if (interactive simulator). Their view is
  // the finished deliverable: Summary + Report.
  const visibleTabs = useMemo((): Array<{ id: ResultsSubTab; label: string }> => {
    const tabs: Array<{ id: ResultsSubTab; label: string }> = [
      { id: 'summary', label: 'Summary' },
      { id: 'report', label: 'Report' },
    ]
    if (!isOwner) {
      tabs.push({ id: 'plan', label: 'Plan' })
      tabs.push({ id: 'whatif', label: 'What-if' })
    }
    return tabs
  }, [isOwner])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--white)',
        padding: isMobile ? '0 8px' : '0 20px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        flexShrink: 0,
      }}>
        {visibleTabs.map(tab => {
          const active = subTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              style={{
                padding: isMobile ? '8px 12px' : '9px 16px',
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: active ? 600 : 400,
                fontFamily: 'var(--font)',
                color: active ? 'var(--green)' : 'var(--gray-500)',
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                minHeight: '44px',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Sub-tab content */}
      {subTab === 'summary' && (
        <DecisionView
          calcResult={props.calcResult}
          answers={props.answers}
          meta={props.meta}
          phase={props.phase}
          savedDiagnosis={props.savedDiagnosis}
        />
      )}

      {subTab === 'report' && isOwner && (
        <OwnerReportView
          calcResult={props.calcResult}
          answers={props.answers}
          meta={props.meta}
          report={props.report}
          reportReleased={props.reportReleased}
          isAdmin={props.isAdmin}
          phase={props.phase}
          focusActions={props.focusActions}
          baselineData={props.baselineData}
        />
      )}

      {subTab === 'report' && !isOwner && (
        <ReportView
          calcResult={props.calcResult}
          answers={props.answers}
          meta={props.meta}
          report={props.report}
          assessmentId={props.assessmentId}
          customerId={props.customerId}
          reportReleased={props.reportReleased}
          isAdmin={props.isAdmin}
          overrides={props.overrides}
          onOverrideChange={props.onOverrideChange}
          phase={props.phase}
          onSwitchToTracking={props.onSwitchToTracking}
          demoBanner={props.demoBanner}
          userRole={props.userRole}
          focusActions={props.focusActions}
          baselineData={props.baselineData}
          fieldLogContext={props.fieldLogContext}
        />
      )}

      {subTab === 'plan' && !isOwner && props.plantId && props.assessmentId !== 'demo' && (
        <InterventionPlanView assessmentId={props.assessmentId} plantId={props.plantId} />
      )}

      {subTab === 'plan' && !isOwner && (!props.plantId || props.assessmentId === 'demo') && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Intervention plan</div>
          <div style={{ fontSize: '13px' }}>Plan generation is available on real assessments with a plant linked. Demo mode is a preview only.</div>
        </div>
      )}

      {subTab === 'whatif' && !isOwner && (() => {
        // Build reportInput + rc for provenance tagging, mirroring the old
        // top-level simulator mode. Falls back silently if the pipeline
        // cannot map (e.g. very early workshop phase with sparse answers).
        let simReportInput: React.ComponentProps<typeof SimulatorView>['reportInput']
        let simRc: React.ComponentProps<typeof SimulatorView>['rc']
        try {
          const dxLite = {
            tat_actual: props.calcResult.ta,
            reject_pct: props.calcResult.rejectPct ?? 0,
            management_context: String(props.answers.biggest_pain ?? ''),
          }
          const input = mapToReportInput(dxLite, props.answers as Record<string, unknown>)
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
        return (
          <SimulatorView
            calcResult={props.calcResult}
            readOnly={false}
            reportInput={simReportInput}
            rc={simRc}
          />
        )
      })()}
    </div>
  )
}
