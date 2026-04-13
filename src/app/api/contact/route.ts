import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

// Simple in-memory rate limiter: max 5 emails per IP per hour
const ipTimestamps = new Map<string, number[]>()
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 }

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = ipTimestamps.get(ip) ?? []
  const recent = timestamps.filter(t => now - t < RATE_LIMIT.windowMs)
  ipTimestamps.set(ip, recent)
  if (recent.length >= RATE_LIMIT.max) return true
  recent.push(now)
  return false
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { name, email, message } = await req.json()

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  // Sanitize: strip newlines/carriage returns to prevent SMTP header injection
  const safeName = String(name).replace(/[\r\n]/g, ' ').trim().slice(0, 200)
  const safeEmail = String(email).replace(/[\r\n]/g, '').trim().slice(0, 254)
  const safeMessage = String(message).trim().slice(0, 5000)

  const { error } = await resend.emails.send({
    from: 'alRMX <onboarding@resend.dev>',
    to: process.env.ADMIN_NOTIFY_EMAIL || 'Louishellmann@gmail.com',
    replyTo: safeEmail,
    subject: `New enquiry from ${safeName}`,
    text: `Name: ${safeName}\nEmail: ${safeEmail}\n\n${safeMessage}`,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
