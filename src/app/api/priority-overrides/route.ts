import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Verify user has access to the assessment via RLS
async function verifyAssessmentAccess(supabase: Awaited<ReturnType<typeof createClient>>, assessmentId: string): Promise<boolean> {
  const { data } = await supabase.from('assessments').select('id').eq('id', assessmentId).single()
  return !!data
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const assessmentId = req.nextUrl.searchParams.get('assessmentId')
  if (!assessmentId) return NextResponse.json({ error: 'Missing assessmentId' }, { status: 400 })

  if (!(await verifyAssessmentAccess(supabase, assessmentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('priority_matrix_overrides')
    .select('*')
    .eq('assessment_id', assessmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ overrides: data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assessmentId, issueTitle, originalQuadrant, overrideQuadrant, overrideReason } = await req.json()
  if (!assessmentId || !issueTitle || !overrideQuadrant) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!(await verifyAssessmentAccess(supabase, assessmentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('priority_matrix_overrides')
    .upsert({
      assessment_id: assessmentId,
      issue_title: issueTitle,
      original_quadrant: originalQuadrant,
      override_quadrant: overrideQuadrant,
      override_reason: overrideReason || null,
      overridden_by: user.id,
    }, { onConflict: 'assessment_id,issue_title' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, assessmentId } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  if (assessmentId && !(await verifyAssessmentAccess(supabase, assessmentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('priority_matrix_overrides')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
