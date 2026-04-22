/**
 * OMIX on-site field guide.
 *
 * Hardcoded execution manuscript for the April 26-30 Riyadh visit. Not an
 * AI-generated template yet — that comes after Louis has used this in the
 * field and knows what actually works. See `FieldGuideView` for how this
 * renders.
 *
 * Design principles (carried through from the "field mode vs board mode"
 * split discussed before the trip):
 * - Field primary user: whoever is on-site with the clipboard (Louis now,
 *   plant manager later).
 * - USD visible at hypothesis level (drives measurement priority), hidden
 *   at intervention level (intervention planning happens in Plan tab, not
 *   here).
 * - Hypotheses classified A/B/C by measurement type so the critical-path
 *   day 1 is about data onboarding, not stopwatch observation.
 * - Day-by-day gates explicitly name what "done" looks like so the guide
 *   is usable without Louis in the room to explain.
 */

export type MeasurementType = 'A' | 'B' | 'C'

export interface FieldGuideHypothesis {
  id: string
  name: string
  usd_per_month: number
  invalidation_time_hours: number
  invalidation_time_label: string
  measurement_type: MeasurementType
  measurement_method: string
  validate_if: string
  invalidate_if: string
  data_dependencies: string[]
  field_priority: number
  related_plan_hypothesis: string
  notes_prompt: string
}

export interface FieldGuideGate {
  id: string
  criterion: string
  fail_action: string
}

export interface FieldGuideSlot {
  start: string
  end: string
  activity: string
  purpose: string
  refs?: string[]
  gate?: FieldGuideGate
}

export interface FieldGuideDay {
  id: string
  label: string
  date_placeholder: string
  focus: string
  slots: FieldGuideSlot[]
  end_of_day_gates: FieldGuideGate[]
}

export interface FieldGuideInterview {
  id: string
  role: string
  when: string
  duration_min: number
  objective: string
  questions: string[]
  hand_off: string
}

export interface FieldGuidePreArrival {
  id: string
  category: 'data_request' | 'logistics' | 'packing' | 'pre_reading'
  title: string
  detail: string
  status_label: string
}

export interface FieldGuide {
  engagement: {
    customer: string
    plant_region: string
    trip_start_label: string
    trip_end_label: string
    length_days: number
    consultant: string
  }
  hypotheses: FieldGuideHypothesis[]
  pre_arrival: FieldGuidePreArrival[]
  days: FieldGuideDay[]
  interviews: FieldGuideInterview[]
  abort_scenarios: {
    id: string
    scenario: string
    if_triggered: string
    action: string
  }[]
}

// ── Hypotheses: reconciled with pre-assessment plan hypotheses ──
// Priority is determined by (invalidation-speed × expected impact ÷ cost).
// The live-log can measure type A hypotheses on the full 30-day dataset
// in hours; types B and C need manual supplementation and take days.

