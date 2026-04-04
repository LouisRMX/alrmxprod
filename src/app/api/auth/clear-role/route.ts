import { NextRequest, NextResponse } from 'next/server'

// Called after password login to clear any leftover viewAs cookie,
// then redirects to the intended destination.
export async function GET(req: NextRequest) {
  const next = new URL(req.url).searchParams.get('next') || '/dashboard'
  const res = NextResponse.redirect(new URL(next, req.url))
  res.cookies.delete('viewAs')
  return res
}
