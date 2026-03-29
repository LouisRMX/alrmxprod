'use client'

import { useState } from 'react'

interface HowToPanelProps {
  howto: string
}

export default function HowToPanel({ howto }: HowToPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', padding: 0,
          fontSize: '11px', color: 'var(--green)', cursor: 'pointer',
          fontFamily: 'var(--font)', fontWeight: 400,
        }}
      >
        How to get this number {open ? '▴' : '▾'}
      </button>
      {open && (
        <div style={{
          fontSize: '11px', color: 'var(--gray-500)', marginTop: '4px',
          lineHeight: 1.5, padding: '6px 8px', background: 'var(--gray-50)',
          borderRadius: '6px',
        }}>
          {howto}
        </div>
      )}
    </div>
  )
}
