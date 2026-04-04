'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AssessmentShell from '@/components/assessment/AssessmentShell'
import ModeTabs, { type AssessmentMode } from '@/components/assessment/ModeTabs'
import PlantOverviewView, { type PlantCardData } from '@/components/plants/PlantOverviewView'
import type { Answers } from '@/lib/calculations'
import type { Phase } from '@/lib/questions'
import { useIsMobile } from '@/hooks/useIsMobile'

// Compare two answer maps — returns true when every key matches
function answersMatchDefaults(current: Answers, defaults: Answers): boolean {
  const allKeys = Array.from(new Set(Object.keys(current).concat(Object.keys(defaults))))
  for (const k of allKeys) {
    const cv = current[k] ?? ''
    const dv = defaults[k] ?? ''
    if (cv !== dv) return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo dataset: Al-Noor RMX, Dubai
//
// Pre-assessment (workshop): core questions filled remotely by plant manager.
// On-site: All questions filled during Louis's plant visit.
//
// Plant profile:
//   10-truck fleet (8 operative), 10 h/day, 290 days/year, 22 days this month
//   Deliveries mostly 12–20 km (suburban/outer city) → TARGET_TA = 84 min
//   Actual turnaround: 100–125 min range (calc midpoint 112 min → +28 min excess)
//   42 deliveries/day, actual_prod 6,400 m³/month → effectiveMixCap ≈ 6.9 m³
//   Rated capacity 34 m³/hr → utilisation ~86%, close to 85% target
//   Contribution margin: $68 − $26 − $7 − $3 = $32/m³ (fuel further reduces)
//   turnaroundLeak ≈ 28 × $1,750/min = $49k/month · rejectLeak ≈ $14k/month
//   Total recoverable ≈ $63k/month
// ─────────────────────────────────────────────────────────────────────────────

// The questions sent to the plant before the visit (PRE_ASSESSMENT_IDS)
const WORKSHOP_ANSWERS: Answers = {
  price_m3:           '68',
  cement_cost:        '26',
  aggregate_cost:     '7',
  admix_cost:         '3',
  plant_cap:          '34',
  actual_prod:        '6400',
  op_hours:           '10',
  op_days:            '290',
  n_trucks:           '10',
  deliveries_day:     '42',
  turnaround:         '100 to 125 minutes — slow',
  reject_pct:         '3.8',
  delivery_radius:    'Most deliveries 12 to 20 km — suburban / outer city',
  dispatch_tool:      'Spreadsheet combined with WhatsApp',
  order_to_dispatch:  '25 to 40 minutes — slow',
  prod_data_source:   'System records — read from batch computer or dispatch system',
  biggest_pain:       'Trucks are always late returning and we lose orders in the afternoons.',
  demand_sufficient:  'Operations — we have more demand than we can currently produce or deliver',
}

// Full dataset — the above + everything gathered during the on-site visit
const ONSITE_ANSWERS: Answers = {
  ...WORKSHOP_ANSWERS,

  // Economics depth
  aggregate_cost:     '7',
  admix_cost:         '3',
  fuel_per_delivery:  '11',
  water_cost:         '0',
  silo_days:          '5 to 10 days — adequate',
  aggregate_days:     '2 to 5 days — tight, supply-sensitive',
  mix_split:          'Mostly standard strength — over 70% is C20 to C30',
  ramadan_schedule:   'Partially — informal earlier start, no formal plan',
  working_days_month: '22',
  typical_month:      'Yes — normal month, representative of typical operations',

  // Fleet depth
  truck_availability: '8',
  qualified_drivers:  '8',
  delivery_radius:    'Most deliveries 12 to 20 km — suburban / outer city',
  partial_load_size:  '6.5',
  site_wait_time:     '62',
  washout_time:       '10 to 20 minutes — standard',

  // Production depth
  batch_cycle:        'Normal — 5 to 7 minutes',
  batch_calibration:  '1 to 2 years ago',
  stops_freq:         '1 to 2 stops',
  operator_backup:    'Partially — someone could manage but has limited experience',
  mix_design_review:  '1 to 3 years ago',
  admix_strategy:     'Workability only — admixtures used to improve flow and placement',

  // Dispatch depth
  order_notice:       '4 to 24 hours — day-of or day-before',
  route_clustering:   'Sometimes — depends on the dispatcher',
  plant_idle:         'Occasionally — a few times per week',

  // Quality & maintenance
  maint_programme:    'Informal — some checks but no written programme',
  truck_breakdowns:   '3',
  return_liability:   'Plant always absorbs the cost',
  demurrage_policy:   'Clause exists but rarely enforced',
  top_customer_pct:   '38',
  quality_control:    'Usually done — most trucks, informal recording',
  reject_cause:       'Heat and stiffening during transit',
  surplus_concrete:   '0.2 to 0.5 m³ — moderate',
  summer_cooling:     'Partial — cold tap water or shaded aggregate storage only',
  breakdowns:         '2 to 3 — acceptable',

  // Data quality
  data_freshness:     "Today's operation — figures from this visit",
  data_observed:      'Seen on screen — batch computer, dispatch system, or printout',
  data_crosscheck:    'Partially — one or two figures cross-checked',
  data_confidence_self: "Medium — reasonable but I'd verify one or two before presenting",
  data_days_match:    'Yes — all from the same month',
  summer_prod_drop:   '10 to 20% — moderate drop',
}

// Report — only available after on-site visit
const ONSITE_REPORT = {
  executive:
`Al-Noor RMX scores 68/100. Fleet turnaround time is the primary financial constraint at 112 minutes — 28 minutes above the 84-minute benchmark for a suburban delivery radius — placing the plant in the bottom 25% of GCC operators. This alone costs an estimated $49,000 per month in lost delivery capacity. Rejection losses add a further $14,000/month. Total recoverable margin is approximately $63,000 per month from operational changes alone, without capital investment.`,

  diagnosis:
`Fleet (primary financial driver): Turnaround at 112 minutes is 28 minutes above the 84-minute benchmark for a 12–20 km suburban delivery radius. Site wait time of 62 minutes is the single largest component — more than 20 minutes above the 40-minute industry standard — driven by uncoordinated site handover and no demurrage enforcement despite a clause existing in contracts. Each excess minute of turnaround costs approximately $1,750/month in lost contribution. Bringing turnaround to 84 minutes — a realistic 90-day target — would recover the full $49,000/month.

Dispatch (lowest score — 48/100): Order-to-dispatch averaging 32 minutes against a 15-minute target. Deliveries are clustered ad hoc by the dispatcher with no zone system, and the operation runs on WhatsApp and spreadsheet with no real-time visibility. At 32 minutes, the plant is in the bottom 25% of GCC operators on this metric.

Quality: A 3.8% rejection rate at $68/m³ with the plant absorbing 100% of write-off costs amounts to approximately $14,000/month. The dominant cause is heat-related stiffening during the extended 112-minute cycle — a problem that will partially resolve as turnaround improves. The plant has only partial cooling measures in place.

Production: Utilisation at 86% is constrained downstream by the turnaround bottleneck — the fleet cannot complete enough cycles to consistently load the plant. Three truck breakdowns last month on an informally maintained 10-truck fleet indicates reactive rather than preventive maintenance.`,

  actions:
`1. Demurrage enforcement (Week 1): Formalise the existing contract clause. A firm 45-minute site limit with a $25/15-min charge, communicated to the top 3 contractors, recovers 15–20 minutes of site wait within 30 days. No capital required.

2. Turnaround audit (Week 1–2): Time-stamp 5 full truck cycles with the plant manager present. Map where the 112 minutes goes — site wait, transit, weighbridge queue, washout. Identify the top 2 recoverable components before committing to an action sequence.

3. Dispatch SOP — order-to-dispatch under 20 minutes (Week 2–3): Pre-load 3 trucks before first orders of the day. Assign a dedicated dispatcher. Introduce a simple zone map for the 12–20 km delivery area — cluster morning and afternoon runs by quadrant. Target: under 20 minutes by Week 5.

4. Zone-based routing (Week 3–4): Systematic area clustering reduces transit per cycle by an estimated 10–14 minutes for the suburban delivery pattern — the single largest operational lever after site wait.

5. Preventive maintenance schedule (Week 2): Create a 4-week rotating service schedule. Three breakdowns per month on an 8-operative fleet is 37.5% above the 2-per-month benchmark and keeps 20% of fleet capacity off-road at any given time.

6. Activate 90-day tracking: Baselines set — turnaround 112 min, rejection rate 3.8%, dispatch time 32 min. Weekly logging takes 5 minutes and creates the before/after case study.`,
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo plant fleet (also used by /demo/plants page)
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_PLANTS: PlantCardData[] = [
  { id: 'dp-1', name: 'Al-Noor Dubai North', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo', phase: 'onsite', overall: 68, scores: { prod: 82, dispatch: 48, logistics: 71, fleet: 71, quality: 70 }, bottleneck: 'Dispatch', ebitda_monthly: 63000, report_released: true, trackingWeek: 7 } },
  { id: 'dp-2', name: 'Al-Noor Dubai Industrial', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-2', phase: 'onsite', overall: 54, scores: { prod: 68, dispatch: 34, logistics: 52, fleet: 52, quality: 61 }, bottleneck: 'Dispatch', ebitda_monthly: 89000, report_released: false, trackingWeek: null } },
  { id: 'dp-3', name: 'Al-Noor Abu Dhabi', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-3', phase: 'complete', overall: 83, scores: { prod: 88, dispatch: 79, logistics: 85, fleet: 85, quality: 80 }, bottleneck: null, ebitda_monthly: 12000, report_released: true, trackingWeek: 13 } },
  { id: 'dp-4', name: 'Al-Noor Sharjah', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-4', phase: 'onsite', overall: 61, scores: { prod: 74, dispatch: 65, logistics: 59, fleet: 59, quality: 47 }, bottleneck: 'Quality', ebitda_monthly: 47000, report_released: false, trackingWeek: 3 } },
  { id: 'dp-5', name: 'Al-Noor Ras Al Khaimah', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-5', phase: 'onsite', overall: 44, scores: { prod: 62, dispatch: 42, logistics: 29, fleet: 29, quality: 44 }, bottleneck: 'Fleet', ebitda_monthly: 124000, report_released: false, trackingWeek: null } },
  { id: 'dp-6', name: 'Al-Noor Dubai South', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-6', phase: 'complete', overall: 78, scores: { prod: 72, dispatch: 81, logistics: 83, fleet: 83, quality: 77 }, bottleneck: 'Production', ebitda_monthly: 31000, report_released: true, trackingWeek: 11 } },
  { id: 'dp-7', name: 'Al-Noor Fujairah', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-7', phase: 'onsite', overall: 66, scores: { prod: 77, dispatch: 71, logistics: 62, fleet: 62, quality: 54 }, bottleneck: 'Quality', ebitda_monthly: 54000, report_released: false, trackingWeek: null } },
  { id: 'dp-8', name: 'Al-Noor Al Ain', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-8', phase: 'complete', overall: 88, scores: { prod: 91, dispatch: 86, logistics: 89, fleet: 89, quality: 86 }, bottleneck: null, ebitda_monthly: 8000, report_released: true, trackingWeek: 13 } },
  { id: 'dp-9', name: 'Al-Noor Ajman', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-9', phase: 'onsite', overall: 57, scores: { prod: 70, dispatch: 59, logistics: 43, fleet: 43, quality: 55 }, bottleneck: 'Fleet', ebitda_monthly: 78000, report_released: false, trackingWeek: null } },
  { id: 'dp-10', name: 'Al-Noor Umm Al Quwain', country: 'AE', assessmentHref: '/demo', assessment: { id: 'demo-10', phase: 'workshop', overall: null, scores: null, bottleneck: null, ebitda_monthly: null, report_released: false, trackingWeek: null } },
]

// ─────────────────────────────────────────────────────────────────────────────

type DemoPhase = 'workshop' | 'onsite'

const PHASE_CONFIG: Record<DemoPhase, {
  phase: Phase
  label: string
  sublabel: string
  badge: string
  badgeBg: string
  badgeColor: string
  buttonLabel: string
  buttonSub: string
}> = {
  workshop: {
    phase: 'workshop',
    label: 'Pre-assessment',
    sublabel: 'Plant manager filled in 14 core questions before the visit',
    badge: 'PRE-ASSESSMENT',
    badgeBg: 'rgba(255,255,255,0.12)',
    badgeColor: 'rgba(255,255,255,0.7)',
    buttonLabel: 'Start on-site visit →',
    buttonSub: 'Adds 30+ observations from the plant floor',
  },
  onsite: {
    phase: 'onsite',
    label: 'On-site assessment',
    sublabel: 'Full diagnostic — all data collected during plant visit',
    badge: 'ON-SITE',
    badgeBg: 'rgba(255,255,255,0.18)',
    badgeColor: '#fff',
    buttonLabel: '← Back to pre-assessment',
    buttonSub: 'See what the plant sent before the visit',
  },
}

export default function DemoView() {
  const router = useRouter()
  const supabase = createClient()
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('workshop')
  // 'plants' shows the portfolio overview; any AssessmentMode shows the assessment
  const [demoView, setDemoView] = useState<'plants' | AssessmentMode>('questions')

  // ── Demo regeneration state ─────────────────────────────────────────────
  const [demoAnswersModified, setDemoAnswersModified] = useState(false)
  const [regenCount, setRegenCount] = useState(0)
  // demoKey forces a full AssessmentShell remount on reset, restoring defaults
  const [demoKey, setDemoKey] = useState(0)

  // Reset modified flag whenever the phase switches — new phase starts clean
  useEffect(() => {
    setDemoAnswersModified(false)
  }, [demoPhase])

  const currentDefaults = demoPhase === 'workshop' ? WORKSHOP_ANSWERS : ONSITE_ANSWERS

  const handleAnswersChange = useCallback((answers: Answers) => {
    setDemoAnswersModified(!answersMatchDefaults(answers, currentDefaults))
  }, [currentDefaults])

  const handleReset = useCallback(() => {
    setDemoKey(k => k + 1)
    setDemoAnswersModified(false)
  }, [])

  const demoBanner = {
    show: demoAnswersModified,
    regenCount,
    maxRegen: 3,
    onRegenerate: () => {
      setRegenCount(c => c + 1)
      setDemoAnswersModified(false)
    },
    onReset: handleReset,
  }
  // ────────────────────────────────────────────────────────────────────────

  const cfg = PHASE_CONFIG[demoPhase]
  const isMobile = useIsMobile()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--gray-50)', overflowX: 'hidden' }}>

      {/* Top bar */}
      {isMobile ? (
        <div style={{
          background: 'var(--green)', flexShrink: 0,
          padding: '0 12px', display: 'flex', alignItems: 'center',
          height: '44px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0,
              background: 'rgba(255,255,255,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#5DCAA5' }} />
            </div>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>Al-RMX</span>
            <span style={{
              fontSize: '9px', fontWeight: 700, letterSpacing: '.4px',
              color: cfg.badgeColor, background: cfg.badgeBg,
              padding: '2px 6px', borderRadius: '3px',
            }}>
              {cfg.badge}
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--green)', padding: '0 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: '44px', flexShrink: 0, gap: '12px',
        }}>
          {/* Left: logo + phase badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
              background: 'rgba(255,255,255,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5DCAA5' }} />
            </div>
            <span style={{ color: '#fff', fontSize: '15px', fontWeight: '500', flexShrink: 0 }}>Al-RMX</span>
            <span style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '.5px',
              color: cfg.badgeColor, background: cfg.badgeBg,
              padding: '2px 7px', borderRadius: '4px', flexShrink: 0,
            }}>
              {cfg.badge}
            </span>
            <span style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.45)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              Al-Noor RMX · Dubai
            </span>
          </div>
          {/* Centre: phase switch button */}
          <button
            onClick={() => setDemoPhase(p => p === 'workshop' ? 'onsite' : 'workshop')}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px', padding: '4px 14px', cursor: 'pointer',
              fontFamily: 'var(--font)', flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{cfg.buttonLabel}</span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '1px' }}>{cfg.buttonSub}</span>
          </button>
          {/* Right: nav buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button onClick={() => router.push('/dashboard')} style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.7)',
              background: 'none', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
              Platform
            </button>
            <button onClick={handleSignOut} style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.7)',
              background: 'none', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Phase context banner */}
      <div style={{
        background: demoPhase === 'workshop' ? '#EFF6FF' : '#F0FDF4',
        borderBottom: `1px solid ${demoPhase === 'workshop' ? '#BFDBFE' : '#BBF7D0'}`,
        padding: isMobile ? '7px 12px' : '8px 20px', fontSize: '12px',
        color: demoPhase === 'workshop' ? '#1E40AF' : '#166534',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '14px', flexShrink: 0 }}>{demoPhase === 'workshop' ? '📋' : '🏭'}</span>
        <div style={{ minWidth: 0 }}>
          <strong>{cfg.label}</strong>
          {!isMobile && (
            <span style={{ marginLeft: '6px', opacity: 0.7 }}>{cfg.sublabel}</span>
          )}
          {!isMobile && demoPhase === 'workshop' && (
            <span style={{ marginLeft: '12px', opacity: 0.7 }}>
              → Click <strong>Start on-site visit</strong> to see the full diagnostic
            </span>
          )}
          {!isMobile && demoPhase === 'onsite' && (
            <span style={{ marginLeft: '12px', opacity: 0.7 }}>
              All data is live — edit any answer and the scores update instantly
            </span>
          )}
        </div>
      </div>

      {/* Persistent tab row — always visible */}
      <ModeTabs
        activeMode={demoView === 'plants' ? ('' as AssessmentMode) : demoView}
        onSwitch={(m) => setDemoView(m)}
        extraTab={{
          label: 'All plants',
          shortLabel: 'All plants',
          onClick: () => setDemoView('plants'),
          active: demoView === 'plants',
        }}
      />

      {/* Plants overview */}
      {demoView === 'plants' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <PlantOverviewView
            plants={DEMO_PLANTS}
            customerName="Al-Noor RMX Group"
            isDemo
          />
        </div>
      )}

      {/* Assessment shell — key forces full remount when phase switches or answers reset */}
      {demoView !== 'plants' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <AssessmentShell
            key={`${demoPhase}-${demoKey}`}
            initialAnswers={demoPhase === 'workshop' ? WORKSHOP_ANSWERS : ONSITE_ANSWERS}
            phase={cfg.phase}
            season="summer"
            country="UAE"
            plant="Al-Noor RMX"
            date="2025-06-15"
            assessmentId="demo"
            report={demoPhase === 'onsite' ? ONSITE_REPORT : null}
            reportReleased={demoPhase === 'onsite'}
            isAdmin={true}
            onSave={() => { /* no-op in demo */ }}
            onAnswersChange={handleAnswersChange}
            demoBanner={demoBanner}
            hideModeTabs
            requestMode={demoView as AssessmentMode}
          />
        </div>
      )}
    </div>
  )
}
