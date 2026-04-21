#!/usr/bin/env node
/**
 * Seed the intervention_library table from supabase/seeds/intervention_library.json.
 *
 * Idempotent: uses upsert keyed on slug. Re-run to pick up edits to the JSON.
 *
 * Usage:
 *   node scripts/seed-intervention-library.mjs
 *
 * Requires env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service-role to bypass RLS on write)
 *
 * Why service-role: intervention_library write is gated by system_admin JWT
 * claim under RLS. Running via service-role is the simplest path for seed
 * scripts without needing a logged-in admin session.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Load env from .env.local if present (Next.js convention)
try {
  const { config } = await import('dotenv')
  config({ path: resolve(process.cwd(), '.env.local') })
} catch { /* dotenv optional */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const catalogPath = resolve(process.cwd(), 'supabase/seeds/intervention_library.json')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))

if (!Array.isArray(catalog)) {
  console.error('Catalog JSON must be an array.')
  process.exit(1)
}

console.log(`Seeding ${catalog.length} interventions from ${catalogPath}...`)

const rows = catalog.map(item => ({
  slug: item.slug,
  title_en: item.title_en,
  title_ar: item.title_ar ?? null,
  category: item.category,
  problem_solves: item.problem_solves,
  applicability_rules: item.applicability_rules ?? {},
  cost_usd_low: item.cost_usd_low ?? null,
  cost_usd_high: item.cost_usd_high ?? null,
  cost_notes: item.cost_notes ?? null,
  impact_metric: item.impact_metric ?? null,
  impact_pct_low: item.impact_pct_low ?? null,
  impact_pct_high: item.impact_pct_high ?? null,
  impact_secondary: item.impact_secondary ?? null,
  effort_weeks: item.effort_weeks ?? null,
  complexity: item.complexity ?? null,
  prerequisites: item.prerequisites ?? [],
  quick_win: Boolean(item.quick_win),
  gcc_notes: item.gcc_notes ?? null,
  sources: item.sources ?? [],
  tags: item.tags ?? [],
}))

const { data, error } = await supabase
  .from('intervention_library')
  .upsert(rows, { onConflict: 'slug' })
  .select('slug')

if (error) {
  console.error('Seed failed:', error.message)
  process.exit(1)
}

console.log(`Upserted ${data.length} rows. Library seeded.`)
