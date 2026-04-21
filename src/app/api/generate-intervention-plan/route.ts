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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 8000
const RATE_LIMIT = { maxRequests: 5, windowSeconds: 60 }

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

  const systemPrompt = buildSystemPrompt(library)
  const userPrompt = buildUserPrompt({
    plant,
    assessment,
    fieldKpis,
    recentInterventions: recentInterventions ?? [],
    regenerationFeedback,
  })

  const inputSnapshot = {
    plant,
    assessment_summary: {
      overall: assessment.overall,
      bottleneck: assessment.bottleneck,
      scores: assessment.scores,
      ebitda_monthly: assessment.ebitda_monthly,
      hidden_rev_monthly: assessment.hidden_rev_monthly,
    },
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

## Grounding rules (NEVER violate)

1. **Every USD figure in your output MUST cite either**:
   - An input field like "(per input: avg_turnaround_min=170)", OR
   - A library slug like "(lib: dispatcher_app_tier1, cost range \$40k-\$80k)"
2. **If you lack a basis for a number, write "to be validated on-site" instead of guessing.** This is the single most important rule. A fabricated SAR/USD figure destroys trust.
3. **Respect the consultant's data constraints.** If field_kpis is empty/null, that means the on-site visit hasn't happened yet. DO NOT invent observed values. Ground all hypotheses in the pre-assessment (self-reported) numbers only, and flag this explicitly in the "Verify on-site" section.
4. **Do NOT re-recommend interventions already in \`recent_interventions\`.** If a dispatch SOP is already logged, don't recommend "implement dispatch SOP" again — build on it or go deeper.
5. **Honor \`applicability_rules\`.** Before recommending a library item, check that the plant's KPIs satisfy the rule (e.g., trucks_min, dispatch_tool_current). If the rule isn't satisfied, exclude it or flag it as conditional.
6. **GCC context**: factor in Riyadh truck movement restrictions (7-hour daytime heavy-vehicle ban in core zones), Saudization quotas for drivers (affects labor rotation plans), summer heat (affects concrete retarder use + driver productivity), patriarch-owner decision style (political viability > technical optimality for Phase 3 items).
7. **Voice**: direct, no consultant jargon. Banned words: leverage, synergy, streamline, optimize, actionable, deep dive, robust. Use commas or periods instead of em-dashes.
8. **All currency in USD.** Never SAR, never EUR.

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
  fieldKpis: unknown
  recentInterventions: Array<{ title: string; description: string | null; target_metric: string | null; intervention_date: string }>
  regenerationFeedback?: string
}

function buildUserPrompt(input: BuildUserPromptInput): string {
  const { plant, assessment, fieldKpis, recentInterventions, regenerationFeedback } = input
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

  return `Generate an intervention plan for the following plant.

## Plant
${plantLabel}

## Assessment summary
- Overall score: ${assessment.overall ?? 'n/a'}
- Primary bottleneck: ${assessment.bottleneck ?? 'n/a'}
- Monthly EBITDA: ${assessment.ebitda_monthly ? `$${Math.round(assessment.ebitda_monthly).toLocaleString()}` : 'n/a'}
- Hidden recoverable monthly margin: ${assessment.hidden_rev_monthly ? `$${Math.round(assessment.hidden_rev_monthly).toLocaleString()}` : 'n/a'}
- Scores: ${JSON.stringify(assessment.scores ?? {})}

## Pre-assessment answers (self-reported)
${JSON.stringify(assessment.answers ?? {}, null, 2)}

## Field log KPIs (last 30 days)
${fieldBlock}

## Recent interventions already in play (do not re-recommend)
${interventionsBlock}
${feedbackBlock}

Produce the markdown plan now, strictly following the output format and grounding rules.`
}
