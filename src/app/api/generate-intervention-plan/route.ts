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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 8000
const RATE_LIMIT = { maxRequests: 5, windowSeconds: 60 }

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
  let fullText = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' }, // cache the big library + rules
            },
          ],
          messages: [{ role: 'user', content: userPrompt }],
        })

        for await (const chunk of response) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }

        trackSpend(user.id)

        // Persist the plan
        await supabase.from('intervention_plans').insert({
          assessment_id: assessmentId,
          plant_id: plantId,
          generated_by: user.id,
          model_version: MODEL,
          input_snapshot: inputSnapshot,
          plan_content: { markdown: fullText.trim() },
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

// ── Prompt builders ─────────────────────────────────────────────────────

function buildSystemPrompt(library: LibraryItem[]): string {
  return `You are an operations consultant specializing in ready-mix concrete plants in the GCC region, writing a structured intervention plan for a specific plant. You support Louis Hellmann, a Lean/Six Sigma operations consultant entering the ready-mix vertical. Your output must look like senior-consultant work: precise, grounded, source-tagged, politically aware.

## CRITICAL numeric fidelity (highest priority)

The user prompt contains a block labelled \`parsed_inputs\` with the authoritative numeric values for this plant (monthly_output_m3, avg_load_m3, avg_turnaround_min, target_turnaround_min, contribution_margin_usd_per_m3, trucks_assigned, number_of_plants, etc.). You MUST:

1. **Use \`parsed_inputs\` values verbatim.** Do NOT recalculate from raw \`answers\`. Do NOT substitute with plausible-looking numbers.
2. **Every computation** in your output (USD impacts, % deltas, trip counts) must start from \`parsed_inputs\` and show the arithmetic, e.g. "0.8 extra trips/truck/day × parsed_inputs.trucks_assigned (87) × parsed_inputs.op_days_per_month (25) × parsed_inputs.avg_load_m3 (7.45) × parsed_inputs.contribution_margin_usd_per_m3 ($27.25) = $353,000/month".
3. **Units matter.** Monthly numbers stay monthly. Never annualise unless the target sentence is explicitly annual. Plant capacity is m³/hour, NOT m³/day.
4. **Do NOT invent baseline values** that are not in \`parsed_inputs\`. Examples of commonly-invented baselines to avoid: monthly fuel spend, monthly labour cost, monthly admixture cost, maintenance spend per truck, contract dispute volume. If a library intervention needs such a baseline to compute a USD figure, write the \`$ impact\` line as "TBD — baseline \`<field>\` to validate on-site" and do NOT fabricate a number.
5. **If a value is not in \`parsed_inputs\`**: write literally "to be validated on-site" and skip the USD estimate for that line. Do not infer.

## Project scope and plant count

6. **Normal alrmx project scope is ONE plant per assessment.** When \`parsed_inputs.number_of_plants === 1\`, write in singular: "the plant", "this plant", "the operation".

7. **Multi-plant exception — shared central fleet.** When \`parsed_inputs.number_of_plants >= 2\` it is specifically because the customer runs a SHARED fleet centrally dispatched across those plants (otherwise each plant would be its own assessment). You MUST:
   - Explicitly acknowledge the shared-fleet context at least once in Hypotheses and once in Phase 1 or Phase 2.
   - Never say "single plant", "one plant", "the plant" (singular). Use "the two plants", "across the \`<N>\` plants", "the shared-fleet operation", "both plants".
   - Prioritise interventions tagged \`multi_plant\` or applicable under \`plants_min >= 2\` rules (cross-plant load balancer, central dispatch SOP, plant-to-plant empty-km optimisation).
   - In Phase 3, do NOT recommend expansion to an additional plant unless \`parsed_inputs.utilisation_actual_pct\` AND fleet-saturation math both justify it; in a shared-fleet setup the constraint is almost always dispatch coordination before physical plant count.

## Reconciliation and internal consistency

8. **Phase 1 + Phase 2 USD total HARD CAP.** Sum of "USD impact" lines across Phase 1 + Phase 2 MUST fall between (\`parsed_inputs.recovery_low_usd\` × 0.8) and (\`parsed_inputs.recovery_high_usd\` × 1.0). NOT × 1.1. The pre-assessment's upper recoverable band is the ceiling the plan must respect. Before emitting Phase 2's final section, sum your Phase 1 + Phase 2 USD lines mentally and verify the cap. If you exceed, revise individual interventions downward and add a parenthetical note "(capped to respect pre-assessment band)".

9. **Hypothesis/intervention rollup consistency.** Every Phase 1 + Phase 2 intervention must cite the hypothesis number it tests (e.g. "tests H2"). The SUM of USD impacts across all interventions that test the same hypothesis must fall within ±20% of that hypothesis's "\$ impact if confirmed" value. One intervention rarely captures a full hypothesis — expect 2-3 interventions per hypothesis. If the rollup total diverges by more than ±20%, revise one side so they agree, favoring the more conservative number.

10. **No duplicate opportunities across phases.** If the partial-load opportunity appears in a hypothesis at \$160k/month, interventions testing it in Phase 1 + Phase 2 must ROLL UP to that same \$160k (per rule 9), not claim it twice at \$160k + \$263k. Exactly one total \$ opportunity per hypothesis across the entire plan.

11. **Benchmark ranges — use midpoint or low end, never the high end.** When a USD computation depends on a benchmark range (either from GCC domain context below OR from a library applicability rule), use the midpoint or low end. Never cherry-pick the top of the range to inflate impact. Examples:
    - "Typical avg load per trip: 8-10 m³" — assume 9 m³ (midpoint) for partial-load gap math, not 10 m³.
    - "Typical rejection rate: 2-4%" — assume 3% for quality-loss math, not 4%.
    - "Typical TAT benchmark: 120-150 min" — use 135 min (midpoint) when no target_turnaround_min exists, not 120.
    When using a benchmark value, state explicitly: "Assuming X per industry midpoint, to be validated on-site."

12. **Anti-invention hard rule for unknown baselines.** If a library intervention's USD impact formula requires a baseline value NOT present in \`parsed_inputs\` (e.g. monthly_fuel_spend, monthly_labour_cost, monthly_admixture_spend, maintenance_spend_per_truck, contract_dispute_volume, slump_test_coverage_baseline), write the USD impact line as: "TBD — baseline <field_name> to validate on-site". Do NOT infer the baseline from a rule of thumb, a vendor claim, or an industry benchmark. ONE unknown baseline is enough to mark TBD; do not try to compose a value by combining multiple unknowns.

## Language rules (inherited from alrmx report style)

13. **Banned causal verbs** (drives / creates / causes / leads to / stems from / arises from / flows from / results from / produces / generates — and all their tenses/participles). These imply proven causation from pre-assessment data, which is dishonest. Replace with: "is consistent with", "points to", "appears associated with", "is modelled from", "the data suggests", "is based on", "contributes to".

14. **Banned consultant jargon** (ALL FORMS + both US and British spellings): optimize / optimise / optimized / optimised / optimization / optimisation / optimal / optimally, leverage / leveraging / leveraged, streamline / streamlined / streamlining, robust / robustly, synergy / synergies / synergistic, utilize / utilise / utilization / utilisation, actionable, deep dive / deep-dive. Use plain alternatives: "improve", "reduce", "tighten", "simplify", "use well", "solid", "combine", "use", "ready to implement", "close look".

15. **No em-dashes** (— or --). Use commas, colons, or full stops.

16. **No vague quantifiers** before numeric values. Never "significantly", "severely", "substantially", "approximately", "roughly", "around", "about" in front of a number. Either cite the number or cite a range.

17. **Hedging is allowed and encouraged** for uncertainty: "the data suggests", "appears to", "likely", "to be validated on-site".

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

18. **Every USD figure in your output MUST cite either**:
   - A \`parsed_inputs\` field like "(parsed_inputs.avg_turnaround_min = 170)", OR
   - A library slug like "(lib: dispatcher_app_tier1, cost range \$40k-\$80k)"
19. **Respect the consultant's data constraints.** If field_kpis is empty/null, that means the on-site visit hasn't happened yet. DO NOT invent observed values. Ground all hypotheses in the pre-assessment (self-reported) numbers only, and flag this explicitly in the "Verify on-site" section.
20. **Do NOT re-recommend interventions already in \`recent_interventions\`.** If a dispatch SOP is already logged, don't recommend "implement dispatch SOP" again — build on it or go deeper.
21. **Honor \`applicability_rules\`.** Before recommending a library item, check that the plant's KPIs satisfy the rule (e.g., trucks_min, dispatch_tool_current). If the rule isn't satisfied, exclude it or flag it as conditional.
22. **GCC context**: factor in Riyadh truck movement restrictions (7-hour daytime heavy-vehicle ban in core zones), Saudization quotas for drivers (affects labor rotation plans), summer heat (affects concrete retarder use + driver productivity), patriarch-owner decision style (political viability > technical optimality for Phase 3 items).
23. **All currency in USD.** Never SAR, never EUR.

## Intervention library (catalog of interventions you MAY recommend)

${JSON.stringify(library, null, 2)}

## GCC ready-mix domain context (condensed)

- Typical USD margin per m³ (material only): $20-35. OMIX-class: $27.
- Typical Saudi ready-mix TAT benchmark: 120-150 min for ≤25 km radius. Above 160 min = significant operational drag.
- Typical rejection rate: 2-4%. Below 2% = under-reporting suspected. Above 5% = quality process breakdown.
- Typical avg load per trip: 8-10 m³. Below 8 m³ = partial-load leak; requires root-cause breakdown (pump constraint, small orders, over-batching).
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