export const OMIX_HYPOTHESES: FieldGuideHypothesis[] = [
  {
    id: 'h1a',
    name: 'Site wait dominates TAT excess',
    usd_per_month: 64_000,
    invalidation_time_hours: 3,
    invalidation_time_label: '2-3 hours once GPS data is in the log',
    measurement_type: 'A',
    measurement_method:
      'Read median site_wait from live-log for 30 days of trips. Compare to typical 15-20 min expectation. Confirmed if median > 25 min. Invalidated if median < 15 min.',
    validate_if: 'Median site_wait across 30 days > 25 min',
    invalidate_if: 'Median site_wait < 15 min',
    data_dependencies: ['gps', 'tickets'],
    field_priority: 1,
    related_plan_hypothesis: 'H1 (TAT excess)',
    notes_prompt:
      'What does the distribution look like? Tail-heavy (few long waits) or centre-heavy (systemic)?',
  },
  {
    id: 'h1b',
    name: 'Dispatch-to-plant-exit time is material',
    usd_per_month: 44_000,
    invalidation_time_hours: 3,
    invalidation_time_label: '2-3 hours from GPS + ticket data',
    measurement_type: 'A',
    measurement_method:
      'From booking timestamp to GPS plant exit per trip, averaged over 30 days. Confirmed if > 45 min. Invalidated if < 30 min.',
    validate_if: 'Mean dispatch-to-exit > 45 min',
    invalidate_if: 'Mean dispatch-to-exit < 30 min',
    data_dependencies: ['gps', 'tickets'],
    field_priority: 2,
    related_plan_hypothesis: 'H1 (TAT excess, dispatch component)',
    notes_prompt:
      'Is there peak-hour vs off-peak variance? What fraction of trips sit at the plant > 60 min?',
  },
  {
    id: 'h3',
    name: 'Cross-plant empty running',
    usd_per_month: 44_000,
    invalidation_time_hours: 4,
    invalidation_time_label: '3-4 hours of GPS map analysis',
    measurement_type: 'A',
    measurement_method:
      'Classify each trip by origin plant vs. delivery zone vs. nearest plant. % of trips where the truck came from the NOT-nearest plant is the cross-plant waste signal.',
    validate_if: '> 15% of trucks origin from non-nearest plant',
    invalidate_if: '< 8% (plants operate mostly siloed)',
    data_dependencies: ['gps', 'tickets'],
    field_priority: 3,
    related_plan_hypothesis: 'H2 (shared-fleet inefficiency)',
    notes_prompt:
      'Which customer zones are the biggest offenders? Is it geographic or time-of-day driven?',
  },
  {
    id: 'h2',
    name: 'Partial-load waste has operational (not customer) roots',
    usd_per_month: 148_000,
    invalidation_time_hours: 8,
    invalidation_time_label: '1 day: 50-ticket review + dispatcher interview',
    measurement_type: 'B',
    measurement_method:
      'Pull 50 partial loads (<7.5 m³) from live-log. For each, classify as customer-driven (residential small pour, site access limit, pump constraint) vs. operational (dispatch pressure, batching residual, time-pressure). >40% operational means strong opportunity.',
    validate_if: '> 40% of partial loads classified as operational',
    invalidate_if: '< 20% operational (primarily customer-mix)',
    data_dependencies: ['tickets', 'dispatcher_interview'],
    field_priority: 4,
    related_plan_hypothesis: 'H3 (partial-load waste)',
    notes_prompt:
      'What are the top 3 operational reasons dispatchers cite? Any pattern by customer or route?',
  },
  {
    id: 'h1c',
    name: 'Dispatch culture adds minutes per trip',
    usd_per_month: 22_000,
    invalidation_time_hours: 6,
    invalidation_time_label: '1 morning peak observation + dispatcher interview',
    measurement_type: 'C',
    measurement_method:
      'Shadow dispatcher for full morning peak (06:30-11:00). Count interruptions/hour, informal overrides, WhatsApp touches per trip. Qualitative signal with quantitative anchors.',
    validate_if: '> 20 interruptions/hour during peak, > 3 WhatsApp touches per trip',
    invalidate_if: 'Structured flow, < 10 interruptions/hour',
    data_dependencies: ['dispatcher_shadow'],
    field_priority: 5,
    related_plan_hypothesis: 'H2 (shared-fleet inefficiency, cultural layer)',
    notes_prompt:
      'Who overrules the dispatcher and how often? What information does he WISH he had that he does not?',
  },
  {
    id: 'h5',
    name: 'Reject rate correlates with temperature or distance',
    usd_per_month: 38_000,
    invalidation_time_hours: 16,
    invalidation_time_label: '2 days: pull 3 months reject log + cross-reference',
    measurement_type: 'B',
    measurement_method:
      'Cross-tab reject incidents against batch temperature, delivery distance, time of day, driver. Visual inspection of patterns — not statistical significance, eyeball correlation.',
    validate_if: 'Visible concentration by temperature, distance, or time-of-day bucket',
    invalidate_if: 'Rejects distributed randomly across dimensions',
    data_dependencies: ['reject_log', 'tickets', 'batch_data'],
    field_priority: 6,
    related_plan_hypothesis: 'H4 (quality loss from process inconsistency)',
    notes_prompt:
      'If visible: is the driver the carrier of the pattern (behaviour), or the route (conditions)?',
  },
  {
    id: 'h4',
    name: 'Batch cycle drift constrains throughput',
    usd_per_month: 43_000,
    invalidation_time_hours: 24,
    invalidation_time_label: '2 days: 15-30 consecutive batch timings per mixer',
    measurement_type: 'C',
    measurement_method:
      'Time 15 consecutive batches on each mixer during peak. Compare to design spec. Note variance, changeover waste, recipe changes. Interview batch controller about drift triggers.',
    validate_if: 'Mean cycle > 110% of design spec, or changeover > 10 min between recipes',
    invalidate_if: 'Cycle within 105% of spec and changeover < 5 min',
    data_dependencies: ['batch_timing', 'batch_controller_interview'],
    field_priority: 7,
    related_plan_hypothesis: 'H5 (batching constraint)',
    notes_prompt:
      'Is the mixer the binding constraint, or is it upstream (aggregate delivery) or downstream (truck availability)?',
  },
]

