import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const VALID_ROLES = ['owner', 'manager', 'operator']

/**
 * GET /api/dev-role?role=owner&return=/dashboard/plants
 * GET /api/dev-role?clear=1&return=/dashboard
 *
 * System admin only. Sets or clears the `viewAs` cookie and redirects.
 * Lets an admin preview the app from any customer role perspective.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
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

  const { searchParams } = new URL(req.url)
  const returnUrl = searchParams.get('return') || '/dashboard'
  const clear = searchParams.get('clear')
  const role = searchParams.get('role')

  const cookieStore = await cookies()
  const response = NextResponse.redirect(new URL(returnUrl, req.url))

  if (clear) {
    // Clear the viewAs override
    response.cookies.delete('viewAs')
  } else if (role && VALID_ROLES.includes(role)) {
    // Set role override cookie (session cookie, expires when browser closes)
    response.cookies.set('viewAs', role, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return response
}
