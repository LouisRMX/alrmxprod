'use client'

import Link from 'next/link'
import { useState } from 'react'

// ── Landing page ─────────────────────────────────────────────────────────────
// Public marketing page for unauthenticated visitors.
// Primary CTA: book a demo (contact form → Louishellmann@gmail.com)

// ── Design tokens ────────────────────────────────────────────────────────────
// Complir-inspired light theme with alrmx green identity
const T = {
  // Core palette
  dark: '#0a2318',           // deep green-black for headlines
  green: '#0F6E56',          // primary brand
  greenMid: '#1D9E75',       // lighter accent
  greenLight: '#E1F5EE',     // subtle bg tint
  greenPale: '#F0FAF6',      // lightest bg tint
  accent: '#10b981',         // emerald for highlights (softer than neon)
  orange: '#f59e0b',         // warm amber for warnings
  orangeMuted: '#d97706',    // darker amber
  // Neutrals
  bg: '#FAFBFC',             // page background
  white: '#ffffff',
  gray900: '#111827',
  gray700: '#374151',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  gray50: '#F9FAFB',
  // Borders & shadows
  border: 'rgba(0, 0, 0, 0.06)',
  borderStrong: 'rgba(0, 0, 0, 0.1)',
  shadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
  shadowMd: '0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.04)',
  shadowLg: '0 10px 15px rgba(0,0,0,0.04), 0 4px 6px rgba(0,0,0,0.02)',
} as const

