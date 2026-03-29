'use client'

interface OptionsInputProps {
  id: string
  options: string[]
  value: string | undefined
  onChange: (id: string, value: string) => void
  baselineValue?: string
}

export default function OptionsInput({ id, options, value, onChange, baselineValue }: OptionsInputProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
      {options.map(opt => {
        const selected = value === opt
        const isBaseline = baselineValue === opt && !selected
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(id, opt)}
            style={{
              padding: '6px 14px',
              border: `1px ${isBaseline ? 'dashed' : 'solid'} ${selected ? 'var(--green-mid)' : isBaseline ? 'var(--green-mid)' : 'var(--gray-300)'}`,
              borderRadius: '20px',
              fontSize: '12px',
              cursor: 'pointer',
              background: selected ? 'var(--green-light)' : 'var(--white)',
              color: selected ? 'var(--green)' : 'var(--gray-700)',
              fontFamily: 'var(--font)',
              fontWeight: selected ? 500 : 400,
              transition: 'all .12s',
            }}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
