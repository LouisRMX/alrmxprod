#!/usr/bin/env node
/**
 * Batch-evaluate the N most recent intervention plans using the LLM-as-judge.
 * Prints a per-plan scorecard and an aggregate summary to stdout.
 *
 * Use before promoting prompt changes to production:
 *   node scripts/eval-plans.mjs 10
 *
 * Exit code 0 if all sampled plans are publishable (overall >= 4 AND no
 * dimension < 3), else 1 — so this can gate CI.
 *
 * Requires env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 */

import { createClient } from '@supabase/supabase-js'

try {
  const { config } = await import('dotenv')
  config({ path: '.env.local' })
} catch { /* dotenv optional */ }

const N = parseInt(process.argv[2] ?? '5', 10)
if (!Number.isFinite(N) || N < 1) {
  console.error('Usage: node scripts/eval-plans.mjs <N>')
  process.exit(2)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(2)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY.')
  process.exit(2)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Dynamic import of the eval module (it's TS, we rely on Next's tsx loader
// at runtime when called via next build; for plain node we preprocess with
// tsx. Fall back to importing compiled .js if present.)
let evaluatePlan
try {
  const mod = await import('../dist/lib/intervention-plan-eval.js')
  evaluatePlan = mod.evaluatePlan
} catch {
  try {
    const { tsImport } = await import('tsx/esm/api')
    const mod = await tsImport('../src/lib/intervention-plan-eval.ts', import.meta.url)
    evaluatePlan = mod.evaluatePlan
  } catch (err) {
    console.error('Could not load intervention-plan-eval module. Install tsx: npm i -D tsx, or build first.')
    console.error(err)
    process.exit(2)
  }
}

const { data: plans, error } = await supabase
  .from('intervention_plans')
  .select('id, assessment_id, plant_id, plan_content, input_snapshot, generated_at')
  .order('generated_at', { ascending: false })
  .limit(N)

if (error) {
  console.error('Failed to fetch plans:', error.message)
  process.exit(1)
}
if (!plans || plans.length === 0) {
  console.log('No plans found to evaluate.')
  process.exit(0)
}

console.log(`Evaluating ${plans.length} most recent plans...\n`)

let anyBelowPublishable = false
const summary = []

for (const plan of plans) {
  const markdown = plan.plan_content?.markdown ?? ''
  if (!markdown.trim()) {
    console.log(`[${plan.id.slice(0, 8)}] SKIP (no markdown)`)
    continue
  }
  const parsedInputs = plan.input_snapshot?.parsed_inputs ?? {}
  const numberOfPlants = parsedInputs.number_of_plants ?? 1

  try {
    const result = await evaluatePlan({
      plan_markdown: markdown,
      parsed_inputs: parsedInputs,
      plant_context: { number_of_plants: numberOfPlants },
    })
    const tag = result.publishable ? 'PASS' : 'FAIL'
    if (!result.publishable) anyBelowPublishable = true
    console.log(`[${plan.id.slice(0, 8)}] ${tag} — overall ${result.overall_score}/5 (${plan.generated_at.slice(0, 10)})`)
    for (const d of result.dimension_scores) {
      const marker = d.score >= 4 ? ' ' : d.score >= 3 ? '~' : '!'
      console.log(`  ${marker} ${d.dimension.padEnd(26)} ${d.score}/5  ${d.rationale ?? ''}`)
      if (d.violations?.length) {
        for (const v of d.violations.slice(0, 3)) {
          console.log(`      - ${v}`)
        }
      }
    }
    if (result.top_fixes.length > 0) {
      console.log(`  Top fixes:`)
      for (const f of result.top_fixes) console.log(`    • ${f}`)
    }
    console.log('')
    summary.push({ id: plan.id.slice(0, 8), overall: result.overall_score, publishable: result.publishable })
  } catch (err) {
    console.error(`[${plan.id.slice(0, 8)}] ERROR:`, err.message ?? err)
    anyBelowPublishable = true
  }
}

console.log('── Summary ────────────────')
for (const s of summary) {
  console.log(`  ${s.id}  ${s.overall}/5  ${s.publishable ? 'publishable' : 'NEEDS FIX'}`)
}
const avgOverall = summary.length > 0
  ? summary.reduce((a, b) => a + b.overall, 0) / summary.length
  : 0
console.log(`\nMean score across ${summary.length} plans: ${avgOverall.toFixed(2)}/5`)

process.exit(anyBelowPublishable ? 1 : 0)