// ── Pre-arrival checklist ──

export const OMIX_PRE_ARRIVAL: FieldGuidePreArrival[] = [
  {
    id: 'data_q1_gps',
    category: 'data_request',
    title: 'GPS export request sent',
    detail:
      'Request 30 days of GPS history for all trucks: timestamps (second resolution), lat/long every 30 sec, ignition on/off. CSV or JSON. If no GPS system or no export possible, the live-log-based measurement plan collapses and Day 1 PM shifts to manual observation.',
    status_label: 'Sent',
  },
  {
    id: 'data_q2_tickets',
    category: 'data_request',
    title: 'Batch ticket export request sent',
    detail:
      '30 days of delivery tickets: ticket id, customer, site id/postcode, plant id, order timestamp, batch start, batch end, truck id, m³, mix code. If only WhatsApp + paper, H2 ticket review falls back to direct observation on loading bay.',
    status_label: 'Sent',
  },
  {
    id: 'data_q3_rejects',
    category: 'data_request',
    title: 'Reject log request sent',
    detail:
      '3 months of reject log with free-text reasons, dates, sites, and batch temperature when recorded. Without a log, H5 drops to interview-based qualitative assessment only.',
    status_label: 'Sent',
  },
  {
    id: 'logistics_visa',
    category: 'logistics',
    title: 'Saudi eVisa confirmed',
    detail: 'eVisa issued and printed/saved to phone.',
    status_label: 'Confirmed',
  },
  {
    id: 'logistics_flight',
    category: 'logistics',
    title: 'Bahrain to Riyadh flight + hotel booked',
    detail: 'Arrival day 0, departure day 5. Hotel within 20 min commute to plant.',
    status_label: 'Booked',
  },
  {
    id: 'logistics_plant_walk',
    category: 'logistics',
    title: 'Day 0 plant walk with owner confirmed',
    detail:
      'Plant walk with owner or plant manager (NOT ops manager alone). Builds political cover for rest of week.',
    status_label: 'Confirmed',
  },
  {
    id: 'packing_laptop',
    category: 'packing',
    title: 'Laptop + charger + powerbank',
    detail: 'Data uploads and live-log use happens from the laptop. Powerbank for 4+ hour dispatcher observation.',
    status_label: 'Packed',
  },
  {
    id: 'packing_notebook',
    category: 'packing',
    title: 'Notebook + 3+ pens + clipboard',
    detail: 'One pen always runs out. Clipboard for printed ticket-review sheets and observation forms.',
    status_label: 'Packed',
  },
  {
    id: 'packing_ppe',
    category: 'packing',
    title: 'Work boots, safety vest, hard hat',
    detail:
      'Plant PPE requirement. Confirm OMIX has spare vest and hat; bring own if uncertain. Work boots: bring own or buy in Riyadh day 0 (no plant lets you walk in sneakers).',
    status_label: 'Packed',
  },
  {
    id: 'packing_stopwatch',
    category: 'packing',
    title: 'Stopwatch (backup for batch timing)',
    detail:
      'If GPS data fails or live-log cannot ingest it, stopwatch is plan B for manual TAT + batch timing. Phone works but a physical stopwatch is more discreet at the dispatcher bord.',
    status_label: 'Packed',
  },
  {
    id: 'packing_attire',
    category: 'packing',
    title: 'Conservative GCC attire',
    detail:
      'Long trousers, collared shirts, closed shoes. No t-shirts. Sun hat + sunglasses for yard walks (April-May Riyadh 35-40°C).',
    status_label: 'Packed',
  },
  {
    id: 'prereading_preassessment',
    category: 'pre_reading',
    title: 'Re-read pre-assessment report',
    detail: 'Know the modelled numbers cold before day 0. Remember: 135 min target, $218-355k band, 25 km radius are ALL modelled assumptions, not targets.',
    status_label: 'Done',
  },
]

