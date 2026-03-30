'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AssessmentShell from '@/components/assessment/AssessmentShell'
import type { Answers } from '@/lib/calculations'

// ── Demo dataset: Al-Noor RMX, Dubai — realistic GCC scenario ──────────────
const DEMO_ANSWERS: Answers = {
  // Fleet
  trucks: '8',
  op_hours: '10',
  op_days: '26',

  // Production
  actual_prod: '18500',
  cap_m3: '21500',

  // Turnaround & dispatch
  turnaround: '54',
  deliveries_day: '19',
  order_to_dispatch: '25 to 40 minutes — slow',

  // Quality
  reject_pct: '3.8',

  // Economics
  price_m3: '68',
  cement_cost: '24',
  aggregate_cost: '7',
  admix_cost: '2.5',

  // Fleet reliability
  breakdown_freq: '2–3 per month',
  breakdown_hours: '5',
  fleet_age: '3–5 years',

  // Overloading
  overload_pct: '10',
  overload_cost: '750',

  // Surplus / waste
  surplus_loads: '4',

  // Demurrage
  demurrage_incidents: '6',
  demurrage_cost: '95',

  // Water
  wash_water: 'Yes — collected and reused in mixing',
}

const DEMO_REPORT = {
  executive: `Al-Noor RMX is running at 86% utilisation with a turnaround time of 54 minutes — 9 minutes above the regional 45-minute benchmark. Combined with a 3.8% rejection rate and slow dispatch response, the plant is leaving an estimated $38,000–$45,000/month in recoverable contribution margin on the table. The primary constraint is logistics throughput, compounded by quality losses and delayed dispatch. Operational improvements in turnaround time and order-to-dispatch alone would generate a 12–15% uplift in effective fleet capacity within 90 days.`,
  diagnosis: `**Logistics (Primary bottleneck):** 54-min average turnaround vs 45-min target creates a hidden capacity gap of ~2 deliveries/day. Each extra minute costs ~$520/month. Root causes are likely weighbridge queuing and washdown sequencing. Dispatch delay (~32 min avg vs 15-min target) compounds the effect — trucks are idle before they even start the cycle.\n\n**Quality:** 3.8% rejection rate represents $8,200/month in direct write-off cost. GCC best practice is below 2%. Calibration and mix consistency are the likely levers.\n\n**Production:** 18,500 m³/month against 21,500 m³ rated capacity = 86% utilisation, 6 points below the 92% target. This gap is largely downstream of the turnaround bottleneck — fixing logistics will recover most of it without additional investment.`,
  actions: `1. **Turnaround audit (Week 1–2):** Time-stamp every truck movement for one week. Identify where the 54 minutes goes — typically 8–12 min are recoverable at weighbridge + washdown.\n2. **Dispatch SOP (Week 1):** Implement a 15-min order-to-dispatch protocol. Batch orders by zone in the morning. Target: under 20 min within 30 days.\n3. **Mix calibration review (Week 2–3):** Pull last 90 days of reject codes. If >60% are slump failures, recalibrate admixture dosing. Target: below 2.5% by Week 8.\n4. **90-day tracking:** Log turnaround, reject rate, and dispatch time weekly. Break-even on these improvements requires <4 weeks. Full recovery of $38k/month gap is realistic by Week 10.`,
}

export default function DemoView() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>

      {/* Top bar */}
      <div style={{
        background: 'var(--green)', padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '44px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.15)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5DCAA5' }} />
          </div>
          <span style={{ color: '#fff', fontSize: '15px', fontWeight: '500' }}>Al-RMX</span>
          <span style={{
            fontSize: '11px', color: 'rgba(255,255,255,0.6)',
            background: 'rgba(255,255,255,0.12)', padding: '2px 8px',
            borderRadius: '4px', marginLeft: '4px',
          }}>
            DEMO
          </span>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginLeft: '8px' }}>
            Al-Noor RMX · Dubai · June 2025
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => router.push('/dashboard')} style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.7)',
            background: 'none', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            Go to platform
          </button>
          <button onClick={handleSignOut} style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.7)',
            background: 'none', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Demo notice banner */}
      <div style={{
        background: '#FEF3C7', borderBottom: '1px solid #FDE68A',
        padding: '8px 24px', fontSize: '12px', color: '#92400E',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span>👁️</span>
        <span>
          <strong>Demo mode</strong> — pre-loaded with a representative GCC ready-mix plant.
          All calculations are live. Changes are not saved.
        </span>
      </div>

      {/* Full assessment shell */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <AssessmentShell
          initialAnswers={DEMO_ANSWERS}
          phase="onsite"
          season="summer"
          country="UAE"
          plant="Al-Noor RMX"
          date="2025-06-15"
          assessmentId="demo"
          report={DEMO_REPORT}
          reportReleased={true}
          isAdmin={true}
          onSave={() => { /* no-op in demo */ }}
        />
      </div>
    </div>
  )
}
