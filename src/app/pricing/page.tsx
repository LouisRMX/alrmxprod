'use client'

// ── Pricing page ───────────────────────────────────────────────────────────
// Three-tier model: Diagnostic · Engage · Partner
// All prices in USD. Designed for GCC / MENA market.

const TIERS = [
  {
    name: 'Diagnostic',
    tagline: 'One plant · One visit',
    price: '$4,900',
    period: 'one-time',
    color: 'var(--gray-700)',
    accent: 'var(--border)',
    accentDark: 'var(--gray-300)',
    cta: 'Start a Diagnostic',
    ctaStyle: 'outline' as const,
    includes: [
      'Full on-site assessment (1 day)',
      'Scored report across 4 dimensions',
      'Financial loss quantification',
      'Prioritised action plan (top 5)',
      'PDF export for management presentation',
      '30-day email Q&A support',
    ],
    notIncluded: [
      '90-day implementation tracking',
      'Monthly progress calls',
      'Multi-plant portfolio view',
    ],
    roi: 'Typical finding: $40k–$120k/mo recoverable margin identified',
  },
  {
    name: 'Engage',
    tagline: 'One plant · 90-day improvement programme',
    price: '$14,900',
    period: 'per engagement',
    color: 'var(--green)',
    accent: 'var(--green-mid)',
    accentDark: 'var(--green)',
    highlight: true,
    badge: 'Most popular',
    cta: 'Start an Engagement',
    ctaStyle: 'filled' as const,
    includes: [
      'Everything in Diagnostic',
      '90-day KPI tracking dashboard',
      'Weekly data review (consultant-side)',
      'Monthly progress calls (3×)',
      'Demurrage clause implementation support',
      'SOP templates for dispatch + turnaround',
      'Case study documentation (with consent)',
      'Before / after PDF export',
    ],
    notIncluded: [
      'Multi-plant portfolio view',
      'Custom integrations',
    ],
    roi: 'Average client recovers 6–10× programme fee in year 1',
  },
  {
    name: 'Partner',
    tagline: 'Multi-plant · Annual retainer',
    price: 'Custom',
    period: 'per year',
    color: 'var(--gray-900)',
    accent: 'var(--gray-200)',
    accentDark: 'var(--gray-700)',
    cta: 'Talk to us',
    ctaStyle: 'outline' as const,
    includes: [
      'Unlimited assessments across your portfolio',
      'Portfolio-level dashboard + benchmarking',
      'Quarterly executive briefings',
      'Priority support (48h response)',
      'Custom KPI tracking per plant',
      'Group SOP library access',
      'Annual benchmarking report',
      'Dedicated relationship manager',
    ],
    notIncluded: [],
    roi: 'Designed for operators with 3+ plants or consulting groups',
  },
]

