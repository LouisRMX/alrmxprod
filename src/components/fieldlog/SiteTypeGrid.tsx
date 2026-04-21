'use client'

/**
 * Icon-based Site Type picker, optimised for low-literacy GCC dispatchers.
 *
 * Renders the 10 site types as a responsive grid of tappable tiles, each
 * showing a large pictogram plus the translated label. Replaces the native
 * <select> dropdown which forced users to read through 10 long text options
 * in a language that may not be their first.
 *
 * Tiles are 44px-tall minimum for tap comfort. Grid collapses to 2 columns
 * on narrow viewports (iPhone portrait) and 5 on desktop.
 */

import { SITE_TYPE_ORDER, type SiteType } from '@/lib/fieldlog/offline-trip-queue'
import { useLogT } from '@/lib/i18n/LogLocaleContext'
import type { LogStringKey } from '@/lib/i18n/log-catalog'

/** Pictogram for each site type. Chosen for cross-cultural recognisability
 *  — GCC dispatchers shouldn't need to read a long English or Arabic phrase
 *  to pick the right one. */
const SITE_TYPE_ICON: Record<SiteType, string> = {
  ground_pour: '🏗',
  road_pavement: '🛣',
  industrial: '🏭',
  high_rise: '🏢',
  bridge_deck: '🌉',
  tunnel: '🚇',
  marine: '⚓',
  piling: '⛏',
  precast: '🧱',
  unknown: '❓',
}

interface Props {
  value?: SiteType
  fromCache?: boolean
  onChange: (v: SiteType) => void
  /** Compact variant used inside the live trip card where vertical space is tight. */
  compact?: boolean
}

export default function SiteTypeGrid({ value, fromCache, onChange, compact }: Props) {
  const { t } = useLogT()
  const showAutoHint = fromCache && value !== undefined

  return (
    <div>
      {showAutoHint && (
        <div style={{
          display: 'inline-block',
          padding: '2px 8px', marginBottom: '8px',
          background: '#FFF4D6', border: '1px solid #F1D79A',
          color: '#7a5a00', borderRadius: '4px',
          fontSize: '10px', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.3px',
        }}>
          ⟳ {t('site_type.auto_badge')}
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: compact ? '6px' : '8px',
      }}>
        {SITE_TYPE_ORDER.map(opt => {
          const active = value === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              aria-pressed={active}
              style={{
                minHeight: compact ? '72px' : '84px',
                padding: '8px 6px',
                background: active ? '#E1F5EE' : '#fff',
                color: active ? '#0F6E56' : '#333',
                border: `1.5px solid ${active ? '#0F6E56' : '#e5e5e5'}`,
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '4px',
                fontFamily: 'inherit',
              }}
            >
              <span style={{
                fontSize: compact ? '22px' : '26px',
                lineHeight: 1,
                filter: active ? 'none' : 'grayscale(.3)',
              }}>{SITE_TYPE_ICON[opt]}</span>
              <span style={{
                fontSize: compact ? '10px' : '11px',
                fontWeight: 600,
                textAlign: 'center',
                lineHeight: 1.2,
              }}>{t(`site_type.${opt}` as LogStringKey)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
