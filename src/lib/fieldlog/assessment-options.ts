/**
 * Admin-curated option lists for the Field Log live timer.
 *
 * Three kinds, all scoped to an assessment_id:
 *   - origin_plant   (e.g. "Narjes", "Shifa")
 *   - batching_unit  (parent_name = origin_plant; e.g. "Unit 1" under "Narjes")
 *   - mix_type       (e.g. "350"; sort_value drives ascending order)
 *
 * Two callers:
 *   - Authenticated admin/manager: reads + writes via the supabase client
 *     using the upsert_assessment_option RPC (RLS enforces customer
 *     membership).
 *   - Unauthenticated /fc/[token] helper: reads via the
 *     get_field_capture_options(p_token) SECURITY DEFINER RPC.
 *
 * The token-mode helper cannot add options. The "+" buttons in the live
 * timer fall back to a friendly "ask your admin to add it" hint when
 * syncMode === 'token'.
 */
import { createClient } from '@/lib/supabase/client'

export interface OriginPlantOption { name: string }
export interface BatchingUnitOption { name: string; parent_name: string | null }
export interface MixTypeOption { name: string; sort_value: number | null }

export interface FieldCaptureOptions {
  origin_plants: OriginPlantOption[]
  batching_units: BatchingUnitOption[]
  mix_types: MixTypeOption[]
}

export const EMPTY_OPTIONS: FieldCaptureOptions = {
  origin_plants: [],
  batching_units: [],
  mix_types: [],
}

/** Authenticated read: pulls all option rows for the assessment and groups
 *  them by kind. Sort matches what get_field_capture_options does
 *  server-side so the two paths render the same order. */
export async function fetchOptionsForAssessment(
  assessmentId: string,
): Promise<FieldCaptureOptions> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('assessment_options')
    .select('kind, name, parent_name, sort_value, sort_order')
    .eq('assessment_id', assessmentId)
  if (error || !data) return EMPTY_OPTIONS

  const origin = data
    .filter(r => r.kind === 'origin_plant')
    .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
    .map(r => ({ name: r.name as string }))

  const units = data
    .filter(r => r.kind === 'batching_unit')
    .sort((a, b) => {
      const p = (a.parent_name ?? '').localeCompare(b.parent_name ?? '')
      if (p !== 0) return p
      const so = a.sort_order - b.sort_order
      if (so !== 0) return so
      return a.name.localeCompare(b.name)
    })
    .map(r => ({ name: r.name as string, parent_name: (r.parent_name as string | null) ?? null }))

  const mix = data
    .filter(r => r.kind === 'mix_type')
    .sort((a, b) => {
      const av = a.sort_value as number | null
      const bv = b.sort_value as number | null
      if (av != null && bv != null) return av - bv
      if (av != null) return -1
      if (bv != null) return 1
      const so = a.sort_order - b.sort_order
      if (so !== 0) return so
      return a.name.localeCompare(b.name)
    })
    .map(r => ({ name: r.name as string, sort_value: (r.sort_value as number | null) ?? null }))

  return { origin_plants: origin, batching_units: units, mix_types: mix }
}

/** Token-mode read: hits the SECURITY DEFINER RPC so the helper does not
 *  need an authenticated session. */
export async function fetchOptionsForToken(token: string): Promise<FieldCaptureOptions> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_field_capture_options', { p_token: token })
  if (error || !data) return EMPTY_OPTIONS
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return EMPTY_OPTIONS
  return {
    origin_plants: (row.origin_plants ?? []) as OriginPlantOption[],
    batching_units: (row.batching_units ?? []) as BatchingUnitOption[],
    mix_types: (row.mix_types ?? []) as MixTypeOption[],
  }
}

/** Admin write: insert (or update sort_value) for one option. Returns the
 *  row id. RLS rejects non-members. */
export async function upsertAssessmentOption(input: {
  assessmentId: string
  kind: 'origin_plant' | 'batching_unit' | 'mix_type'
  name: string
  parentName?: string | null
  sortValue?: number | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('upsert_assessment_option', {
    p_assessment_id: input.assessmentId,
    p_kind: input.kind,
    p_name: input.name.trim(),
    p_parent_name: input.parentName ?? null,
    p_sort_value: input.sortValue ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: String(data) }
}

/** Mix-type strength values to seed a fresh assessment with on the
 *  admin's first visit to the option setup. The 11 values requested by
 *  the user, sorted ascending. */
export const DEFAULT_MIX_TYPE_SEED: ReadonlyArray<{ name: string; sort_value: number }> = [
  { name: '250', sort_value: 250 },
  { name: '270', sort_value: 270 },
  { name: '350', sort_value: 350 },
  { name: '370', sort_value: 370 },
  { name: '400', sort_value: 400 },
  { name: '410', sort_value: 410 },
  { name: '420', sort_value: 420 },
  { name: '440', sort_value: 440 },
  { name: '470', sort_value: 470 },
  { name: '500', sort_value: 500 },
  { name: '550', sort_value: 550 },
] as const

/** Best-effort one-time seed of mix-types for an assessment. Idempotent
 *  via the unique constraint, so calling this every time the picker opens
 *  is safe but wasteful — call once when the admin first opens setup. */
export async function seedDefaultMixTypes(assessmentId: string): Promise<void> {
  for (const m of DEFAULT_MIX_TYPE_SEED) {
    await upsertAssessmentOption({
      assessmentId,
      kind: 'mix_type',
      name: m.name,
      sortValue: m.sort_value,
    })
  }
}
