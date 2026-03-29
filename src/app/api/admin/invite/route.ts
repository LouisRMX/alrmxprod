import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Admin client with service role key — can create users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  // Verify requester is system_admin
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'system_admin') {
    return NextResponse.json({ error: 'Forbidden — system admin only' }, { status: 403 })
  }

  // Parse request
  let body: { email: string; fullName: string; customerId: string; role: string; assessmentId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, fullName, customerId, role, assessmentId } = body

  if (!email || !fullName || !customerId || !role) {
    return NextResponse.json({ error: 'Missing required fields: email, fullName, customerId, role' }, { status: 400 })
  }

  if (!['customer_admin', 'customer_user'].includes(role)) {
    return NextResponse.json({ error: 'Role must be customer_admin or customer_user' }, { status: 400 })
  }

  // Check customer exists
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name')
    .eq('id', customerId)
    .single()

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  // Invite user via Supabase admin API
  // This sends an email with a password-creation link
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role,
    },
    redirectTo: `${req.nextUrl.origin}/auth/callback`,
  })

  if (inviteError) {
    // User may already exist — try to find them
    if (inviteError.message?.includes('already been registered')) {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
      const existingUser = users?.find(u => u.email === email)

      if (existingUser) {
        // User exists — just add them to the customer
        const { error: memberError } = await supabase.from('customer_members').upsert({
          customer_id: customerId,
          user_id: existingUser.id,
          role,
        }, { onConflict: 'customer_id,user_id' })

        if (memberError) {
          return NextResponse.json({ error: 'Failed to add member: ' + memberError.message }, { status: 500 })
        }

        // Assign assessment if provided
        if (assessmentId && role === 'customer_user') {
          await supabase.from('assessment_assignments').upsert({
            assessment_id: assessmentId,
            user_id: existingUser.id,
          }, { onConflict: 'assessment_id,user_id' })
        }

        return NextResponse.json({ success: true, userId: existingUser.id, alreadyExisted: true })
      }
    }

    return NextResponse.json({ error: 'Invite failed: ' + inviteError.message }, { status: 500 })
  }

  const newUserId = inviteData.user.id

  // Add to customer_members
  const { error: memberError } = await supabase.from('customer_members').insert({
    customer_id: customerId,
    user_id: newUserId,
    role,
  })

  if (memberError) {
    return NextResponse.json({ error: 'User invited but failed to add to customer: ' + memberError.message }, { status: 500 })
  }

  // Assign assessment if provided
  if (assessmentId && role === 'customer_user') {
    await supabase.from('assessment_assignments').upsert({
      assessment_id: assessmentId,
      user_id: newUserId,
    }, { onConflict: 'assessment_id,user_id' })
  }

  // Update customer contact_email if not set
  if (!customer.name) {
    await supabase.from('customers').update({ contact_email: email, contact_name: fullName }).eq('id', customerId)
  }

  return NextResponse.json({ success: true, userId: newUserId, alreadyExisted: false })
}
