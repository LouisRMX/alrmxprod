import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isSystemAdmin } from '@/lib/supabase/admin'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await isSystemAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { name: string; country: string; contact_name?: string; contact_email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const admin = getAdminClient()
  const { data, error } = await admin.from('customers').insert({
    name: body.name,
    country: body.country,
    contact_name: body.contact_name || null,
    contact_email: body.contact_email || null,
    created_by: user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customer: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isSystemAdmin(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing customer id' }, { status: 400 })

  const admin = getAdminClient()
  const { data, error } = await admin.from('customers').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customer: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!await isSystemAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing customer id' }, { status: 400 })

  const admin = getAdminClient()

  // Delete in dependency order (no CASCADE on plants → assessments chain)
  const { data: plants } = await admin.from('plants').select('id').eq('customer_id', id)
  const plantIds = (plants || []).map((p: { id: string }) => p.id)

  for (const pid of plantIds) {
    const { data: assessments } = await admin.from('assessments').select('id').eq('plant_id', pid)
    const aIds = (assessments || []).map((a: { id: string }) => a.id)
    for (const aid of aIds) {
      await admin.from('action_items').delete().eq('assessment_id', aid)
      await admin.from('reports').delete().eq('assessment_id', aid)
      await admin.from('priority_matrix_overrides').delete().eq('assessment_id', aid)
    }
    if (aIds.length > 0) {
      await admin.from('assessments').delete().in('id', aIds)
    }
  }
  if (plantIds.length > 0) {
    await admin.from('plants').delete().in('id', plantIds)
  }

  const { error } = await admin.from('customers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
