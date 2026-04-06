'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DevRoleSwitcher from '@/components/DevRoleSwitcher'
import AssessmentShell from '@/components/assessment/AssessmentShell'
import ModeTabs, { type AssessmentMode } from '@/components/assessment/ModeTabs'
import PlantOverviewView, { type PlantCardData } from '@/components/plants/PlantOverviewView'
import type { Answers } from '@/lib/calculations'
import type { Phase } from '@/lib/questions'
import type { MemberRole } from '@/lib/getEffectiveMemberRole'
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
// Demo dataset: Al-Noor RMX, Riyadh (Saudi Arabia)
//
// Pre-assessment (workshop): core questions filled remotely by plant manager.
// On-site: All questions filled during Louis's plant visit.
//
// Plant profile (Saudi mid-size, Vision 2030 supply zone):
//   20-truck fleet (17 operative), 10 h/day, 245 days/year, 20 days this month
//   Deliveries mostly 12–20 km (suburban/outer city) → TARGET_TA = 84 min
//   Actual turnaround: 100–125 min range (calc midpoint 112 min → +28 min excess)
//   86 deliveries/day, actual_prod 10,000 m³/month → effectiveMixCap ≈ 5.8 m³
//   Rated capacity 75 m³/hr → utilisation ~84%, close to 85% target
//   Contribution margin: $60 − $23 − $12 − $5 = $20/m³ (fuel further reduces)
//   dispatch score ≈ 48 (< 65) → dispatch issue fires: bnLoss = TA $58k + 35%×cap $36k = $94k
//   rejectLeak ≈ $21k/month (independent) → total recoverable = $94k + $21k = $115k/month
//   scores: prod ≈ 82, dispatch ≈ 48, fleet ≈ 71, quality ≈ 70 → overall ≈ 68
// ─────────────────────────────────────────────────────────────────────────────

// The questions sent to the plant before the visit (PRE_ASSESSMENT_IDS)
const WORKSHOP_ANSWERS: Answers = {
  price_m3:           '60',
  cement_cost:        '23',
  aggregate_cost:     '12',
  admix_cost:         '5',
  plant_cap:          '75',
  actual_prod:        '10000',
  op_hours:           '10',
  op_days:            '245',
  n_trucks:           '20',
  deliveries_day:     '86',
  turnaround:         '100 to 125 minutes — slow',
  reject_pct:         '3.5',
  delivery_radius:    'Most deliveries 12 to 20 km — suburban / outer city',
  dispatch_tool:      'Spreadsheet combined with WhatsApp',
  order_to_dispatch:  '25 to 40 minutes — slow',
  prod_data_source:   'System records — read from batch computer or dispatch system',
  biggest_pain:       'Trucks are stuck at construction sites during the morning peak and we lose afternoon orders — especially in summer.',
  demand_sufficient:  'Operations — we have more demand than we can currently produce or deliver',
}

// Full dataset — the above + everything gathered during the on-site visit
const ONSITE_ANSWERS: Answers = {
  ...WORKSHOP_ANSWERS,

  // Economics depth
  aggregate_cost:     '12',
  admix_cost:         '5',
  fuel_per_delivery:  '5',
  water_cost:         '0',
  silo_days:          '5 to 10 days — adequate',
  aggregate_days:     '2 to 5 days — tight, supply-sensitive',
  mix_split:          'Mostly standard strength — over 70% is C20 to C30',
  ramadan_schedule:   'Partially — informal earlier start, no formal plan',
  working_days_month: '20',
  typical_month:      'Yes — normal month, representative of typical operations',

  // Fleet depth
  truck_availability: '17',
  qualified_drivers:  '16',
  delivery_radius:    'Most deliveries 12 to 20 km — suburban / outer city',
  partial_load_size:  '6.5',
  site_wait_time:     '52',
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
  truck_breakdowns:   '4',
  return_liability:   'Plant always absorbs the cost',
  demurrage_policy:   'Clause exists but rarely enforced',
  top_customer_pct:   '41',
  quality_control:    'Usually done — most trucks, informal recording',
  reject_cause:       'Heat and slump loss during transit — loads batched before 09:00 arriving outside spec at peak summer sites',
  surplus_concrete:   '0.2 to 0.5 m³ — moderate',
  summer_cooling:     'Partial — cold tap water or shaded aggregate storage only',
  breakdowns:         '2 to 3 — acceptable',

  // Data quality
  data_freshness:     "Today's operation — figures from this visit",
  data_observed:      'Seen on screen — batch computer, dispatch system, or printout',
  data_crosscheck:    'Partially — one or two figures cross-checked',
  data_confidence_self: "Medium — reasonable but I'd verify one or two before presenting",
  data_days_match:    'Yes — all from the same month',
  summer_prod_drop:   '20 to 30% — significant drop during June–September',
}

