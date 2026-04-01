'use client'

import { useState } from 'react'
import type { CalcScores } from '@/lib/calculations'

interface ScoreLivePanelProps {
  scores: CalcScores
  overall: number | null
  bottleneck: string | null
}

function scoreColor(v: number | null): string {
  if (v === null) return 'var(--gray-300)'
  if (v >= 80) return 'var(--green-mid)'
  if (v >= 60) return '#D68910'
  return 'var(--red)'
}

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
      <span style={{ fontSize: '12px', color: 'var(--gray-500)', width: '80px', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '8px', background: 'var(--gray-100)', borderRadius: '4px', overflow: 'hidden' }}>
        {value !== null && (
          <div style={{
            width: `${value}%`, height: '8px', borderRadius: '4px',
            background: scoreColor(value), transition: 'width .5s, background .4s',
          }} />
        )}
      </div>
      <span style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'var(--mono)', width: '38px', textAlign: 'right', color: scoreColor(value) }}>
        {value !== null ? value : '—'}
      </span>
    </div>
  )
}

const SCORE_EXPLANATIONS = [
  {
    label: 'Production',
    color: '#0F6E56',
    subtitle: 'How well the plant uses its capacity',
    body: 'Measures how close your plant is to its optimal operating rate of 92%. That 8% headroom is intentional — it allows for schedule changes without overloading the plant. If utilisation is well below 92%, the plant has spare capacity that could generate more revenue. If it exceeds 92% consistently, scheduling is under pressure.',
    factors: [
      { name: 'Actual m³ produced', weight: 'Primary' },
      { name: 'Plant hourly capacity × operating hours', weight: 'Denominator' },
    ],
    benchmark: '92% utilisation = green zone',
  },
  {
    label: 'Dispatch',
    color: '#c0392b',
    subtitle: 'Speed from customer call to truck departure',
    body: 'Measures how quickly an order moves from when a customer calls to when the loaded truck leaves the gate. Every minute of unnecessary delay means trucks idle at the plant, deliveries arrive late, and drivers run fewer cycles per day. The industry target is under 15 minutes.',
    factors: [
      { name: 'Order-to-dispatch time', weight: '60%' },
      { name: 'Route planning method (zone routing vs. ad hoc)', weight: '15%' },
      { name: 'Dispatch tools (software vs. WhatsApp/spreadsheet)', weight: '13%' },
      { name: 'How far ahead orders are confirmed', weight: '12%' },
    ],
    benchmark: 'Under 15 min = green zone',
  },
  {
    label: 'Fleet',
    color: '#0F6E56',
    subtitle: 'How efficiently trucks complete delivery cycles',
    body: 'Measures the full round-trip time for each truck: leave plant → deliver → return → reload. The target depends on your delivery radius — roughly 60 minutes plus 1.5 minutes per kilometre of radius. A plant serving a 10 km area targets 75 minutes per cycle. Longer turnarounds mean fewer deliveries per truck per day, directly reducing plant output.',
    factors: [
      { name: 'Turnaround time vs. benchmark for your delivery radius', weight: '50%' },
      { name: 'Fleet availability (trucks in service vs. off-road)', weight: '25%' },
      { name: 'Qualified drivers relative to truck count', weight: '15%' },
      { name: 'Washout time at the plant after delivery', weight: '10%' },
    ],
    benchmark: 'Turnaround ≤ (60 + radius × 1.5) min = green zone',
  },
  {
    label: 'Quality',
    color: '#c0392b',
    subtitle: 'How much concrete is rejected or wasted',
    body: 'Measures the rate at which delivered concrete is rejected by customers and the plant\'s exposure to that cost. Every rejected m³ is a direct write-off — the plant typically absorbs 100% of the material cost plus the truck cycle. A 4% rejection rate on 6,000 m³/month at $68/m³ costs roughly $16,000/month.',
    factors: [
      { name: 'Rejection rate (%)', weight: '50%' },
      { name: 'Quality control procedures (testing, slump checks)', weight: '25%' },
      { name: 'Batch plant calibration frequency', weight: '15%' },
      { name: 'Surplus concrete handling policy', weight: '10%' },
    ],
    benchmark: 'Below 2% rejection = green zone',
  },
]

