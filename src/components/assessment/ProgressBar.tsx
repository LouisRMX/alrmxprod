'use client'

interface ProgressBarProps {
  answered: number
  total: number
}

export default function ProgressBar({ answered, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '4px', background: 'var(--gray-100)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`,
          height: '4px',
          background: 'var(--green-mid)',
          borderRadius: '2px',
          transition: 'width .3s',
        }} />
      </div>
      <span style={{ fontSize: '11px', color: 'var(--gray-500)', fontFamily: 'var(--mono)', minWidth: '40px' }}>
        {answered} / {total}
      </span>
    </div>
  )
}
