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
      <HowItWorks />
      <Diagnostic />
      <PortfolioBenchmark />
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
      padding: 'clamp(40px, 5vw, 64px) 24px clamp(40px, 5vw, 64px)',
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div className="landing-hero-grid" style={{ maxWidth: '1280px', margin: '0 auto' }}>

        {/* ── Left: text ── */}
        <div>
          <h1 style={{
            fontSize: 'clamp(28px, 3.5vw, 48px)', fontWeight: 400,
            fontFamily: 'var(--serif)',
            color: T.dark, lineHeight: 1.15, letterSpacing: '-0.5px',
            margin: '0 0 14px',
          }}>
            Every day your ready-mix plant runs,
            <span style={{ color: T.green }}> money is lost.</span>
          </h1>

          <p style={{
            fontSize: 'clamp(14px, 1.6vw, 16px)', color: T.gray500,
            lineHeight: 1.6, margin: '0 0 20px', maxWidth: '480px',
          }}>
            We quantify it, identify the constraint, and turn it into recovered profit.
          </p>

          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            background: T.greenPale, border: `1px solid ${T.greenLight}`,
            borderRadius: '6px', padding: '5px 12px', marginBottom: '16px',
          }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: T.green, textTransform: 'uppercase', letterSpacing: '1px' }}>
              From hidden loss to recovered profit
            </span>
          </div>

          {/* Compact vertical timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', margin: '0 0 20px' }}>
            {[
              { num: '1', label: 'Quantify', desc: 'Revenue loss in dollars from your own data' },
              { num: '2', label: 'Identify', desc: 'The one constraint limiting output and margin' },
              { num: '3', label: 'Execute', desc: 'We implement focused actions with your team' },
              { num: '4', label: 'Track', desc: 'We track results until the financial impact is realized' },
            ].map((item, i) => (
              <div key={item.num} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: T.green, color: T.white,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)',
                  }}>
                    {item.num}
                  </div>
                  {i < 3 && <div style={{ width: '2px', height: '12px', background: T.gray200 }} />}
                </div>
                <div style={{ paddingTop: '5px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: T.dark }}>{item.label}</span>
                  <span style={{ fontSize: '12px', color: T.gray500, marginLeft: '8px' }}>{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <a
            href="#contact"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              background: T.dark, color: T.white, textDecoration: 'none',
              padding: '14px 28px', borderRadius: '10px', fontSize: '15px', fontWeight: 600,
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
              <span style={{ fontSize: '42px', fontWeight: 800, color: T.dark, lineHeight: 1, letterSpacing: '-2px', fontFamily: 'var(--mono)' }}>$295k–$425k</span>
              <span style={{ fontSize: '14px', color: T.gray500, fontWeight: 600 }}>/month lost</span>
            </div>
            <div style={{ fontSize: '12px', color: T.gray400 }}>18% of total capacity</div>
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
            <div style={{ fontSize: '16px', fontWeight: 700, color: T.dark, marginBottom: '14px' }}>Dispatch inefficiency</div>
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
              <span style={{ fontSize: '42px', fontWeight: 800, color: T.green, lineHeight: 1, letterSpacing: '-2px', fontFamily: 'var(--mono)' }}>$70k–$100k</span>
              <span style={{ fontSize: '14px', color: T.greenMid, fontWeight: 600 }}>/month recovered</span>
            </div>
            <div style={{ fontSize: '12px', color: T.greenMid }}>After 12 weeks</div>
          </div>

          {/* Credibility label */}
          <div style={{
            marginTop: '10px',
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: T.green, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: T.gray500 }}>
              Based on real plant data
            </span>
          </div>

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
      label: 'Quality / rejection rate',
      text: 'Rejection percentage, material write-off at cost price, dominant cause identification.',
    },
  ]

  return (
    <section style={{ background: T.gray50, padding: 'clamp(64px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <Eyebrow text="The diagnostic" />
        <h2 style={h2Style}>
          Four dimensions. Specific numbers. Calculated from your own data.
        </h2>
        <p style={{ fontSize: '15px', color: T.gray500, lineHeight: 1.6, margin: '0 0 36px', maxWidth: '520px' }}>
          Every dimension produces a monthly dollar figure. Not a qualitative finding.
          Based on data you provide during the assessment.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {dimensions.map(d => (
            <div key={d.num} style={{
              background: T.white, border: `1px solid ${T.border}`,
              borderRadius: '12px', padding: '20px 22px',
              display: 'flex', gap: '20px', alignItems: 'flex-start',
              boxShadow: T.shadow,
              transition: 'box-shadow 0.15s, border-color 0.15s',
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: '11px', color: T.green,
                fontWeight: 600, flexShrink: 0, marginTop: '2px', letterSpacing: '0.5px',
              }}>
                {d.num}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: T.dark, marginBottom: '4px' }}>
                  {d.label}
                </div>
                <div style={{ fontSize: '13px', color: T.gray500, lineHeight: 1.55 }}>
                  {d.text}
                </div>
              </div>
              <div style={{
                marginLeft: 'auto', flexShrink: 0,
                fontSize: '11px', fontWeight: 600, color: T.green,
                background: T.greenPale, border: `1px solid ${T.greenLight}`,
                borderRadius: '6px', padding: '4px 10px', whiteSpace: 'nowrap',
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
      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        <Eyebrow text="Quick check" />
        <h2 style={{
          ...h2Style,
          fontSize: 'clamp(24px, 3.5vw, 36px)',
        }}>
          Could your fleet be holding back your plant?
        </h2>
        <p style={{ fontSize: '15px', color: T.gray500, lineHeight: 1.6, margin: '-8px 0 36px', maxWidth: '520px' }}>
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
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <Eyebrow text="How it works" />
        <h2 style={h2Style}>3 Phases</h2>
        <p style={{ fontSize: '15px', color: T.gray500, lineHeight: 1.6, margin: '-12px 0 24px' }}>
          Time to value in a few weeks.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          {steps.map((step) => (
            <div key={step.num} style={{
              display: 'flex', gap: '24px', alignItems: 'flex-start',
              background: T.gray50,
              border: `1px solid ${T.border}`,
              borderRadius: '14px',
              padding: '28px',
              boxShadow: T.shadow,
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: T.dark, color: T.white,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '15px', fontWeight: 800, flexShrink: 0,
                fontFamily: 'var(--mono)',
              }}>
                {step.num}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: T.dark }}>
                    {step.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                    <span style={{
                      fontSize: '18px', fontWeight: 800, fontFamily: 'var(--mono)',
                      color: T.dark,
                    }}>
                      {step.price}
                    </span>
                    {step.priceNote && (
                      <span style={{ fontSize: '11px', color: T.gray400, fontStyle: 'italic' }}>
                        {step.priceNote}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: T.gray500, lineHeight: 1.7 }}>
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
  const plants = [
    { name: 'Abu Dhabi Plant',  dispatch: '18 min', gap: null,     loss: null,      best: true  },
    { name: 'Dubai Plant',      dispatch: '34 min', gap: '+16 min', loss: '$67k/mo', best: false },
    { name: 'Sharjah Plant',    dispatch: '41 min', gap: '+23 min', loss: '$108k/mo', best: false },
  ]

  return (
    <section style={{ background: T.dark, padding: 'clamp(64px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <Eyebrow text="Multi-plant portfolio" color={T.accent} />
        <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 42px)', fontWeight: 400, color: T.white, lineHeight: 1.15, letterSpacing: '-0.5px', margin: '0 0 16px', fontFamily: 'var(--serif)' }}>
          Your best plant is your benchmark.
          <span style={{ color: T.accent }}> Not an industry average.</span>
        </h2>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: '0 0 40px', maxWidth: '560px' }}>
          When you operate multiple plants, we show exactly which ones are underperforming relative to your own best performers, and what that gap costs every month.
        </p>

        {/* Plant comparison table */}
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 110px', padding: '10px 20px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {['Plant', 'Dispatch', 'vs Best', 'At risk /mo'].map(h => (
              <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</div>
            ))}
          </div>
          {/* Rows */}
          {plants.map((p, i) => (
            <div key={p.name} style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 100px 110px',
              padding: '16px 20px', alignItems: 'center',
              borderBottom: i < plants.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              background: p.best ? 'rgba(16,185,129,0.06)' : 'transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', color: p.best ? T.accent : 'rgba(255,255,255,0.7)', fontWeight: p.best ? 700 : 400 }}>{p.name}</span>
                {p.best && <span style={{ fontSize: '10px', fontWeight: 700, color: T.accent, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '4px', padding: '1px 6px' }}>Best</span>}
              </div>
              <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 600, color: p.best ? T.accent : 'rgba(255,255,255,0.6)' }}>{p.dispatch}</div>
              <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 700, color: p.gap ? T.orange : 'rgba(16,185,129,0.6)' }}>{p.gap ?? '\u2014'}</div>
              <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 700, color: p.loss ? T.orange : 'rgba(255,255,255,0.3)' }}>{p.loss ?? '\u2014'}</div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '14px 20px', textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'rgba(245,158,11,0.6)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '4px' }}>Total recoverable across portfolio</div>
            <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--mono)', color: T.orange }}>$175k / month</div>
          </div>
        </div>
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
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <Eyebrow text="Get started" />
        <h2 style={{
          fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 400,
          fontFamily: 'var(--serif)',
          color: T.dark, lineHeight: 1.2, letterSpacing: '-0.5px',
          margin: '0 0 12px',
        }}>
          Book a 20-min walkthrough
        </h2>
        <p style={{ fontSize: '15px', color: T.gray500, margin: '0 0 20px', lineHeight: 1.6 }}>
          We walk you through a demo-plant case and show exactly how losses are identified, prioritized, and turned into measurable profit.
        </p>
        <p style={{ fontSize: '12px', fontWeight: 600, color: T.gray400, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>
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
              <span style={{ fontSize: '14px', color: T.gray500, lineHeight: 1.5 }}>{item}</span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: '13px', color: T.gray400, margin: '0 0 32px', lineHeight: 1.6, fontStyle: 'italic' }}>
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
      <div style={{ maxWidth: '660px', margin: '0 auto' }}>
        <Eyebrow text="FAQ" />
        <h2 style={h2Style}>Common questions</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginTop: '8px' }}>
          {FAQS.map((faq, i) => (
            <div key={faq.q} style={{
              padding: '24px 0',
              borderBottom: i < FAQS.length - 1 ? `1px solid ${T.border}` : 'none',
            }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: T.dark, marginBottom: '8px' }}>
                {faq.q}
              </div>
              <div style={{ fontSize: '14px', color: T.gray500, lineHeight: 1.65 }}>
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
  fontWeight: 400,
  fontFamily: 'var(--serif)',
  color: T.dark,
  lineHeight: 1.2,
  letterSpacing: '-0.4px',
  margin: '0 0 20px',
}
