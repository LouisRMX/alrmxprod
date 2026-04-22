#!/usr/bin/env node
/**
 * One-off: convert supabase/seeds/intervention_library.json → a paste-ready
 * SQL block with 30 INSERT ... ON CONFLICT (slug) DO UPDATE rows.
 *
 * Output goes to stdout. Redirect into a file or copy from the terminal:
 *   node scripts/json-to-seed-sql.mjs > supabase/seeds/intervention_library.sql
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const path = resolve(process.cwd(), 'supabase/seeds/intervention_library.json')
const catalog = JSON.parse(readFileSync(path, 'utf8'))

function esc(s) {
  if (s === null || s === undefined) return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}
function num(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'NULL'
  return String(n)
}
function bool(b) {
  return b ? 'true' : 'false'
}
function jsonb(o) {
  if (o === null || o === undefined) return `'{}'::jsonb`
  return `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`
}
function textArr(arr) {
  if (!arr || arr.length === 0) return `ARRAY[]::text[]`
  const items = arr.map(s => `'${String(s).replace(/'/g, "''")}'`).join(', ')
  return `ARRAY[${items}]::text[]`
}

const lines = []
lines.push('-- Seed intervention_library. Idempotent via ON CONFLICT (slug).')
lines.push('-- Generated from supabase/seeds/intervention_library.json.')
lines.push('')

for (const item of catalog) {
  lines.push(`INSERT INTO public.intervention_library (`)
  lines.push(`  slug, title_en, title_ar, category, problem_solves, applicability_rules,`)
  lines.push(`  cost_usd_low, cost_usd_high, cost_notes, impact_metric, impact_pct_low,`)
  lines.push(`  impact_pct_high, impact_secondary, effort_weeks, complexity, prerequisites,`)
  lines.push(`  quick_win, gcc_notes, sources, tags,`)
  lines.push(`  site_type_applicability, tat_component_target`)
  lines.push(`) VALUES (`)
  lines.push(`  ${esc(item.slug)},`)
  lines.push(`  ${esc(item.title_en)},`)
  lines.push(`  ${esc(item.title_ar ?? null)},`)
  lines.push(`  ${esc(item.category)},`)
  lines.push(`  ${esc(item.problem_solves)},`)
  lines.push(`  ${jsonb(item.applicability_rules ?? {})},`)
  lines.push(`  ${num(item.cost_usd_low)},`)
  lines.push(`  ${num(item.cost_usd_high)},`)
  lines.push(`  ${esc(item.cost_notes ?? null)},`)
  lines.push(`  ${esc(item.impact_metric ?? null)},`)
  lines.push(`  ${num(item.impact_pct_low)},`)
  lines.push(`  ${num(item.impact_pct_high)},`)
  lines.push(`  ${esc(item.impact_secondary ?? null)},`)
  lines.push(`  ${num(item.effort_weeks)},`)
  lines.push(`  ${esc(item.complexity ?? null)},`)
  lines.push(`  ${textArr(item.prerequisites ?? [])},`)
  lines.push(`  ${bool(item.quick_win)},`)
  lines.push(`  ${esc(item.gcc_notes ?? null)},`)
  lines.push(`  ${jsonb(item.sources ?? [])},`)
  lines.push(`  ${textArr(item.tags ?? [])},`)
  lines.push(`  ${textArr(item.site_type_applicability ?? ['any'])},`)
  lines.push(`  ${esc(item.tat_component_target ?? 'multi')}`)
  lines.push(`) ON CONFLICT (slug) DO UPDATE SET`)
  lines.push(`  title_en = EXCLUDED.title_en,`)
  lines.push(`  title_ar = EXCLUDED.title_ar,`)
  lines.push(`  category = EXCLUDED.category,`)
  lines.push(`  problem_solves = EXCLUDED.problem_solves,`)
  lines.push(`  applicability_rules = EXCLUDED.applicability_rules,`)
  lines.push(`  cost_usd_low = EXCLUDED.cost_usd_low,`)
  lines.push(`  cost_usd_high = EXCLUDED.cost_usd_high,`)
  lines.push(`  cost_notes = EXCLUDED.cost_notes,`)
  lines.push(`  impact_metric = EXCLUDED.impact_metric,`)
  lines.push(`  impact_pct_low = EXCLUDED.impact_pct_low,`)
  lines.push(`  impact_pct_high = EXCLUDED.impact_pct_high,`)
  lines.push(`  impact_secondary = EXCLUDED.impact_secondary,`)
  lines.push(`  effort_weeks = EXCLUDED.effort_weeks,`)
  lines.push(`  complexity = EXCLUDED.complexity,`)
  lines.push(`  prerequisites = EXCLUDED.prerequisites,`)
  lines.push(`  quick_win = EXCLUDED.quick_win,`)
  lines.push(`  gcc_notes = EXCLUDED.gcc_notes,`)
  lines.push(`  sources = EXCLUDED.sources,`)
  lines.push(`  tags = EXCLUDED.tags,`)
  lines.push(`  site_type_applicability = EXCLUDED.site_type_applicability,`)
  lines.push(`  tat_component_target = EXCLUDED.tat_component_target;`)
  lines.push('')
}

process.stdout.write(lines.join('\n'))
