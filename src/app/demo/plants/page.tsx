import Link from 'next/link'
import PlantOverviewView, { type PlantCardData } from '@/components/plants/PlantOverviewView'

// ─────────────────────────────────────────────────────────────────────────────
// Demo dataset — Al-Noor RMX Group, UAE
// 10 plants across Dubai, Abu Dhabi, Sharjah and northern emirates.
// All cards link to /demo (the live Al-Noor Dubai North assessment).
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_PLANTS: PlantCardData[] = [
  // ── 1. Main demo plant — on-site assessment, tracking active ──
  {
    id: 'dp-1',
    name: 'Al-Noor Dubai North',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo',
      phase: 'onsite',
      overall: 68,
      scores: { prod: 82, dispatch: 48, logistics: 71, fleet: 71, quality: 70 },
      bottleneck: 'Dispatch',
      ebitda_monthly: 63000,
      report_released: true,
      trackingWeek: 7,
    },
  },
  // ── 2. At risk — dispatch bottleneck, no tracking ──
  {
    id: 'dp-2',
    name: 'Al-Noor Dubai Industrial',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-2',
      phase: 'onsite',
      overall: 54,
      scores: { prod: 68, dispatch: 34, logistics: 52, fleet: 52, quality: 61 },
      bottleneck: 'Dispatch',
      ebitda_monthly: 89000,
      report_released: false,
      trackingWeek: null,
    },
  },
  // ── 3. Top performer — complete, tracking done ──
  {
    id: 'dp-3',
    name: 'Al-Noor Abu Dhabi',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-3',
      phase: 'complete',
      overall: 83,
      scores: { prod: 88, dispatch: 79, logistics: 85, fleet: 85, quality: 80 },
      bottleneck: null,
      ebitda_monthly: 12000,
      report_released: true,
      trackingWeek: 13,
    },
  },
  // ── 4. Amber — quality bottleneck, early tracking ──
  {
    id: 'dp-4',
    name: 'Al-Noor Sharjah',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-4',
      phase: 'onsite',
      overall: 61,
      scores: { prod: 74, dispatch: 65, logistics: 59, fleet: 59, quality: 47 },
      bottleneck: 'Quality',
      ebitda_monthly: 47000,
      report_released: false,
      trackingWeek: 3,
    },
  },
  // ── 5. Critical — fleet bottleneck, largest gap ──
  {
    id: 'dp-5',
    name: 'Al-Noor Ras Al Khaimah',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-5',
      phase: 'onsite',
      overall: 44,
      scores: { prod: 62, dispatch: 42, logistics: 29, fleet: 29, quality: 44 },
      bottleneck: 'Fleet',
      ebitda_monthly: 124000,
      report_released: false,
      trackingWeek: null,
    },
  },
  // ── 6. Good — near green, tracking near complete ──
  {
    id: 'dp-6',
    name: 'Al-Noor Dubai South',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-6',
      phase: 'complete',
      overall: 78,
      scores: { prod: 72, dispatch: 81, logistics: 83, fleet: 83, quality: 77 },
      bottleneck: 'Production',
      ebitda_monthly: 31000,
      report_released: true,
      trackingWeek: 11,
    },
  },
  // ── 7. Amber — quality bottleneck ──
  {
    id: 'dp-7',
    name: 'Al-Noor Fujairah',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-7',
      phase: 'onsite',
      overall: 66,
      scores: { prod: 77, dispatch: 71, logistics: 62, fleet: 62, quality: 54 },
      bottleneck: 'Quality',
      ebitda_monthly: 54000,
      report_released: false,
      trackingWeek: null,
    },
  },
  // ── 8. Best performer — all green, tracking complete ──
  {
    id: 'dp-8',
    name: 'Al-Noor Al Ain',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-8',
      phase: 'complete',
      overall: 88,
      scores: { prod: 91, dispatch: 86, logistics: 89, fleet: 89, quality: 86 },
      bottleneck: null,
      ebitda_monthly: 8000,
      report_released: true,
      trackingWeek: 13,
    },
  },
  // ── 9. At risk — fleet bottleneck ──
  {
    id: 'dp-9',
    name: 'Al-Noor Ajman',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-9',
      phase: 'onsite',
      overall: 57,
      scores: { prod: 70, dispatch: 59, logistics: 43, fleet: 43, quality: 55 },
      bottleneck: 'Fleet',
      ebitda_monthly: 78000,
      report_released: false,
      trackingWeek: null,
    },
  },
  // ── 10. Workshop phase — assessment in progress, no scores yet ──
  {
    id: 'dp-10',
    name: 'Al-Noor Umm Al Quwain',
    country: 'AE',
    assessmentHref: '/demo',
    assessment: {
      id: 'demo-10',
      phase: 'workshop',
      overall: null,
      scores: null,
      bottleneck: null,
      ebitda_monthly: null,
      report_released: false,
      trackingWeek: null,
    },
  },
]

export default function DemoPlantsPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>

      {/* Top bar */}
      <div style={{
        background: 'var(--green)', padding: '0 16px',
        height: '48px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5DCAA5' }} />
          </div>
          <span style={{ color: '#fff', fontSize: '15px', fontWeight: 500 }}>Al-RMX</span>
          <span style={{
            fontSize: '10px', fontWeight: 700, letterSpacing: '.5px',
            color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.12)',
            padding: '2px 7px', borderRadius: '4px',
          }}>
            DEMO
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            href="/demo"
            style={{
              fontSize: '12px', color: 'rgba(255,255,255,0.75)',
              background: 'none', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px', padding: '4px 10px',
              textDecoration: 'none', fontFamily: 'var(--font)',
            }}
          >
            View assessment →
          </Link>
        </div>
      </div>

      {/* Plant overview */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PlantOverviewView
          plants={DEMO_PLANTS}
          customerName="Al-Noor RMX Group"
          isDemo
        />
      </div>
    </div>
  )
}