// ── Day-by-day plan ──

export const OMIX_DAYS: FieldGuideDay[] = [
  {
    id: 'day_0',
    label: 'Day 0 — Arrival + plant walk',
    date_placeholder: 'Saturday April 26',
    focus: 'Relationships and logistics confirmation. No measurements. Earn the right to be there all week.',
    slots: [
      {
        start: 'AM',
        end: 'AM',
        activity: 'Hotel check-in',
        purpose: 'Settle, review pre-assessment report once more.',
      },
      {
        start: 'PM',
        end: 'PM',
        activity: 'Plant walk with owner or plant manager',
        purpose:
          'Earn trust. Take notes on physical layout (mixer positions, truck entry, dispatch desk). Do NOT ask about KPIs or numbers. Do not interview ops manager alone on day 0.',
      },
      {
        start: 'Late PM',
        end: 'Late PM',
        activity: 'Confirm data exports ready for Monday morning',
        purpose:
          'Touch base with IT or data owner. Escalate IMMEDIATELY if any export missing — day 1 without data is day lost.',
        gate: {
          id: 'd0_g1_data_ready',
          criterion: 'GPS, tickets, reject log exports confirmed arriving by Monday 09:00',
          fail_action: 'Escalate to owner tonight. Shift Day 1 AM to manual observation if no data by Monday 10:00.',
        },
      },
    ],
    end_of_day_gates: [
      {
        id: 'd0_eod',
        criterion: 'Plant walk completed with owner or PM present (not ops manager alone). Data exports confirmed.',
        fail_action: 'Do not start Day 1 without the walk. Reschedule to Day 1 AM and push everything +1 day.',
      },
    ],
  },
  {
    id: 'day_1_am',
    label: 'Day 1 AM — Data onboarding + sanity check',
    date_placeholder: 'Monday April 28',
    focus: 'THE critical path day. If data onboarding fails, the week compresses to manual-only.',
    slots: [
      {
        start: '06:30',
        end: '08:30',
        activity: 'Morning-peak observation at dispatch desk',
        purpose:
          'Calibrate yourself before reading data in the afternoon. No stopwatch, no questions. Just watch and take narrative notes on tempo, interruptions, information flow.',
      },
      {
        start: '09:00',
        end: '11:00',
        activity: 'Upload GPS + tickets to live-log',
        purpose:
          'Verify TAT components calculate correctly. Formula must be 60 min + delivery_radius × 1.5 × 2 — NEVER hardcoded. Confirm site/plant geofencing correct.',
        refs: ['h1a', 'h1b', 'h3'],
      },
      {
        start: '11:00',
        end: '12:00',
        activity: 'Sanity check: 5 manual vs log trips',
        purpose:
          'Pick 5 trips with known ticket times + driver memory. Verify live-log TAT components match within ±5 min. If 2+ trips are >10 min off, data needs cleanup before trusting output.',
        gate: {
          id: 'd1am_g1_sanity',
          criterion: '5-trip sanity check passes (all within ±5 min)',
          fail_action:
            'Day 1 PM becomes data cleanup, not analysis. Type A hypotheses slip to Day 2 PM. Something from Day 2 must drop.',
        },
      },
    ],
    end_of_day_gates: [
      {
        id: 'd1am_eod',
        criterion: 'Live-log runs with validated 30-day data.',
        fail_action: 'Switch to manual plan: stopwatch + 20-trip observation across Day 1 PM and Day 2 AM.',
      },
    ],
  },
  {
    id: 'day_1_pm',
    label: 'Day 1 PM — Type A invalidation',
    date_placeholder: 'Monday April 28',
    focus: 'Read the live-log output. Kill or confirm H1a, H1b, H3 before dinner.',
    slots: [
      {
        start: '13:00',
        end: '15:00',
        activity: 'Read output on H1a (site wait), H1b (dispatch-exit), H3 (cross-plant)',
        purpose:
          'Each hypothesis has a confirmed / invalidated / needs deeper dive verdict by 15:00. Write a 1-page fate note to yourself.',
        refs: ['h1a', 'h1b', 'h3'],
      },
      {
        start: '15:00',
        end: '17:00',
        activity: 'Fate note + replan remaining 4 days',
        purpose:
          'Based on what died vs lived, adjust Day 2-5. If H1a died, partial_load interview on Day 2 gets more time. If H1a strongly confirmed, site readiness intervention gets priority.',
        gate: {
          id: 'd1pm_g1_fate',
          criterion: 'Written 1-page fate note for H1a, H1b, H3 with verdict and next step',
          fail_action:
            'Reset: did the data tell you nothing, or did you not look hard enough? Talk through output with Kurt remotely before going to dinner.',
        },
      },
    ],
    end_of_day_gates: [
      {
        id: 'd1_eod',
        criterion: 'Type A verdict complete. Days 2-5 adjusted if needed.',
        fail_action: 'Do not proceed to Day 2 until Type A is resolved. Extend if needed.',
      },
    ],
  },
  {
    id: 'day_2',
    label: 'Day 2 — Partial-load root + dispatch culture',
    date_placeholder: 'Tuesday April 29',
    focus: 'H2 ticket review + H1c dispatcher observation + interview.',
    slots: [
      {
        start: '06:30',
        end: '11:00',
        activity: 'Dispatcher shadow — full morning peak',
        purpose:
          'Sit AT the bord, not behind. Count interruptions/hour, WhatsApp touches per trip, override moments. Narrative log, not stopwatch.',
        refs: ['h1c'],
      },
      {
        start: '11:00',
        end: '13:00',
        activity: 'Partial-load ticket review (50 tickets)',
        purpose:
          'Classify each <7.5 m³ load as customer-driven vs operational. Target: know by lunch whether H2 is >40% operational.',
        refs: ['h2'],
      },
      {
        start: '14:00',
        end: '15:30',
        activity: 'Dispatcher interview (post-peak)',
        purpose:
          'Not about numbers. About decisions. "When do you send a partial load? Who overrules you? What information do you wish you had?"',
        refs: ['h2', 'h1c'],
      },
      {
        start: '15:30',
        end: '17:00',
        activity: 'Cross-reference ticket review with live-log timing',
        purpose:
          'Do operational partial loads cluster by hour-of-day, customer, or dispatcher shift? Memo it.',
        gate: {
          id: 'd2_g1_h2',
          criterion: 'H2 operational-vs-customer classification complete for 50 tickets',
          fail_action: 'Extend review to Day 3 AM if sample too small. Push H4 batch cycle to Day 4.',
        },
      },
    ],
    end_of_day_gates: [
      {
        id: 'd2_eod',
        criterion: 'H2 verdict + H1c cultural observations documented.',
        fail_action: 'Better to extend Day 2 than push forward with weak H2 data.',
      },
    ],
  },
  {
    id: 'day_3',
    label: 'Day 3 — Batch cycle + ops manager interview',
    date_placeholder: 'Wednesday April 30',
    focus: 'H4 batch timing + the politically important ops manager interview.',
    slots: [
      {
        start: '07:00',
        end: '10:00',
        activity: 'Batch cycle timing — mixer 1 during peak',
        purpose:
          '15 consecutive batches. Note cycle time, raw material load, discharge, deviations. Compare against design spec.',
        refs: ['h4'],
      },
      {
        start: '10:00',
        end: '11:00',
        activity: 'Batch controller interview',
        purpose:
          'Recipe complexity, cycle drift triggers, whether plant system captures timing data you can pull.',
        refs: ['h4'],
      },
      {
        start: '11:00',
        end: '13:00',
        activity: 'Batch cycle timing — mixer 2 and/or off-peak',
        purpose:
          'Is cycle uniform across mixers and time-of-day? Hidden variance here often explains throughput mystery.',
        refs: ['h4'],
      },
      {
        start: '14:00',
        end: '15:30',
        activity: 'Ops manager interview (politically most important)',
        purpose:
          'Owner\'s brother or equivalent. Let him explain the operation — do not test him. Close with: "What is the most important thing I need to understand before writing my report?"',
      },
      {
        start: '16:00',
        end: '17:00',
        activity: 'Senior driver #1 interview',
        purpose:
          'Site wait root causes from driver view. Dispatch quality. What makes a good day bad.',
      },
    ],
    end_of_day_gates: [
      {
        id: 'd3_eod',
        criterion: 'H4 batch timing characterised. Ops manager interview closed without conflict.',
        fail_action:
          'Ops manager relationship is worth more than one hypothesis. If tension, debrief with Kurt before Day 4.',
      },
    ],
  },
  {
    id: 'day_4',
    label: 'Day 4 — Reject correlation + end-to-end observation',
    date_placeholder: 'Thursday May 1',
    focus: 'H5 reject analysis + two qualitative end-to-end trip observations.',
    slots: [
      {
        start: '07:00',
        end: '09:00',
        activity: 'Reject log cross-tab (H5)',
        purpose:
          'Correlate rejects against batch temp, distance, time-of-day, driver. Visual pattern hunt. Not statistical — just look.',
        refs: ['h5'],
      },
      {
        start: '09:00',
        end: '14:00',
        activity: 'End-to-end trip #1',
        purpose:
          'Ride with or closely track one trip start-to-finish. Note every delay, every decision, every wait. Qualitative spine of the final report.',
      },
      {
        start: '14:00',
        end: '17:00',
        activity: 'End-to-end trip #2 (contrasting site type)',
        purpose:
          'Different site type than #1 (if #1 was high-rise, #2 should be residential or industrial). Contrast validation.',
      },
    ],
    end_of_day_gates: [
      {
        id: 'd4_eod',
        criterion: 'H5 verdict + 2 end-to-end observations documented.',
        fail_action: 'If only 1 E2E possible, prioritise the dominant site-type.',
      },
    ],
  },
  {
    id: 'day_5',
    label: 'Day 5 — Synthesis + closing meeting',
    date_placeholder: 'Friday May 2',
    focus: 'Hypothesis fate finalised. Closing meeting with owner. Handover note to yourself.',
    slots: [
      {
        start: '07:00',
        end: '10:00',
        activity: 'Third end-to-end trip (missing site type) if possible',
        purpose:
          'Fill the gap in site-type coverage. Skip if Day 4 already covered the dominant types and time is tight.',
      },
      {
        start: '10:00',
        end: '13:00',
        activity: 'Data cleanup + final hypothesis fate review',
        purpose:
          'For each of 7 hypotheses: confirmed / partial / invalidated. USD adjusted. Intervention implication. What data still missing. This becomes the report scaffold.',
        refs: ['h1a', 'h1b', 'h1c', 'h2', 'h3', 'h4', 'h5'],
      },
      {
        start: '14:00',
        end: '15:30',
        activity: 'Closing meeting with owner',
        purpose:
          'Status, not results. "Here is what we saw. Report follows in 2 weeks. Most important area I see is X." Gives owner a chance to correct before you freeze the narrative.',
        gate: {
          id: 'd5_g1_closing',
          criterion: 'Owner acknowledges the provisional findings without conflict',
          fail_action: 'If owner pushes back on findings, note it precisely and revisit in home-office before drafting.',
        },
      },
      {
        start: '16:00',
        end: '17:00',
        activity: 'Handover note to self',
        purpose:
          'What goes in report, what goes in Phase 2 plan, what needs follow-up, what was unexpected. Write it now while memory is fresh.',
      },
    ],
    end_of_day_gates: [
      {
        id: 'd5_eod',
        criterion: 'All 7 hypotheses have a fate. Closing meeting done. Handover note written.',
        fail_action: 'Do not leave Riyadh without this. Extend departure flight if needed.',
      },
    ],
  },
]

