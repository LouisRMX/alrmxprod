'use client'

import { useRef, useCallback } from 'react'

interface ObservationInputProps {
  id: string
  value: string | undefined
  onChange: (id: string, value: string) => void
  baselineValue?: string
}

export default function ObservationInput({ id, value, onChange, baselineValue }: ObservationInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const autoResize = useCallback(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [])

  return (
    <div>
      <textarea
        ref={ref}
        placeholder="Write their exact words…"
        value={value || ''}
        onChange={e => { onChange(id, e.target.value); autoResize() }}
        style={{
          width: '100%',
          padding: '9px 11px',
          border: '1px solid var(--gray-300)',
          borderRadius: '8px',
          fontSize: '13px',
          fontFamily: 'var(--font)',
          color: 'var(--gray-900)',
          background: 'var(--gray-50)',
          minHeight: '60px',
          resize: 'none',
          lineHeight: 1.5,
          outline: 'none',
          transition: 'border-color .15s',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--green-mid)'; e.currentTarget.style.background = 'var(--white)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--gray-300)'; e.currentTarget.style.background = 'var(--gray-50)' }}
      />
      {baselineValue && baselineValue !== value && (
        <div style={{ fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px', fontStyle: 'italic' }}>
          Last visit: {baselineValue.length > 80 ? baselineValue.slice(0, 80) + '…' : baselineValue}
        </div>
      )}
    </div>
  )
}
