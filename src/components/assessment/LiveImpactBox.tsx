'use client'

interface LiveImpactBoxProps {
  lines: string[] | null
}

export default function LiveImpactBox({ lines }: LiveImpactBoxProps) {
  if (!lines || lines.length === 0) return null

  return (
    <div style={{
      background: 'var(--green-light)',
      border: '1px solid #9FE1CB',
      borderRadius: '8px',
      padding: '8px 12px',
      marginTop: '8px',
    }}>
      <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.4px' }}>
        Live impact
      </div>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--green)', marginTop: '2px', lineHeight: 1.5 }}>
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}
