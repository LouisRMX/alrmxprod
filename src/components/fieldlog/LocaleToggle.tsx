'use client'

/**
 * Small EN / عربي toggle for the Log tab header.
 *
 * Appears next to the date picker and other header actions. Persists
 * selection via LogLocaleContext + localStorage so observers who
 * open the /fc/[token] URL get their last-chosen language.
 */

import { useLogT } from '@/lib/i18n/LogLocaleContext'

export default function LocaleToggle() {
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
        style={{ ...btnStyle(locale === 'ar'), border: 'none', borderRadius: 0, fontFamily: '"DM Sans", "Segoe UI Arabic", sans-serif' }}
      >
        عربي
      </button>
    </div>
  )
}
