'use client'

/**
 * LogLocaleProvider + useLogT hook.
 *
 * Scoped to the Log tab: provides locale state (en | ar | ur) plus a
 * translator function `t(key, params?)`. Persists choice to
 * localStorage so observer's language is remembered across sessions.
 *
 * The RTL direction is derived from locale (Arabic and Urdu are RTL).
 * Apply via `dir={isRTL ? 'rtl' : 'ltr'}` on a root element.
 *
 * For non-English locales, the <Bilingual> component automatically
 * stacks the English original under the localised text so admins and
 * helpers can refer to the same labels across languages without
 * needing a toggle.
 *
 * Why not next-intl or react-i18next: the Log tab is the ONLY part of
 * the platform that gets translated, so a 5kB custom hook beats a
 * 20-60kB library. Easy to extend to more locales by adding entries
 * to CATALOG in log-catalog.ts.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { CATALOG, type LogLocale, type LogStringKey } from './log-catalog'

const STORAGE_KEY = 'alrmx-log-locale'

interface LogLocaleCtx {
  locale: LogLocale
  setLocale: (l: LogLocale) => void
  t: (key: LogStringKey, params?: Record<string, string | number>) => string
  isRTL: boolean
  /** True once a stored locale has been read (client-only). Consumers can
   *  gate a first-visit language modal on !hasChosenLocale && hydrated. */
  hydrated: boolean
  hasChosenLocale: boolean
}

const LogLocaleContext = createContext<LogLocaleCtx | null>(null)

export function LogLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LogLocale>('en')
  const [hydrated, setHydrated] = useState(false)
  const [hasChosenLocale, setHasChosenLocale] = useState(false)

  // Read persisted state on mount. SSR-safe: defaults to 'en', then
  // flips on client if a stored value differs. hasChosenLocale lets
  // consumers gate a first-visit language chooser modal.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'en' || stored === 'ar' || stored === 'ur') {
        setLocaleState(stored)
        setHasChosenLocale(true)
      }
    } catch {
      // Private browsing or disabled storage, ignore
    }
    setHydrated(true)
  }, [])

  const setLocale = useCallback((l: LogLocale) => {
    setLocaleState(l)
    setHasChosenLocale(true)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, l)
      } catch { /* ignore */ }
    }
  }, [])

  const t = useCallback((key: LogStringKey, params?: Record<string, string | number>): string => {
    const raw = CATALOG[locale][key] ?? CATALOG.en[key] ?? key
    if (!params) return raw
    return Object.entries(params).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      raw,
    )
  }, [locale])

  const value = useMemo<LogLocaleCtx>(() => ({
    locale,
    setLocale,
    t,
    // Both Arabic and Urdu use the Perso-Arabic script and read RTL.
    isRTL: locale === 'ar' || locale === 'ur',
    hydrated,
    hasChosenLocale,
  }), [locale, setLocale, t, hydrated, hasChosenLocale])

  return (
    <LogLocaleContext.Provider value={value}>
      {children}
    </LogLocaleContext.Provider>
  )
}

export function useLogT(): LogLocaleCtx {
  const ctx = useContext(LogLocaleContext)
  if (!ctx) {
    // Outside the provider (e.g., server context): return a stable no-op
    // implementation that falls back to English. Avoids runtime crash
    // while still being type-safe.
    return {
      locale: 'en',
      setLocale: () => {},
      t: (key, params) => {
        const raw = CATALOG.en[key] ?? key
        if (!params) return raw
        return Object.entries(params).reduce(
          (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
          raw,
        )
      },
      isRTL: false,
      hydrated: false,
      hasChosenLocale: false,
    }
  }
  return ctx
}
