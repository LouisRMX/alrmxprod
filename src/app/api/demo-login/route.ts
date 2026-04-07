import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * GET /api/demo-login
 *
 * Signs in as the demo user (DEMO_EMAIL / DEMO_PASSWORD env vars) and
 * redirects to /demo. Used by the "Try demo →" button on the login page
 * and by the preview browser for automated UI verification.
 *
 * Returns 503 if the env vars are not set.
 */
export async function GET(req: NextRequest) {
  const email    = process.env.DEMO_EMAIL
  const password = process.env.DEMO_PASSWORD

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Demo not configured, set DEMO_EMAIL and DEMO_PASSWORD in .env.local' },
      { status: 503 }
    )
  }

  const res = NextResponse.redirect(new URL('/demo', req.url))
  res.cookies.delete('viewAs')

  // Build a Supabase client that writes session cookies directly onto `res`
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: object }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json(
      { error: 'Demo login failed, check DEMO_EMAIL / DEMO_PASSWORD' },
      { status: 401 }
    )
  }

  return res
}
