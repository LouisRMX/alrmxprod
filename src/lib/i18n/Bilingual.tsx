'use client'

/**
 * <Bilingual k="tab.live" /> — renders a translated label.
 *
 * In English locale: returns just the English string.
 * In any other locale (Arabic, Urdu, ...): stacks the localised value
 * with the English original underneath so cross-language conversation
 * is always possible. The admin and the helper see the same screen and
 * can refer to either text without enabling a separate toggle.
 *
 * Use `inline` for buttons or tight spaces where stacking looks wrong:
 *   <Bilingual k="stage.next.pouring" inline />
 * which renders "Localised / English" on one line instead of two rows.
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
  const { t, locale } = useLogT()
  const primary = t(k, params)

  // English locale: just the primary, no overlay.
  // Any other locale: always show the English original underneath so
  // admins and helpers can talk across languages without toggling a
  // setting. This used to be gated behind a "+EN" admin toggle; the
  // dual display now ships by default for every non-English locale.
  if (locale === 'en') {
    return <>{primary}</>
  }

  const english = interpolate(CATALOG.en[k] ?? k, params)
  // When the localised value is identical to the English (e.g. EN/AR
  // labels intentionally kept the same, or a missing translation that
  // fell through the t() fallback) skip the overlay so the same text
  // does not appear twice.
  if (primary === english) {
    return <>{primary}</>
  }

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
