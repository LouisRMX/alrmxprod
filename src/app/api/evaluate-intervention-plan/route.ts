/**
 * POST /api/evaluate-intervention-plan
 *
 * Runs the LLM-as-judge eval on an existing intervention_plan by id,
 * returns scorecard JSON. Used by the UI to show per-plan quality
 * scores, and by scripts/eval-plans.mjs for batch regression runs
 * before promoting prompt changes.
 */

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { evaluatePlan } from '@/lib/intervention-plan-eval'

const RATE_LIMIT = { maxRequests: 10, windowSeconds: 60 }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = checkRateLimit(user.id, RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  const { planId } = await req.json().catch(() => ({})) as { planId?: string }
  if (!planId) {
    return NextResponse.json({ error: 'planId required' }, { status: 400 })
  }

  const { data: plan, error: pErr } = await supabase
    .from('intervention_plans')
    .select('id, assessment_id, plant_id, plan_content, input_snapshot')
    .eq('id', planId)
    .single()
  if (pErr || !plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  const markdown = (plan.plan_content as { markdown?: string } | null)?.markdown ?? ''
  if (!markdown.trim()) {
    return NextResponse.json({ error: 'Plan has no markdown content' }, { status: 400 })
  }

  const snapshot = (plan.input_snapshot as Record<string, unknown>) ?? {}
  const parsedInputs = (snapshot.parsed_inputs as Record<string, unknown>) ?? {}
  const numberOfPlants = typeof parsedInputs.number_of_plants === 'number'
    ? (parsedInputs.number_of_plants as number)
    : 1

  try {
    const result = await evaluatePlan({
      plan_markdown: markdown,
      parsed_inputs: parsedInputs,
      plant_context: { number_of_plants: numberOfPlants },
    })

    // Persist the score back onto the plan record as a structured field
    await supabase
      .from('intervention_plans')
      .update({
        notes: `Eval: ${result.overall_score}/5 (${result.publishable ? 'publishable' : 'needs fixes'})`,
        input_snapshot: {
          ...snapshot,
          eval_result: {
            overall_score: result.overall_score,
            publishable: result.publishable,
            dimension_scores: result.dimension_scores,
            top_fixes: result.top_fixes,
            evaluated_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', planId)

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Plan evaluation error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