// Focus actions — curated from on-site findings (seeded into ActionBoard for demo)
const DEMO_FOCUS_ACTIONS = [
  'Implement dispatch SOP: order-to-dispatch under 20 min. Pre-load 3 trucks before first orders and assign a dedicated dispatcher with a fixed zone map.',
  'Enforce demurrage clause: 45-min site limit with $25/15-min charge. Communicate to top 3 contractors this week.',
  'Run turnaround audit: time-stamp 5 full truck cycles and map where the 112 minutes goes before committing to further actions.',
]

// Report — only available after on-site visit
const ONSITE_REPORT = {
  executive:
`Al-Noor scores 68/100. Dispatch coordination is the primary financial constraint — order-to-dispatch averaging 32 minutes, no zone routing, and uncoordinated site scheduling lock the 20-truck fleet into a 112-minute turnaround cycle that is 28 minutes above benchmark. Together, these cost an estimated $94,000 per month in lost delivery capacity and untapped plant utilisation. Rejection losses from summer heat add a further $21,000/month. Total recoverable margin is approximately $115,000 per month from operational changes alone, without capital investment.`,

  diagnosis:
`Dispatch (primary financial driver — 48/100): Order-to-dispatch averaging 32 minutes against a 15-minute target. Deliveries are allocated ad hoc with no zone system, and the operation runs entirely on WhatsApp and spreadsheet with no real-time tracking. The 32-minute dispatch delay is the upstream cause of the 112-minute turnaround: trucks leave late, arrive late, and contractors have no visibility to prepare sites. Fixing dispatch is the highest-leverage single action available — estimated $94,000/month recovery from combined turnaround improvement and capacity release.

Fleet: Turnaround at 112 minutes is 28 minutes above the 84-minute benchmark for a 12–20 km suburban delivery radius. Site wait time of 52 minutes is the largest component, driven by uncoordinated site handover and no demurrage enforcement despite a clause existing in contracts. This is the direct downstream consequence of the dispatch problem — both must be addressed together.

Quality: A 3.5% rejection rate at $60/m³ with the plant absorbing 100% of write-off costs amounts to approximately $21,000/month. The dominant cause is heat-related slump loss during the extended 112-minute cycle — compounded by summer temperatures exceeding 40°C and the absence of a consistent retarder protocol. The rejection rate will partially improve as turnaround shortens.

Production: Utilisation at 84% is constrained downstream by turnaround — the fleet cannot complete enough cycles to consistently load the plant. Four truck breakdowns last month on an informally maintained fleet indicates reactive rather than preventive maintenance.`,

  actions:
`1. Dispatch SOP — order-to-dispatch under 20 minutes (Week 1–2): Pre-load 3 trucks before first orders of the day. Assign a dedicated dispatcher with a fixed zone map for the 12–20 km delivery area — cluster morning and afternoon runs by quadrant. Target: under 20 minutes by Week 4. This is the single highest-leverage action.

2. Demurrage enforcement (Week 1): Formalise the existing contract clause. A firm 45-minute site limit with a $25/15-min charge, communicated to the top 3 contractors, recovers 10–15 minutes of site wait within 30 days. No capital required.

3. Turnaround audit (Week 1–2): Time-stamp 5 full truck cycles with the plant manager present. Map where the 112 minutes goes — site wait, transit, weighbridge queue, washout. Identify the top 2 recoverable components before committing to an action sequence.

4. Retarder protocol for summer loads (Week 1): Flag all loads with expected site arrival after 10:00 AM during June–September. Batch plant operator confirms retarder addition before drum rotation starts. The 3.5% rejection rate is directly linked to heat-related slump failure — a documented protocol reduces this within 30 days.

5. Zone-based routing (Week 3–4): Systematic area clustering reduces transit per cycle by an estimated 10–14 minutes for the suburban delivery pattern.

6. Preventive maintenance schedule (Week 2): Create a 4-week rotating service schedule. Four breakdowns per month on a 20-truck fleet is above benchmark and keeps capacity off-road at peak demand hours.

7. Activate 90-day tracking: Baselines set — turnaround 112 min, rejection rate 3.5%, dispatch time 32 min. Weekly logging takes 5 minutes and creates the before/after case study.`,
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo plant fleet (also used by /demo/plants page)
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_PLANTS: PlantCardData[] = [
  // ── Core 3 (always shown) ────────────────────────────────────────────────
  { id: 'dp-1',  name: 'Al-Noor Riyadh North', country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo',   phase: 'onsite',   overall: 68, scores: { prod: 82, dispatch: 48, logistics: 71, fleet: 71, quality: 70 },
      bottleneck: 'dispatch', constraintDetail: '32 min order-to-dispatch · target 15 min',
      ebitda_monthly: 115000, report_released: true, trackingWeek: 7, recoveredMonthly: 60000,
      primaryActionStatus: 'in_progress',
      topAction: 'Enforce 45-min site limit with demurrage charge — communicate to top 3 contractors this week',
      trackingImprovement: { turnaroundDelta: -12, dispatchDelta: -7, weekOf: 7, weekTotal: 12 },
      kpi: { dispatchMin: 32, turnaroundMin: 112, rejectPct: 3.0, utilPct: 84 } } },
  { id: 'dp-2',  name: 'Al-Noor Riyadh East',  country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-2', phase: 'onsite',   overall: 54, scores: { prod: 68, dispatch: 34, logistics: 52, fleet: 52, quality: 61 },
      bottleneck: 'dispatch',
      ebitda_monthly: 103000, report_released: false, trackingWeek: null, recoveredMonthly: 19000,
      primaryActionStatus: 'todo',
      topAction: 'Run turnaround audit: time-stamp 5 full truck cycles and map where the 125 min goes',
      kpi: { dispatchMin: 38, turnaroundMin: 125, rejectPct: 2.9, utilPct: 82 } } },
  { id: 'dp-3',  name: 'Al-Noor Dammam',        country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-3', phase: 'onsite',   overall: 44, scores: { prod: 62, dispatch: 42, logistics: 29, fleet: 29, quality: 44 },
      bottleneck: 'fleet',
      ebitda_monthly: 141000, report_released: false, trackingWeek: null,
      primaryActionStatus: 'todo',
      topAction: 'Schedule fleet routing audit with transport manager — map where the 140 min is lost',
      kpi: { turnaroundMin: 140, dispatchMin: 22, rejectPct: 2.8, utilPct: 78 } } },
  // ── Extended 10 ─────────────────────────────────────────────────────────
  { id: 'dp-4',  name: 'Al-Noor Jeddah',        country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-4', phase: 'complete', overall: 83, scores: { prod: 88, dispatch: 79, logistics: 85, fleet: 85, quality: 80 },
      bottleneck: null,
      ebitda_monthly: 14000, report_released: true, trackingWeek: 13, recoveredMonthly: 11000,
      primaryActionStatus: 'done',
      kpi: { turnaroundMin: 91, dispatchMin: 14, rejectPct: 1.9, utilPct: 83 } } },
  { id: 'dp-5',  name: 'Al-Noor Al Khobar',     country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-5', phase: 'onsite',   overall: 61, scores: { prod: 74, dispatch: 65, logistics: 59, fleet: 59, quality: 47 },
      bottleneck: 'quality',
      ebitda_monthly: 54000, report_released: false, trackingWeek: 3, recoveredMonthly: 9000,
      primaryActionStatus: 'in_progress',
      topAction: 'Increase retarder dosage on all loads with expected site arrival after 10:00 AM during summer',
      kpi: { rejectPct: 4.2, dispatchMin: 19, turnaroundMin: 100, utilPct: 79 } } },
  { id: 'dp-6',  name: 'Al-Noor Makkah',        country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-6', phase: 'complete', overall: 78, scores: { prod: 72, dispatch: 81, logistics: 83, fleet: 83, quality: 77 },
      bottleneck: 'prod',
      ebitda_monthly: 36000, report_released: true, trackingWeek: 11, recoveredMonthly: 22000,
      primaryActionStatus: 'in_progress',
      kpi: { utilPct: 72, dispatchMin: 16, turnaroundMin: 96, rejectPct: 2.5 } } },
  { id: 'dp-7',  name: 'Al-Noor Madinah',       country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-7', phase: 'onsite',   overall: 66, scores: { prod: 77, dispatch: 71, logistics: 62, fleet: 62, quality: 54 },
      bottleneck: 'quality',
      ebitda_monthly: 62000, report_released: false, trackingWeek: null,
      primaryActionStatus: 'todo',
      topAction: 'Start logging every rejection with cause code from tomorrow — add one line per return to the dispatch sheet',
      kpi: { rejectPct: 3.8, dispatchMin: 20, turnaroundMin: 98, utilPct: 80 } } },
  { id: 'dp-8',  name: 'Al-Noor Jubail',        country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-8', phase: 'complete', overall: 88, scores: { prod: 91, dispatch: 86, logistics: 89, fleet: 89, quality: 86 },
      bottleneck: null,
      ebitda_monthly: 9000, report_released: true, trackingWeek: 13, recoveredMonthly: 7000,
      primaryActionStatus: 'done',
      kpi: { turnaroundMin: 86, dispatchMin: 13, rejectPct: 1.5, utilPct: 87 } } },
  { id: 'dp-9',  name: 'Al-Noor Yanbu',         country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-9', phase: 'onsite',   overall: 57, scores: { prod: 70, dispatch: 59, logistics: 43, fleet: 43, quality: 55 },
      bottleneck: 'fleet',
      ebitda_monthly: 89000, report_released: false, trackingWeek: null,
      primaryActionStatus: 'todo',
      topAction: 'Map truck cycle: time-stamp site wait, transit, weighbridge and washout on 5 consecutive trips',
      kpi: { turnaroundMin: 135, dispatchMin: 21, rejectPct: 2.2, utilPct: 80 } } },
  { id: 'dp-10', name: 'Al-Noor NEOM',          country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-10', phase: 'workshop', overall: null, scores: null, bottleneck: null,
      ebitda_monthly: null, report_released: false, trackingWeek: null } },
  // ── Extended 20 ─────────────────────────────────────────────────────────
  { id: 'dp-11', name: 'Al-Noor Tabuk',         country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-11', phase: 'onsite',  overall: 59, scores: { prod: 67, dispatch: 55, logistics: 48, fleet: 48, quality: 63 },
      bottleneck: 'fleet',
      ebitda_monthly: 97000, report_released: false, trackingWeek: null,
      primaryActionStatus: 'todo',
      kpi: { turnaroundMin: 128, dispatchMin: 21, rejectPct: 2.0, utilPct: 81 } } },
  { id: 'dp-12', name: 'Al-Noor Taif',          country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-12', phase: 'onsite',  overall: 72, scores: { prod: 80, dispatch: 74, logistics: 69, fleet: 69, quality: 66 },
      bottleneck: 'quality',
      ebitda_monthly: 41000, report_released: true, trackingWeek: 5, recoveredMonthly: 12000,
      primaryActionStatus: 'in_progress',
      kpi: { rejectPct: 3.2, dispatchMin: 18, turnaroundMin: 97, utilPct: 81 } } },
  { id: 'dp-13', name: 'Al-Noor Buraidah',      country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-13', phase: 'workshop', overall: null, scores: null, bottleneck: null,
      ebitda_monthly: null, report_released: false, trackingWeek: null } },
  { id: 'dp-14', name: 'Al-Noor Al Ahsa',       country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-14', phase: 'onsite',  overall: 49, scores: { prod: 58, dispatch: 38, logistics: 44, fleet: 44, quality: 56 },
      bottleneck: 'dispatch',
      ebitda_monthly: 118000, report_released: false, trackingWeek: null,
      primaryActionStatus: 'todo',
      kpi: { dispatchMin: 36, turnaroundMin: 118, rejectPct: 2.5, utilPct: 83 } } },
  { id: 'dp-15', name: 'Al-Noor Hail',          country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-15', phase: 'complete', overall: 81, scores: { prod: 85, dispatch: 78, logistics: 83, fleet: 83, quality: 79 },
      bottleneck: null,
      ebitda_monthly: 19000, report_released: true, trackingWeek: 13, recoveredMonthly: 14000,
      primaryActionStatus: 'done',
      kpi: { turnaroundMin: 88, dispatchMin: 14, rejectPct: 1.7, utilPct: 86 } } },
  { id: 'dp-16', name: 'Al-Noor Jizan',         country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-16', phase: 'onsite',  overall: 63, scores: { prod: 75, dispatch: 60, logistics: 57, fleet: 57, quality: 62 },
      bottleneck: 'fleet',
      ebitda_monthly: 73000, report_released: false, trackingWeek: null,
      primaryActionStatus: 'todo',
      kpi: { turnaroundMin: 118, dispatchMin: 19, rejectPct: 2.4, utilPct: 82 } } },
  { id: 'dp-17', name: 'Al-Noor Sakaka',        country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-17', phase: 'workshop', overall: null, scores: null, bottleneck: null,
      ebitda_monthly: null, report_released: false, trackingWeek: null } },
  { id: 'dp-18', name: 'Al-Noor Najran',        country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-18', phase: 'onsite',  overall: 55, scores: { prod: 64, dispatch: 52, logistics: 47, fleet: 47, quality: 59 },
      bottleneck: 'fleet',
      ebitda_monthly: 86000, report_released: false, trackingWeek: null,
      primaryActionStatus: 'todo',
      kpi: { turnaroundMin: 122, dispatchMin: 20, rejectPct: 2.6, utilPct: 79 } } },
  { id: 'dp-19', name: 'Al-Noor Abha',          country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-19', phase: 'onsite',  overall: 76, scores: { prod: 83, dispatch: 77, logistics: 72, fleet: 72, quality: 71 },
      bottleneck: 'quality',
      ebitda_monthly: 28000, report_released: true, trackingWeek: 9, recoveredMonthly: 15000,
      primaryActionStatus: 'in_progress',
      kpi: { rejectPct: 3.5, dispatchMin: 17, turnaroundMin: 94, utilPct: 82 } } },
  { id: 'dp-20', name: 'Al-Noor Arar',          country: 'SA', assessmentHref: '/demo',
    assessment: { id: 'demo-20', phase: 'workshop', overall: null, scores: null, bottleneck: null,
      ebitda_monthly: null, report_released: false, trackingWeek: null } },
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

