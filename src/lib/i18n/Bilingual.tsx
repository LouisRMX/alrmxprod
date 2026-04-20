'use client'

/**
 * <Bilingual k="tab.live" /> — renders a translated label.
 *
 * Normally behaves identically to `t(k)`: returns the current locale's
 * string. When `bilingualMode=true` AND `locale='ar'`, stacks the Arabic
 * value with a small English subtitle so the admin can train a helper
 * while both see the same screen. Controlled by the admin-only toggle
 * exposed in LocaleToggle.
 *
 * Use `inline` for buttons or tight spaces where stacking looks wrong:
 *   <Bilingual k="stage.next.pouring" inline />
 * which renders "AR / EN" on one line instead of two rows.
 */

import { CATALOG, type LogStringKey } from './log-catalog'
import { useLogT } from './LogLocaleContext'

interface Props {
  k: LogStringKey
  params?: Record<string, string | number>
  /** Render AR + EN inline on one line (for buttons). Default stacks. */
  inline?: boolean
}

function interpolate(raw: string, params?: Record<string, string | number>): string {
  if (!params) return raw
  return Object.entries(params).reduce(
    (acc, [p, v]) => acc.replace(new RegExp(`\\{${p}\\}`, 'g'), String(v)),
    raw,
  )
}

export default function Bilingual({ k, params, inline }: Props) {
  const { t, locale, bilingualMode } = useLogT()
  const primary = t(k, params)

  // Only overlay English when admin has explicitly asked for it AND we
  // are in Arabic. English-only users see nothing extra; Arabic helpers
  // on /fc/[token] never get this toggle so they also see nothing extra.
  if (!bilingualMode || locale !== 'ar') {
    return <>{primary}</>
  }

  const english = interpolate(CATALOG.en[k] ?? k, params)

  if (inline) {
    return (
      <span>
        {primary}
        <span style={{ color: '#888', fontWeight: 400, marginInlineStart: '6px', fontSize: '0.82em' }}>
          / {english}
        </span>
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
      <span>{primary}</span>
      <span style={{ color: '#888', fontWeight: 400, fontSize: '0.72em', marginTop: '1px' }}>
        {english}
      </span>
    </span>
  )
}
