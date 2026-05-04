'use client'

/**
 * Full-screen language chooser shown the first time a user opens the Field
 * Log on a device. Three big buttons: English / عربي / اردو. Choice persists
 * to localStorage via LogLocaleContext so the modal doesn't reappear.
 *
 * Why prominent: in a GCC ready-mix plant the dispatcher's first decision
 * is what language to work in. Hiding the choice behind a small header
 * toggle makes an Arabic- or Urdu-first user wade through English UI
 * before discovering they can switch. Ask once, up front, remember forever.
 */

import { useLogT } from '@/lib/i18n/LogLocaleContext'

export default function LocaleFirstVisitModal() {
  const { setLocale, hydrated, hasChosenLocale } = useLogT()

  // Only show once hydrated from localStorage AND the user hasn't chosen yet.
  if (!hydrated || hasChosenLocale) return null

  const btnStyle: React.CSSProperties = {
    flex: 1, minHeight: '96px',
    border: '2px solid #0F6E56', borderRadius: '14px',
    background: '#fff', color: '#0F6E56',
    fontSize: '22px', fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '10px',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose language"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(20,20,20,0.55)',
        zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: '18px',
        padding: 'clamp(20px, 5vw, 28px)',
        maxWidth: '440px', width: '100%',
        boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column', gap: '18px',
      }}>
        <div style={{
          textAlign: 'center', fontSize: '14px', color: '#888',
          textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600,
        }}>
          Al-RMX · Field Log
        </div>
        <div style={{
          textAlign: 'center',
          fontSize: '15px', color: '#333', lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            Choose a language
          </div>
          <div style={{ fontFamily: '"DM Sans", "Segoe UI Arabic", sans-serif' }} lang="ar" dir="rtl">
            اختر اللغة
          </div>
          <div style={{ fontFamily: '"Noto Nastaliq Urdu", "DM Sans", "Segoe UI Arabic", sans-serif', marginTop: '2px' }} lang="ur" dir="rtl">
            زبان منتخب کریں
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
          <button
            type="button"
            onClick={() => setLocale('en')}
            style={btnStyle}
          >
            <span style={{ fontSize: '28px' }}>🇬🇧</span>
            <span>English</span>
          </button>
          <button
            type="button"
            onClick={() => setLocale('ar')}
            style={{
              ...btnStyle,
              fontFamily: '"DM Sans", "Segoe UI Arabic", sans-serif',
            }}
            lang="ar"
            dir="rtl"
          >
            <span style={{ fontSize: '28px' }}>🇸🇦</span>
            <span>عربي</span>
          </button>
          <button
            type="button"
            onClick={() => setLocale('ur')}
            style={{
              ...btnStyle,
              fontFamily: '"Noto Nastaliq Urdu", "DM Sans", "Segoe UI Arabic", sans-serif',
            }}
            lang="ur"
            dir="rtl"
          >
            <span style={{ fontSize: '28px' }}>🇵🇰</span>
            <span>اردو</span>
          </button>
        </div>
        <div style={{
          textAlign: 'center',
          fontSize: '11px', color: '#aaa', lineHeight: 1.4,
        }}>
          You can change this later from the header toggle.
          <br />
          <span dir="rtl" lang="ar" style={{ fontFamily: '"DM Sans", "Segoe UI Arabic", sans-serif' }}>
            يمكنك تغييره لاحقاً من شريط العنوان.
          </span>
          <br />
          <span dir="rtl" lang="ur" style={{ fontFamily: '"Noto Nastaliq Urdu", "DM Sans", "Segoe UI Arabic", sans-serif' }}>
            آپ یہ ہیڈر سے بعد میں بھی بدل سکتے ہیں۔
          </span>
        </div>
      </div>
    </div>
  )
}