export default function LandingPage() {
  return (
    <div style={{ fontFamily: 'var(--font)', color: T.gray900, background: T.bg, overflowX: 'hidden' }}>
      <Nav />
      <Hero />
      <Calculator />
      <PortfolioBenchmark />
      <WhoWeAre />
      <HowItWorks />
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
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.border}`,
      padding: '0 24px',
    }}>
      <div style={{
        maxWidth: '1080px', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '56px',
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: '19px', fontFamily: 'var(--serif)', fontWeight: 400, color: T.dark, letterSpacing: '-0.2px' }}>al</span><span style={{ fontSize: '17px', fontFamily: 'var(--font)', fontWeight: 800, color: T.green, letterSpacing: '-0.5px' }}>RMX</span>
        </Link>

        {/* Right nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href="/login" style={{
            fontSize: '13px', color: T.gray500, textDecoration: 'none',
            padding: '6px 12px', borderRadius: '6px',
          }}>
            Log in
          </Link>
          <Link href="/login" style={{
            fontSize: '13px', fontWeight: 600, color: T.white, textDecoration: 'none',
            padding: '7px 16px', borderRadius: '7px', background: T.dark,
          }}>
            Demo
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{
      background: T.white,
      padding: 'clamp(40px, 5vw, 64px) clamp(24px, 4vw, 64px) clamp(40px, 5vw, 64px)',
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div className="landing-hero-grid" style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {/* ── Left: text ── */}
        <div>
          <h1 style={{
            fontSize: 'clamp(32px, 4vw, 56px)', fontWeight: 400,
            fontFamily: 'var(--serif)',
            color: T.dark, lineHeight: 1.15, letterSpacing: '-0.5px',
            margin: '0 0 14px',
          }}>
            Every day your ready-mix plant runs,
            <span style={{ color: T.green }}> money is lost.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 1.8vw, 20px)', color: T.gray500,
            lineHeight: 1.6, margin: '0 0 28px', maxWidth: '560px',
          }}>
            We quantify it, identify the constraint, and turn it into recovered profit.
          </p>

          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            background: T.greenPale, border: `1px solid ${T.greenLight}`,
            borderRadius: '6px', padding: '6px 14px', marginBottom: '20px',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: T.green, textTransform: 'uppercase', letterSpacing: '1px' }}>
              From hidden loss to recovered profit
            </span>
          </div>

          {/* Compact vertical timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', margin: '0 0 28px' }}>
            {[
              { num: '1', label: 'Quantify', desc: 'Revenue loss in dollars from your own data' },
              { num: '2', label: 'Identify', desc: 'The one constraint limiting output and margin' },
              { num: '3', label: 'Execute', desc: 'We implement focused actions with your team' },
              { num: '4', label: 'Track', desc: 'We track results until the financial impact is realized' },
            ].map((item, i) => (
              <div key={item.num} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: T.green, color: T.white,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)',
                  }}>
                    {item.num}
                  </div>
                  {i < 3 && <div style={{ width: '2px', height: '14px', background: T.gray200 }} />}
                </div>
                <div style={{ paddingTop: '7px' }}>
                  <span style={{ fontSize: '17px', fontWeight: 700, color: T.dark }}>{item.label}</span>
                  <span style={{ fontSize: '15px', color: T.gray500, marginLeft: '10px' }}>{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <a
            href="#contact"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: T.dark, color: T.white, textDecoration: 'none',
              padding: '16px 32px', borderRadius: '10px', fontSize: '16px', fontWeight: 600,
              boxShadow: T.shadowMd,
              transition: 'background .15s, box-shadow .15s, transform .15s',
              letterSpacing: '0.01em',
            }}
          >
            See where you are losing money
            <span style={{ fontSize: '16px' }}>&#8594;</span>
          </a>
        </div>

        {/* ── Right: data story cards ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>

          {/* Label */}
          <div style={{ fontSize: '11px', fontWeight: 600, color: T.gray400, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            Example plant analysis
          </div>

          {/* Card 1: Identified */}
          <div style={{
            background: T.white,
            border: `1px solid ${T.borderStrong}`,
            borderRadius: '14px',
            padding: '22px 24px',
            boxShadow: T.shadow,
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: T.gray400, marginBottom: '10px' }}>
              Identified
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '48px', fontWeight: 800, color: T.dark, lineHeight: 1, letterSpacing: '-2px', fontFamily: 'var(--mono)' }}>$295k–$425k</span>
              <span style={{ fontSize: '15px', color: T.gray500, fontWeight: 600 }}>/month lost</span>
            </div>
            <div style={{ fontSize: '12px', color: T.gray400, marginBottom: '4px' }}>18% of total capacity</div>
            <div style={{ fontSize: '11px', color: T.gray300, fontStyle: 'italic' }}>Range reflects variation in production, pricing, and demand</div>
          </div>

          {/* Connector */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', color: T.gray300, fontSize: '16px' }}>&#8595;</div>

          {/* Card 2: Primary constraint */}
          <div style={{
            background: T.white,
            border: `1px solid ${T.borderStrong}`,
            borderRadius: '14px',
            padding: '22px 24px',
            boxShadow: T.shadow,
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: T.gray400, marginBottom: '10px' }}>
              Primary constraint
            </div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: T.dark, marginBottom: '14px' }}>Dispatch inefficiency</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: T.gray400 }}>Best plant</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: T.green, fontFamily: 'var(--mono)' }}>19 min</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: T.gray400 }}>This plant</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626', fontFamily: 'var(--mono)' }}>41 min</span>
              </div>
            </div>
            <div style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', padding: '5px 10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: T.orangeMuted, fontFamily: 'var(--mono)' }}>+22 min</span>
              <span style={{ fontSize: '11px', color: '#92400E' }}>slower than your best plant</span>
            </div>
            <div style={{ marginTop: '12px', borderTop: `1px solid ${T.border}`, paddingTop: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: T.dark, fontFamily: 'var(--mono)' }}>$89k–$128k</span>
              <span style={{ fontSize: '12px', color: T.gray500, marginLeft: '5px' }}>/month at risk from this constraint</span>
            </div>
          </div>

          {/* Connector */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', color: T.gray300, fontSize: '16px' }}>&#8595;</div>

          {/* Card 3: Recovered */}
          <div style={{
            background: T.greenPale,
            border: `1px solid ${T.greenLight}`,
            borderLeft: `4px solid ${T.green}`,
            borderRadius: '14px',
            padding: '22px 24px',
            boxShadow: T.shadow,
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: T.green, marginBottom: '10px' }}>
              Recovered
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
              <span style={{ fontSize: '48px', fontWeight: 800, color: T.green, lineHeight: 1, letterSpacing: '-2px', fontFamily: 'var(--mono)' }}>$70k–$100k</span>
              <span style={{ fontSize: '15px', color: T.greenMid, fontWeight: 600 }}>/month recovered</span>
            </div>
            <div style={{ fontSize: '12px', color: T.greenMid }}>After 12 weeks</div>
          </div>


        </div>
      </div>
    </section>
  )
}

// ── Calculator ───────────────────────────────────────────────────────────────

function Calculator() {
  // Visible inputs (5)
  const [capacity, setCapacity] = useState(120)     // m³/hr plant capacity
  const [trucks, setTrucks] = useState(18)            // number of trucks
  const [turnaround, setTurnaround] = useState(120)   // minutes avg turnaround
  const [dispatchMin, setDispatchMin] = useState(35)   // order-to-dispatch minutes
  const [showInfo, setShowInfo] = useState(false)

  // Hidden defaults (used in calculation, not shown to user)
  const opHours = 10          // standard GCC operating hours
  const mixerCap = 10         // standard mixer capacity m³

  // ── Calculations ──
  // Plant: practical ceiling is 92% of theoretical (industry standard)
  // Fleet: dispatch efficiency modeled as 1 - (minutes / 100), capped 40-98%
  const plantCapDaily = capacity * 0.92 * opHours                   // practical plant ceiling/day
  const delsPerTruck = (opHours * 60) / turnaround
  const totalDels = delsPerTruck * trucks
  const fleetRawDaily = totalDels * mixerCap
  const dispatchEff = Math.max(0.40, Math.min(0.98, 1 - (dispatchMin / 100)))
  const effFleetDaily = fleetRawDaily * dispatchEff
  const bottleneck = plantCapDaily <= effFleetDaily ? 'Plant' : 'Fleet'
  const fleetUtilPct = Math.min(99, (effFleetDaily / plantCapDaily) * 100)
  const gapDaily = Math.max(0, plantCapDaily - effFleetDaily)
  const hasGap = gapDaily > 0 || fleetUtilPct < 85

  const inputRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: `1px solid ${T.border}`,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '13px', color: T.gray700, fontWeight: 500, flex: 1,
  }
  const inputStyle: React.CSSProperties = {
    width: '90px', padding: '8px 10px',
    border: `1px solid ${T.gray200}`, borderRadius: '8px',
    fontSize: '14px', fontFamily: 'var(--mono)', fontWeight: 600,
    color: T.dark, textAlign: 'right',
    background: T.white,
  }
  const unitStyle: React.CSSProperties = {
    fontSize: '12px', color: T.gray400, width: '55px', textAlign: 'left', marginLeft: '8px',
  }

  return (
    <section id="calculator" style={{ background: T.white, padding: 'clamp(64px, 8vw, 96px) 24px', borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <Eyebrow text="Quick check" />
        <h2 style={{
          ...h2Style,
          fontSize: 'clamp(24px, 3.5vw, 36px)',
        }}>
          Could your fleet be holding back your plant?
        </h2>
        <p style={{ fontSize: '17px', color: T.gray500, lineHeight: 1.6, margin: '-8px 0 36px', maxWidth: '600px' }}>
          A quick check to see if your fleet and plant capacity are aligned.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '40px',
          alignItems: 'flex-start',
        }}>
          {/* ── Left: inputs ── */}
          <div style={{
            background: T.gray50,
            border: `1px solid ${T.border}`,
            borderRadius: '14px',
            padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: T.dark, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Your plant
              </span>
              <button
                onClick={() => setShowInfo(!showInfo)}
                style={{
                  background: 'none', border: `1px solid ${T.gray200}`, borderRadius: '50%',
                  width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: T.gray400,
                  fontFamily: 'var(--font)',
                }}
              >
                ?
              </button>
            </div>

            {showInfo && (
              <div style={{
                background: T.white, border: `1px solid ${T.border}`, borderRadius: '10px',
                padding: '14px 16px', marginBottom: '12px', fontSize: '12px', color: T.gray500, lineHeight: 1.6,
                display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <div><strong style={{ color: T.dark }}>Plant capacity</strong> Maximum hourly output your batching plant can produce.</div>
                <div><strong style={{ color: T.dark }}>Number of trucks</strong> Total truck mixers available for delivery (owned + hired).</div>
                <div><strong style={{ color: T.dark }}>Avg. turnaround</strong> Average time from truck loading to return, including travel, pour, and wait time on site.</div>
                <div><strong style={{ color: T.dark }}>Dispatch time</strong> Time from receiving an order to the first truck leaving the plant. Includes scheduling, batching queue, and loading. Longer dispatch time reduces effective fleet capacity.</div>
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '8px', color: T.gray400, fontSize: '11px' }}>
                  Assumptions: 10 operating hours/day, 10 m³ mixer capacity, 92% practical plant ceiling, dispatch efficiency modeled as a function of dispatch time.
                </div>
              </div>
            )}

            <div style={inputRow}>
              <span style={labelStyle}>Plant capacity</span>
              <input type="number" value={capacity} onChange={e => setCapacity(+e.target.value)} style={inputStyle} />
              <span style={unitStyle}>m³/hr</span>
            </div>
            <div style={inputRow}>
              <span style={labelStyle}>Number of trucks</span>
              <input type="number" value={trucks} onChange={e => setTrucks(+e.target.value)} style={inputStyle} />
              <span style={unitStyle}>trucks</span>
            </div>
            <div style={inputRow}>
              <span style={labelStyle}>Avg. turnaround</span>
              <input type="number" value={turnaround} onChange={e => setTurnaround(+e.target.value)} style={inputStyle} />
              <span style={unitStyle}>min</span>
            </div>
            <div style={{ ...inputRow, borderBottom: 'none' }}>
              <span style={labelStyle}>Dispatch time</span>
              <input type="number" value={dispatchMin} onChange={e => setDispatchMin(+e.target.value)} style={inputStyle} />
              <span style={unitStyle}>min</span>
            </div>
          </div>

          {/* ── Right: results ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Main result: utilization */}
            <div style={{
              background: T.white,
              border: `1px solid ${T.borderStrong}`,
              borderRadius: '14px',
              padding: '28px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: T.gray400, marginBottom: '14px' }}>
                Fleet utilization of plant capacity
              </div>
              <div style={{
                fontSize: '64px', fontWeight: 800, fontFamily: 'var(--mono)',
                color: fleetUtilPct < 60 ? '#DC2626' : fleetUtilPct < 80 ? T.orangeMuted : T.green,
                letterSpacing: '-2px', lineHeight: 1, marginBottom: '8px',
              }}>
                {Math.round(fleetUtilPct)}%
              </div>
              <div style={{ fontSize: '13px', color: T.gray500, marginBottom: '4px' }}>
                Your fleet can service <strong>{Math.round(fleetUtilPct)}%</strong> of your plant&apos;s capacity
              </div>
            </div>

            {/* Capacity breakdown */}
            <div style={{
              background: T.gray50,
              border: `1px solid ${T.border}`,
              borderRadius: '14px',
              padding: '20px 24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: T.gray500 }}>Practical plant capacity</span>
                <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)', color: T.dark }}>
                  {Math.round(plantCapDaily).toLocaleString()} m³/day
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: T.gray500 }}>Fleet throughput</span>
                <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)', color: fleetUtilPct < 70 ? '#DC2626' : T.orangeMuted }}>
                  {Math.round(effFleetDaily).toLocaleString()} m³/day
                </span>
              </div>
              {gapDaily > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: '13px', color: T.gray500 }}>Capacity gap</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)', color: '#DC2626' }}>
                    {Math.round(gapDaily).toLocaleString()} m³/day
                  </span>
                </div>
              )}
              {bottleneck === 'Fleet' && (
                <div style={{ marginTop: '14px', fontSize: '12px', color: T.gray500, lineHeight: 1.6 }}>
                  Your fleet is the binding constraint. The full assessment quantifies how much of this gap is recoverable revenue.
                </div>
              )}
              {bottleneck === 'Plant' && (
                <div style={{ marginTop: '14px', fontSize: '12px', color: T.gray500, lineHeight: 1.6 }}>
                  Your plant is the binding constraint. The assessment identifies whether demand, scheduling, or equipment limits your output.
                </div>
              )}
            </div>

            {/* CTA */}
            <a
              href="#contact"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                background: T.dark, color: T.white, textDecoration: 'none',
                padding: '16px 24px', borderRadius: '10px', fontSize: '15px', fontWeight: 600,
                boxShadow: T.shadowMd,
              }}
            >
              Find out what this gap costs you
              <span>&#8594;</span>
            </a>

            <p style={{ fontSize: '11px', color: T.gray400, textAlign: 'center', lineHeight: 1.5 }}>
              Based on fleet throughput vs. plant capacity. See assumptions in the ? panel.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Who we are ───────────────────────────────────────────────────────────────

function WhoWeAre() {
  return (
    <section style={{ background: T.white, padding: 'clamp(64px, 8vw, 96px) 24px', borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <Eyebrow text="Who we are" />
        <h2 style={h2Style}>
          40+ years in GCC cement and concrete.
          <span style={{ color: T.green }}> Structured operational improvement.</span>
        </h2>
        <p style={{ fontSize: '17px', color: T.gray500, lineHeight: 1.7, margin: '0 0 40px', maxWidth: '700px' }}>
          alRMX combines deep Middle East industry experience with data-driven diagnostics and Lean-based improvement frameworks. We do not sell software. We identify, quantify, and help you fix what limits your plant.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Kurt */}
          <div style={{
            background: T.gray50, border: `1px solid ${T.border}`,
            borderRadius: '14px', padding: '28px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: T.gray400, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              Industry
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: T.dark, marginBottom: '6px' }}>
              Kurt Christensen
            </div>
            <div style={{ fontSize: '14px', color: T.green, fontWeight: 600, marginBottom: '14px' }}>
              40+ years in cement and concrete across the GCC
            </div>
            <div style={{ fontSize: '15px', color: T.gray500, lineHeight: 1.65 }}>
              Deep operational knowledge of cement plant optimization, concrete production, and ready-mix logistics in Saudi Arabia and the UAE. Founder of Alcement, advising international companies on construction and development in the region.
            </div>
          </div>

          {/* Louis */}
          <div style={{
            background: T.gray50, border: `1px solid ${T.border}`,
            borderRadius: '14px', padding: '28px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: T.gray400, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              Operations
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: T.dark, marginBottom: '6px' }}>
              Louis Hellmann
            </div>
            <div style={{ fontSize: '14px', color: T.green, fontWeight: 600, marginBottom: '14px' }}>
              Operational improvement, Lean, data-driven diagnostics
            </div>
            <div style={{ fontSize: '15px', color: T.gray500, lineHeight: 1.65 }}>
              Specialist in diagnosing and transforming industrial operations. Lean and Six Sigma methodology applied to manufacturing, logistics, and supply chain. Built the alRMX diagnostic platform to quantify losses and track improvements with measurable financial impact.
            </div>
          </div>
        </div>

        <div style={{
          marginTop: '32px', padding: '20px 24px',
          background: T.greenPale, border: `1px solid ${T.greenLight}`,
          borderRadius: '10px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            background: T.green, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <span style={{ fontSize: '15px', color: T.dark, fontWeight: 500 }}>
            Every assessment is built on real plant-floor experience, not generic benchmarks.
          </span>
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
      label: 'Discovery Report',
      price: '$3,000',
      text: 'You get a quantified business case showing exactly where you are losing money and how much is recoverable. The on-site visit confirms why. If the numbers justify a full on-site engagement, you go in knowing exactly what you are fixing.',
    },
    {
      num: '2',
      label: 'On-site assessment',
      price: '$15,000',
      priceNote: 'excl. travel & accommodation',
      text: 'We visit your plant to confirm the numbers, identify what data alone cannot capture, and build the prioritized action plan with your team. The output is a validated diagnosis you can act on immediately. This protects you from investing in improvements or systems in the wrong places, or solving the wrong problems. This ensures you focus only on improvements with proven financial impact.',
    },
    {
      num: '3',
      label: 'Continuous improvements',
      price: '$2,500 / month',
      priceNote: '$2,000 / month per additional plant',
      text: 'KPIs tracked weekly against the documented baseline. Includes a monthly accountability session and two on-site business reviews per year. This phase turns the engagement into a compounding asset. Every month builds on the last. This phase ensures improvements are implemented, tracked, and translated into measurable financial results, not just plans.',
    },
  ]

  return (
    <section style={{ background: T.white, padding: 'clamp(64px, 8vw, 96px) 24px', borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <Eyebrow text="How it works" />
        <h2 style={h2Style}>3 Phases</h2>
        <p style={{ fontSize: '17px', color: T.gray500, lineHeight: 1.6, margin: '-12px 0 24px' }}>
          Time to value in a few weeks.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          {steps.map((step) => (
            <div key={step.num} style={{
              display: 'flex', gap: '24px', alignItems: 'flex-start',
              background: T.gray50,
              border: `1px solid ${T.border}`,
              borderRadius: '14px',
              padding: '32px',
              boxShadow: T.shadow,
            }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '50%',
                background: T.dark, color: T.white,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '17px', fontWeight: 800, flexShrink: 0,
                fontFamily: 'var(--mono)',
              }}>
                {step.num}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: T.dark }}>
                    {step.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)',
                      color: T.dark,
                    }}>
                      {step.price}
                    </span>
                    {step.priceNote && (
                      <span style={{ fontSize: '13px', color: T.gray400, fontStyle: 'italic' }}>
                        {step.priceNote}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '16px', color: T.gray500, lineHeight: 1.7 }}>
                  {step.text}
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}

// ── Portfolio Benchmark ───────────────────────────────────────────────────────

function PortfolioBenchmark() {
  const [activePanel, setActivePanel] = useState<{ plant: string; dimension: string } | null>(null)

  const plants = [
    { name: 'Al-Noor Dammam',  country: 'SA', dispatch: 22, turnaround: 140, util: 78.0, quality: 2.8, atRisk: 141, actions: 'none', best: true },
    { name: 'Al-Noor Riyadh East', country: 'SA', dispatch: 38, turnaround: 125, util: 82.0, quality: 2.9, atRisk: 103, actions: 'in_progress', best: false },
    { name: 'Al-Noor Riyadh North', country: 'SA', dispatch: 32, turnaround: 112, util: 84.0, quality: 3.0, atRisk: 115, actions: 'in_progress', best: false },
  ]

  // Action items per plant+dimension
  const actionItems: Record<string, { text: string; status: 'todo' | 'in_progress' | 'done' }[]> = {
    'Al-Noor Riyadh East|Dispatch': [
      { text: 'Schedule a process review with Al-Noor Dammam. They run 22 min dispatch vs your 38 min. Ask what changed.', status: 'todo' },
      { text: 'Assign a dedicated dispatcher for peak hours', status: 'todo' },
      { text: 'Implement order-to-dispatch SOP. Target 15 min', status: 'in_progress' },
      { text: 'Lock dispatch slots during peak concrete demand hours', status: 'todo' },
    ],
    'Al-Noor Riyadh North|Dispatch': [
      { text: 'Review dispatch queue management with plant manager', status: 'in_progress' },
      { text: 'Benchmark against Dammam dispatch workflow', status: 'todo' },
      { text: 'Install dispatch tracking board at loading bay', status: 'done' },
    ],
    'Al-Noor Riyadh East|Turnaround': [
      { text: 'Analyze GPS data for route optimization opportunities', status: 'todo' },
      { text: 'Negotiate site access windows with top 5 customers', status: 'todo' },
    ],
    'Al-Noor Riyadh North|Quality': [
      { text: 'Review batching calibration logs for last 30 days', status: 'in_progress' },
      { text: 'Schedule moisture sensor maintenance', status: 'todo' },
    ],
  }

  const bestDispatch = Math.min(...plants.map(p => p.dispatch))
  const bestTurnaround = Math.min(...plants.map(p => p.turnaround))
  const bestUtil = Math.max(...plants.map(p => p.util))
  const bestQuality = Math.min(...plants.map(p => p.quality))
  const totalAtRisk = plants.reduce((s, p) => s + p.atRisk, 0)
  const improving = plants.filter(p => p.actions === 'in_progress' || p.actions === 'done').length

  function kpiColor(gap: number) {
    if (gap <= 0.05) return '#1a6644'
    if (gap <= 0.25) return '#c96a00'
    return '#cc3333'
  }
  function kpiBg(gap: number) {
    if (gap <= 0.05) return 'transparent'
    if (gap <= 0.25) return '#fff8ed'
    return '#fff3f3'
  }
  function gapLow(val: number, best: number) { return best > 0 ? (val - best) / best : 0 }
  function gapHigh(val: number, best: number) { return best > 0 ? (best - val) / best : 0 }

  const actionBadge = (s: 'todo' | 'in_progress' | 'done') => {
    const m = { todo: { label: 'To do', bg: '#fff3f3', color: '#cc3333', border: '#fcc' }, in_progress: { label: 'In progress', bg: '#fff8ed', color: '#c96a00', border: '#f5cba0' }, done: { label: 'Done', bg: '#f0faf5', color: '#1a6644', border: '#b6e2ce' } }
    return m[s]
  }

  const actionStyle = (a: string) => {
    if (a === 'in_progress') return { label: 'In progress', bg: '#fff8ed', color: '#c96a00', border: '#f5cba0' }
    if (a === 'done') return { label: 'Done', bg: '#f0faf5', color: '#1a6644', border: '#b6e2ce' }
    return { label: 'No actions', bg: '#fff3f3', color: '#cc3333', border: '#fcc' }
  }

  const colTemplate = '1.6fr 130px 140px 130px 115px 135px 135px 80px'

  const headerCell: React.CSSProperties = {
    fontSize: '12px', fontWeight: 700, color: T.gray400,
    textTransform: 'uppercase', letterSpacing: '.06em',
  }

  function handleKpiClick(plantName: string, dimension: string, isBest: boolean) {
    if (isBest) return
    const key = `${plantName}|${dimension}`
    if (activePanel?.plant === plantName && activePanel?.dimension === dimension) {
      setActivePanel(null)
    } else if (actionItems[key]) {
      setActivePanel({ plant: plantName, dimension })
    }
  }

  const panelActions = activePanel ? actionItems[`${activePanel.plant}|${activePanel.dimension}`] || [] : []
  const panelPlant = activePanel ? plants.find(p => p.name === activePanel.plant) : null
  const panelValue = activePanel && panelPlant ? (
    activePanel.dimension === 'Dispatch' ? `${panelPlant.dispatch} min` :
    activePanel.dimension === 'Turnaround' ? `${panelPlant.turnaround} min` :
    activePanel.dimension === 'Quality' ? `${panelPlant.quality}%` : ''
  ) : ''

  return (
    <section style={{ background: T.gray50, padding: 'clamp(64px, 8vw, 96px) clamp(24px, 3vw, 48px)', overflow: 'visible' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto 0 clamp(24px, 3vw, 48px)' }}>
        <div>
        <Eyebrow text="Multi-plant portfolio" />
        <h2 style={h2Style}>
          Compare. Prioritize. Improve.
        </h2>
        <p style={{ fontSize: '17px', color: T.gray500, lineHeight: 1.7, margin: '0 0 32px', maxWidth: '640px' }}>
          See which plants underperform, what it costs you, and track the actions that close the gap.
        </p>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px', background: '#fff8ed', border: '1px solid #f5cba0', borderRadius: '14px', padding: '24px 28px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#c96a00', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Total recoverable</div>
            <div style={{ fontSize: '36px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#c96a00' }}>${totalAtRisk}k<span style={{ fontSize: '18px', fontWeight: 500 }}> /month</span></div>
          </div>
          <div style={{ flex: 1, minWidth: '240px', background: T.white, border: `1px solid ${T.border}`, borderRadius: '14px', padding: '24px 28px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: T.gray400, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Primary bottleneck</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#c96a00' }}>Dispatch</div>
          </div>
          <div style={{ flex: 1, minWidth: '240px', background: T.white, border: `1px solid ${T.border}`, borderRadius: '14px', padding: '24px 28px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: T.gray400, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Plants improving</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: improving > 0 ? '#1a6644' : T.gray400 }}>{improving} <span style={{ fontSize: '18px', fontWeight: 500, color: T.gray400 }}>of {plants.length}</span></div>
          </div>
        </div>

        {/* Warning banner */}
        <div style={{
          background: '#fff8ed', border: '1px solid #f5cba0', borderLeft: '4px solid #c96a00',
          borderRadius: '10px', padding: '16px 20px', marginBottom: '24px',
          fontSize: '16px', color: '#92400E', display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '16px' }}>&#9888;</span>
          <span><strong>${totalAtRisk - plants[0].atRisk}k/month at risk</strong> across {plants.filter(p => !p.best).length} plants. {plants.filter(p => p.actions === 'none').length > 0 ? `No active improvement actions on ${plants.filter(p => p.actions === 'none').length} plant${plants.filter(p => p.actions === 'none').length > 1 ? 's' : ''}.` : ''}</span>
        </div>

        </div>

        {/* Table + Action panel layout */}
        <div style={{ display: 'flex', gap: '20px', position: 'relative' }}>

          {/* Comparison table */}
          <div style={{
            flex: 1,
            background: T.white, border: `1px solid ${T.border}`,
            borderRadius: '14px',
            overflow: 'hidden', boxShadow: T.shadow,
          }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: colTemplate, padding: '16px 28px', borderBottom: `1px solid ${T.border}`, background: T.gray50 }}>
              <div style={headerCell}>Plant</div>
              <div style={headerCell}>Dispatch</div>
              <div style={headerCell}>Turnaround</div>
              <div style={headerCell}>Utilization</div>
              <div style={headerCell}>Quality</div>
              <div style={headerCell}>At risk /mo</div>
              <div style={headerCell}>Actions</div>
              <div />
            </div>

            {/* Rows */}
            {plants.map((p, i) => {
              const dGap = gapLow(p.dispatch, bestDispatch)
              const tGap = gapLow(p.turnaround, bestTurnaround)
              const uGap = gapHigh(p.util, bestUtil)
              const qGap = gapLow(p.quality, bestQuality)
              const as = actionStyle(p.actions)

              const kpiCell = (val: string, gap: number, dim: string) => {
                const isClickable = !p.best && gap > 0.05 && actionItems[`${p.name}|${dim}`]
                const isActive = activePanel?.plant === p.name && activePanel?.dimension === dim
                return (
                  <div
                    onClick={() => handleKpiClick(p.name, dim, p.best)}
                    style={{
                      background: isActive ? '#e0f2fe' : kpiBg(gap),
                      borderRadius: '8px', padding: '6px 10px',
                      cursor: isClickable ? 'pointer' : 'default',
                      border: isActive ? '2px solid #0ea5e9' : isClickable ? `1.5px dashed ${kpiColor(gap)}40` : '2px solid transparent',
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '15px', fontFamily: 'var(--mono)', fontWeight: 600, color: kpiColor(gap) }}>{val}</span>
                      {isClickable && !isActive && <span style={{ fontSize: '11px', color: kpiColor(gap), opacity: 0.5 }}>&#8599;</span>}
                    </div>
                    {p.best
                      ? <div style={{ fontSize: '11px', color: T.gray400 }}>portfolio best</div>
                      : <div style={{ fontSize: '11px', color: kpiColor(gap) }}>
                          {dim === 'Utilization' ? `+${parseFloat(val) < bestUtil ? (bestUtil - parseFloat(val)).toFixed(1) : '0'}pp vs best` : `+${parseInt(val) - (dim === 'Dispatch' ? bestDispatch : bestTurnaround)} ${dim === 'Quality' ? 'pp' : 'min'} vs best`}
                        </div>
                    }
                  </div>
                )
              }

              return (
                <div key={p.name} style={{
                  display: 'grid', gridTemplateColumns: colTemplate,
                  padding: '20px 28px', alignItems: 'center',
                  borderBottom: i < plants.length - 1 ? `1px solid ${T.border}` : 'none',
                  background: p.best ? '#f6fdf9' : T.white,
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 600, color: T.dark }}>{p.name}</span>
                      {p.best && <span style={{ fontSize: '10px', fontWeight: 700, color: '#1a6644', background: '#e6f7ef', border: '1px solid #b6e2ce', borderRadius: '4px', padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Best</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: T.gray400 }}>{p.country}</div>
                  </div>

                  {kpiCell(`${p.dispatch} min`, dGap, 'Dispatch')}
                  {kpiCell(`${p.turnaround} min`, tGap, 'Turnaround')}
                  {kpiCell(`${p.util.toFixed(1)}%`, uGap, 'Utilization')}
                  {kpiCell(`${p.quality.toFixed(1)}%`, qGap, 'Quality')}

                  <div style={{ fontSize: '18px', fontFamily: 'var(--mono)', fontWeight: 700, color: T.dark }}>${p.atRisk}k</div>

                  <div style={{
                    fontSize: '13px', fontWeight: 600, color: as.color,
                    background: as.bg, border: `1px solid ${as.border}`,
                    borderRadius: '5px', padding: '4px 10px', textAlign: 'center', whiteSpace: 'nowrap',
                  }}>{as.label}</div>

                  <div style={{ fontSize: '14px', color: T.green, fontWeight: 600, cursor: 'default' }}>View &#8594;</div>
                </div>
              )
            })}
          </div>

          {/* Action panel (outside container, to the right) */}
          {activePanel && (
            <div style={{
              position: 'absolute', top: 0, left: '100%', marginLeft: '20px',
              width: '340px',
              background: T.white,
              border: `1px solid ${T.border}`,
              borderRadius: '14px',
              boxShadow: T.shadowLg,
              overflow: 'hidden',
            }}>
              {/* Panel header */}
              <div style={{ padding: '20px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: T.gray400, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{activePanel.plant}</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: T.dark, marginTop: '4px' }}>{activePanel.dimension}</div>
                  </div>
                  <button onClick={() => setActivePanel(null)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '18px', color: T.gray400, padding: '4px',
                  }}>&times;</button>
                </div>
                <div style={{ fontSize: '14px', fontFamily: 'var(--mono)', fontWeight: 700, color: '#cc3333', marginTop: '4px' }}>
                  {panelValue}, needs improvement
                </div>
              </div>

              {/* Actions list */}
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: T.gray400, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {panelActions.map((action, i) => {
                    const badge = actionBadge(action.status)
                    return (
                      <div key={i} style={{
                        background: T.gray50, border: `1px solid ${T.border}`,
                        borderRadius: '10px', padding: '14px 16px',
                      }}>
                        <div style={{ fontSize: '13px', color: T.dark, lineHeight: 1.5, marginBottom: '8px' }}>
                          {action.text}
                        </div>
                        <span style={{
                          fontSize: '10px', fontWeight: 600, color: badge.color,
                          background: badge.bg, border: `1px solid ${badge.border}`,
                          borderRadius: '4px', padding: '2px 8px',
                        }}>{badge.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Hint */}
        {!activePanel && (
          <div style={{ fontSize: '15px', color: T.dark, marginTop: '16px', fontWeight: 500 }}>
            Click any highlighted KPI to see the improvement actions &#8599;
          </div>
        )}
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
    width: '100%', padding: '12px 14px',
    border: `1px solid ${T.gray200}`, borderRadius: '8px',
    fontSize: '14px', fontFamily: 'var(--font)',
    background: T.white, color: T.gray900,
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  return (
    <section id="contact" style={{ background: T.gray50, padding: 'clamp(64px, 9vw, 100px) 24px', borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <Eyebrow text="Get started" />
        <h2 style={{
          fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400,
          fontFamily: 'var(--serif)',
          color: T.dark, lineHeight: 1.2, letterSpacing: '-0.5px',
          margin: '0 0 12px',
        }}>
          Book a 20-min walkthrough
        </h2>
        <p style={{ fontSize: '17px', color: T.gray500, margin: '0 0 20px', lineHeight: 1.6 }}>
          We walk you through a demo-plant case and show exactly how losses are identified, prioritized, and turned into measurable profit.
        </p>
        <p style={{ fontSize: '13px', fontWeight: 600, color: T.gray400, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          You will see
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            'How data is collected',
            'Where capacity is typically lost',
            'How bottlenecks are identified',
            'How actions are prioritized based on financial impact',
          ].map(item => (
            <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{
                color: T.white, fontSize: '9px', flexShrink: 0, marginTop: '4px',
                width: '16px', height: '16px', borderRadius: '50%', background: T.green,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
              }}>&#10003;</span>
              <span style={{ fontSize: '16px', color: T.gray500, lineHeight: 1.5 }}>{item}</span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: '15px', color: T.gray400, margin: '0 0 32px', lineHeight: 1.6, fontStyle: 'italic' }}>
          Built on 20+ years of GCC cement and concrete experience.
        </p>

        {status === 'sent' ? (
          <div style={{
            background: T.greenPale, border: `1px solid ${T.greenLight}`,
            borderRadius: '12px', padding: '24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '10px', color: T.green }}>&#10003;</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: T.green, marginBottom: '6px' }}>Message sent</div>
            <div style={{ fontSize: '13px', color: T.gray500 }}>We&apos;ll be in touch within 24 hours.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{
            display: 'flex', flexDirection: 'column', gap: '14px',
            background: T.white, border: `1px solid ${T.border}`,
            borderRadius: '14px', padding: '24px',
            boxShadow: T.shadow,
          }}>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: T.gray700, marginBottom: '6px' }}>
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
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: T.gray700, marginBottom: '6px' }}>
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
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: T.gray700, marginBottom: '6px' }}>
                Message
              </label>
              <textarea
                required value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Tell us about your plant: location, number of trucks, daily output, or any specific concern."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            {status === 'error' && (
              <div style={{ fontSize: '13px', color: '#DC2626' }}>
                Something went wrong. Please try again or email directly at Louishellmann@gmail.com
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              style={{
                padding: '13px 24px', background: T.dark, color: T.white,
                border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font)', opacity: status === 'sending' ? 0.7 : 1,
                alignSelf: 'flex-start',
                transition: 'background 0.15s',
              }}
            >
              {status === 'sending' ? 'Sending\u2026' : 'Send message \u2192'}
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
    a: 'The structured assessment takes 15\u201320 minutes. The financial output is immediate.',
  },
  {
    q: 'Can this work across a portfolio of plants?',
    a: 'Yes. Each plant is assessed independently. Portfolio output (which plant carries the highest recoverable margin) is available as a summary view.',
  },
  {
    q: 'What happens after the on-site visit?',
    a: 'You receive a confirmed diagnosis and a prioritized action plan. If 90-day tracking is activated, KPIs are logged weekly against the documented baseline from the assessment.',
  },
]

function FAQ() {
  return (
    <section style={{ background: T.white, padding: 'clamp(64px, 8vw, 96px) 24px', borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
        <Eyebrow text="FAQ" />
        <h2 style={h2Style}>Common questions</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginTop: '8px' }}>
          {FAQS.map((faq, i) => (
            <div key={faq.q} style={{
              padding: '24px 0',
              borderBottom: i < FAQS.length - 1 ? `1px solid ${T.border}` : 'none',
            }}>
              <div style={{ fontSize: '17px', fontWeight: 600, color: T.dark, marginBottom: '8px' }}>
                {faq.q}
              </div>
              <div style={{ fontSize: '16px', color: T.gray500, lineHeight: 1.65 }}>
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
      background: T.dark,
      padding: '40px 24px',
      borderTop: `1px solid ${T.border}`,
    }}>
      <div style={{
        maxWidth: '1080px', margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '16px',
      }}>
        {/* Logo */}
        <div>
          <span style={{ fontSize: '18px', fontFamily: 'var(--serif)', fontWeight: 400, color: 'rgba(255,255,255,0.5)', letterSpacing: '-0.2px' }}>al</span><span style={{ fontSize: '16px', fontFamily: 'var(--font)', fontWeight: 800, color: T.accent, letterSpacing: '-0.5px' }}>RMX</span>
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
          &copy; {new Date().getFullYear()} alRMX
        </div>
      </div>
    </footer>
  )
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Eyebrow({ text, color = T.green }: { text: string; color?: string }) {
  return (
    <div style={{
      fontSize: '13px', fontWeight: 700, color,
      textTransform: 'uppercase', letterSpacing: '1px',
      marginBottom: '16px',
    }}>
      {text}
    </div>
  )
}

const h2Style: React.CSSProperties = {
  fontSize: 'clamp(28px, 3.5vw, 40px)',
  fontWeight: 400,
  fontFamily: 'var(--serif)',
  color: T.dark,
  lineHeight: 1.2,
  letterSpacing: '-0.4px',
  margin: '0 0 20px',
}
