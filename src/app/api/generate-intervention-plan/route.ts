/**
 * Generate a plant-specific intervention plan.
 *
 * Streams a markdown document with structured sections that the UI renders
 * progressively. Output schema (markdown h2 sections, in order):
 *
 *   ## Data points worth investigating on-site
 *   ## Hypotheses (ranked by potential $ impact)
 *   ## Phase 1 — Candidate quick wins (indicative weeks 1-4)
 *   ## Phase 2 — Candidate structural moves (indicative weeks 5-12)
 *   ## Phase 3 — Strategic directions (indicative quarters 2+)
 *   ## Hypothesis coverage reconciliation (mandatory rollup table)
 *   ## Data collection targets (conditional on field-log state)
 *   ## Pitch summary
 *
 * The system prompt is the full intervention_library catalog + domain
 * rules + output format spec. It's cached via Anthropic's prompt_caching
 * feature so subsequent calls only pay for the per-request delta.
 *
 * All USD figures in output must be grounded in either:
 *   - The assessment/field-log input data (signalled via {{input.xxx}} tokens
 *     the model is told not to invent), OR
 *   - A library entry with cost/impact ranges (the model cites the slug).
 *
 * Plan is saved to intervention_plans on completion for later retrieval +
 * editing. The client streams the text directly.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, checkSpendCap, trackSpend } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { mapToReportInput, calculateReport, type ReportInput, type ReportCalculations } from '@/lib/reportCalculations'
import type { Answers } from '@/lib/calculations'
import { validatePlan } from '@/lib/intervention-plan-validator'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 8000
const RATE_LIMIT = { maxRequests: 5, windowSeconds: 60 }

/** Maximum streaming duration in seconds. Set to 5 min to cover two Claude
 *  calls (initial + up to 2 revisions) plus validation overhead. Vercel
 *  default without this export is 60s which truncates mid-revision. */
export const maxDuration = 300
/** Max plans any single assessment can generate in 24h. Prevents per-plant
 *  spam even when the user's daily spend cap isn't yet hit. */
const PER_ASSESSMENT_DAILY_CAP = 10

/** Authoritative parsed numeric inputs. The LLM MUST cite these. */
interface ParsedInputs {
  selling_price_usd_per_m3: number
  material_cost_usd_per_m3: number
  contribution_margin_usd_per_m3: number
  trucks_assigned: number
  number_of_plants: number
  plant_capacity_m3_per_hour: number
  operating_hours_per_day: number
  operating_days_per_year: number
  op_days_per_month: number
  monthly_output_m3: number
  monthly_contribution_usd: number
  avg_load_m3: number
  total_trips_last_month: number
  actual_trips_per_truck_per_day: number
  avg_turnaround_min: number
  target_turnaround_min: number
  target_trips_per_truck_per_day: number
  rejection_rate_pct: number
  actual_daily_output_m3: number
  target_daily_output_m3: number
  utilisation_actual_pct: number
  utilisation_target_pct: number
  monthly_gap_m3: number
  monthly_gap_usd: number
  recovery_low_usd: number
  recovery_high_usd: number
  quality_loss_usd: number
  dispatch_loss_usd: number
  production_loss_usd: number
  gap_driver: string
  constraint: string
  bottleneck: string
  has_external_constraint: boolean
  dispatch_tool_raw: string
  biggest_operational_challenge: string
  demand_vs_capacity: string
  data_sources_raw: string
  avg_delivery_radius_raw: string
  /** Pre-computed impact multipliers. These exist so the LLM does not do
   *  arithmetic. To estimate USD/month from a % improvement, multiply the
   *  percentage (as decimal) by the matching multiplier. See impact_formulas. */
  impact_multipliers: ImpactMultipliers
  impact_formulas: Record<string, string>
  /** Populated from plant_site_type_percentiles view + daily_logs trip counts.
   *  Status=ready when at least one site_type has sample_size>=5. Status=
   *  insufficient_data when Field Log is empty/thin (pre-visit or early
   *  engagement). */
  site_type_analysis: SiteTypeAnalysis | null
}

/** Deterministic multipliers. Each represents the USD/month impact of a
 *  1-unit improvement in the named metric, computed from parsed_inputs. */
interface ImpactMultipliers {
  /** Per 1 extra trip per truck per day, over the month. */
  per_trip_per_truck_per_day_usd: number
  /** Per 1 m³ increase in average load, over the month. */
  per_m3_avg_load_increase_usd: number
  /** Per 1 percentage point reduction in rejection rate, over the month.
   *  Material-cost-only basis (monthly_output_m3 × material_cost × 0.01). */
  per_rejection_pp_reduction_usd: number
  /** Per 1 minute of TAT reduction, over the month. Assumes saved minutes
   *  convert to extra trips at the same load, same margin. */
  per_min_tat_reduction_usd: number
  /** Per 1 percentage point increase in plant utilisation, over the month.
   *  Based on plant capacity × margin × op hours × op days. */
  per_utilisation_pp_increase_usd: number
  /** Per 1 percentage point reduction in dispatch-to-order lag — approximated
   *  as linear fraction of dispatch_loss_usd. */
  per_dispatch_pp_improvement_usd: number
}

/** Pull site-type percentile data from Supabase + compute trip-mix + flags.
 *  Returns null if no data at all (pre-Field-Log); always non-null otherwise
 *  even if status ends up 'insufficient_data'. */
