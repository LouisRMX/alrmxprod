'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AssessmentShell from '@/components/assessment/AssessmentShell'
import type { Answers } from '@/lib/calculations'
import type { Phase } from '@/lib/questions'

// ─────────────────────────────────────────────────────────────────────────────
// Demo dataset: Al-Noor RMX, Dubai
//
// Pre-assessment (workshop): 14 core questions filled remotely by plant manager.
// On-site: All questions filled during Louis's plant visit.
//
// Plant profile:
//   10-truck fleet (8 operative), 10 h/day, 290 days/year, 22 days this month
//   Delivery radius 12 km → TARGET_TA = 78 min; actual turnaround 95 min (+17 min)
//   38 deliveries/day, 7 m³ trucks → ~5,900 m³/month
//   Rated capacity 30 m³/hr → utilisation ~89%, just below 92% target
//   Contribution margin: $68 − $26 − $7 − $3 = $32/m³
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
  mixer_capacity:     '7',
  deliveries_day:     '42',
  turnaround:         '95',
  reject_pct:         '3.8',
  dispatch_tool:      'Spreadsheet combined with WhatsApp',
  order_to_dispatch:  '25 to 40 minutes — slow',
  prod_data_source:   'System records — read from batch computer or dispatch system',
  biggest_pain:       'Trucks are always late returning and we lose orders in the afternoons.',
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
  delivery_radius:    '10',
  partial_load_size:  '6.5',
  site_wait_time:     '55',
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
`Al-Noor RMX scores 75/100. The plant's 10-truck fleet is producing 6,400 m³ per month at 89% utilisation against a 92% target. Fleet turnaround time is the primary financial constraint at 95 minutes — 20 minutes above the 75-minute benchmark for a 10 km delivery radius — costing an estimated $62,000 per month in lost delivery capacity. Rejection losses add a further $18,000/month. Total recoverable margin is approximately $80,000 per month from operational improvements alone, without capital investment.`,

  diagnosis:
`Fleet (primary financial driver): The 95-minute turnaround is 20 minutes above the 75-minute benchmark for a 10 km delivery radius. Site wait time of 55 minutes is the single largest component — above the 40-minute industry benchmark — and the plant has no enforced demurrage clause despite one existing in contracts. Each excess minute of turnaround costs approximately $3,100/month. Bringing turnaround to 80 minutes — a realistic 90-day target — would recover an estimated $46,000/month.

Dispatch (lowest score at 52/100): Order-to-dispatch averaging 32 minutes against a 15-minute target is the most visible gap. Deliveries are routed ad hoc with no zone system, and dispatch runs on WhatsApp and spreadsheet with no real-time tracking.

Quality: A 3.8% rejection rate at $68/m³ with the plant absorbing 100% of write-off costs amounts to approximately $18,000/month. The dominant cause is heat-related stiffening during transit — expected in GCC summer — but the plant has only partial cooling measures (cold tap water and shaded aggregate storage).

Production: Utilisation at 89% is close to the 92% target but constrained downstream by the turnaround bottleneck. Three truck breakdowns last month on an informally maintained fleet, combined with 20% fleet unavailability (2 trucks regularly off-road), suggest reactive rather than preventive maintenance.`,

  actions:
`1. Demurrage enforcement (Week 1): Formalise the existing contract clause. Set a 45-minute site limit with a $25/15-min charge. A firm conversation with the top 3 contractors recovers this within 30 days.

2. Dispatch SOP — order-to-dispatch under 20 minutes (Week 1–2): Pre-load 3 trucks before first orders are confirmed. Assign a dedicated dispatcher. Target: under 20 minutes by Week 4.

3. Turnaround audit (Week 1–2): Time-stamp 3 full truck cycles. Identify where the 95 minutes goes — typically 8–12 minutes are recoverable at weighbridge queuing and washout handover. Target: under 82 minutes within 30 days.

4. Zone-based dispatch routing (Week 3–4): Cluster consecutive deliveries by area. Reduces transit per cycle by an estimated 8–12 minutes.

5. Preventive maintenance schedule (Week 2): Create a 4-week rotating service schedule. Three breakdowns per month on an 8-operative fleet is 37.5% above the 2-per-month benchmark.

6. Activate 90-day tracking: Baselines established — turnaround 95 min, rejection rate 3.8%, dispatch time 32 min. Weekly logging takes 5 minutes and creates the before/after case study.`,
}

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

  const cfg = PHASE_CONFIG[demoPhase]

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>

      {/* Top bar */}
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

      {/* Phase context banner */}
      <div style={{
        background: demoPhase === 'workshop' ? '#EFF6FF' : '#F0FDF4',
        borderBottom: `1px solid ${demoPhase === 'workshop' ? '#BFDBFE' : '#BBF7D0'}`,
        padding: '8px 20px', fontSize: '12px',
        color: demoPhase === 'workshop' ? '#1E40AF' : '#166534',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ fontSize: '16px' }}>{demoPhase === 'workshop' ? '📋' : '🏭'}</span>
        <div>
          <strong>{cfg.label}:</strong> {cfg.sublabel}
          {demoPhase === 'workshop' && (
            <span style={{ marginLeft: '12px', opacity: 0.7 }}>
              → Click <strong>Start on-site visit</strong> to see the full diagnostic
            </span>
          )}
          {demoPhase === 'onsite' && (
            <span style={{ marginLeft: '12px', opacity: 0.7 }}>
              All data is live — edit any answer and the scores update instantly
            </span>
          )}
        </div>
      </div>

      {/* Assessment shell — key forces full remount when phase switches */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AssessmentShell
          key={demoPhase}
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
        />
      </div>
    </div>
  )
}
