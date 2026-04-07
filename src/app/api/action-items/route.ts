import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getAuthenticatedUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET /api/action-items?assessmentId=xxx&customerId=xxx
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const assessmentId = searchParams.get('assessmentId')
  const customerId = searchParams.get('customerId')
  if (!assessmentId || !customerId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const admin = getAdminClient()
  const [{ data: items }, { data: membersRaw }] = await Promise.all([
    admin.from('action_items').select('*').eq('assessment_id', assessmentId).order('created_at', { ascending: true }),
    admin.from('customer_members').select('user_id, role, profile:profiles(full_name, email)').eq('customer_id', customerId),
  ])

  const members = (membersRaw ?? []).map((m: Record<string, unknown>) => ({
    ...m,
    profile: Array.isArray(m.profile) ? (m.profile as unknown[])[0] ?? null : m.profile,
  }))

  return NextResponse.json({ items: items ?? [], members })
}

// POST /api/action-items  — single or bulk insert
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const admin = getAdminClient()

  if (Array.isArray(body.items)) {
    // Bulk insert (auto-population)
    const { data, error } = await admin.from('action_items').insert(body.items).select('*')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data })
  } else {
    // Single insert
    const { data, error } = await admin.from('action_items').insert(body).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  }
}

// PATCH /api/action-items  — update one item
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = getAdminClient()
  const { data, error } = await admin.from('action_items').update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE /api/action-items  — delete one item
export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const admin = getAdminClient()
  const { error } = await admin.from('action_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