async function loadSiteTypeAnalysis(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  plantId: string,
  assessmentId: string,
  windowDays = 30,
): Promise<SiteTypeAnalysis | null> {
  const windowStart = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10)

  // Percentiles: only site_types with sample_size >= 5 come back (view gates it).
  const { data: percRows, error: percErr } = await supabase
    .from('plant_site_type_percentiles')
    .select('site_type, sample_size, tat_p25, tat_p50, tat_p75, site_wait_p25, site_wait_p50, site_wait_p75, unload_p50, unload_p75, first_trip_date, last_trip_date')
    .eq('plant_id', plantId)
  if (percErr) {
    console.warn('plant_site_type_percentiles query failed:', percErr.message)
    return null
  }
  const percentiles = (percRows ?? []) as SiteTypePercentileRow[]

  // Trip count + mix over the analysis window. This shows what the plant
  // is actually delivering, not just what has enough samples.
  const { data: mixRows } = await supabase
    .from('daily_logs')
    .select('site_type')
    .eq('assessment_id', assessmentId)
    .gte('log_date', windowStart)
  const mixCounts = new Map<string, number>()
  let totalTrips = 0
  for (const row of mixRows ?? []) {
    const t = (row as { site_type: string | null }).site_type ?? 'unknown'
    mixCounts.set(t, (mixCounts.get(t) ?? 0) + 1)
    totalTrips += 1
  }
  const site_mix = Array.from(mixCounts.entries())
    .map(([site_type, trip_count]) => ({
      site_type,
      trip_count,
      pct_of_trips: totalTrips > 0 ? Math.round((trip_count / totalTrips) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.trip_count - a.trip_count)

  // Derived flags: where does the plan-generator's attention belong?
  const derived_flags = percentiles
    .filter(r => r.tat_p50 != null && r.tat_p50 > 0)
    .map(r => {
      const p25 = Number(r.tat_p25 ?? 0)
      const p50 = Number(r.tat_p50 ?? 0)
      const p75 = Number(r.tat_p75 ?? 0)
      const sw50 = Number(r.site_wait_p50 ?? 0)
      const variance_ratio = p50 > 0 ? Math.round(((p75 - p25) / p50) * 100) / 100 : 0
      const variance_flag = variance_ratio > 0.4
      const site_wait_flag = sw50 >= 20
      const notes: string[] = []
      if (variance_flag) notes.push(`TAT P75-P25 spread is ${Math.round(variance_ratio * 100)}% of P50 — variance suggests inconsistent process, worth root-causing`)
      if (site_wait_flag) notes.push(`median site_wait ${sw50} min — coordination is the dominant loss`)
      if (notes.length === 0) notes.push('no clear anomaly surfaced from internal distribution')
      return {
        site_type: r.site_type,
        variance_flag,
        variance_ratio,
        site_wait_flag,
        note: notes.join('; '),
      }
    })

  const status: SiteTypeAnalysis['status'] =
    percentiles.length === 0
      ? 'insufficient_data'
      : percentiles.length < site_mix.length ? 'partial' : 'ready'

  return {
    status,
    total_trips_in_window: totalTrips,
    sample_window_days: windowDays,
    percentiles,
    site_mix,
    derived_flags,
  }
}

function computeImpactMultipliers(ri: ReportInput, rc: ReportCalculations): ImpactMultipliers {
  const trucks = ri.trucks_assigned || 0
  const opDaysMonth = rc.op_days_per_month || 25
  const avgLoad = rc.avg_load_m3 || 0
  const margin = rc.contribution_margin_per_m3 || 0
  const monthlyOutput = ri.actual_production_last_month_m3 || 0
  const tatActual = ri.avg_turnaround_min || 0
  const tripsActual = rc.actual_trips_per_truck_per_day || 0

  const perTripPerTruckPerDay = trucks * opDaysMonth * avgLoad * margin

  const perM3LoadIncrease = (ri.total_trips_last_month || 0) * margin

  // Rejection rate is material-cost-only (that's what the pre-assessment
  // tracks). Reducing 1pp means 0.01 × monthly_output is no longer wasted.
  const perRejectionPp = monthlyOutput * (ri.material_cost_per_m3 || 0) * 0.01

  // TAT saved → extra trips at same cadence.
  // dtrips_per_day = (tat_actual / (tat_actual - 1)) - 1 ≈ 1 / tat_actual (small changes)
  // Then × trucks × op_days × avg_load × margin.
  const perMinTat = tatActual > 0
    ? (tripsActual / tatActual) * trucks * opDaysMonth * avgLoad * margin
    : 0

  // Utilisation: 1pp of plant capacity × margin, monthly.
  const perUtilisationPp = (ri.plant_capacity_m3_per_hour || 0) *
    (ri.operating_hours_per_day || 0) *
    opDaysMonth * margin * 0.01

  // Dispatch: approximate as 1% of dispatch_loss_usd.
  const perDispatchPp = (rc.dispatch_loss_usd || 0) * 0.01

  return {
    per_trip_per_truck_per_day_usd: Math.round(perTripPerTruckPerDay),
    per_m3_avg_load_increase_usd: Math.round(perM3LoadIncrease),
    per_rejection_pp_reduction_usd: Math.round(perRejectionPp),
    per_min_tat_reduction_usd: Math.round(perMinTat),
    per_utilisation_pp_increase_usd: Math.round(perUtilisationPp),
    per_dispatch_pp_improvement_usd: Math.round(perDispatchPp),
  }
}

/** Human-readable formulas for the LLM to cite verbatim, so it doesn't
 *  re-derive or mis-multiply. */
function computeImpactFormulas(ri: ReportInput, rc: ReportCalculations): Record<string, string> {
  const trucks = ri.trucks_assigned
  const opDaysMonth = rc.op_days_per_month
  const avgLoad = rc.avg_load_m3
  const margin = rc.contribution_margin_per_m3
  const monthlyOutput = ri.actual_production_last_month_m3
  const tatActual = ri.avg_turnaround_min
  const tripsActual = rc.actual_trips_per_truck_per_day
  return {
    per_trip_per_truck_per_day_usd: `${trucks} trucks × ${opDaysMonth} op_days × ${avgLoad.toFixed(2)} m³ × $${margin.toFixed(2)} margin`,
    per_m3_avg_load_increase_usd: `${ri.total_trips_last_month} trips × $${margin.toFixed(2)} margin`,
    per_rejection_pp_reduction_usd: `${monthlyOutput} m³ × $${ri.material_cost_per_m3.toFixed(2)} material × 0.01`,
    per_min_tat_reduction_usd: `(${tripsActual.toFixed(2)} trips/truck/day ÷ ${tatActual} min TAT) × ${trucks} trucks × ${opDaysMonth} op_days × ${avgLoad.toFixed(2)} m³ × $${margin.toFixed(2)} margin`,
    per_utilisation_pp_increase_usd: `${ri.plant_capacity_m3_per_hour} m³/hr × ${ri.operating_hours_per_day} hrs × ${opDaysMonth} op_days × $${margin.toFixed(2)} margin × 0.01`,
    per_dispatch_pp_improvement_usd: `1% of dispatch_loss_usd ($${Math.round(rc.dispatch_loss_usd).toLocaleString()})`,
  }
}

function deriveParsedInputs(
  ri: ReportInput,
  rc: ReportCalculations,
  siteTypeAnalysis: SiteTypeAnalysis | null = null,
): ParsedInputs {
  return {
    selling_price_usd_per_m3: ri.selling_price_per_m3,
    material_cost_usd_per_m3: ri.material_cost_per_m3,
    contribution_margin_usd_per_m3: rc.contribution_margin_per_m3,
    trucks_assigned: ri.trucks_assigned,
    number_of_plants: ri.number_of_plants ?? 1,
    plant_capacity_m3_per_hour: ri.plant_capacity_m3_per_hour,
    operating_hours_per_day: ri.operating_hours_per_day,
    operating_days_per_year: ri.operating_days_per_year,
    op_days_per_month: rc.op_days_per_month,
    monthly_output_m3: ri.actual_production_last_month_m3,
    monthly_contribution_usd: ri.actual_production_last_month_m3 * rc.contribution_margin_per_m3,
    avg_load_m3: rc.avg_load_m3,
    total_trips_last_month: ri.total_trips_last_month,
    actual_trips_per_truck_per_day: rc.actual_trips_per_truck_per_day,
    avg_turnaround_min: ri.avg_turnaround_min,
    target_turnaround_min: rc.target_tat_min,
    target_trips_per_truck_per_day: rc.target_trips_per_truck_per_day,
    rejection_rate_pct: ri.rejection_rate_pct,
    actual_daily_output_m3: rc.actual_daily_output_m3,
    target_daily_output_m3: rc.target_daily_output_m3,
    utilisation_actual_pct: rc.utilisation_actual_pct,
    utilisation_target_pct: rc.utilisation_target_pct,
    monthly_gap_m3: rc.monthly_gap_m3,
    monthly_gap_usd: rc.monthly_gap_usd,
    recovery_low_usd: rc.recovery_low_usd,
    recovery_high_usd: rc.recovery_high_usd,
    quality_loss_usd: rc.quality_loss_usd,
    dispatch_loss_usd: rc.dispatch_loss_usd,
    production_loss_usd: rc.production_loss_usd,
    gap_driver: rc.gap_driver,
    constraint: rc.constraint,
    bottleneck: '',
    has_external_constraint: rc.has_external_constraint,
    dispatch_tool_raw: ri.dispatch_tool,
    biggest_operational_challenge: ri.biggest_operational_challenge,
    demand_vs_capacity: ri.demand_vs_capacity,
    data_sources_raw: ri.data_sources,
    avg_delivery_radius_raw: String(ri.avg_delivery_radius),
    impact_multipliers: computeImpactMultipliers(ri, rc),
    impact_formulas: computeImpactFormulas(ri, rc),
    site_type_analysis: siteTypeAnalysis,
  }
}

interface LibraryItem {
  slug: string
  title_en: string
  category: string
  problem_solves: string
  applicability_rules: Record<string, unknown>
  cost_usd_low: number | null
  cost_usd_high: number | null
  cost_notes: string | null
  impact_metric: string | null
  impact_pct_low: number | null
  impact_pct_high: number | null
  impact_secondary: string | null
  effort_weeks: number | null
  complexity: string | null
  prerequisites: string[]
  quick_win: boolean
  gcc_notes: string | null
  sources: unknown
  tags: string[]
  site_type_applicability?: string[]
  tat_component_target?: string
}

/** Per-site-type percentile row from plant_site_type_percentiles view.
 *  Only surfaces when sample_size >= 5 for that (plant, site_type). */
interface SiteTypePercentileRow {
  site_type: string
  sample_size: number
  tat_p25: number | null
  tat_p50: number | null
  tat_p75: number | null
  site_wait_p25: number | null
  site_wait_p50: number | null
  site_wait_p75: number | null
  unload_p50: number | null
  unload_p75: number | null
  first_trip_date: string | null
  last_trip_date: string | null
}

/** Site-type analysis block injected into parsed_inputs when Field Log has
 *  enough data for at least one site_type. LLM uses this to ground anomaly
 *  detection in the plant's own distribution, never external benchmarks. */
interface SiteTypeAnalysis {
  status: 'insufficient_data' | 'partial' | 'ready'
  total_trips_in_window: number
  sample_window_days: number
  percentiles: SiteTypePercentileRow[]
  site_mix: Array<{ site_type: string; trip_count: number; pct_of_trips: number }>
  // Quick-read flags derived from percentiles so the LLM doesn't have to
  // recompute. Each site_type with sample_size >= 5 gets:
  //   variance_flag: tat_p75 - tat_p25 > 40% of tat_p50 → investigate variance
  //   site_wait_flag: site_wait_p50 >= 20 min → investigate coordination
  derived_flags: Array<{
    site_type: string
    variance_flag: boolean
    variance_ratio: number // (p75 - p25) / p50
    site_wait_flag: boolean
    note: string
  }>
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before generating another plan.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }
  const spend = checkSpendCap(user.id)
  if (!spend.allowed) {
    return NextResponse.json(
      { error: `Daily AI budget reached ($${spend.dailyCap}/day). Resets in 24 hours.` },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const {
    assessmentId,
    plantId,
    regenerationFeedback,
  }: {
    assessmentId?: string
    plantId?: string
    regenerationFeedback?: string
  } = body

  if (!assessmentId || !plantId) {
    return NextResponse.json({ error: 'assessmentId and plantId required' }, { status: 400 })
  }

  // Per-assessment daily cap — prevents spam even before hitting user-level
  // daily spend cap. Plans with regenerationFeedback don't count against the
  // cap because the consultant is iterating deliberately.
  if (!regenerationFeedback) {
    const twentyFourHrsAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('intervention_plans')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', assessmentId)
      .gte('generated_at', twentyFourHrsAgo)
    if ((count ?? 0) >= PER_ASSESSMENT_DAILY_CAP) {
      return NextResponse.json(
        { error: `This assessment has generated ${count} plans in the last 24 hours. Daily cap of ${PER_ASSESSMENT_DAILY_CAP} reached. Wait or edit an existing plan.` },
        { status: 429 }
      )
    }
  }

  // Load assessment + computed KPIs + recent field log summary
  const { data: assessment, error: aErr } = await supabase
    .from('assessments')
    .select('id, plant_id, answers, scores, overall, bottleneck, ebitda_monthly, hidden_rev_monthly')
    .eq('id', assessmentId)
    .single()
  if (aErr || !assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
  }

  const { data: plant } = await supabase
    .from('plants')
    .select('id, name, country, customer_id')
    .eq('id', plantId)
    .single()

  // Latest 30 days field log KPIs (may be empty pre-visit)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  let fieldKpis: unknown = null
  try {
    const { data } = await supabase.rpc('get_weekly_kpis_from_daily_logs', {
      p_assessment_id: assessmentId,
      p_start_date: thirtyDaysAgo,
    })
    fieldKpis = data
  } catch {
    // RPC may not be available in all environments; pre-visit state is fine
  }

  // Recent interventions already logged (don't re-recommend)
  const { data: recentInterventions } = await supabase
    .from('intervention_logs')
    .select('title, description, target_metric, intervention_date')
    .eq('assessment_id', assessmentId)
    .order('intervention_date', { ascending: false })
    .limit(20)

  // Load intervention library (all entries — system prompt caches them)
  const { data: libraryRows } = await supabase
    .from('intervention_library')
    .select('slug, title_en, category, problem_solves, applicability_rules, cost_usd_low, cost_usd_high, cost_notes, impact_metric, impact_pct_low, impact_pct_high, impact_secondary, effort_weeks, complexity, prerequisites, quick_win, gcc_notes, sources, tags')

  const library: LibraryItem[] = (libraryRows ?? []) as LibraryItem[]

  // Compute parsed numeric inputs from raw answers. This is the critical step
  // that prevents the LLM from fumbling bucket-text labels like "Over 125 min"
  // and inventing margin/utilisation numbers. Same path as /api/generate-report.
  let parsedInputs: ParsedInputs | null = null
  try {
    const answers = (assessment.answers ?? {}) as Answers
    const answersRec = answers as unknown as Record<string, unknown>
    // Minimal dx stub — mapToReportInput only reads tat_actual + reject_pct + management_context.
    const tatActualAnswer = Number(answersRec.turnaround ?? answersRec.avg_turnaround_min ?? 0)
    const rejectAnswer = Number(answersRec.rejection_rate ?? answersRec.rejection_rate_pct ?? 0)
    const dxStub = {
      tat_actual: isFinite(tatActualAnswer) && tatActualAnswer > 0 ? tatActualAnswer : 170,
      reject_pct: isFinite(rejectAnswer) && rejectAnswer > 0 ? rejectAnswer : 2,
      management_context: String(answersRec.biggest_pain ?? answersRec.biggest_operational_challenge ?? ''),
    }
    const reportInput = mapToReportInput(dxStub, answersRec)
    const rc = calculateReport(reportInput)
    // Load site-type percentile analysis (requires plant_site_type_percentiles
    // view from migration 20260422_site_type_percentiles.sql). Null if view
    // query fails; the prompt still builds but without site-type section.
    const siteTypeAnalysis = await loadSiteTypeAnalysis(supabase, plantId, assessmentId)
    parsedInputs = deriveParsedInputs(reportInput, rc, siteTypeAnalysis)
  } catch (err) {
    console.warn('Intervention plan: parsed-inputs derivation failed, prompt will omit numeric block', err)
  }

  const systemPrompt = buildSystemPrompt(library)
  const userPrompt = buildUserPrompt({
    plant,
    assessment,
    parsedInputs,
    fieldKpis,
    recentInterventions: recentInterventions ?? [],
    regenerationFeedback,
  })

  // Annotate parsed inputs with the assessment's stored bottleneck (captured
  // in the snapshot so the LLM doesn't have to cross-reference two blocks).
  if (parsedInputs && assessment.bottleneck) {
    parsedInputs.bottleneck = String(assessment.bottleneck)
  }

  const inputSnapshot = {
    plant,
    assessment_summary: {
      overall: assessment.overall,
      bottleneck: assessment.bottleneck,
      scores: assessment.scores,
      ebitda_monthly: assessment.ebitda_monthly,
      hidden_rev_monthly: assessment.hidden_rev_monthly,
    },
    parsed_inputs: parsedInputs,
    field_kpis: fieldKpis,
    recent_interventions: recentInterventions,
    regeneration_feedback: regenerationFeedback ?? null,
    generated_at: new Date().toISOString(),
  }

  const encoder = new TextEncoder()

  // Capture values we need inside the stream closure below.
  const recoveryLow = parsedInputs?.recovery_low_usd ?? null
  const recoveryHigh = parsedInputs?.recovery_high_usd ?? null
  const numberOfPlants = parsedInputs?.number_of_plants ?? 1

  // Control markers the client listens for. Picked to be vanishingly
  // unlikely in markdown output so we can split the stream cleanly.
  const RESET_MARKER = '\u0001ALRMX_PLAN_RESET\u0001'
  const DONE_MARKER = '\u0001ALRMX_PLAN_DONE\u0001'

  const MAX_REVISION_CYCLES = 2

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = ''

        // ── Pass 1: stream Claude's initial draft to the client ─────────
        await streamClaude({
          controller,
          encoder,
          systemPrompt,
          userMessages: [{ role: 'user', content: userPrompt }],
          onText: (t) => { fullText += t },
        })

        // ── Validate + up to MAX_REVISION_CYCLES re-stream passes ──────
        const allValidations: Array<ReturnType<typeof validatePlan>> = []
        let cycle = 0
        while (cycle < MAX_REVISION_CYCLES) {
          const validation = validatePlan({
            markdown: fullText,
            recovery_low_usd: recoveryLow,
            recovery_high_usd: recoveryHigh,
            number_of_plants: numberOfPlants,
          })
          allValidations.push(validation)

          const hasCritical = validation.violations.some(v => v.severity === 'critical')
          const hasMajor = validation.violations.some(v => v.severity === 'major')
          if (!hasCritical && !hasMajor) break
          cycle += 1

          // Tell the client: drop everything shown so far and stream the
          // revised version fresh. UI shows "Revising..." state during gap.
          controller.enqueue(encoder.encode(RESET_MARKER))

          let revisedText = ''
          await streamClaude({
            controller,
            encoder,
            systemPrompt,
            userMessages: [
              { role: 'user', content: userPrompt },
              { role: 'assistant', content: fullText },
              { role: 'user', content: buildRevisionPrompt(validation, cycle) },
            ],
            onText: (t) => { revisedText += t },
          })
          fullText = revisedText
        }

        // ── Post-sanitize: final mechanical cleanup ─────────────────────
        // Em-dashes specifically: regex-replace any that slipped through
        // into commas. Safe even if validator already caught them.
        const sanitizedText = sanitizeFinalMarkdown(fullText)

        // If sanitization actually changed anything and we're already past
        // the max revision cycles, surface the cleaned version by resetting
        // the client once more and re-emitting. Cheap because no LLM call.
        if (sanitizedText !== fullText) {
          controller.enqueue(encoder.encode(RESET_MARKER))
          controller.enqueue(encoder.encode(sanitizedText))
        }

        controller.enqueue(encoder.encode(DONE_MARKER))

        trackSpend(user.id)

        // Persist ONLY the final sanitized text + revision audit trail.
        await supabase.from('intervention_plans').insert({
          assessment_id: assessmentId,
          plant_id: plantId,
          generated_by: user.id,
          model_version: MODEL,
          input_snapshot: {
            ...inputSnapshot,
            validation: {
              cycles_run: cycle,
              validations: allValidations,
              post_sanitize_applied: sanitizedText !== fullText,
            },
          },
          plan_content: { markdown: sanitizedText.trim() },
          status: 'draft',
        })

        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const stack = err instanceof Error ? err.stack : undefined
        console.error('intervention-plan generation error:', msg, stack)
        // Emit a visible error payload to the client before closing the
        // stream — easier to debug than a raw "HTTP 500" with no body.
        try {
          controller.enqueue(encoder.encode(`\n\n---\n\n**GENERATION ERROR:** ${msg}\n\n`))
        } catch { /* controller may already be closed */ }
        controller.error(err)
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/** Build the revision instruction sent to Claude when validator fails.
 *  Key constraint: do NOT drop interventions — reduce numbers instead.
 *  Dropping is the revision model's easy way out when capped, which
 *  destroys value the consultant may want to keep. */
function buildRevisionPrompt(validation: ReturnType<typeof validatePlan>, cycle: number): string {
  return `Your draft for intervention plan cycle ${cycle} did not pass validation. Produce a corrected version of the ENTIRE plan now, keeping the same section structure and the SAME list of interventions. Fix the issues by ADJUSTING NUMBERS (USD impact, percentages) DOWN — do not delete interventions. The consultant decides scope, you only enforce numeric discipline.

${validation.revisionFeedback}

Output the full revised plan. All content must be fresh (the client resets their view when they receive the revision), so include every section from "Data points worth investigating on-site" through "Pitch summary".`
}

/** Last-mile cleanup on the final plan before persisting + returning.
 *  Handles the purely mechanical fixes that are safer in code than LLM:
 *  - Em-dashes and en-dashes → commas (matches alrmx report style).
 *  - Double-hyphen ASCII em-dash substitutes → commas.
 *  - Trailing whitespace on lines.
 *  - 3+ consecutive blank lines → 2.
 */
function sanitizeFinalMarkdown(md: string): string {
  return md
    // em-dash + en-dash + ascii "--" → ", "
    .replace(/[\u2014\u2013]|--/g, ',')
    // tidy double-space left by replacements
    .replace(/ {2,}/g, ' ')
    // trim trailing whitespace per line
    .split('\n').map(l => l.trimEnd()).join('\n')
    // collapse 3+ blank lines
    .replace(/\n{3,}/g, '\n\n')
}

/** Stream a single Claude call into the response controller.
 *  `onText` receives every text delta so callers can accumulate the full text. */
async function streamClaude(args: {
  controller: ReadableStreamDefaultController
  encoder: TextEncoder
  systemPrompt: string
  userMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  onText: (text: string) => void
}) {
  const { controller, encoder, systemPrompt, userMessages, onText } = args
  const response = await anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' }, // big library + rules cached
      },
    ],
    messages: userMessages,
  })
  for await (const chunk of response) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      onText(chunk.delta.text)
      controller.enqueue(encoder.encode(chunk.delta.text))
    }
  }
}

