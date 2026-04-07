import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSystemAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ role: null })

  const admin = await isSystemAdmin(user.id)
  return NextResponse.json({ role: admin ? 'system_admin' : null })
}
