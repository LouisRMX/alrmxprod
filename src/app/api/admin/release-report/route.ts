import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'system_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { assessmentId: string; released: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { assessmentId, released } = body
  if (!assessmentId) {
    return NextResponse.json({ error: 'Missing assessmentId' }, { status: 400 })
  }

  const { error } = await supabase
    .from('assessments')
    .update({ report_released: released !== false })
    .eq('id', assessmentId)

  if (error) {
    return NextResponse.json({ error: 'Failed to update: ' + error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, released: released !== false })
}
