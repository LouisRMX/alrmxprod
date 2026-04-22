/**
 * LLM-as-judge eval framework for intervention plans.
 *
 * Used both as an API route (POST /api/evaluate-plan) and as a standalone
 * script (scripts/eval-plans.mjs). Given a generated plan + its
 * parsed_inputs, asks Claude Haiku to score the plan on 10 dimensions
 * (numeric fidelity, plant scope, banned language, reconciliation,
 * hypothesis consistency, etc.) and return a structured JSON scorecard.
 *
 * The judge prompt is intentionally stricter than the generator prompt:
 * the judge should catch violations the generator+validator missed.
 *
 * Output is machine-readable so we can run regressions before promoting
 * prompt changes to production.
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const JUDGE_MODEL = 'claude-haiku-4-5-20251001'

export interface EvalDimensionScore {
  dimension: string
  score: number // 0 to 5, integer
  rationale: string
  violations?: string[]
}

export interface EvalResult {
  overall_score: number // 0 to 5 average
  dimension_scores: EvalDimensionScore[]
  publishable: boolean // true if overall >= 4 AND no dimension < 3
  top_fixes: string[] // 3-5 prioritised fixes
  raw_judge_output: string
}

export interface EvalInput {
  plan_markdown: string
  parsed_inputs: Record<string, unknown>
  plant_context?: { number_of_plants: number; plant_name?: string }
}

/** 10 eval dimensions, each scored 0-5. 5 = perfect, 3 = acceptable,
 *  0 = publish this and the consultant loses credibility. */
const DIMENSIONS = [
  {
    key: 'numeric_fidelity',
    name: 'Numeric fidelity',
    description: 'Every USD figure must trace to parsed_inputs or an impact_multiplier. No fabricated baselines. No arithmetic drift (a × b = c where c mismatches).',
  },
  {
    key: 'plant_scope',
    name: 'Plant scope language',
    description: 'Plural plant language when number_of_plants >= 2, singular when = 1. No "single plant" if plants >= 2. Shared-fleet context acknowledged when multi-plant.',
  },
  {
    key: 'banned_language',
    name: 'Banned language',
    description: 'No banned causal verbs (drives/creates/causes/leads to/stems from/arises from/flows from/results from/produces/generates). No banned jargon (optimize/optimise/leverage/streamline/robust/synergy/utilize/actionable/deep dive). No em-dashes. No vague quantifiers before numbers.',
  },
  {
    key: 'reconciliation',
    name: 'Recovery band reconciliation',
    description: 'Phase 1 + Phase 2 USD impact total falls between recovery_low_usd × 0.8 and recovery_high_usd × 1.05. Plan does not over-promise vs. pre-assessment band.',
  },
  {
    key: 'hypothesis_consistency',
    name: 'Hypothesis-to-intervention consistency',
    description: 'Every Phase 1 + Phase 2 intervention cites the hypothesis it tests. Sum of interventions testing a given hypothesis = hypothesis USD ±20%. No duplicate opportunities.',
  },
  {
    key: 'library_citation',
    name: 'Library slug citations',
    description: 'Every Phase 1 + Phase 2 intervention references a library slug in parens. Applicability rules are respected (nothing recommended that the plant KPIs disqualify).',
  },
  {
    key: 'gcc_context',
    name: 'GCC context integration',
    description: 'Riyadh truck restrictions acknowledged. Saudization / labour structure referenced where relevant. Summer heat impact noted for quality/fleet interventions. Patriarch-owner dynamics reflected in tone.',
  },
  {
    key: 'verify_onsite_quality',
    name: 'Verify on-site section quality',
    description: 'Flags data discrepancies between raw answers and parsed_inputs. Names 5-8 suspicious points with concrete verification methods. Does not invent observed values; respects pre-visit status.',
  },
  {
    key: 'tone_consultant',
    name: 'Senior consultant tone',
    description: 'Direct, precise, politically aware. No fluff. Respects owner decision authority while not flattering. Hedges where data demands hedging, commits where data supports commitment.',
  },
  {
    key: 'actionability',
    name: 'Phase actionability',
    description: 'Phase 1 items are implementable in weeks 1-4 with low capex. Phase 2 items require capex or vendor selection but deliver inside 12 weeks. Phase 3 items are strategic conversation-starters, not hidden operational items.',
  },
] as const

export async function evaluatePlan(input: EvalInput): Promise<EvalResult> {
  const systemPrompt = `You are the quality judge for alrmx intervention plans. Your job is to catch every violation the generator missed. Be ruthless. A plan that embarrasses the consultant in front of a plant owner costs real money; prefer false positives over false negatives.

You will score a plan on ${DIMENSIONS.length} dimensions, each 0-5:
- 5 = flawless, no violations
- 4 = minor issue, acceptable to ship
- 3 = borderline, needs a light polish
- 2 = material issue, do not ship without fix
- 1 = systemic failure in this dimension
- 0 = plan would actively damage the consultant's credibility

Dimensions:
${DIMENSIONS.map(d => `- ${d.name}: ${d.description}`).join('\n')}

Output format: a single JSON object matching this schema (no markdown fencing, no prose before or after):

{
  "dimension_scores": [
    { "dimension": "<dimension key from above>", "score": 0-5, "rationale": "<1-2 sentences>", "violations": ["<specific quote or issue>", ...] }
  ],
  "top_fixes": ["<prioritised fix 1>", "<fix 2>", ...]
}

Include every dimension in dimension_scores. List at most 5 top fixes. If a dimension has no issues, include it with score 5 and an empty violations array.`

  const userPrompt = `## Parsed inputs (authoritative for numeric checks)
${JSON.stringify(input.parsed_inputs, null, 2)}

## Plant context
${JSON.stringify(input.plant_context ?? {}, null, 2)}

## Plan markdown to evaluate
${input.plan_markdown}

Produce the JSON scorecard now. Be specific in violations — quote the offending text when you can.`

  const response = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = response.content
    .filter(c => c.type === 'text')
    .map(c => (c as { text: string }).text)
    .join('')

  // Parse — be defensive, judge might wrap in fences despite instructions
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  let parsed: { dimension_scores?: EvalDimensionScore[]; top_fixes?: string[] } = {}
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    console.error('Eval judge output failed to parse:', err, raw.slice(0, 200))
    return {
      overall_score: 0,
      dimension_scores: [],
      publishable: false,
      top_fixes: ['Judge output failed to parse as JSON; re-run evaluation.'],
      raw_judge_output: raw,
    }
  }

  const scores = parsed.dimension_scores ?? []
  const avg = scores.length > 0
    ? scores.reduce((s, d) => s + (d.score ?? 0), 0) / scores.length
    : 0
  const minDim = scores.length > 0 ? Math.min(...scores.map(d => d.score ?? 0)) : 0
  const publishable = avg >= 4 && minDim >= 3

  return {
    overall_score: Math.round(avg * 10) / 10,
    dimension_scores: scores,
    publishable,
    top_fixes: parsed.top_fixes ?? [],
    raw_judge_output: raw,
  }
}

export const EVAL_DIMENSIONS = DIMENSIONS
