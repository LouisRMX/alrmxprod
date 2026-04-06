/**
 * Follow-up Assessment Questions
 * Short-form questionnaire used for 60-day outcome capture after a baseline assessment.
 * Only asks for key operational metrics that show improvement — actual measured values, not ranges.
 */

import type { Section } from './questions'

export const FOLLOWUP_QUESTIONS: Section[] = [
  {
    id: 'followup_ops',
    label: 'Operational metrics — enter actual measured values',
    qs: [
      {
        id: 'turnaround',
        label: 'Actual average truck turnaround',
        hint: 'Log departure and return times for 10+ trips and take the average',
        type: 'num',
        unit: 'min',
        req: true,
      },
      {
        id: 'deliveries_day',
        label: 'Actual average deliveries per day',
        hint: 'Take last 4 weeks of delivery records, divide total by working days',
        type: 'num',
        unit: 'del/day',
        req: true,
      },
      {
        id: 'order_to_dispatch',
        label: 'Actual average order-to-dispatch time',
        hint: 'Record order receipt vs. batch start time for 20 orders',
        type: 'num',
        unit: 'min',
      },
      {
        id: 'reject_pct',
        label: 'Actual reject/return rate',
        hint: 'Loads rejected or returned as a % of total deliveries last month',
        type: 'num',
        unit: '%',
      },
      {
        id: 'actual_prod',
        label: 'Monthly production volume (last 4 weeks)',
        type: 'num',
        unit: 'm³',
      },
      {
        id: 'n_trucks',
        label: 'Operative trucks now',
        hint: 'Trucks currently available and road-worthy',
        type: 'num',
        unit: 'trucks',
      },
    ],
  },
  {
    id: 'followup_changes',
    label: 'What changed',
    qs: [
      {
        id: 'dispatch_tool',
        label: 'Dispatch tool currently in use',
        hint: 'Name the system or method now used to coordinate drivers',
        type: 'text',
      },
      {
        id: 'biggest_win',
        label: 'Biggest operational change since the baseline assessment',
        hint: 'Describe the single most impactful thing that changed',
        type: 'text',
      },
    ],
  },
]
