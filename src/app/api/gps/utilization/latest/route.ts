/**
 * GET /api/gps/utilization/latest?assessmentId=...
 *
 * Returns the latest non-archived utilization_analysis_results for the
 * assessment. A single assessment can have multiple live results:
 *   - one baseline row (analysis_mode='baseline', exclusion_id=null)
 *   - one row per active exclusion (analysis_mode='within_period',
 *     exclusion_id=<exclusion row>)
 *
 * Response shape:
 *   {
 *     result: <baseline row or null>,
 *     periods: [<within_period rows>]
 *   }
 *
 * Keeping `result` at the top level preserves backwards compatibility
 * with the existing UI call-sites that only read baseline.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const assessmentId = req.nextUrl.searchParams.get('assessmentId')
  if (!assessmentId) {
    return NextResponse.json({ error: 'assessmentId required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('utilization_analysis_results')
    .select('*')
    .eq('assessment_id', assessmentId)
    .eq('archived', false)
    .order('computed_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<Record<string, unknown> & { analysis_mode?: string; exclusion_id?: string | null }>
  const baseline = rows.find(r => (r.analysis_mode ?? 'baseline') === 'baseline') ?? null
  const periods = rows.filter(r => r.analysis_mode === 'within_period')

  return NextResponse.json({ result: baseline, periods })
}
