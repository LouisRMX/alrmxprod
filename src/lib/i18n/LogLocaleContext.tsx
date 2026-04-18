'use client'

/**
 * LogLocaleProvider + useLogT hook.
 *
 * Scoped to the Log tab: provides locale state (en | ar) plus a
 * translator function `t(key, params?)`. Persists choice to
 * localStorage so observer's language is remembered across sessions.
 *
 * The RTL direction is derived from locale and should be applied by
 * consumers as `dir={isRTL ? 'rtl' : 'ltr'}` on a root element.
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
}

const LogLocaleContext = createContext<LogLocaleCtx | null>(null)

export function LogLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LogLocale>('en')

  // Read persisted locale on mount. SSR-safe: defaults to 'en' then
  // flips on client if stored value differs.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'en' || stored === 'ar') {
        setLocaleState(stored)
      }
    } catch {
      // Private browsing or disabled storage, ignore
    }
  }, [])

  const setLocale = useCallback((l: LogLocale) => {
    setLocaleState(l)
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
    isRTL: locale === 'ar',
  }), [locale, setLocale, t])

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
    }
  }
  return ctx
}
