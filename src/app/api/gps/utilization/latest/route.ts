/**
 * GET /api/gps/utilization/latest?assessmentId=...
 *
 * Returns the latest non-archived utilization_analysis_results row for
 * the given assessment, or 404 if none exists yet. Used by the
 * UtilizationView UI to render the hero-card on page load.
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
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ result: null })
  }
  return NextResponse.json({ result: data })
}
