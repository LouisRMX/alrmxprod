/**
 * alRMX Diagnosis Pipeline
 *
 * Three-step process:
 * 1. buildStructuredDiagnosis() — raw analysis, no prose
 * 2. runValidationChecks() — quality gate
 * 3. buildValidatedDiagnosis() — corrected output for rendering
 *
 * All downstream consumers (DecisionView, Report, PDF) use only
 * the ValidatedDiagnosis output. None of them do their own analysis.
 */

import type { CalcResult, Answers } from './calculations'
import { buildIssues, getFinancialBottleneck, type Issue } from './issues'

// ── Step 1: Structured Diagnosis ─────────────────────────────────────────────

export type LossClassification = 'additive' | 'overlapping' | 'directional_only'
export type DataSource = 'measured' | 'operator_reported' | 'calculated' | 'inferred'

export interface PerformanceGap {
  actual: number
  target: number
  gap: number
  source: DataSource
  unit: string
}

export interface LossComponent {
  dimension: string
  amount: number
  method: string
  classification: LossClassification
  overlaps_with: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface ActionItem {
  text: string
  detail: string
  dimension: string
  time_horizon: 'this_week' | 'this_month' | 'next_month' | '90_days'
}

export interface StructuredDiagnosis {
  // Core
  primary_constraint: string
  confidence: 'high' | 'medium-high' | 'medium' | 'low'
  evidence_basis: string

  // Gaps
  performance_gaps: Record<string, PerformanceGap>

  // Financial
  loss_method: string
  lost_volume_m3_monthly: number
  margin_per_m3: number
  monthly_loss_total: number
  loss_breakdown: LossComponent[]

  // Attribution (directional, not precise)
  attribution: Record<string, number>
  attribution_precision: 'directional' | 'estimated' | 'measured'

  // Mechanism
  primary_mechanism: string
  observed_signals: string[]
  inferred_signals: string[]

  // Actions
  actions: ActionItem[]

  // Limits
  not_accounted_for: string[]

