import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assessmentId, answers, clear } = await req.json()
  if (!assessmentId) {
    return NextResponse.json({ error: 'Missing assessmentId' }, { status: 400 })
  }

  // Verify access via RLS
  const { data: current } = await supabase
    .from('assessments')
    .select('answers')
    .eq('id', assessmentId)
    .single()

  if (!current) {
    return NextResponse.json({ error: 'Assessment not found or access denied' }, { status: 403 })
  }

  // Clear mode: reset all answers to empty object
  const newAnswers = clear
    ? {}
    : { ...(current?.answers as Record<string, unknown> || {}), ...(answers || {}) }

  const { error: dbErr } = await supabase
    .from('assessments')
    .update({ answers: newAnswers })
    .eq('id', assessmentId)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, fieldsApplied: clear ? 0 : Object.keys(answers || {}).length, cleared: !!clear })
}
