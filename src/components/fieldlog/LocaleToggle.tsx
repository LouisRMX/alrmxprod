'use client'

/**
 * Small EN / عربي / اردو toggle for the Log tab header.
 *
 * Appears next to the date picker and other header actions. Persists
 * selection via LogLocaleContext + localStorage so observers who
 * open the /fc/[token] URL get their last-chosen language.
 *
 * No bilingual toggle: the <Bilingual> component automatically stacks
 * the English original under the localised text whenever locale !== 'en',
 * so admins and helpers can refer to either label without an extra tap.
 * The `adminMode` prop is kept for API compatibility but unused.
 */

import { useLogT } from '@/lib/i18n/LogLocaleContext'

interface Props {
  adminMode?: boolean
}

export default function LocaleToggle({ adminMode: _adminMode }: Props) {
  const { locale, setLocale } = useLogT()

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px',
    background: active ? '#0F6E56' : '#fff',
    color: active ? '#fff' : '#555',
    border: '1px solid #d1d5db',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: '32px',
  })

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ display: 'inline-flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #d1d5db' }}>
        <button
          type="button"
          onClick={() => setLocale('en')}
          aria-pressed={locale === 'en'}
          style={{ ...btnStyle(locale === 'en'), border: 'none', borderRight: '1px solid #d1d5db', borderRadius: 0 }}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLocale('ar')}
          aria-pressed={locale === 'ar'}
          style={{ ...btnStyle(locale === 'ar'), border: 'none', borderRight: '1px solid #d1d5db', borderRadius: 0, fontFamily: '"DM Sans", "Segoe UI Arabic", sans-serif' }}
        >
          عربي
        </button>
        <button
          type="button"
          onClick={() => setLocale('ur')}
          aria-pressed={locale === 'ur'}
          style={{ ...btnStyle(locale === 'ur'), border: 'none', borderRadius: 0, fontFamily: '"Noto Nastaliq Urdu", "DM Sans", "Segoe UI Arabic", sans-serif' }}
        >
          اردو
        </button>
      </div>
    </div>
  )
}