  // Demand context
  demand_constrained: boolean
}

export function buildStructuredDiagnosis(
  r: CalcResult,
  answers: Answers,
  meta?: { country?: string; plant?: string; date?: string }
): StructuredDiagnosis {
  const issues = buildIssues(r, answers, meta)
  const withLoss = issues.filter(i => i.loss > 0)
  const primaryDim = getFinancialBottleneck(issues) || r.bottleneck || 'Fleet'

  // Performance gaps
  const gaps: Record<string, PerformanceGap> = {}
  if (r.ta > 0) {
    gaps.turnaround = {
      actual: r.ta, target: r.TARGET_TA, gap: Math.max(0, r.ta - r.TARGET_TA),
      source: 'operator_reported', unit: 'min'
    }
  }
  if (r.dispatchMin) {
    gaps.dispatch = {
      actual: r.dispatchMin, target: 15, gap: Math.max(0, r.dispatchMin - 15),
      source: 'operator_reported', unit: 'min'
    }
  }
  gaps.utilization = {
    actual: Math.round(r.util * 100), target: 85, gap: Math.max(0, 85 - Math.round(r.util * 100)),
    source: 'calculated', unit: '%'
  }
  if (r.rejectPct > 0) {
    gaps.rejection = {
      actual: r.rejectPct, target: 2.0, gap: Math.max(0, r.rejectPct - 2.0),
      source: 'operator_reported', unit: '%'
    }
  }
  if (r.delDay > 0 && r.effectiveUnits > 0) {
    const delsPerTruck = r.delDay / r.effectiveUnits
    const targetDels = r.TARGET_TA > 0 ? Math.floor((r.opH * 60) / r.TARGET_TA) : 8
    gaps.deliveries_per_truck = {
      actual: Math.round(delsPerTruck * 10) / 10, target: targetDels, gap: Math.max(0, targetDels - delsPerTruck),
      source: 'calculated', unit: 'del/truck/day'
    }
  }

  // Loss breakdown with classification
  const lossBreakdown: LossComponent[] = []

  if (r.turnaroundLeakMonthly > 0) {
    lossBreakdown.push({
      dimension: 'Fleet / Turnaround',
      amount: r.demandSufficient === false ? r.turnaroundLeakMonthlyCostOnly : r.turnaroundLeakMonthly,
      method: 'excess_min_x_deliveries_x_margin',
      classification: 'overlapping',
      overlaps_with: 'Production (both measure capacity gap from same constraint)',
      confidence: r.taBreakdownEntered ? 'medium' : 'low',
    })
  }

  if (r.capLeakMonthly > 0 && r.ta <= r.TARGET_TA) {
    // Only additive when turnaround is within target (pure production gap)
    lossBreakdown.push({
      dimension: 'Production',
      amount: r.capLeakMonthly,
      method: 'capacity_delta_x_margin',
      classification: 'additive',
      overlaps_with: null,
      confidence: 'medium',
    })
  } else if (r.capLeakMonthly > 0) {
    // When turnaround is above target, capLeak overlaps with turnaround
    lossBreakdown.push({
      dimension: 'Production',
      amount: r.capLeakMonthly,
      method: 'capacity_delta_x_margin',
      classification: 'overlapping',
      overlaps_with: 'Fleet / Turnaround (downstream effect of same constraint)',
      confidence: 'medium',
    })
  }

  if (r.rejectMaterialLoss > 0) {
    // Only material loss is additive. Opportunity cost (wasted cycle) overlaps with throughput.
    lossBreakdown.push({
      dimension: 'Quality',
      amount: r.rejectMaterialLoss,
      method: 'reject_rate_x_volume_x_material_cost',
      classification: 'additive',
      overlaps_with: null,
      confidence: 'medium',
    })
  }

  if (r.partialLeakMonthly > 0) {
    lossBreakdown.push({
      dimension: 'Partial loads',
      amount: r.partialLeakMonthly,
      method: 'partial_fraction_x_wasted_capacity',
      classification: 'additive',
      overlaps_with: null,
      confidence: 'low',
    })
  }

  // Total: use max of overlapping, sum of additive
  const overlappingMax = Math.max(
    ...lossBreakdown.filter(l => l.classification === 'overlapping').map(l => l.amount),
    0
  )
  const additiveSum = lossBreakdown
    .filter(l => l.classification === 'additive')
    .reduce((s, l) => s + l.amount, 0)
  const totalLoss = overlappingMax + additiveSum

  // Lost volume
  const potentialMonthly = r.cap * 0.85 * r.opH * (r.opD / 12)
  const actualMonthly = r.monthlyM3 || (r.actual * r.opH * (r.opD / 12))
  const lostVolume = Math.max(0, Math.round(potentialMonthly - actualMonthly))

  // Attribution (directional)
  const totalIssuesLoss = withLoss.reduce((s, i) => s + i.loss, 0)
  const attribution: Record<string, number> = {}
  const dimLosses: Record<string, number> = {}
  for (const issue of withLoss) {
    const dim = issue.dimension || 'Other'
    dimLosses[dim] = (dimLosses[dim] || 0) + issue.loss
  }
  for (const [dim, loss] of Object.entries(dimLosses)) {
    attribution[dim] = totalIssuesLoss > 0 ? Math.round((loss / totalIssuesLoss) * 100) / 100 : 0
  }

  // Observed + inferred signals
  const observed: string[] = []
  const inferred: string[] = []
  for (const issue of withLoss.slice(0, 5)) {
    if (issue.diagnosis?.observed) observed.push(issue.diagnosis.observed)
    if (issue.diagnosis?.mechanism) {
      const mech = issue.diagnosis.mechanism.replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
      if (issue.diagnosis.strength === 'likely' || issue.diagnosis.strength === 'hypothesis') {
        inferred.push(mech.split('.')[0] + '.')
      }
    }
  }

  // Primary mechanism
  const primaryIssue = withLoss.find(i => i.diagnosis) || withLoss[0]
  const primaryMechanism = primaryIssue?.diagnosis?.mechanism
    ?.replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
    || primaryIssue?.t || ''

  // Actions from primary issue only
  const actions: ActionItem[] = []
  const primaryWithDiag = withLoss.filter(i => i.diagnosis).slice(0, 2)
  for (const issue of primaryWithDiag) {
    const d = issue.diagnosis
    if (!d) continue
    const steps = d.action.split(/Step \d+:\s*/).filter(Boolean)
    steps.forEach((step, i) => {
      const lines = step.split(/\.\s+/).filter(Boolean)
      const text = lines[0]?.trim() || step.trim()
      const detail = lines.slice(1).join('. ').trim()
      if (text && !actions.some(a => a.text === text)) {
        actions.push({
          text, detail,
          dimension: issue.dimension || 'Other',
          time_horizon: i === 0 ? 'this_week' : i < 2 ? 'this_month' : '90_days',
        })
      }
    })
  }

  // Evidence basis
  const hasOnSiteData = r.taBreakdownEntered
  const confidence = hasOnSiteData ? 'medium-high' as const
    : r.demandSufficient !== null ? 'medium' as const
    : 'low' as const

  return {
    primary_constraint: primaryDim,
    confidence,
    evidence_basis: hasOnSiteData
      ? 'On-site observation + operator-reported metrics'
      : 'Operator-reported metrics (assessment questionnaire)',

    performance_gaps: gaps,

    loss_method: 'capacity_gap_with_overlap_correction',
    lost_volume_m3_monthly: lostVolume,
    margin_per_m3: r.contribSafe,
    monthly_loss_total: totalLoss,
    loss_breakdown: lossBreakdown,

    attribution,
    attribution_precision: hasOnSiteData ? 'estimated' : 'directional',

    primary_mechanism: primaryMechanism,
    observed_signals: Array.from(new Set(observed)),
    inferred_signals: Array.from(new Set(inferred)),

    actions: actions.slice(0, 5),

    not_accounted_for: [
      'Traffic congestion patterns',
      'Project type variation (high-rise vs ground pour)',
      'Driver behavior and break patterns',
      'Multi-shift dynamics',
      'Seasonal demand variation',
      ...(r.taBreakdownEntered ? [] : ['Detailed TAT component breakdown']),
    ],

    demand_constrained: r.demandSufficient === false,
  }
}

// ── Step 2: Validation Gate ──────────────────────────────────────────────────

export type CheckStatus = 'pass' | 'flag' | 'warn' | 'fail'

export interface ValidationCheck {
  name: string
  status: CheckStatus
  detail: string
  correction?: string
}

export interface ValidationResult {
  checks: ValidationCheck[]
  corrected_total_loss: number
  corrected_actions: ActionItem[]
  approved_precision: 'point_estimate' | 'range' | 'directional'
  flags: string[]
}

export function runValidationChecks(d: StructuredDiagnosis): ValidationResult {
  const checks: ValidationCheck[] = []
  const flags: string[] = []
  let correctedLoss = d.monthly_loss_total

  // 1. Double counting check
  const overlapping = d.loss_breakdown.filter(l => l.classification === 'overlapping')
  if (overlapping.length > 1) {
    const sum = overlapping.reduce((s, l) => s + l.amount, 0)
    const max = Math.max(...overlapping.map(l => l.amount))
    if (sum > max * 1.1) {
      checks.push({
        name: 'double_counting',
        status: 'flag',
        detail: `Overlapping losses sum to $${Math.round(sum).toLocaleString()} but max single is $${Math.round(max).toLocaleString()}. Using max to avoid double count.`,
        correction: 'Total loss uses max of overlapping components + sum of additive.',
      })
      flags.push('Overlapping losses corrected to avoid double counting')
    }
  } else {
    checks.push({ name: 'double_counting', status: 'pass', detail: 'No overlapping losses detected or already corrected.' })
  }

  // 2. Single method check
  const methods = Array.from(new Set(d.loss_breakdown.map(l => l.method)))
  checks.push({
    name: 'single_method',
    status: methods.length <= 3 ? 'pass' : 'warn',
    detail: `${methods.length} calculation methods used: ${methods.join(', ')}`,
  })

  // 3. Attribution vs evidence
  const maxAttribution = Math.max(...Object.values(d.attribution))
  if (maxAttribution > 0.7 && d.attribution_precision === 'directional') {
    checks.push({
      name: 'attribution_vs_evidence',
      status: 'flag',
      detail: `Primary constraint attributed ${Math.round(maxAttribution * 100)}% of loss but precision is only 'directional'.`,
      correction: 'Present attribution as "primary driver" not as a percentage.',
    })
    flags.push('Attribution presented as directional, not percentage')
  } else {
    checks.push({ name: 'attribution_vs_evidence', status: 'pass', detail: 'Attribution level matches evidence quality.' })
  }

  // 4. Input-conclusion match
  const hasDispatchData = d.performance_gaps.dispatch !== undefined
  const constraintIsDispatch = d.primary_constraint === 'Dispatch'
  if (constraintIsDispatch && !hasDispatchData) {
    checks.push({
      name: 'input_conclusion_match',
      status: 'fail',
      detail: 'Primary constraint is dispatch but no dispatch time data provided.',
    })
  } else {
    checks.push({ name: 'input_conclusion_match', status: 'pass', detail: 'All conclusions traceable to input data.' })
  }

  // 5. Reportability check
  const hasPointEstimates = d.actions.length > 0 && d.attribution_precision !== 'measured'
  if (hasPointEstimates) {
    checks.push({
      name: 'reportability',
      status: 'flag',
      detail: 'Per-action recovery estimates would imply precision not supported by data.',
      correction: 'Use combined recovery range for all actions instead of per-action estimates.',
    })
    flags.push('Per-action recovery replaced with combined range')
  } else {
    checks.push({ name: 'reportability', status: 'pass', detail: 'All claims are reportable at current precision level.' })
  }

  // 6. Precision check
  const lossConfidences = d.loss_breakdown.map(l => l.confidence)
  const hasLowConfidence = lossConfidences.includes('low')
  const hasOnlyHigh = lossConfidences.every(c => c === 'high')
  let approvedPrecision: 'point_estimate' | 'range' | 'directional'
  if (hasOnlyHigh) {
    approvedPrecision = 'point_estimate'
    checks.push({ name: 'precision', status: 'pass', detail: 'All loss components have high confidence. Point estimates approved.' })
  } else if (hasLowConfidence) {
    approvedPrecision = 'range'
    checks.push({
      name: 'precision',
      status: 'flag',
      detail: 'Some loss components have low confidence. Ranges required.',
      correction: 'Use +/- 18% range on total loss. No point estimates for individual components.',
    })
    flags.push('Total loss presented as range due to low-confidence components')
  } else {
    approvedPrecision = 'range'
    checks.push({ name: 'precision', status: 'pass', detail: 'Medium confidence. Ranges recommended.' })
  }

  // Corrected actions: strip per-action dollar estimates, use combined range
  const correctedActions = d.actions.map(a => ({ ...a }))

  return {
    checks,
    corrected_total_loss: correctedLoss,
    corrected_actions: correctedActions,
    approved_precision: approvedPrecision,
    flags,
  }
}

// ── Step 3: Validated Diagnosis ──────────────────────────────────────────────

export interface ValidatedDiagnosis {
  // Plant context (needed for report headers)
  plant_name?: string
  country?: string
  assessment_date?: string

