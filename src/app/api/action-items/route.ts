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

// Verify the user is a member of the customer org (or system_admin)
async function verifyCustomerAccess(userId: string, customerId: string): Promise<boolean> {
  const admin = getAdminClient()
  // System admins bypass
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).single()
  if (profile?.role === 'system_admin') return true
  // Check membership
  const { data: member } = await admin
    .from('customer_members')
    .select('id')
    .eq('customer_id', customerId)
    .eq('user_id', userId)
    .single()
  return !!member
}

// GET /api/action-items?assessmentId=xxx&customerId=xxx
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const assessmentId = searchParams.get('assessmentId')
  const customerId = searchParams.get('customerId')
  if (!assessmentId || !customerId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  if (!(await verifyCustomerAccess(user.id, customerId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  // Verify ownership: look up assessment -> plant -> customer, then check membership
  const assessmentId = Array.isArray(body.items) ? body.items[0]?.assessment_id : body.assessment_id
  if (assessmentId) {
    const { data: assess } = await admin.from('assessments').select('plant_id').eq('id', assessmentId).single()
    if (assess?.plant_id) {
      const { data: plant } = await admin.from('plants').select('customer_id').eq('id', assess.plant_id).single()
      if (plant?.customer_id && !(await verifyCustomerAccess(user.id, plant.customer_id))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

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

// Verify user has access to the action item's customer org
async function verifyActionItemAccess(userId: string, actionItemId: string): Promise<boolean> {
  const admin = getAdminClient()
  const { data: item } = await admin.from('action_items').select('assessment_id').eq('id', actionItemId).single()
  if (!item?.assessment_id) return false
  const { data: assess } = await admin.from('assessments').select('plant_id').eq('id', item.assessment_id).single()
  if (!assess?.plant_id) return false
  const { data: plant } = await admin.from('plants').select('customer_id').eq('id', assess.plant_id).single()
  if (!plant?.customer_id) return false
  return verifyCustomerAccess(userId, plant.customer_id)
}

// PATCH /api/action-items  — update one item
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  if (!(await verifyActionItemAccess(user.id, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  if (!(await verifyActionItemAccess(user.id, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = getAdminClient()
  const { error } = await admin.from('action_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
