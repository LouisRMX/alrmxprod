import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assessmentId, answers } = await req.json()
  if (!assessmentId || !answers) {
    return NextResponse.json({ error: 'Missing assessmentId or answers' }, { status: 400 })
  }

  // Fetch current answers and merge (don't overwrite existing)
  const { data: current } = await supabase
    .from('assessments')
    .select('answers')
    .eq('id', assessmentId)
    .single()

  const merged = { ...(current?.answers as Record<string, unknown> || {}), ...answers }

  const { error: dbErr } = await supabase
    .from('assessments')
    .update({ answers: merged })
    .eq('id', assessmentId)

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, fieldsApplied: Object.keys(answers).length })
}