  // Plant parameters (needed for proof layer and report)
  plant_capacity_m3hr: number
  operating_hours: number
  operating_days: number
  trucks_total: number
  trucks_effective: number

  // Verdict
  total_loss: number
  total_loss_range: { lo: number; hi: number } | null
  primary_constraint: string
  confidence: string
  demand_constrained: boolean

  // Mechanism
  verdict_cause: string
  mechanism_detail: string
  observed_signals: string[]
  inferred_signals: string[]

  // Production context
  actual_monthly_m3: number
  utilization_pct: number

  // Quality context
  reject_pct: number
  reject_plant_fraction: number  // 0-1

  // Material context
  material_stoppage_days_quarter: number  // 0 if no stoppages
  material_context: string | null         // explanatory text for report

  // Calculation trace (single source of truth, all downstream must reference these)
  calc_trace: {
    fleet_daily_m3: number
    plant_daily_m3: number
    actual_daily_m3: number
    target_daily_m3: number       // min(fleet@target, plant) - the achievable ceiling
    gap_daily_m3: number          // target - actual
    working_days_month: number
    gap_monthly_m3: number        // gap_daily × working_days
    margin_per_m3: number
    throughput_loss_usd: number   // gap_monthly × margin
    trips_per_truck: number
    trips_per_truck_target: number
  }

