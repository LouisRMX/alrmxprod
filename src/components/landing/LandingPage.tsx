'use client'

import Link from 'next/link'
import { useState } from 'react'

// ── Landing page ─────────────────────────────────────────────────────────────
// Public marketing page for unauthenticated visitors.
// Primary CTA: book a demo (contact form → Louishellmann@gmail.com)

export default function LandingPage() {
  return (
    <div style={{ fontFamily: 'var(--font)', color: 'var(--gray-900)', background: 'var(--white)', overflowX: 'hidden' }}>
      <Nav />
      <Hero />
      <Problem />
      <Diagnostic />
      <HowItWorks />
      <WhatYouReceive />
      <Credibility />
      <Contact />
      <FAQ />
      <Footer />
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
    }}>
      <div style={{
        maxWidth: '1080px', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '56px',
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '6px',
            background: 'var(--green)', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)' }}>al</span>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gray-900)', letterSpacing: '-0.3px' }}>
            alRMX
          </span>
        </Link>

        {/* Right nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href="/login" style={{
            fontSize: '13px', color: 'var(--gray-700)', textDecoration: 'none',
            padding: '6px 12px', borderRadius: '6px',
          }}>
            Log in
          </Link>
          <Link href="/login" style={{
            fontSize: '13px', fontWeight: 600, color: '#fff', textDecoration: 'none',
            padding: '7px 16px', borderRadius: '7px', background: 'var(--green)',
          }}>
            Demo
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

const heroScreens = [
  { label: 'Identify the gap',      src: '/screen-1-dashboard.png' },
  { label: 'Quantify the cost',     src: '/screen-2-report.png'    },
  { label: 'Track improvement',     src: '/screen-3-tracking.png'  },
]

function Hero() {
  const [activeScreen, setActiveScreen] = useState(0)

  return (
    <section style={{
      background: '#0a1a13',
      padding: 'clamp(56px, 8vw, 96px) 24px clamp(64px, 9vw, 112px)',
    }}>
      <div style={{
        maxWidth: '1120px', margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
        gap: 'clamp(32px, 5vw, 72px)', alignItems: 'center',
      }}>

        {/* ── Left: text ── */}
        <div>
          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: 'rgba(15,110,86,0.25)', border: '1px solid rgba(15,110,86,0.4)',
            borderRadius: '20px', padding: '4px 12px', marginBottom: '28px',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#86efac', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Ready-mix concrete operations
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(28px, 3.5vw, 46px)', fontWeight: 800,
            color: '#fff', lineHeight: 1.1, letterSpacing: '-1px',
            margin: '0 0 18px',
          }}>
            Operational losses in ready-mix plants are rarely visible.
            <span style={{ color: '#4ade80' }}> They are always calculable.</span>
          </h1>

          {/* Subline */}
          <p style={{
            fontSize: 'clamp(14px, 1.6vw, 16px)', color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.6, margin: '0 0 28px',
          }}>
            We calculate the exact monthly dollar cost of your turnaround time, dispatch delay,
            and rejection rate — based on your plant&apos;s own data. Before anyone visits the site.
          </p>

          {/* Bullets */}
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 36px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {[
              'Monthly revenue leakage per dimension — in dollars',
              'Primary bottleneck ranked by financial impact',
              'Clear actions with a 90-day tracking baseline',
            ].map(text => (
              <li key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
                <span style={{ color: '#4ade80', fontSize: '15px', flexShrink: 0, marginTop: '1px' }}>✓</span>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{text}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <a href="#contact" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'var(--green)', color: '#fff', textDecoration: 'none',
            padding: '12px 22px', borderRadius: '9px', fontSize: '14px', fontWeight: 600,
          }}>
            Book a 20-min walkthrough →
          </a>
        </div>

        {/* ── Right: screenshot ── */}
        <div>
          {/* Tab pills */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {heroScreens.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setActiveScreen(i)}
                style={{
                  fontSize: '11px', fontWeight: 600, padding: '5px 12px',
                  borderRadius: '20px', border: 'none', cursor: 'pointer',
                  background: activeScreen === i ? '#4ade80' : 'rgba(255,255,255,0.08)',
                  color: activeScreen === i ? '#0a1a13' : 'rgba(255,255,255,0.5)',
                  transition: 'all .15s',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Screenshot frame */}
          <div style={{
            borderRadius: '10px', overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}>
            {/* Browser chrome bar */}
            <div style={{
              background: '#1a2e22', padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: '6px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
              <div style={{
                flex: 1, marginLeft: '8px', background: 'rgba(255,255,255,0.06)',
                borderRadius: '4px', padding: '3px 10px',
                fontSize: '10px', color: 'rgba(255,255,255,0.3)',
              }}>
                alrmx.com/dashboard
              </div>
            </div>
            {/* Screenshot image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroScreens[activeScreen].src}
              alt={heroScreens[activeScreen].label}
              style={{ width: '100%', display: 'block', maxHeight: '420px', objectFit: 'cover', objectPosition: 'top' }}
            />
          </div>
        </div>

      </div>
    </section>
  )
}

// ── Problem ───────────────────────────────────────────────────────────────────

function Problem() {
  const items = [
    {
      label: 'Fleet turnaround',
      text: 'Cycle time runs above benchmark. Each excess minute has a monthly cost — it is rarely calculated.',
    },
    {
      label: 'Dispatch delay',
      text: 'Order-to-truck takes two to three times longer than it should. The margin impact is invisible on any report.',
    },
    {
      label: 'Utilization gap',
      text: 'Plant runs below installed capacity while the bottleneck goes unidentified.',
    },
    {
      label: 'Rejection write-offs',
      text: 'Rejected loads absorbed at full material cost. Root cause untracked. Loss continues every month.',
    },
    {
      label: 'No documented baseline',
      text: 'No way to measure whether any intervention actually worked. Improvement is assumed, not proven.',
    },
  ]

  return (
    <section style={{ background: 'var(--white)', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <Eyebrow text="The problem" />
        <h2 style={h2Style}>
          Most plants absorb the cost without knowing the number.
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {items.map((item, i) => (
            <div key={item.label} style={{
              display: 'flex', gap: '16px', alignItems: 'flex-start',
              padding: '20px 0',
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'var(--warning)', flexShrink: 0, marginTop: '7px',
              }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '3px' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--gray-500)', lineHeight: 1.6 }}>
                  {item.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Diagnostic ────────────────────────────────────────────────────────────────

function Diagnostic() {
  const dimensions = [
    {
      num: '01',
      label: 'Production utilization',
      text: 'Plant output versus installed capacity. Monthly revenue cost of running below potential.',
    },
    {
      num: '02',
      label: 'Dispatch coordination',
      text: 'Order-to-truck time versus benchmark. Margin cost of slow or unstructured dispatch.',
    },
    {
      num: '03',
      label: 'Fleet turnaround',
      text: 'Full delivery cycle time versus delivery radius benchmark. Monthly loss per excess minute.',
    },
    {
      num: '04',
      label: 'Fleet availability',
      text: 'Breakdown frequency, maintenance structure, unplanned idle time. Operational disruption cost.',
    },
    {
      num: '05',
      label: 'Quality / rejection rate',
      text: 'Rejection percentage, material write-off at cost price, dominant cause identification.',
    },
  ]

  return (
    <section style={{ background: 'var(--gray-50)', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <Eyebrow text="The diagnostic" />
        <h2 style={h2Style}>
          Five dimensions. Specific numbers. Calculated from your own data.
        </h2>
        <p style={{ fontSize: '15px', color: 'var(--gray-500)', lineHeight: 1.6, margin: '0 0 36px', maxWidth: '520px' }}>
          Every dimension produces a monthly dollar figure — not a qualitative finding.
          Based on your plant&apos;s operational data, not industry averages.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {dimensions.map(d => (
            <div key={d.num} style={{
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '18px 20px',
              display: 'flex', gap: '20px', alignItems: 'flex-start',
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--green)',
                fontWeight: 600, flexShrink: 0, marginTop: '2px', letterSpacing: '0.5px',
              }}>
                {d.num}
              </span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '3px' }}>
                  {d.label}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.55 }}>
                  {d.text}
                </div>
              </div>
              <div style={{
                marginLeft: 'auto', flexShrink: 0,
                fontSize: '11px', fontWeight: 600, color: 'var(--green)',
                background: 'var(--green-pale)', border: '1px solid var(--tooltip-border)',
                borderRadius: '5px', padding: '3px 8px', whiteSpace: 'nowrap',
              }}>
                $ / month
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      num: '1',
      label: 'Remote diagnostic',
      text: 'You answer structured questions about your operations. The diagnostic calculates monthly losses across all five dimensions — dispatch, turnaround, utilization, fleet, quality — from your own data. Output is immediate. No site visit required.',
    },
    {
      num: '2',
      label: 'On-site validation',
      text: 'Physical visit to confirm findings, observe actual dispatch and batch cycles, and identify what the numbers alone cannot capture. Output: validated diagnosis and a prioritized action plan.',
    },
  ]

  return (
    <section style={{ background: 'var(--white)', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <Eyebrow text="How it works" />
        <h2 style={h2Style}>Three phases. No long lead time.</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginTop: '8px' }}>
          {steps.map((step, i) => (
            <div key={step.num} style={{
              display: 'flex', gap: '24px', alignItems: 'flex-start',
              padding: '28px 0',
              borderBottom: i < steps.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'var(--green)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, flexShrink: 0,
              }}>
                {step.num}
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '6px' }}>
                  {step.label}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--gray-500)', lineHeight: 1.6, maxWidth: '560px' }}>
                  {step.text}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 90-day tracking note */}
        <div style={{
          marginTop: '24px', padding: '14px 18px',
          background: 'var(--gray-50)', border: '1px solid var(--border)',
          borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start',
        }}>
          <span style={{ color: 'var(--green)', flexShrink: 0, marginTop: '1px' }}>↳</span>
          <div style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--gray-700)' }}>Optional: 90-day improvement tracking.</strong>{' '}
            Baseline documented at assessment. KPIs logged weekly. Improvement measured against real numbers — not estimates.
          </div>
        </div>
      </div>
    </section>
  )
}

// ── What you receive ──────────────────────────────────────────────────────────

function WhatYouReceive() {
  const items = [
    'Scored assessment across five operational dimensions',
    'Primary bottleneck identified and ranked by monthly financial impact',
    'Revenue leakage in $ per dimension per month',
    'Lost production volume in m³',
    'Prioritized improvement actions — specific to your operation',
    '90-day tracking baseline with weekly KPI structure',
  ]

  return (
    <section style={{
      background: 'var(--green-pale)',
      borderTop: '1px solid var(--tooltip-border)',
      borderBottom: '1px solid var(--tooltip-border)',
      padding: 'clamp(64px, 8vw, 96px) 24px',
    }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <Eyebrow text="What you receive" color="var(--green)" />
        <h2 style={{ ...h2Style, color: '#0a3d26' }}>
          Deliverables — not observations.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginTop: '8px' }}>
          {items.map(item => (
            <div key={item} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              background: 'var(--white)', border: '1px solid var(--tooltip-border)',
              borderRadius: '8px', padding: '14px 16px',
            }}>
              <span style={{ color: 'var(--green)', fontSize: '15px', flexShrink: 0, marginTop: '1px' }}>✓</span>
              <span style={{ fontSize: '13px', color: 'var(--gray-700)', lineHeight: 1.5, fontWeight: 500 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Credibility ───────────────────────────────────────────────────────────────

function Credibility() {
  return (
    <section style={{ background: 'var(--white)', padding: 'clamp(56px, 7vw, 80px) 24px' }}>
      <div style={{
        maxWidth: '600px', margin: '0 auto', textAlign: 'center',
      }}>
        <div style={{
          width: '40px', height: '2px', background: 'var(--green)',
          margin: '0 auto 28px',
        }} />
        <p style={{
          fontSize: 'clamp(16px, 2vw, 19px)', color: 'var(--gray-700)',
          lineHeight: 1.65, fontStyle: 'italic', margin: 0,
        }}>
          Built on a combination of 20+ years of operational experience
          inside cement and concrete plants in the GCC, and a structured
          background in manufacturing diagnostics and operational improvement.
        </p>
      </div>
    </section>
  )
}

// ── Contact ───────────────────────────────────────────────────────────────────

function Contact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message }),
    })
    setStatus(res.ok ? 'sent' : 'error')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    border: '1px solid var(--border)', borderRadius: '8px',
    fontSize: '14px', fontFamily: 'var(--font)',
    background: 'var(--white)', color: 'var(--gray-900)',
    boxSizing: 'border-box',
  }

  return (
    <section id="contact" style={{ background: '#0a1a13', padding: 'clamp(64px, 9vw, 100px) 24px' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800,
          color: '#fff', lineHeight: 1.2, letterSpacing: '-0.5px',
          margin: '0 0 12px',
        }}>
          Book a 20-min walkthrough
        </h2>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', margin: '0 0 32px', lineHeight: 1.6 }}>
          We run the diagnostic live on your plant&apos;s data. You see your numbers — turnaround cost, dispatch gap, bottleneck — before we finish the call.
        </p>

        {status === 'sent' ? (
          <div style={{
            background: 'rgba(15,110,86,0.2)', border: '1px solid rgba(15,110,86,0.4)',
            borderRadius: '10px', padding: '24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>✓</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#4ade80', marginBottom: '6px' }}>Message sent</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>We&apos;ll be in touch within 24 hours.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  Name
                </label>
                <input
                  required type="text" value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  Email
                </label>
                <input
                  required type="email" value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Message
              </label>
              <textarea
                required value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us about your plant — location, number of trucks, daily output, or any specific concern."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {status === 'error' && (
              <div style={{ fontSize: '13px', color: '#f87171' }}>
                Something went wrong — please try again or email directly at Louishellmann@gmail.com
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              style={{
                padding: '13px 24px', background: 'var(--green)', color: '#fff',
                border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font)', opacity: status === 'sending' ? 0.7 : 1,
                alignSelf: 'flex-start',
              }}
            >
              {status === 'sending' ? 'Sending…' : 'Send message →'}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'What data do I need to provide?',
    a: 'Basic operational figures: plant capacity, daily output, number of trucks, average delivery radius, turnaround time, dispatch time, rejection rate. No system integrations. No data exports. No preparation required.',
  },
  {
    q: 'Is this software I need to install or license?',
    a: 'No. The diagnostic runs through a structured online assessment. Nothing to install. Nothing to integrate with your existing systems.',
  },
  {
    q: 'How long does the remote phase take?',
    a: 'The structured assessment takes 15–20 minutes. The financial output is immediate.',
  },
  {
    q: 'Can this work across a portfolio of plants?',
    a: 'Yes. Each plant is assessed independently. Portfolio output — which plant carries the highest recoverable margin — is available as a summary view.',
  },
  {
    q: 'What happens after the on-site visit?',
    a: 'You receive a confirmed diagnosis and a prioritized action plan. If 90-day tracking is activated, KPIs are logged weekly against the documented baseline from the assessment.',
  },
]

function FAQ() {
  return (
    <section style={{ background: 'var(--gray-50)', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: '660px', margin: '0 auto' }}>
        <Eyebrow text="FAQ" />
        <h2 style={h2Style}>Common questions</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginTop: '8px' }}>
          {FAQS.map((faq, i) => (
            <div key={faq.q} style={{
              padding: '24px 0',
              borderBottom: i < FAQS.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '8px' }}>
                {faq.q}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--gray-500)', lineHeight: 1.65 }}>
                {faq.a}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer style={{
      background: '#0a1a13',
      padding: '40px 24px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{
        maxWidth: '1080px', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '16px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '5px',
            background: 'var(--green)', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)' }}>al</span>
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>alRMX</span>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', gap: '24px' }}>
          {[
            { label: 'Log in', href: '/login' },
          ].map(link => (
            <Link key={link.href} href={link.href} style={{
              fontSize: '13px', color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
            }}>
              {link.label}
            </Link>
          ))}
        </div>

        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
          © {new Date().getFullYear()} alRMX
        </div>
      </div>
    </footer>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Eyebrow({ text, color = 'var(--green)' }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: '11px', fontWeight: 700, color,
      textTransform: 'uppercase', letterSpacing: '1px',
      marginBottom: '14px',
    }}>
      {text}
    </div>
  )
}

const h2Style: React.CSSProperties = {
  fontSize: 'clamp(22px, 3.5vw, 30px)',
  fontWeight: 800,
  color: 'var(--gray-900)',
  lineHeight: 1.2,
  letterSpacing: '-0.4px',
  margin: '0 0 20px',
}
