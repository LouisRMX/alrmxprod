import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }

    // Check if this is a new invited user who needs to set password
    const user = data?.session?.user
    if (user && !user.user_metadata?.password_set) {
      return NextResponse.redirect(`${origin}/auth/set-password`)
    }
  }

  const res = NextResponse.redirect(`${origin}${next}`)
  // Always clear any leftover role override on login
  res.cookies.delete('viewAs')
  return res
}