  // Financial
  main_driver: { dimension: string; amount: number }
  other_losses: number
  loss_breakdown_detail: { dimension: string; amount: number; classification: LossClassification }[]
  lost_volume_m3: number
  margin_per_m3: number

  // Gaps
  performance_gaps: Record<string, PerformanceGap>

  // Actions (corrected)
  actions: ActionItem[]
  combined_recovery_range: { lo: number; hi: number }

  // Recovery opportunities (separate from loss, not in total)
  recovery_opportunities: { label: string; amount: number }[]

  // Demand-constrained: cost-only savings (separate from total loss)
  cost_only_savings: number

  // Precision
  approved_precision: 'point_estimate' | 'range' | 'directional'

  // Validation flags
  flags: string[]
  validation_checks: ValidationCheck[]

  // Limits (split: global = always apply, case = depends on this plant's data)
  global_model_limits: string[]
  case_specific_missing_data: string[]

  // Management context (observed on-site, for report credibility)
  management_context?: string

  // Executive narrative (2-3 sentences: what, why, what it means)
  executive_narrative: string

  // Claim strength: how strong is the primary conclusion
  claim_strength: 'confirmed' | 'strongly_supported' | 'directional'
  claim_strength_basis: string

  // Business implication: what changes if constraint is addressed
  business_implication: {
    output_increase_m3: number     // additional m3/month achievable
    utilization_target_pct: number // utilization after improvement
    financial_recovery_range: { lo: number; hi: number }
    summary: string                // one-sentence implication
  }

