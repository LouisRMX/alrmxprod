'use client'

import { validateNumeric } from '@/lib/questions'

interface NumericInputProps {
  id: string
  value: string | number | undefined
  unit?: string
  onChange: (id: string, value: string) => void
  baselineValue?: string | number
}

export default function NumericInput({ id, value, unit, onChange, baselineValue }: NumericInputProps) {
  const raw = value !== undefined && value !== '' ? String(value) : ''
  const numVal = raw !== '' ? Number(raw) : null
  const warning = numVal !== null && !isNaN(numVal) ? validateNumeric(id, numVal) : null

  const baseNum = baselineValue !== undefined && baselineValue !== '' ? Number(baselineValue) : null
  const delta = numVal !== null && baseNum !== null && !isNaN(numVal) && !isNaN(baseNum) && baseNum !== 0
    ? Math.round((numVal - baseNum) / baseNum * 100)
    : null

  return (
    <div>
      <input
        type="number"
        inputMode="decimal"
        placeholder="-"
        value={raw}
        onChange={e => onChange(id, e.target.value)}
        style={{
          padding: '8px 11px',
          border: '1px solid var(--gray-300)',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: 500,
          fontFamily: 'var(--font)',
          background: 'var(--gray-50)',
          color: 'var(--gray-900)',
          width: '160px',
          outline: 'none',
          transition: 'border-color .15s',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--green-mid)'; e.currentTarget.style.background = 'var(--white)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--gray-300)'; e.currentTarget.style.background = 'var(--gray-50)' }}
      />
      {unit && (
        <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px' }}>
          {unit}
          {delta !== null && (
            <span style={{ marginLeft: '8px', color: delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--gray-500)' }}>
              Last visit: {baseNum} ({delta > 0 ? '+' : ''}{delta}%)
            </span>
          )}
        </div>
      )}
      {warning && (
        <div style={{ fontSize: '11px', color: '#D68910', marginTop: '4px', padding: '4px 8px', background: '#FFF8E1', borderRadius: '4px' }}>
          ⚠ {warning}
        </div>
      )}
    </div>
  )
}
