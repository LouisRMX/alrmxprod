import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Require authenticated user — only the customer/analyst who submitted can trigger this
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { assessmentId: string; plantName: string; country: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { assessmentId, plantName, country } = body

  if (!assessmentId || !plantName) {
    return NextResponse.json({ error: 'Missing assessmentId or plantName' }, { status: 400 })
  }

  // Send email notification to admin if Resend is configured
  const resendKey = process.env.RESEND_API_KEY
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL

  if (resendKey && adminEmail) {
    try {
      const origin = req.nextUrl.origin
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Al-RMX <notifications@alrmx.com>',
          to: [adminEmail],
          subject: `Pre-assessment submitted: ${plantName}${country ? ` (${country})` : ''}`,
          html: `
            <div style="font-family: sans-serif; max-width: 520px; padding: 24px;">
              <h2 style="color: #0F6E56; margin-bottom: 8px;">Pre-assessment submitted</h2>
              <p style="color: #374151; line-height: 1.6;">
                <strong>${plantName}</strong>${country ? ` in <strong>${country}</strong>` : ''} has completed their pre-assessment questionnaire.
              </p>
              <p style="margin: 20px 0;">
                <a href="${origin}/dashboard/assess/${assessmentId}"
                   style="background: #0F6E56; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                  View assessment →
                </a>
              </p>
              <p style="color: #6b7280; font-size: 12px; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
                Al-RMX Plant Intelligence Platform
              </p>
            </div>
          `,
        }),
      })
    } catch (e) {
      // Non-fatal — notification failure should not block the UI
      console.error('Failed to send assessment-complete notification email:', e)
    }
  } else {
    // Log to console so it's visible in Vercel logs when email is not configured
    console.log(`[Al-RMX] Pre-assessment submitted: ${plantName} (${country}) — assessment ${assessmentId}`)
  }

  return NextResponse.json({ success: true })
}
