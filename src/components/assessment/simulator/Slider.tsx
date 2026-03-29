'use client'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  baselineValue: number
  unit: string
  onChange: (value: number) => void
}

export default function Slider({ label, value, min, max, step, baselineValue, unit, onChange }: SliderProps) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const baselinePct = max > min ? ((baselineValue - min) / (max - min)) * 100 : 0
  const delta = baselineValue > 0 ? Math.round((value - baselineValue) / baselineValue * 100) : 0

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--gray-900)' }}>{label}</span>
        <span style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
          {value} {unit}
          {delta !== 0 && (
            <span style={{ fontSize: '11px', fontWeight: 400, color: delta > 0 ? '#27ae60' : 'var(--red)', marginLeft: '6px' }}>
              {delta > 0 ? '+' : ''}{delta}%
            </span>
          )}
        </span>
      </div>

      <div style={{ position: 'relative', height: '24px' }}>
        {/* Track */}
        <div style={{
          position: 'absolute', top: '10px', left: 0, right: 0, height: '4px',
          background: 'var(--gray-100)', borderRadius: '2px',
        }}>
          <div style={{
            width: `${pct}%`, height: '4px', background: 'var(--green-mid)', borderRadius: '2px',
            transition: 'width .1s',
          }} />
        </div>

        {/* Baseline marker */}
        <div style={{
          position: 'absolute', top: '6px', left: `${baselinePct}%`,
          width: '2px', height: '12px', background: 'var(--gray-300)',
          transform: 'translateX(-1px)',
        }} />

        {/* Range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '24px',
            opacity: 0, cursor: 'pointer', margin: 0,
          }}
        />

        {/* Thumb indicator */}
        <div style={{
          position: 'absolute', top: '4px', left: `${pct}%`,
          width: '16px', height: '16px', borderRadius: '50%',
          background: 'var(--green)', border: '2px solid white',
          boxShadow: '0 1px 4px rgba(0,0,0,.2)',
          transform: 'translateX(-8px)', pointerEvents: 'none',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--gray-300)', marginTop: '2px' }}>
        <span>{min} {unit}</span>
        <span style={{ color: 'var(--gray-500)', fontSize: '9px' }}>baseline: {baselineValue}</span>
        <span>{max} {unit}</span>
      </div>
    </div>
  )
}