// ── Interview guides ──

export const OMIX_INTERVIEWS: FieldGuideInterview[] = [
  {
    id: 'int_dispatcher',
    role: 'Dispatcher',
    when: 'Day 2 afternoon (post-peak)',
    duration_min: 60,
    objective:
      'Understand dispatch DECISIONS (not numbers). What drives partial loads, cross-plant assignments, and time-of-day prioritisation.',
    questions: [
      'Walk me through a typical morning: what is the first decision you make at 06:30?',
      'When do you send a partial load? What triggers that decision?',
      'Who overrules your decisions? How often and what kind of calls?',
      'If you could have one extra piece of information at your desk, what would it be?',
      'What do drivers complain to you about most often?',
      'Between the two plants, do you ever send a truck from the farther plant? Why?',
      'What happens at 15:30 when afternoon restrictions lift?',
    ],
    hand_off: 'Thank them. Ask if you can sit next to them one morning next week.',
  },
  {
    id: 'int_ops_manager',
    role: 'Ops manager (owner\'s brother or equivalent)',
    when: 'Day 3 afternoon',
    duration_min: 90,
    objective:
      'Politically the most important interview of the week. Let him OWN the operation in his own words. Do not test, do not correct.',
    questions: [
      'Walk me through a typical day at the plant.',
      'What is the biggest frustration for you right now?',
      'Where do you personally think we should look first?',
      'What have you tried in the past that did not work? Why not?',
      'Who on the team do you rely on most? For what?',
      'If you could only fix one thing in the next 3 months, what would it be?',
      'What is the most important thing I need to understand before writing my report?',
    ],
    hand_off:
      'Acknowledge his framing. Say the report will reflect both data and his perspective. Signal you will show him a draft before it is finalised.',
  },
  {
    id: 'int_batch_controller',
    role: 'Batch controller',
    when: 'Day 3 mid-morning',
    duration_min: 45,
    objective:
      'Does cycle drift? What causes it? Does the plant system capture timing data?',
    questions: [
      'How many recipes are active? How often does a new one get added?',
      'What is the design cycle time for a standard C35 mix?',
      'When you see cycle slow, what is usually the cause?',
      'Can you export batch timings from the system? What format?',
      'Do you record changeover time between recipes?',
      'Any mixer difference in reliability or speed?',
    ],
    hand_off: 'Ask for read-only access to the batch controller data for the rest of the week.',
  },
  {
    id: 'int_senior_driver',
    role: 'Senior driver (5+ years tenure)',
    when: 'Day 3 late afternoon or Day 4 late afternoon',
    duration_min: 45,
    objective:
      'Ground-truth on site wait, dispatch quality, and what turns a good day into a bad one. Driver perspective is missing from data.',
    questions: [
      'When you arrive at a site and have to wait, what is the most common reason?',
      'Which customers are consistently ready when you arrive? Which are not?',
      'How often do you get dispatched on a partial load? Why, in your experience?',
      'What time of day is hardest to work? What makes it hard?',
      'If you could change one thing about dispatch, what would it be?',
      'Have you ever refused a load or had one rejected at site? What happened?',
    ],
    hand_off: 'Thank him for his time. Ask if he would be willing to show you a full trip one afternoon.',
  },
]