// ── Prompt builders ─────────────────────────────────────────────────────

function buildSystemPrompt(library: LibraryItem[]): string {
  return `You are supporting Louis Hellmann, a Lean/Six Sigma operations consultant entering the ready-mix vertical. You produce a SUGGESTION DOCUMENT, not a prescriptive action plan.

## Role boundary (read this first)

**Louis is the operator of the plan, not its subject.** He decides:
- What to investigate, and in what order
- Which interventions to pursue and which to skip
- When in the engagement to do any given action
- How to frame things to the specific owner (Abdul Aziz)

**Your job is to surface options, hypotheses, and relevant data patterns** so Louis can make those decisions faster. You have less context than he does about the customer, the commercial setup, and the engagement dynamics. Respect that.

### Language posture

Write as a senior analyst briefing a senior consultant, NOT as a consultant instructing a client. Use:
- "The data suggests..." / "One hypothesis is..." / "Worth investigating..."
- "Candidate interventions..." / "Louis may want to consider..."
- "If pursued, this intervention..." / "One possible approach would be..."

Avoid:
- "You must..." / "Week 1 must include..." / "Mandatory..."
- "The consultant will..." / "We will..."
- "The plan dictates..." / "Required first step..."
- Any language that fixes timing or sequencing that the consultant hasn't chosen

The phase labels (weeks 1-4, weeks 5-12, quarters 2+) are INDICATIVE timeframes for each intervention's natural fit, not a commitment schedule. Louis sets the actual sequence after on-site.

### Senior-consultant quality bar

Your output must still look like senior-analyst work: precise, grounded, source-tagged, politically aware. The posture shift is FROM prescriptive TO advisory, not a drop in rigour.

## CRITICAL: pre-assessment doctrine (highest priority)

**This plan is a pre-visit hypothesis document, not a binding set of targets or conclusions.** The pre-assessment that fed parsed_inputs explicitly states that no gaps, root causes, specific interventions, or targets can be concluded before on-site assessment. Your plan MUST honour that framing in language and quantification.

### Provenance of parsed_inputs — reported vs. modelled

Some values in parsed_inputs are REPORTED by the customer (directly answered in the pre-assessment questionnaire). Others are MODELLED — computed from benchmark assumptions or midpoints. You MUST treat the two categories differently:

**REPORTED values (safe to cite as current state):**
- selling_price_usd_per_m3, material_cost_usd_per_m3, contribution_margin_usd_per_m3
- trucks_assigned, number_of_plants, plant_capacity_m3_per_hour
- operating_hours_per_day (midpoint of reported range; treat as reported)
- monthly_output_m3, total_trips_last_month, avg_load_m3
- avg_turnaround_min, rejection_rate_pct (what the customer says)
- actual_trips_per_truck_per_day, actual_daily_output_m3, utilisation_actual_pct

**MODELLED values (PRE-ASSESSMENT HYPOTHESES, NOT targets):**
- target_turnaround_min — computed from fixed 60 min + 25 km × 1.5 min/km × 2 = 135 min. This is a pre-assessment BENCHMARK, NOT a validated target. On-site Week 1 must establish the achievable target.
- target_trips_per_truck_per_day, target_daily_output_m3, utilisation_target_pct — all derived from target_turnaround_min.
- monthly_gap_m3, monthly_gap_usd — gap between actual and modelled target.
- recovery_low_usd, recovery_high_usd — 40-65% × monthly_gap_usd.
- quality_loss_usd, dispatch_loss_usd, production_loss_usd — modelled breakdowns.
- avg_delivery_radius (midpoint of reported range 5-45 km = 25 km).

### Language discipline for modelled values

When citing a modelled value, ALWAYS wrap it explicitly:
- ✓ "assumed target TAT of 135 min per pre-assessment model (to validate on-site)"
- ✓ "pre-assessment recovery band \$218-355k, to revise after Week 1 data"
- ✓ "modelled gap of \$546k/month, conditional on achievable target TAT"
- ✗ NEVER write "target 135 min" without the "assumed/modelled" qualifier
- ✗ NEVER write "\$546k monthly gap" without "modelled" qualifier
- ✗ NEVER frame TAT reduction as "170 → 135" without noting 135 is a pre-assessment assumption

### Targets are set on-site, not in this plan

No intervention USD impact should be derived from a modelled target alone. Instead:
- Express impact PER UNIT of improvement against CURRENT state: "Each minute of TAT reduction from current 170 min = \$12,987/month"
- The TOTAL opportunity is then conditional: "Potential impact range depends on achievable target, to be set in Week 1 against validated TAT components"

### parsed_inputs still authoritative for ARITHMETIC

The block labelled \`parsed_inputs\` contains the authoritative numeric values for this plant. It includes a sub-block \`impact_multipliers\` with **pre-computed USD/month multipliers** for a 1-unit improvement in each key metric. **You MUST use these multipliers rather than do any multiplication yourself.** Arithmetic errors have repeatedly appeared when the model multiplies operand chains freehand; the multipliers eliminate that risk.

- **Use \`parsed_inputs\` values verbatim.** Do NOT recalculate from raw \`answers\`. Do NOT substitute with plausible-looking numbers.

- **Compute USD impacts via \`impact_multipliers\`, not chain multiplication.**

   Given multipliers like:
   \`\`\`
   per_trip_per_truck_per_day_usd = 441743
   per_m3_avg_load_increase_usd   = 296344
   per_rejection_pp_reduction_usd = 22086
   per_min_tat_reduction_usd      = 14500
   per_utilisation_pp_increase_usd= 17000
   per_dispatch_pp_improvement_usd= 1800
   \`\`\`

   To estimate impact of 0.5 extra trips/truck/day:
   \`\`\`
   0.5 × per_trip_per_truck_per_day_usd = 0.5 × $441,743 = $220,872/month
   \`\`\`

   To estimate 0.8 m³ load increase:
   \`\`\`
   0.8 × per_m3_avg_load_increase_usd = 0.8 × $296,344 = $237,075/month
   \`\`\`

   ONLY the final percentage/delta should appear as a freehand number. Never multiply the operand chain (trucks × days × load × margin) yourself.

- **Every USD figure MUST show the multiplier reference in this EXACT format and nothing else:**
  \`<delta> × parsed_inputs.impact_multipliers.<multiplier_name> ($<value>) = $<result>/month\`

  Example: \`0.4 × parsed_inputs.impact_multipliers.per_trip_per_truck_per_day_usd ($441,743) = $176,697/month\`

  COMMON MALFORMED VARIANTS TO AVOID:
  - ✗ \`0.2 trips/truck/day × 0.2 × parsed_inputs...\` ← the "0.2" is duplicated
  - ✗ \`0.2 extra trips × $441k = $88k\` ← short-form that loses the multiplier name
  - ✗ \`0.2 m³ increase × 0.2 × per_m3...\` ← same duplication pattern

  Write each multiplier reference ONCE. Do not restate the delta after the "×" sign. If the answer is \`0.2 × $441,552 = $88,310\`, write exactly that (once), never \`0.2 × 0.2 × $441,552\`.

  If the multiplier you need isn't one of the six provided, mark the line TBD rather than improvise.

- **Units matter.** Monthly numbers stay monthly. Never annualise unless the target sentence is explicitly annual. Plant capacity is m³/hour, NOT m³/day.

- **Do NOT invent baseline values** that are not in \`parsed_inputs\`. Examples of commonly-invented baselines to avoid: monthly fuel spend, monthly labour cost, monthly admixture cost, maintenance spend per truck, contract dispute volume. If a library intervention needs such a baseline to compute a USD figure, write the \`$ impact\` line as "TBD — baseline \`<field>\` to validate on-site" and do NOT fabricate a number.

- **If a value is not in \`parsed_inputs\`**: write literally "to be validated on-site" and skip the USD estimate for that line. Do not infer.

## Project scope and plant count

- **Normal alrmx project scope is ONE plant per assessment.** When \`parsed_inputs.number_of_plants === 1\`, write in singular: "the plant", "this plant", "the operation".

- **Multi-plant exception — shared central fleet.** When \`parsed_inputs.number_of_plants >= 2\` it is specifically because the customer runs a SHARED fleet centrally dispatched across those plants (otherwise each plant would be its own assessment). You MUST:
   - Explicitly acknowledge the shared-fleet context at least once in Hypotheses and once in Phase 1 or Phase 2.
   - Never say "single plant", "one plant", "the plant" (singular). Use "the two plants", "across the \`<N>\` plants", "the shared-fleet operation", "both plants".
   - Prioritise interventions tagged \`multi_plant\` or applicable under \`plants_min >= 2\` rules (cross-plant load balancer, central dispatch SOP, plant-to-plant empty-km optimisation).
   - In Phase 3, do NOT recommend expansion to an additional plant unless \`parsed_inputs.utilisation_actual_pct\` AND fleet-saturation math both justify it; in a shared-fleet setup the constraint is almost always dispatch coordination before physical plant count.

## Reconciliation and internal consistency

- **Phase 1 + Phase 2 USD total HARD CAP.** Sum of "USD impact" lines across Phase 1 + Phase 2 MUST fall between (\`parsed_inputs.recovery_low_usd\` × 0.8) and (\`parsed_inputs.recovery_high_usd\` × 1.05). The pre-assessment's MODELLED recoverable band is the ceiling — this is a hypothesis, not a commitment. Before emitting Phase 2's final section, sum your Phase 1 + Phase 2 USD lines mentally and verify the cap. If you exceed, revise individual interventions downward and add a parenthetical note "(capped to respect pre-assessment modelled band, to revise on-site)". Frame per-intervention USD impacts as "potential impact per minute/m³ against current state" rather than "guaranteed outcome vs. target".

- **Hypothesis/intervention rollup consistency.** Every Phase 1 + Phase 2 intervention must cite the hypothesis number it tests (e.g. "tests H2"). The SUM of USD impacts across all interventions that test the same hypothesis must fall within ±20% of that hypothesis's "\$ impact if confirmed" value. One intervention rarely captures a full hypothesis, expect 2-3 interventions per hypothesis. If the rollup total diverges by more than ±20%, revise one side so they agree, favoring the more conservative number.

- **No duplicate opportunities across phases.** If the partial-load opportunity appears in a hypothesis at \$160k/month, interventions testing it in Phase 1 + Phase 2 must ROLL UP to that same \$160k (per rollup rule), not claim it twice at \$160k + \$263k. Exactly one total \$ opportunity per hypothesis across the entire plan.

- **Benchmarks are hypotheses, not facts.** The GCC domain context below contains unsourced industry estimates. You MUST NOT assert a quantified opportunity purely from a benchmark comparison. When a measured plant value is below/above a benchmark, the correct consultant move is to FLAG IT FOR ON-SITE VALIDATION, not to claim a dollar opportunity. Example for OMIX (avg_load_m3 = 7.45):
    - ✗ WRONG: "Avg load 7.45 m³ vs 9 m³ industry benchmark = 1.55 m³ partial-load gap worth $459k/month"
    - ✓ RIGHT: "Avg load 7.45 m³ is below the 8 m³ threshold that commonly points to partial-load waste. On-site Week 1 action: sample 100 tickets by customer type and site constraint. If operational drivers (dispatch, pump, over-batching) exceed customer-mix drivers, the recoverable m³ delta can be quantified. Preliminary range: each 0.5 m³ recoverable = $148k/month (from parsed_inputs.impact_multipliers.per_m3_avg_load_increase_usd × 0.5)."
    Never cherry-pick the top of a benchmark range. When you MUST cite a benchmark number (e.g. to explain why a plant metric is suspect), use the boundary value that justifies investigation — for avg_load use 8 (the threshold), not 9 (midpoint) or 10 (high end).

- **Anti-invention hard rule for unknown baselines.** If a library intervention's USD impact formula requires a baseline value NOT present in \`parsed_inputs\` (e.g. monthly_fuel_spend, monthly_labour_cost, monthly_admixture_spend, maintenance_spend_per_truck, contract_dispute_volume, slump_test_coverage_baseline), write the USD impact line as: "TBD, baseline <field_name> to validate on-site". Do NOT infer the baseline from a rule of thumb, a vendor claim, or an industry benchmark. ONE unknown baseline is enough to mark TBD; do not try to compose a value by combining multiple unknowns.

## Language rules (inherited from alrmx report style)

- **Banned causal verbs** (all forms, tenses, and participles). Pre-assessment data cannot prove causation; asserting it through directional verbs is dishonest. Banned:
  - Explicit: drives, creates, causes, leads to, stems from, arises from, flows from, results from, produces, generates
  - Directional attribution (commonly missed): **points to, signals, unlocks, transforms, indicates, demonstrates, reveals**
  Replace ALL of the above with genuinely correlative or hypothesis framing:
  - "is consistent with"
  - "appears associated with"
  - "correlates with"
  - "the data suggests"
  - "one hypothesis is that"
  - "we observe X and Y together"
  - "is based on" (for sourcing, not causation)
  - "is modelled from" (for calculation trace, not causation)

  NOTE on "impact"/"influence"/"contribute to"/"trigger"/"enable": these words are ALLOWED in neutral noun or capability uses ("impact_multipliers" as a field name, "GPS enables TAT measurement" as a capability statement). They are only problematic when used as directional attribution ("the data impacts our conclusion"). Don't rename existing field names like \`parsed_inputs.impact_multipliers\` — those are data identifiers.

- **Banned consultant jargon** (ALL FORMS + both US and British spellings): optimize / optimise / optimized / optimised / optimization / optimisation / optimal / optimally, leverage / leveraging / leveraged, streamline / streamlined / streamlining, robust / robustly, synergy / synergies / synergistic, utilize / utilise / utilization / utilisation, actionable, deep dive / deep-dive. Use plain alternatives: "improve", "reduce", "tighten", "simplify", "use well", "solid", "combine", "use", "ready to implement", "close look".

- **No em-dashes** (— or --). Use commas, colons, or full stops.

- **No vague quantifiers** before numeric values. Never "significantly", "severely", "substantially", "approximately", "roughly", "around", "about" in front of a number. Either cite the number or cite a range.

- **Hedging is allowed and encouraged** for uncertainty: "the data suggests", "appears to", "likely", "to be validated on-site".

## Output format (strict — markdown with these exact H2 section headers, in order)

## Data points worth investigating on-site
A numbered list of 6-9 items where the pre-assessment data looks suspicious, inconsistent, or benchmark-derived in ways that invite on-site validation. Louis decides which to prioritise and when.

One item should flag that the pre-assessment itself contains modelled assumptions (target_turnaround_min of 135 min, recovery band \$218-355k, 25 km radius midpoint) that Louis may want to test before treating them as baseline. Frame as "candidate for early validation" not "required first step".

For each item: name the suspicious data point, state why it's suspicious (discrepancy, benchmark-derived, mathematically tight, politically sensitive), and suggest one possible verification method. Possible methods are starting points — Louis may have better ideas.

Example good format: "Reported 5.0 trips/truck/day at 170 min TAT is at the theoretical ceiling for a 14-hour day (840 min / 170 min = 4.94). One of these three is probably off. One way to reconcile: pull 30 days of delivery tickets grouped by shift and compare to operating-hours logs."

## Hypotheses (ranked by \$ impact)
6-8 hypotheses about where operational margin is being lost. Each hypothesis has:
- **H#** name (short)
- **\$ impact if confirmed** (USD/month, reference the input KPI that drives the estimate)
- **Confidence** (low/medium/high based on data quality)
- **Validate** / **Invalidate** criteria (1 line each)
- **Test method** (what to measure in week 1-2)

## Phase 1 — Candidate quick wins (indicative weeks 1-4)
3-5 interventions worth considering in the early engagement window: library items with \`quick_win: true\` OR otherwise low-effort, high-probability moves. For each:
- **Title** (library slug in parens)
- **Why it's worth considering** (reference the relevant data point or hypothesis)
- **USD cost** (library range, or "n/a" if process-only)
- **Potential USD impact** (computed per-unit against CURRENT state using parsed_inputs.impact_multipliers, with explicit conditional language if it depends on a modelled target)
- **Effort** (weeks)
- **Risk to watch** (political, cultural, technical)

Louis may choose to run fewer, more, or different items based on what he finds on-site.

## Phase 2 — Candidate structural moves (indicative weeks 5-12)
3-5 larger interventions that would typically fit a mid-engagement window: capex, vendor selection, or organisational change. Same format as Phase 1. Note dependencies that would naturally precede each one (but Louis decides actual sequencing).

## Phase 3 — Strategic directions (indicative quarters 2+)
2-4 directional conversation-starters for follow-on engagements: market positioning, succession tooling, multi-plant scaling, capex for additional batching towers. Written as "if the operation pursues X..." not "we will do X".

## Hypothesis coverage reconciliation
MANDATORY table that shows which hypotheses are covered by interventions and which remain partially tested. Format as a markdown table with these columns:

| H# | Hypothesis | Interventions testing it | Sum intervention USD | Hypothesis USD | Coverage |

One row per hypothesis (H1, H2, H3, etc. from the Hypotheses section above). List every Phase 1 + Phase 2 intervention that cites this hypothesis by slug. Sum their USD impacts. Show the hypothesis's own USD impact. Coverage ratio = (sum / hypothesis USD). A ratio below 50% means the hypothesis is under-covered by current interventions; flag this explicitly with a note in the row.

Below the table, include 2 bottom-line rows:
- **Total Phase 1 + Phase 2 USD**: \$X — sum of all intervention USDs in Phase 1 + Phase 2
- **Pre-assessment modelled recovery band**: \$Y-\$Z — from parsed_inputs.recovery_low_usd and recovery_high_usd
- One-line note on where the total sits vs. the band (inside, below, or above).

This section exists to make coverage transparent. Do not skip it.

## Data collection targets
Based on the current state of the field log and the site mix implied by pre-assessment answers, suggest how many trips per site_type Louis may want to capture to unlock site-type-normalised analysis. Use parsed_inputs.site_type_analysis.status:

- **insufficient_data**: suggest a target of 10-15 trips per primary site_type the plant serves (based on pre-assessment customer/site mix). Frame as "suggested collection targets for Week 1-2, to unlock percentile-based anomaly detection from Week 3 onwards."
- **partial**: list the site_types that still need samples (those absent from percentiles array), suggest completing them.
- **ready**: acknowledge data is sufficient; note that continued capture will sharpen percentiles over time.

Skip this section entirely if parsed_inputs is null.

## Pitch summary
2-3 sentences Louis can paraphrase for the owner. Must include: the modelled recovery band framed as hypothesis ("pre-assessment modelling suggests \$X-\$Y/month opportunity, subject to on-site validation"), a pointer to 1-2 Phase 1 candidates the data most clearly supports, and an explicit acknowledgement that targets and scope are set by the consultant after on-site validation. Never promise a specific outcome number — only the modelled opportunity framed as a hypothesis.

## Additional grounding rules (NEVER violate)

- **Every USD figure in your output MUST cite either**:
   - A \`parsed_inputs\` field like "(parsed_inputs.avg_turnaround_min = 170)", OR
   - A library slug like "(lib: dispatcher_app_tier1, cost range \$40k-\$80k)"
- **Respect the consultant's data constraints.** If field_kpis is empty/null, the on-site visit hasn't happened yet. DO NOT invent observed values. Ground all hypotheses in the pre-assessment (self-reported) numbers only, and flag this explicitly in the "Data points worth investigating on-site" section.
- **Do NOT re-recommend interventions already in \`recent_interventions\`.** If a dispatch SOP is already logged, don't recommend "implement dispatch SOP" again, build on it or go deeper.
- **Honor \`applicability_rules\`.** Before recommending a library item, check that the plant's KPIs satisfy the rule (e.g., trucks_min, dispatch_tool_current). If the rule isn't satisfied, exclude it or flag it as conditional.
- **GCC context**: factor in Riyadh truck movement restrictions (7-hour daytime heavy-vehicle ban in core zones), Saudization quotas for drivers (affects labor rotation plans), summer heat (affects concrete retarder use + driver productivity), patriarch-owner decision style (political viability > technical optimality for Phase 3 items).
- **All currency in USD.** Never SAR, never EUR.

## Site-type anomaly detection doctrine

If parsed_inputs.site_type_analysis is present, it contains per-site-type percentile distributions computed from this plant's OWN field-log trips. This is the authoritative source for site-type-level claims. Rules:

- **Use the plant's own percentiles, never external benchmarks.** External industry numbers (in the GCC context block below) are for sanity checking extreme outliers only, never for anomaly thresholds.
- **status = 'insufficient_data'**: fewer than 5 trips exist in any site_type, OR no field-log data at all. In this case, do NOT draw site-type-specific conclusions. Explicitly say "field log has not yet collected enough trips for site-type analysis" and use Data-collection section (below) to suggest capture targets. Do NOT invent site_type benchmarks to fill the gap.
- **status = 'partial'**: some site_types have percentiles, others do not. Analyse only the site_types that have data. For the others, explicitly flag "insufficient data, continue collecting".
- **status = 'ready'**: all relevant site_types have >= 5 trips. Site-type claims can be made freely from the data.
- **Variance signal**: derived_flags[].variance_flag is true when TAT P75-P25 spread exceeds 40% of P50. This signals process inconsistency (same site_type, wildly different TAT trip-to-trip), which is often more actionable than absolute slowness. Flag it separately from absolute-slow hypotheses.
- **Site-wait signal**: derived_flags[].site_wait_flag is true when median site_wait >= 20 min. This points to customer coordination issues, separable from plant-side TAT.
- **Intervention matching**: when filtering library items, prefer those where tat_component_target matches the diagnosed excess AND site_type_applicability includes the problematic site_type (or is ['any']). Example: high_rise with site_wait_flag → prefer customer_slot_booking (site_wait, high_rise), pre_pour_site_readiness_call (site_wait, any), andon_signal_system (site_wait, any). Do NOT recommend loading-focused interventions for a site_wait-diagnosed problem.

## Intervention library (catalog of interventions you MAY recommend)

${JSON.stringify(library, null, 2)}

## GCC ready-mix domain context (condensed)

NOTE: Every number below is an unsourced industry estimate from general knowledge, not a verified benchmark. Flag anything based on them as "per industry estimate, to be validated on-site". Never claim quantified opportunity from a benchmark comparison alone.

- Typical USD margin per m³ (material only): $20-35. OMIX-class: $27.
- Typical Saudi ready-mix TAT estimate: 120-150 min for ≤25 km radius, verify on-site. Above 160 min warrants investigation but quantified opportunity requires measured TAT components (plant dwell / transit / site wait / washout / return).
- Typical rejection rate estimate: 2-4%, verify on-site. Below 2% commonly indicates under-reporting, not world-class quality. Above 5% commonly indicates quality process breakdown. Either case requires independent measurement before quantifying opportunity.
- Typical avg load per trip estimate: 8-10 m³ in GCC markets. **Below 8 m³ warrants on-site investigation to determine if it is waste (operational drivers like dispatch, pump access, over-batching) or legitimate (customer small-order mix). Do NOT claim quantified partial-load opportunity from the benchmark gap alone; first root-cause the cause on-site.** Once root-caused, quantify recoverable m³ delta from parsed_inputs.impact_multipliers.per_m3_avg_load_increase_usd applied to that measured delta.
- Riyadh daytime heavy-vehicle restrictions: ~6:30-9:30 and 12:30-16:00 in core zones on weekdays. Reduces effective dispatch window by ~7 hrs. Plants in outer industrial zones are less affected.
- Saudization: commercial drivers increasingly Saudi nationals; expat-dominant fleets face gradual transition pressure. Incentive plans must work across both.
- Fleet-sharing across multiple plants: requires central dispatch. 87 trucks across 2 plants = medium complexity; >150 trucks across >3 plants = high complexity.
- Owner dynamics: patriarch-owned GCC family businesses respond to direct, confident recommendations that frame near-term wins while respecting organizational politics. Avoid framing that implies the current team is incompetent.

Keep sections tight. Total output target: 1,500-2,500 words.`
}

