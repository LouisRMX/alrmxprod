'use client'

/**
 * Client shell for the unauthenticated field-capture route.
 *
 * Wraps LiveTripTimer with a header that shows context (plant name)
 * and a language toggle so the helper can switch between English and
 * Arabic. Locale persists in localStorage via LogLocaleContext.
 */
import LiveTripTimer from '@/components/fieldlog/live-timer/LiveTripTimer'
import LocaleToggle from '@/components/fieldlog/LocaleToggle'
import LocaleFirstVisitModal from '@/components/fieldlog/LocaleFirstVisitModal'
import { LogLocaleProvider, useLogT } from '@/lib/i18n/LogLocaleContext'

interface Props {
  token: string
  assessmentId: string
  plantId: string
  plantName: string
  /** Helper name baked into the token by the admin who minted it.
   *  Pre-fills (and locks) the measurer in the live timer so the
   *  helper cannot pick a different name. NULL for legacy tokens
   *  minted before the field existed. */
  helperName: string | null
}

export default function FieldCaptureClient(props: Props) {
  return (
    <LogLocaleProvider>
      <LocaleFirstVisitModal />
      <FieldCaptureInner {...props} />
    </LogLocaleProvider>
  )
}

function FieldCaptureInner({ token, assessmentId, plantId, plantName, helperName }: Props) {
  const { isRTL } = useLogT()

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        background: '#fafafa',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <header style={{
        background: '#0F6E56', color: '#fff',
        padding: '12px 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '12px', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', opacity: 0.8 }}>
            Al-RMX · Field Capture
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginTop: '2px' }}>
            {plantName}
          </div>
          {helperName && (
            <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '4px', opacity: 0.85 }}>
              {helperName}
            </div>
          )}
        </div>
        <LocaleToggle />
      </header>

      <main style={{ flex: 1, overflow: 'auto' }}>
        <LiveTripTimer
          assessmentId={assessmentId}
          plantId={plantId}
          syncMode="token"
          token={token}
          helperName={helperName}
        />
      </main>
    </div>
  )
}