interface DemoViewProps {
  userRole?: MemberRole | null
  isOverridden?: boolean
}

export default function DemoView({ userRole = null, isOverridden = false }: DemoViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('workshop')

  // Allowed modes per role — mirrors AssessmentShell logic
  const allowedModes: AssessmentMode[] = userRole === 'owner'
    ? ['report', 'simulator', 'track']
    : userRole === 'operator'
    ? ['track']
    : ['questions', 'report', 'simulator', 'track']

  // Everyone starts on All plants by default
  const defaultView: 'plants' | AssessmentMode =
    userRole === 'operator' ? 'track'
    : searchParams.get('view') === 'report' ? 'report'
    : searchParams.get('view') === 'simulator' ? 'simulator'
    : searchParams.get('view') === 'track' ? 'track'
    : 'plants'

  // 'plants' shows the portfolio overview; any AssessmentMode shows the assessment
  const [demoView, setDemoView] = useState<'plants' | AssessmentMode>(defaultView)
  const [demoPlantCount, setDemoPlantCount] = useState<1 | 3 | 10 | 20>(1)

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
          justifyContent: 'space-between',
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
          <button onClick={handleSignOut} style={{
            fontSize: '11px', color: 'rgba(255,255,255,0.7)',
            background: 'none', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '5px', padding: '3px 8px', cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}>
            Sign out
          </button>
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
              Al-Noor RMX · Riyadh
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

      {/* Phase context banner — hidden for owner (they see report/track only) */}
      {userRole !== 'owner' && (
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
      )}

      {/* Persistent tab row — always visible */}
      <ModeTabs
        activeMode={demoView === 'plants' ? ('' as AssessmentMode) : demoView}
        onSwitch={(m) => { if (allowedModes.includes(m)) setDemoView(m) }}
        allowedModes={allowedModes}
        extraTab={userRole !== 'operator' ? {
          label: 'All plants',
          shortLabel: 'All plants',
          onClick: () => setDemoView('plants'),
          active: demoView === 'plants',
        } : undefined}
      />

      {/* Plants overview */}
      {demoView === 'plants' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <PlantOverviewView
            plants={DEMO_PLANTS.slice(0, demoPlantCount)}
            customerName="Al-Noor RMX Group"
            isDemo
            demoPlantCount={demoPlantCount}
            onDemoPlantCountChange={setDemoPlantCount}
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
            customerId="demo-customer"
            report={demoPhase === 'onsite' ? ONSITE_REPORT : null}
            reportReleased={demoPhase === 'onsite'}
            isAdmin={!userRole}
            userRole={userRole ?? undefined}
            onSave={() => { /* no-op in demo */ }}
            onAnswersChange={handleAnswersChange}
            demoBanner={demoBanner}
            hideModeTabs
            requestMode={demoView as AssessmentMode}
            focusActions={demoPhase === 'onsite' ? DEMO_FOCUS_ACTIONS : null}
          />
        </div>
      )}

      <DevRoleSwitcher viewAs={userRole} isOverridden={isOverridden} />
    </div>
  )
}