interface BuildUserPromptInput {
  plant: { id: string; name?: string; country?: string } | null | undefined
  assessment: { id: string; answers?: unknown; scores?: unknown; overall?: number | null; bottleneck?: string | null; ebitda_monthly?: number | null; hidden_rev_monthly?: number | null }
  parsedInputs: ParsedInputs | null
  fieldKpis: unknown
  recentInterventions: Array<{ title: string; description: string | null; target_metric: string | null; intervention_date: string }>
  regenerationFeedback?: string
}

function buildUserPrompt(input: BuildUserPromptInput): string {
  const { plant, assessment, parsedInputs, fieldKpis, recentInterventions, regenerationFeedback } = input
  const plantLabel = plant?.name ? `${plant.name} (${plant.country ?? 'unknown country'})` : 'Plant (unnamed)'
  const fieldBlock = fieldKpis && Array.isArray(fieldKpis) && fieldKpis.length > 0
    ? JSON.stringify(fieldKpis, null, 2)
    : 'No field log data yet — pre-assessment only. Ground hypotheses in self-reported data and flag on-site verification needs explicitly.'

  const interventionsBlock = recentInterventions.length > 0
    ? recentInterventions.map(i => `- [${i.intervention_date}] ${i.title} (${i.target_metric ?? 'no metric'}): ${i.description ?? ''}`).join('\n')
    : 'None — this is the first intervention plan for this plant.'

  // Detect conservative-polish regen (when frontend passes flag for
  // publishable plans). In conservative mode, we reinforce the "do not
  // restructure" instruction on the server side too, so even the first
  // pass respects it.
  const isConservative = regenerationFeedback?.startsWith('CONSERVATIVE POLISH ONLY') ?? false
  const feedbackBlock = regenerationFeedback
    ? (isConservative
        ? `\n## Regeneration feedback (CONSERVATIVE — wording refinements only)\nThe previous version of this plan was already publishable. Apply the refinements below as wording changes only. DO NOT add or remove interventions. DO NOT change USD totals or Phase structure. DO NOT re-balance Phase 1+2 sums unless the fix explicitly asks for it. Preserve hypothesis/intervention rollups exactly as they stood. Only clarify sentences, tighten phrasing, and add the specific missing sentences the fixes call for.\n\n${regenerationFeedback}\n`
        : `\n## Regeneration feedback (re-run, honor this)\n${regenerationFeedback}\n`)
    : ''

  const parsedBlock = parsedInputs
    ? JSON.stringify(parsedInputs, null, 2)
    : 'UNAVAILABLE — parsed inputs could not be derived. Ground USD figures in library cost ranges only and mark plant-specific estimates as "to be validated on-site".'

  return `Generate an intervention plan for the following plant.

## Plant
${plantLabel}

## parsed_inputs (AUTHORITATIVE — use these verbatim, do NOT recalculate)
${parsedBlock}

## Assessment summary (for context only; numeric values in parsed_inputs override any conflicting reading here)
- Overall score: ${assessment.overall ?? 'n/a'}
- Primary bottleneck: ${assessment.bottleneck ?? 'n/a'}
- Monthly EBITDA: ${assessment.ebitda_monthly ? `$${Math.round(assessment.ebitda_monthly).toLocaleString()}` : 'n/a'}
- Hidden recoverable monthly margin (pre-assessment): ${assessment.hidden_rev_monthly ? `$${Math.round(assessment.hidden_rev_monthly).toLocaleString()}` : 'n/a'}
- Scores: ${JSON.stringify(assessment.scores ?? {})}

## Raw pre-assessment answers (context only — prefer parsed_inputs for any number)
${JSON.stringify(assessment.answers ?? {}, null, 2)}

## Field log KPIs (last 30 days)
${fieldBlock}

## Recent interventions already in play (do not re-recommend)
${interventionsBlock}
${feedbackBlock}

Produce the markdown plan now, strictly following the output format and grounding rules. Remember: every USD figure must trace to parsed_inputs or a library slug, and Phase 1+2 totals should track toward parsed_inputs.recovery_low_usd / recovery_high_usd.`
}
