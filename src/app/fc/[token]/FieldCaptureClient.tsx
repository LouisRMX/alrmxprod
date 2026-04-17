'use client'

/**
 * Client shell for the unauthenticated field-capture route.
 *
 * Wraps LiveTripTimer with a header that shows context (plant name) and
 * nothing else. No back links, no menus, no navigation out of this view.
 */
import LiveTripTimer from '@/components/fieldlog/live-timer/LiveTripTimer'

interface Props {
  token: string
  assessmentId: string
  plantId: string
  plantName: string
}

export default function FieldCaptureClient({ token, assessmentId, plantId, plantName }: Props) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: '#fafafa',
      paddingTop: 'env(safe-area-inset-top)',
    }}>
      <header style={{
        background: '#0F6E56', color: '#fff',
        padding: '12px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', opacity: 0.8 }}>
            Al-RMX · Field Capture
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginTop: '2px' }}>
            {plantName}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto' }}>
        <LiveTripTimer
          assessmentId={assessmentId}
          plantId={plantId}
          syncMode="token"
          token={token}
        />
      </main>
    </div>
  )
}