function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--white)', borderRadius: '12px',
          width: '100%', maxWidth: '520px',
          boxShadow: '0 8px 32px rgba(0,0,0,.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--gray-900)' }}>How scores are calculated</div>
            <div style={{ fontSize: '12px', color: 'var(--gray-500)', marginTop: '2px' }}>Each score runs from 0 to 100 based on what your answers reveal</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '18px', color: 'var(--gray-400)', lineHeight: 1, padding: '4px',
            }}
          >×</button>
        </div>

        {/* Colour scale */}
        <div style={{
          display: 'flex', gap: '8px', padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--gray-50, #fafafa)',
        }}>
          {[
            { range: '80–100', label: 'Good', bg: 'var(--green-light)', fg: 'var(--green)', border: 'var(--tooltip-border)' },
            { range: '60–79', label: 'Attention needed', bg: 'var(--warning-bg)', fg: '#92610A', border: 'var(--warning-border)' },
            { range: '0–59', label: 'Priority', bg: 'var(--error-bg)', fg: 'var(--red)', border: 'var(--error-border)' },
          ].map(s => (
            <div key={s.range} style={{
              flex: 1, textAlign: 'center', padding: '6px 4px',
              background: s.bg, border: `1px solid ${s.border}`, borderRadius: '6px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)', color: s.fg }}>{s.range}</div>
              <div style={{ fontSize: '10px', color: s.fg, marginTop: '1px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Score sections */}
        <div style={{ padding: '4px 0 8px' }}>
          {SCORE_EXPLANATIONS.map((s, i) => (
            <div key={s.label} style={{
              padding: '14px 20px',
              borderBottom: i < SCORE_EXPLANATIONS.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)' }}>{s.label}</span>
                <span style={{ fontSize: '11px', color: 'var(--gray-500)' }}>{s.subtitle}</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--gray-700)', lineHeight: '1.6', margin: '0 0 8px' }}>
                {s.body}
              </p>
              <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginBottom: '6px', fontWeight: 500 }}>
                What feeds into this score:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '6px' }}>
                {s.factors.map(f => (
                  <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ color: 'var(--gray-600)' }}>{f.name}</span>
                    <span style={{ color: 'var(--gray-400)', fontFamily: 'var(--mono)', flexShrink: 0, marginLeft: '8px' }}>{f.weight}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 500 }}>
                ✓ {s.benchmark}
              </div>
            </div>
          ))}

          {/* Overall + Bottleneck explanation */}
          <div style={{ padding: '14px 20px', background: 'var(--gray-50, #fafafa)', margin: '0' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '4px' }}>Overall & Bottleneck</div>
            <p style={{ fontSize: '12px', color: 'var(--gray-700)', lineHeight: '1.6', margin: '0 0 8px' }}>
              The <strong>Overall score</strong> is the simple average of the four scores above. A single weak area pulls it down significantly — a plant scoring 90/90/90/30 gets an overall of 75, not 90.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--gray-700)', lineHeight: '1.6', margin: 0 }}>
              The <strong>Bottleneck</strong> badge marks whichever area scored lowest. That is the operational weak point. Note that the biggest <em>financial</em> loss may come from a different area — the Report tab shows the financial impact of each dimension separately.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ScoreLivePanel({ scores, overall, bottleneck }: ScoreLivePanelProps) {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <>
      <div style={{
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--gray-300)' }}>
            Live scores
          </div>
          <button
            onClick={() => setShowInfo(true)}
            title="How are these scores calculated?"
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: '50%',
              width: '18px', height: '18px', cursor: 'pointer',
              fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1, padding: 0, flexShrink: 0,
            }}
          >i</button>
        </div>
        <ScoreRow label="Production" value={scores.prod} />
        <ScoreRow label="Dispatch" value={scores.dispatch} />
        <ScoreRow label="Fleet" value={scores.logistics} />
        <ScoreRow label="Quality" value={scores.quality} />
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '8px' }}>
          <ScoreRow label="Overall" value={overall} />
        </div>
        {bottleneck && (
          <div style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
            fontSize: '11px', fontWeight: 500,
            background: '#FDE8E6', color: 'var(--red)', marginTop: '4px',
          }}>
            Bottleneck: {bottleneck}
          </div>
        )}
      </div>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </>
  )
}
