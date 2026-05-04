'use client'

/**
 * Small EN / عربي / اردو toggle for the Log tab header.
 *
 * Appears next to the date picker and other header actions. Persists
 * selection via LogLocaleContext + localStorage so observers who
 * open the /fc/[token] URL get their last-chosen language.
 *
 * When `adminMode` is true AND the current locale is Arabic, a
 * secondary "+EN" toggle appears that flips on bilingualMode. This is
 * only shown to admins (FieldLogView passes adminMode={isAdmin}); the
 * unauthenticated /fc/[token] route omits the prop so helpers never
 * see it. Bilingual mode is intentionally Arabic-only — Urdu helpers
 * who need an English crutch can switch to EN directly.
 */

import { useLogT } from '@/lib/i18n/LogLocaleContext'

interface Props {
  adminMode?: boolean
}

export default function LocaleToggle({ adminMode }: Props) {
  const { locale, setLocale, bilingualMode, setBilingualMode } = useLogT()

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

  const showBilingualToggle = adminMode && locale === 'ar'

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
      {showBilingualToggle && (
        <button
          type="button"
          onClick={() => setBilingualMode(!bilingualMode)}
          aria-pressed={bilingualMode}
          title="Show English labels next to Arabic (admin-only)"
          style={{
            padding: '5px 9px',
            background: bilingualMode ? '#E1F5EE' : '#fff',
            color: bilingualMode ? '#0F6E56' : '#888',
            border: `1px solid ${bilingualMode ? '#0F6E56' : '#d1d5db'}`,
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            minHeight: '32px',
            letterSpacing: '.2px',
          }}
        >
          + EN
        </button>
      )}
    </div>
  )
}