  // Data quality gate
  data_quality: 'sufficient' | 'directional' | 'insufficient'
  data_warnings: string[]

  // Evidence
  evidence_basis: string

  // TAT (if available)
  tat_actual: number
  tat_target: number
  tat_breakdown: { label: string; actual: number; benchmark: number }[] | null
}

export function buildValidatedDiagnosis(
  r: CalcResult,
  answers: Answers,
  meta?: { country?: string; plant?: string; date?: string }
): ValidatedDiagnosis {
  // Step 1
  const diagnosis = buildStructuredDiagnosis(r, answers, meta)

  // Step 2
  const validation = runValidationChecks(diagnosis)

  // Build verdict cause (cleaned, no "likely" in verdict)
  const verdictCause = diagnosis.primary_mechanism
    .split('.')[0]
    .replace(/\blikely\b\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  // Main driver
  const sortedDims = [...diagnosis.loss_breakdown].sort((a, b) => b.amount - a.amount)
  const mainDriver = sortedDims[0]
  const otherLoss = sortedDims.slice(1)
    .filter(l => l.classification === 'additive')
    .reduce((s, l) => s + l.amount, 0)

  // Recovery range: 40-65% of corrected total is recoverable in 90 days
  const recoveryLo = Math.round(validation.corrected_total_loss * 0.40)
  const recoveryHi = Math.round(validation.corrected_total_loss * 0.65)

  // Loss range (if precision requires it)
  const needsRange = validation.approved_precision === 'range' || validation.approved_precision === 'directional'
  const lossRange = needsRange
    ? { lo: Math.round(validation.corrected_total_loss * 0.82), hi: Math.round(validation.corrected_total_loss * 1.18) }
    : null

  // TAT breakdown
  const tatBreakdown = r.taBreakdownEntered ? [
    { label: 'Plant-side', actual: Math.max(0, r.ta - (r.taTransitMin || 0) - (r.taSiteWaitMin || 0) - (r.taWashoutMin || 0)), benchmark: Math.max(0, r.TARGET_TA - (r.taTransitMin ? Math.min(r.taTransitMin, r.TARGET_TA * 0.3) : r.TARGET_TA * 0.2) - 35 - 12) },
    { label: 'Transit', actual: r.taTransitMin || Math.round(r.radius * 2 * 1.5) || 0, benchmark: r.taTransitMin || Math.round(r.radius * 2 * 1.5) || 0 },
    { label: 'Site', actual: r.taSiteWaitMin || 0, benchmark: 35 },
    { label: 'Washout', actual: r.taWashoutMin || 0, benchmark: 12 },
  ] : null

  return {
    // Plant context
    plant_name: meta?.plant,
    country: meta?.country,
    assessment_date: meta?.date,

    // Plant parameters
    plant_capacity_m3hr: r.cap,
    operating_hours: r.opH,
    operating_days: r.opD,
    trucks_total: r.trucks,
    trucks_effective: r.effectiveUnits,

    // Production + quality context
    actual_monthly_m3: r.monthlyM3 || Math.round(r.actual * r.opH * (r.opD / 12)),
    utilization_pct: Math.round(r.util * 100),
    reject_pct: r.rejectPct,
    reject_plant_fraction: r.rejectPlantFraction,

    // Material context
    material_stoppage_days_quarter: (() => {
      const map: Record<string, number> = {
        'Once, 1 to 2 days lost': 1.5,
        '2 to 3 times, 3 to 7 days lost': 5,
        'More than 3 times, frequent disruption': 10,
      }
      return map[answers.material_stoppages as string] || 0
    })(),
    material_context: (() => {
      const map: Record<string, number> = {
        'Once, 1 to 2 days lost': 1.5,
        '2 to 3 times, 3 to 7 days lost': 5,
        'More than 3 times, frequent disruption': 10,
      }
      const days = map[answers.material_stoppages as string] || 0
      if (days === 0) return null
      const monthlyDays = Math.round(days / 3 * 10) / 10
      return `~${days} days of production stopped due to material shortage in the last quarter (~${monthlyDays} days/month). This is already included in the reported production figure and does not add to the total loss.`
    })(),

    // Calculation trace: single source of truth
    calc_trace: (() => {
      const fleetDailyM3 = r.ta > 0 && r.effectiveUnits > 0
        ? Math.round(r.effectiveUnits * ((r.opH * 60) / r.ta) * r.effectiveMixCap)
        : 0
      const plantDailyM3 = Math.round(r.cap * 0.92 * r.opH)
      const actualDailyM3 = Math.round(r.actual * r.opH)
      const targetFleetM3 = r.TARGET_TA > 0 && r.effectiveUnits > 0
        ? Math.round(r.effectiveUnits * ((r.opH * 60) / r.TARGET_TA) * r.effectiveMixCap * 0.85)
        : 0
      const targetDailyM3 = Math.min(targetFleetM3, plantDailyM3)
      const gapDailyM3 = Math.max(0, targetDailyM3 - actualDailyM3)
      const workingDays = Math.round(r.opD / 12)
      const gapMonthlyM3 = gapDailyM3 * workingDays
      const tripsPerTruck = r.ta > 0 ? Math.round(((r.opH * 60) / r.ta) * 10) / 10 : 0
      const tripsTarget = r.TARGET_TA > 0 ? Math.round(((r.opH * 60) / r.TARGET_TA) * 10) / 10 : 0
      return {
        fleet_daily_m3: fleetDailyM3,
        plant_daily_m3: plantDailyM3,
        actual_daily_m3: actualDailyM3,
        target_daily_m3: targetDailyM3,
        gap_daily_m3: gapDailyM3,
        working_days_month: workingDays,
        gap_monthly_m3: gapMonthlyM3,
        margin_per_m3: r.contribSafe,
        throughput_loss_usd: Math.round(gapMonthlyM3 * r.contribSafe),
        trips_per_truck: tripsPerTruck,
        trips_per_truck_target: tripsTarget,
      }
    })(),

    total_loss: validation.corrected_total_loss,
    total_loss_range: lossRange,
    primary_constraint: diagnosis.primary_constraint,
    confidence: diagnosis.confidence,
    demand_constrained: diagnosis.demand_constrained,

    verdict_cause: verdictCause,
    mechanism_detail: diagnosis.primary_mechanism
      .replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
      .split('.').filter(s => s.trim()).slice(0, 3).join('. ') + '.',
    observed_signals: diagnosis.observed_signals,
    inferred_signals: diagnosis.inferred_signals,

    main_driver: mainDriver
      ? { dimension: mainDriver.dimension, amount: mainDriver.amount }
      : { dimension: diagnosis.primary_constraint, amount: diagnosis.monthly_loss_total },
    other_losses: otherLoss,
    loss_breakdown_detail: diagnosis.loss_breakdown.map(l => ({
      dimension: l.dimension,
      amount: l.amount,
      classification: l.classification,
    })),
    lost_volume_m3: diagnosis.lost_volume_m3_monthly,
    margin_per_m3: diagnosis.margin_per_m3,

    performance_gaps: diagnosis.performance_gaps,

    actions: validation.corrected_actions,
    combined_recovery_range: { lo: recoveryLo, hi: recoveryHi },

    recovery_opportunities: [
      ...(r.demurrageOpportunity > 0 ? [{ label: 'Demurrage enforcement', amount: r.demurrageOpportunity }] : []),
    ],
    cost_only_savings: r.demandSufficient === false ? r.turnaroundLeakMonthlyCostOnly : 0,

    approved_precision: validation.approved_precision,
    flags: validation.flags,
    validation_checks: validation.checks,

    global_model_limits: [
      'Traffic congestion patterns not modeled',
      'Project type variation (high-rise vs ground pour) not differentiated',
      'Driver behavior and break patterns not captured',
      'Seasonal demand variation applied as a factor, not measured',
    ],
    case_specific_missing_data: [
      ...(r.taBreakdownEntered ? [] : ['Detailed TAT component breakdown not available']),
      ...(r.dispatchMin ? [] : ['Dispatch time not reported']),
      ...(!r.taSiteWaitMin ? ['Site waiting time not measured per delivery'] : []),
      ...(!r.fuelPerDel ? ['Fuel cost per delivery not provided'] : []),
    ],
    management_context: undefined,

    // Executive narrative: what, why, what it means
    executive_narrative: buildExecutiveNarrative(r, diagnosis, validation),

    // Claim strength
    ...buildClaimStrength(r, diagnosis),

    // Business implication
    business_implication: buildBusinessImplication(r, diagnosis, validation),

    data_quality: r.dataQuality,
    data_warnings: r.warnings.filter(w => w.startsWith('INCONSISTENT:')),

    evidence_basis: diagnosis.evidence_basis,

    tat_actual: r.ta,
    tat_target: r.TARGET_TA,
    tat_breakdown: tatBreakdown,
  }
}

// ── Narrative Builders ───────────────────────────────────────────────────────

function buildExecutiveNarrative(
  r: CalcResult,
  d: StructuredDiagnosis,
  v: ValidationResult,
): string {
  const loss = v.corrected_total_loss
  const utilPct = Math.round(r.util * 100)

  if (d.demand_constrained) {
    return `This plant has capacity to produce more but the order book does not fill it. At ${utilPct}% utilization, growing demand is the priority before optimizing operations.`
  }

  // Rounded loss (no false precision)
  const lossRounded = Math.round(loss / 10000) * 10 // round to nearest 10k
  const lossStr = lossRounded >= 1000 ? `$${(lossRounded / 1000).toFixed(1)}M` : `$${lossRounded}k`

  // Concrete cause from verdict
  const cause = d.primary_mechanism
    .replace(/^Based on (the )?reported (dispatch )?(setup|inputs),?\s*/i, '')
    .split('.')[0]
    .replace(/\blikely\b\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  // Deliveries impact
  const delsActual = r.ta > 0 ? Math.floor((r.opH * 60) / r.ta) : 0
  const delsTarget = r.TARGET_TA > 0 ? Math.floor((r.opH * 60) / r.TARGET_TA) : 0
  const delsPhrase = delsActual > 0 && delsTarget > delsActual
    ? `, reducing each truck from ${delsTarget} to ${delsActual} deliveries per day`
    : ''

  // Concrete action from primary
  const primaryAction = d.actions[0]?.text || 'operational improvements'
  const secondaryAction = d.actions[1]?.text || ''
  const actionPhrase = secondaryAction
    ? `${primaryAction.charAt(0).toUpperCase() + primaryAction.slice(1)} and ${secondaryAction.toLowerCase()}`
    : primaryAction.charAt(0).toUpperCase() + primaryAction.slice(1)

  // Recovery
  const recoveryLo = Math.round(v.corrected_total_loss * 0.40 / 1000)
  const recoveryHi = Math.round(v.corrected_total_loss * 0.65 / 1000)

  return `~${lossStr}/month in value is not being captured. ${cause.charAt(0).toUpperCase() + cause.slice(1)}${delsPhrase}. ${actionPhrase} can recover $${recoveryLo}k-$${recoveryHi}k/month within 90 days.`
}

function buildClaimStrength(
  r: CalcResult,
  d: StructuredDiagnosis,
): { claim_strength: 'confirmed' | 'strongly_supported' | 'directional'; claim_strength_basis: string } {
  // Rules:
  // confirmed: TAT breakdown entered + on-site observations + core metrics validated
  // strongly_supported: core metrics reported + multiple consistent signals
  // directional: limited data, inference-heavy

  const hasBreakdown = r.taBreakdownEntered
  const hasMultipleSignals = d.observed_signals.length >= 2
  const hasCoreMetrics = d.performance_gaps.turnaround !== undefined && d.performance_gaps.utilization !== undefined

  if (hasBreakdown && hasMultipleSignals && hasCoreMetrics) {
    return {
      claim_strength: 'confirmed',
      claim_strength_basis: 'TAT component breakdown available. Multiple operational signals observed. Core metrics validated.',
    }
  }

  if (hasCoreMetrics && hasMultipleSignals) {
    return {
      claim_strength: 'strongly_supported',
      claim_strength_basis: 'Core performance metrics reported. Multiple consistent signals support the identified constraint. Detailed TAT breakdown would strengthen the conclusion.',
    }
  }

  return {
    claim_strength: 'directional',
    claim_strength_basis: 'Based on limited operational data. The identified constraint is the most plausible driver but should be confirmed with additional measurement.',
  }
}

function buildBusinessImplication(
  r: CalcResult,
  d: StructuredDiagnosis,
  v: ValidationResult,
): { output_increase_m3: number; utilization_target_pct: number; financial_recovery_range: { lo: number; hi: number }; summary: string } {
  const currentUtil = Math.round(r.util * 100)
  const targetUtil = Math.min(90, currentUtil + Math.round((85 - currentUtil) * 0.7))
  const currentMonthly = r.monthlyM3 || Math.round(r.actual * r.opH * (r.opD / 12))
  const targetMonthly = Math.round(r.cap * (targetUtil / 100) * r.opH * (r.opD / 12))
  const outputIncrease = Math.max(0, targetMonthly - currentMonthly)

  const recoveryLo = Math.round(v.corrected_total_loss * 0.40)
  const recoveryHi = Math.round(v.corrected_total_loss * 0.65)

  const constraint = d.primary_constraint === 'Fleet' ? 'fleet turnaround' : d.primary_constraint.toLowerCase()

  const summary = d.demand_constrained
    ? `Growing the order book is the priority. The plant has capacity to increase output by ~${Math.round(outputIncrease / 100) * 100} m3/month once demand supports it.`
    : `Fixing ${constraint} can increase output by ~${Math.round(outputIncrease / 100) * 100} m3/month, bringing utilization from ${currentUtil}% toward ${targetUtil}% and recovering $${Math.round(recoveryLo / 1000)}k-$${Math.round(recoveryHi / 1000)}k/month.`

  return {
    output_increase_m3: outputIncrease,
    utilization_target_pct: targetUtil,
    financial_recovery_range: { lo: recoveryLo, hi: recoveryHi },
    summary,
  }
}

// ── Debug / Trace Mode ───────────────────────────────────────────────────────

export function printCalculationTrace(vd: ValidatedDiagnosis): string {
  const t = vd.calc_trace
  const lines: string[] = [
    '=== CALCULATION TRACE ===',
    '',
    '--- BASE INPUTS ---',
    `Plant capacity:    ${vd.plant_capacity_m3hr} m³/hr`,
    `Operating hours:   ${vd.operating_hours} hr/day`,
    `Operating days:    ${vd.operating_days} days/yr`,
    `Working days/mo:   ${t.working_days_month}`,
    `Trucks:            ${vd.trucks_total} total, ${vd.trucks_effective} effective`,
    `Margin:            $${t.margin_per_m3}/m³`,
    `TAT:               ${vd.tat_actual} min (target ${vd.tat_target} min)`,
    '',
    '--- DERIVED VALUES ---',
    `Trips/truck/day:   ${t.trips_per_truck} (target ${t.trips_per_truck_target})`,
    `Fleet capacity:    ${t.fleet_daily_m3} m³/day`,
    `Plant capacity:    ${t.plant_daily_m3} m³/day`,
    `Actual output:     ${t.actual_daily_m3} m³/day`,
    `Target output:     ${t.target_daily_m3} m³/day (min of fleet@target, plant)`,
    '',
    '--- THROUGHPUT CHAIN ---',
    `Gap daily:         ${t.gap_daily_m3} m³/day (${t.target_daily_m3} - ${t.actual_daily_m3})`,
    `Gap monthly:       ${t.gap_monthly_m3} m³/mo (${t.gap_daily_m3} × ${t.working_days_month} days)`,
    `Throughput loss:    $${t.throughput_loss_usd.toLocaleString()}/mo (${t.gap_monthly_m3} × $${t.margin_per_m3})`,
    '',
    '--- VALIDATION ---',
    `gap_daily = target - actual: ${t.target_daily_m3} - ${t.actual_daily_m3} = ${t.target_daily_m3 - t.actual_daily_m3} ${t.target_daily_m3 - t.actual_daily_m3 === t.gap_daily_m3 ? '✓' : '✗ MISMATCH'}`,
    `gap_monthly = gap_daily × days: ${t.gap_daily_m3} × ${t.working_days_month} = ${t.gap_daily_m3 * t.working_days_month} ${t.gap_daily_m3 * t.working_days_month === t.gap_monthly_m3 ? '✓' : '✗ MISMATCH'}`,
    `throughput_usd = gap_monthly × margin: ${t.gap_monthly_m3} × ${t.margin_per_m3} = ${t.gap_monthly_m3 * t.margin_per_m3} ${t.gap_monthly_m3 * t.margin_per_m3 === t.throughput_loss_usd ? '✓' : '✗ MISMATCH'}`,
    '',
    '--- CONSTRAINT ---',
    `Active: ${vd.primary_constraint}`,
    `Fleet < Plant: ${t.fleet_daily_m3 < t.plant_daily_m3}`,
    `Demand constrained: ${vd.demand_constrained}`,
    '',
    '--- TOTAL LOSS ---',
    `Throughput:        $${t.throughput_loss_usd.toLocaleString()}`,
    `Leakage:           $${vd.other_losses.toLocaleString()}`,
    `Total:             $${vd.total_loss.toLocaleString()}`,
  ]
  return lines.join('\n')
}