const FAQ = [
  {
    q: 'How is the financial loss figure calculated?',
    a: 'The model uses your plant\'s actual production data, truck fleet, and delivery radius to estimate the margin impact of each operational gap. It applies a contribution margin (or an industry-standard 35% estimate if costs are incomplete) to calculate the cost of each additional minute of turnaround time, percentage point of rejection, and idle capacity.',
  },
  {
    q: 'What data do I need to provide?',
    a: 'You need basic plant data you likely already have: plant capacity (m³/hr), daily production, number of trucks, average turnaround time, rejection rate, selling price, and delivery radius. A full assessment takes 45–90 minutes on site.',
  },
  {
    q: 'Is the 90-day tracking self-serve for the plant?',
    a: 'Yes. The plant manager logs two numbers per week — turnaround time and dispatch time. That\'s it. The system calculates the financial impact automatically and shows progress against targets in a simple dashboard.',
  },
  {
    q: 'Can the report be shared with the plant owner?',
    a: 'Yes. Reports are in draft until the consultant releases them. Once released, the customer has read-only access to their report. The PDF export is formatted for boardroom presentation.',
  },
  {
    q: 'Do you work outside GCC?',
    a: 'The benchmarks and financial model are calibrated for GCC and MENA markets. The tool works anywhere, but benchmark comparisons will be most meaningful in Saudi Arabia, UAE, Bahrain, Qatar, Kuwait, and Oman.',
  },
]

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: '1px' }}>
      <circle cx="7" cy="7" r="7" fill={color} opacity={0.15} />
      <path d="M4 7l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: '1px' }}>
      <path d="M4 4l6 6M10 4l-6 6" stroke="var(--gray-300)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function PricingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)', fontFamily: 'var(--font)' }}>

      {/* Nav */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gray-900)', textDecoration: 'none', letterSpacing: '-.3px' }}>
          alRMX
        </a>
        <a href="/login" style={{ fontSize: '13px', color: 'var(--gray-500)', textDecoration: 'none' }}>
          Sign in →
        </a>
      </div>

      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '60px 24px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '52px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '12px' }}>
            Pricing
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 700, color: 'var(--gray-900)', margin: '0 0 14px', lineHeight: 1.15 }}>
            Find the margin your plant is leaving on the table
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--gray-500)', maxWidth: '560px', margin: '0 auto', lineHeight: 1.6 }}>
            Built for ready-mix operations in the GCC. Quantify your losses in a single visit — then track the recovery over 90 days.
          </p>
        </div>

        {/* Tier cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '64px' }}>
          {TIERS.map(tier => (
            <div
              key={tier.name}
              style={{
                background: 'var(--white)',
                border: `2px solid ${tier.highlight ? tier.accent : 'var(--border)'}`,
                borderRadius: '14px',
                padding: '28px 24px',
                position: 'relative',
                boxShadow: tier.highlight ? '0 4px 24px rgba(0,0,0,.08)' : 'none',
                display: 'flex', flexDirection: 'column',
              }}
            >
              {tier.badge && (
                <div style={{
                  position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--green)', color: '#fff', fontSize: '10px', fontWeight: 700,
                  padding: '3px 12px', borderRadius: '20px', letterSpacing: '.4px', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {tier.badge}
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: tier.color, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
                  {tier.name}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--gray-500)', marginBottom: '16px', lineHeight: 1.4 }}>
                  {tier.tagline}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--gray-900)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
                    {tier.price}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--gray-400)' }}>{tier.period}</span>
                </div>
              </div>

              {/* CTA */}
              <a
                href="/login"
                style={{
                  display: 'block', textAlign: 'center', padding: '11px',
                  borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  textDecoration: 'none', marginBottom: '24px',
                  background: tier.ctaStyle === 'filled' ? 'var(--green)' : 'var(--white)',
                  color: tier.ctaStyle === 'filled' ? '#fff' : 'var(--gray-700)',
                  border: tier.ctaStyle === 'filled' ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                {tier.cta}
              </a>

              {/* Includes */}
              <div style={{ flex: 1 }}>
                {tier.includes.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', fontSize: '13px', color: 'var(--gray-700)', lineHeight: 1.4 }}>
                    <CheckIcon color={tier.color} />
                    {item}
                  </div>
                ))}
                {tier.notIncluded.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', fontSize: '13px', color: 'var(--gray-300)', lineHeight: 1.4 }}>
                    <CrossIcon />
                    {item}
                  </div>
                ))}
              </div>

              {/* ROI note */}
              <div style={{
                marginTop: '20px', padding: '10px 12px',
                background: tier.highlight ? 'rgba(15,110,86,.06)' : 'var(--gray-50)',
                borderRadius: '8px', fontSize: '11px', color: 'var(--gray-500)', lineHeight: 1.5,
              }}>
                {tier.roi}
              </div>
            </div>
          ))}
        </div>

        {/* Social proof strip */}
        <div style={{
          background: 'var(--white)', border: '1px solid var(--border)', borderRadius: '12px',
          padding: '28px 32px', marginBottom: '64px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: '16px' }}>
            Typical results across GCC clients
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', flexWrap: 'wrap' }}>
            {[
              { value: '−18 min', label: 'avg turnaround reduction' },
              { value: '−1.8 pp', label: 'avg rejection rate drop' },
              { value: '$54k/mo', label: 'avg monthly margin recovered' },
              { value: '90 days', label: 'typical payback period' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)', marginBottom: '4px' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--gray-500)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: '24px', textAlign: 'center' }}>
            Frequently asked questions
          </div>
          {FAQ.map((item, i) => (
            <div
              key={i}
              style={{
                padding: '20px 0',
                borderBottom: i < FAQ.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '8px' }}>
                {item.q}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--gray-500)', lineHeight: 1.7 }}>
                {item.a}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
