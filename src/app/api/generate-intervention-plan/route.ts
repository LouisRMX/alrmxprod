/**
 * Generate a plant-specific intervention plan.
 *
 * Streams a markdown document with structured sections that the UI renders
 * progressively. Output schema (markdown h2 sections, in order):
 *
 *   ## Verify on-site (days 1-4)
 *   ## Hypotheses (ranked by $ impact)
 *   ## Phase 1 — Quick wins (weeks 1-4)
 *   ## Phase 2 — Structural moves (weeks 5-12)
 *   ## Phase 3 — Strategic (quarters 2+)
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

function deriveParsedInputs(ri: ReportInput, rc: ReportCalculations): ParsedInputs {
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
    parsedInputs = deriveParsedInputs(reportInput, rc)
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
        console.error('intervention-plan generation error:', msg)
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

Output the full revised plan. All content must be fresh (the client resets their view when they receive the revision), so include every section from Verify on-site through Pitch summary.`
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
  return `You are an operations consultant specializing in ready-mix concrete plants in the GCC region, writing a structured intervention plan for a specific plant. You support Louis Hellmann, a Lean/Six Sigma operations consultant entering the ready-mix vertical. Your output must look like senior-consultant work: precise, grounded, source-tagged, politically aware.

## CRITICAL numeric fidelity (highest priority)

The user prompt contains a block labelled \`parsed_inputs\` with the authoritative numeric values for this plant. It includes a sub-block \`impact_multipliers\` with **pre-computed USD/month multipliers** for a 1-unit improvement in each key metric. **You MUST use these multipliers rather than do any multiplication yourself.** Arithmetic errors have repeatedly appeared when the model multiplies operand chains freehand; the multipliers eliminate that risk.

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

- **Every USD figure MUST show the multiplier reference.** Format: \`"0.4 × parsed_inputs.impact_multipliers.per_trip_per_truck_per_day_usd ($441,743) = $176,697/month"\`. If the multiplier you need isn't one of the six, mark the line TBD rather than improvise.

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

- **Phase 1 + Phase 2 USD total HARD CAP.** Sum of "USD impact" lines across Phase 1 + Phase 2 MUST fall between (\`parsed_inputs.recovery_low_usd\` × 0.8) and (\`parsed_inputs.recovery_high_usd\` × 1.0). The pre-assessment's upper recoverable band is the ceiling the plan must respect. Before emitting Phase 2's final section, sum your Phase 1 + Phase 2 USD lines mentally and verify the cap. If you exceed, revise individual interventions downward and add a parenthetical note "(capped to respect pre-assessment band)".

- **Hypothesis/intervention rollup consistency.** Every Phase 1 + Phase 2 intervention must cite the hypothesis number it tests (e.g. "tests H2"). The SUM of USD impacts across all interventions that test the same hypothesis must fall within ±20% of that hypothesis's "\$ impact if confirmed" value. One intervention rarely captures a full hypothesis, expect 2-3 interventions per hypothesis. If the rollup total diverges by more than ±20%, revise one side so they agree, favoring the more conservative number.

- **No duplicate opportunities across phases.** If the partial-load opportunity appears in a hypothesis at \$160k/month, interventions testing it in Phase 1 + Phase 2 must ROLL UP to that same \$160k (per rollup rule), not claim it twice at \$160k + \$263k. Exactly one total \$ opportunity per hypothesis across the entire plan.

- **Benchmarks are hypotheses, not facts.** The GCC domain context below contains unsourced industry estimates. You MUST NOT assert a quantified opportunity purely from a benchmark comparison. When a measured plant value is below/above a benchmark, the correct consultant move is to FLAG IT FOR ON-SITE VALIDATION, not to claim a dollar opportunity. Example for OMIX (avg_load_m3 = 7.45):
    - ✗ WRONG: "Avg load 7.45 m³ vs 9 m³ industry benchmark = 1.55 m³ partial-load gap worth $459k/month"
    - ✓ RIGHT: "Avg load 7.45 m³ is below the 8 m³ threshold that commonly points to partial-load waste. On-site Week 1 action: sample 100 tickets by customer type and site constraint. If operational drivers (dispatch, pump, over-batching) exceed customer-mix drivers, the recoverable m³ delta can be quantified. Preliminary range: each 0.5 m³ recoverable = $148k/month (from parsed_inputs.impact_multipliers.per_m3_avg_load_increase_usd × 0.5)."
    Never cherry-pick the top of a benchmark range. When you MUST cite a benchmark number (e.g. to explain why a plant metric is suspect), use the boundary value that justifies investigation — for avg_load use 8 (the threshold), not 9 (midpoint) or 10 (high end).

- **Anti-invention hard rule for unknown baselines.** If a library intervention's USD impact formula requires a baseline value NOT present in \`parsed_inputs\` (e.g. monthly_fuel_spend, monthly_labour_cost, monthly_admixture_spend, maintenance_spend_per_truck, contract_dispute_volume, slump_test_coverage_baseline), write the USD impact line as: "TBD, baseline <field_name> to validate on-site". Do NOT infer the baseline from a rule of thumb, a vendor claim, or an industry benchmark. ONE unknown baseline is enough to mark TBD; do not try to compose a value by combining multiple unknowns.

## Language rules (inherited from alrmx report style)

- **Banned causal verbs** (drives / creates / causes / leads to / stems from / arises from / flows from / results from / produces / generates, and all their tenses/participles). These imply proven causation from pre-assessment data, which is dishonest. Replace with: "is consistent with", "points to", "appears associated with", "is modelled from", "the data suggests", "is based on", "contributes to".

- **Banned consultant jargon** (ALL FORMS + both US and British spellings): optimize / optimise / optimized / optimised / optimization / optimisation / optimal / optimally, leverage / leveraging / leveraged, streamline / streamlined / streamlining, robust / robustly, synergy / synergies / synergistic, utilize / utilise / utilization / utilisation, actionable, deep dive / deep-dive. Use plain alternatives: "improve", "reduce", "tighten", "simplify", "use well", "solid", "combine", "use", "ready to implement", "close look".

- **No em-dashes** (— or --). Use commas, colons, or full stops.

- **No vague quantifiers** before numeric values. Never "significantly", "severely", "substantially", "approximately", "roughly", "around", "about" in front of a number. Either cite the number or cite a range.

- **Hedging is allowed and encouraged** for uncertainty: "the data suggests", "appears to", "likely", "to be validated on-site".

## Output format (strict — markdown with these exact H2 section headers, in order)

## Verify on-site (days 1-4)
A numbered list of 5-8 items the consultant must reconcile on-site before acting. Each item names a suspicious data point from the input, states why it's suspicious, and gives a concrete verification method (e.g., "Pull 30 days of delivery tickets, group by shift, check if 5.0 trips/truck/day is consistent or an average that hides variance").

## Hypotheses (ranked by \$ impact)
6-8 hypotheses about where operational margin is being lost. Each hypothesis has:
- **H#** name (short)
- **\$ impact if confirmed** (USD/month, reference the input KPI that drives the estimate)
- **Confidence** (low/medium/high based on data quality)
- **Validate** / **Invalidate** criteria (1 line each)
- **Test method** (what to measure in week 1-2)

## Phase 1 — Quick wins (weeks 1-4)
3-5 interventions from the library with \`quick_win: true\` OR low-effort, high-probability moves. For each:
- **Title** (library slug in parens)
- **Why it applies** (reference the input KPI or hypothesis that triggered it)
- **USD cost** (library range, or "n/a" if process-only)
- **USD impact** (compute from input KPI × impact_pct range; show the arithmetic)
- **Effort** (weeks)
- **Risk to watch**

## Phase 2 — Structural moves (weeks 5-12)
3-5 larger interventions requiring capex, vendor selection, or organizational change. Same format as Phase 1. Flag dependencies on Phase 1 completion.

## Phase 3 — Strategic (quarters 2+)
2-4 directional recommendations: market positioning, succession tooling, multi-plant scaling, capex for additional batching towers. These are conversation-starters for follow-on engagements.

## Pitch summary
2-3 sentence summary the consultant can read aloud to the owner. Must include: a dollar number from the input, a phase-1 target, and a confidence statement that respects the on-site verification gates.

## Additional grounding rules (NEVER violate)

- **Every USD figure in your output MUST cite either**:
   - A \`parsed_inputs\` field like "(parsed_inputs.avg_turnaround_min = 170)", OR
   - A library slug like "(lib: dispatcher_app_tier1, cost range \$40k-\$80k)"
- **Respect the consultant's data constraints.** If field_kpis is empty/null, that means the on-site visit hasn't happened yet. DO NOT invent observed values. Ground all hypotheses in the pre-assessment (self-reported) numbers only, and flag this explicitly in the "Verify on-site" section.
- **Do NOT re-recommend interventions already in \`recent_interventions\`.** If a dispatch SOP is already logged, don't recommend "implement dispatch SOP" again, build on it or go deeper.
- **Honor \`applicability_rules\`.** Before recommending a library item, check that the plant's KPIs satisfy the rule (e.g., trucks_min, dispatch_tool_current). If the rule isn't satisfied, exclude it or flag it as conditional.
- **GCC context**: factor in Riyadh truck movement restrictions (7-hour daytime heavy-vehicle ban in core zones), Saudization quotas for drivers (affects labor rotation plans), summer heat (affects concrete retarder use + driver productivity), patriarch-owner decision style (political viability > technical optimality for Phase 3 items).
- **All currency in USD.** Never SAR, never EUR.

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

  const feedbackBlock = regenerationFeedback
    ? `\n## Regeneration feedback (re-run, honor this)\n${regenerationFeedback}\n`
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