// ── Abort scenarios ──

export const OMIX_ABORT_SCENARIOS: FieldGuide['abort_scenarios'] = [
  {
    id: 'abort_no_gps',
    scenario: 'OMIX cannot export GPS data or system is black-box',
    if_triggered: 'Before departure or Day 0',
    action:
      'Revise plan before travel: Types A hypotheses shift to manual stopwatch observation (20 trips max across Days 1-2). Nedprioriter H1b dispatch-to-exit (needs GPS to measure cleanly). Compress Days 2-3 to fit.',
  },
  {
    id: 'abort_sanity_fails',
    scenario: 'Day 1 AM sanity check fails (live-log does not match manual verification)',
    if_triggered: 'Day 1 11:00',
    action:
      'Day 1 PM becomes data cleanup, not analysis. Type A verdicts slip to Day 2 PM. Drop one activity from Day 2 (probably H1c dispatcher shadow, which can be abbreviated).',
  },
  {
    id: 'abort_h2_customer_driven',
    scenario: 'Partial-load ticket review shows <20% operational (primarily customer-mix)',
    if_triggered: 'Day 2 13:00',
    action:
      'H2 drops from $148k to ~$30-50k opportunity. Deprioritise partial_load_elimination intervention in final report. Redirect Day 3 AM time to deeper batch cycle analysis instead.',
  },
  {
    id: 'abort_reject_log_absent',
    scenario: 'Reject log is not tracked or has <20 entries over 3 months',
    if_triggered: 'Before Day 4 or Day 4 07:00',
    action:
      'H5 shifts from correlation analysis to interview-only. Spend the freed Day 4 morning on a second end-to-end trip observation instead.',
  },
  {
    id: 'abort_ops_manager_tension',
    scenario: 'Ops manager interview (Day 3) goes badly or shows resistance',
    if_triggered: 'Day 3 15:30',
    action:
      'Debrief with Kurt before Day 4. Do NOT confront in-person. Day 4 closing meeting plan may need to shift — owner-only instead of ops-manager-present. Preserve the relationship; it matters for any follow-on engagement.',
  },
  {
    id: 'abort_two_or_more_gates_fail',
    scenario: 'Two or more daily end-of-day gates fail',
    if_triggered: 'End of Day 2 or later',
    action:
      'Stop trying to salvage the original plan. Pick the 3 hypotheses with best-quality data so far and finish those thoroughly. Report fewer hypotheses validated deeply > more hypotheses validated shallowly.',
  },
]

// ── Top-level export ──

export const OMIX_FIELD_GUIDE: FieldGuide = {
  engagement: {
    customer: 'OMIX',
    plant_region: 'Riyadh Region',
    trip_start_label: 'April 26, 2026',
    trip_end_label: 'May 2, 2026',
    length_days: 5,
    consultant: 'Louis Hellmann',
  },
  hypotheses: OMIX_HYPOTHESES,
  pre_arrival: OMIX_PRE_ARRIVAL,
  days: OMIX_DAYS,
  interviews: OMIX_INTERVIEWS,
  abort_scenarios: OMIX_ABORT_SCENARIOS,
}
