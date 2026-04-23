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
import type { FieldLogContext, MeasuredTripStats } from '@/lib/fieldlog/context'
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

  // Field log data-basis banner
  measuredStats: MeasuredTripStats | null
  fieldLogFetchedAt: Date | null
  fieldLogRefreshing: boolean
  fieldLogError: string | null
  onRefreshFieldLog: () => void

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
      <DataBasisBanner
        measuredStats={props.measuredStats}
        fieldLogFetchedAt={props.fieldLogFetchedAt}
        fieldLogRefreshing={props.fieldLogRefreshing}
        fieldLogError={props.fieldLogError}
        onRefresh={props.onRefreshFieldLog}
        isDemoMode={props.assessmentId === 'demo'}
      />

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

// ── Data basis banner ─────────────────────────────────────────────────────
//
// Makes explicit whether the numbers on this page reflect the consultant's
// reported pre-assessment answers or measurements from the Field Log. Also
// surfaces staleness — the initial fetch happens on mount, so trips logged
// during the session won't be reflected until the user clicks Refresh.

function DataBasisBanner({
  measuredStats,
  fieldLogFetchedAt,
  fieldLogRefreshing,
  fieldLogError,
  onRefresh,
  isDemoMode,
}: {
  measuredStats: MeasuredTripStats | null
  fieldLogFetchedAt: Date | null
  fieldLogRefreshing: boolean
  fieldLogError: string | null
  onRefresh: () => void
  isDemoMode: boolean
}) {
  if (isDemoMode) return null

  const agoText = fieldLogFetchedAt ? formatRelative(fieldLogFetchedAt) : null

  const palette = measuredStats
    ? { bg: '#E1F5EE', border: '#A8D9C5', fg: '#0F6E56' }
    : { bg: '#FFF4D6', border: '#F1D79A', fg: '#7a5a00' }

  const mainText = measuredStats
    ? `Measured from Field Log · ${measuredStats.measuredTripCount} trips in last ${measuredStats.windowDays} days`
    : 'Reported values from assessment questions'

  const subText = measuredStats
    ? `Avg TAT ${Math.round(measuredStats.measuredTA)} min${measuredStats.measuredRejectPct != null ? ` · reject ${measuredStats.measuredRejectPct}%` : ' · reject rate needs 20+ trips'}`
    : 'Log at least 15 trips in the last 30 days to use measured baseline.'

  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.border}`,
      borderRadius: 0, padding: '8px 16px',
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      fontSize: '12px', color: palette.fg, minHeight: '40px',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flex: '1 1 auto', minWidth: 0 }}>
        <strong style={{ whiteSpace: 'nowrap' }}>Data basis:</strong>
        <span>{mainText}</span>
      </div>
      <span style={{ color: palette.fg, opacity: 0.75, fontSize: '11px' }}>{subText}</span>
      {agoText && (
        <span style={{ color: palette.fg, opacity: 0.6, fontSize: '11px', whiteSpace: 'nowrap' }}>
          · updated {agoText}
        </span>
      )}
      {fieldLogError && (
        <span style={{ color: '#8B3A2E', fontSize: '11px' }}>
          · {fieldLogError}
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={fieldLogRefreshing}
        style={{
          padding: '4px 10px',
          background: 'var(--white)',
          border: `1px solid ${palette.border}`,
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          color: palette.fg,
          cursor: fieldLogRefreshing ? 'not-allowed' : 'pointer',
          opacity: fieldLogRefreshing ? 0.6 : 1,
          minHeight: '30px',
        }}
      >
        {fieldLogRefreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}

function formatRelative(when: Date): string {
  const ms = Date.now() - when.getTime()
  if (ms < 10_000) return 'just now'
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  return `${h}h ${min % 60}m ago`
}
