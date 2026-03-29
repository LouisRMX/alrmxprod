'use client'

import { useState, useRef, useEffect } from 'react'
import type { QuestionInfo } from '@/lib/questions'

interface InfoPanelProps {
  info: QuestionInfo
}

export default function InfoPanel({ info }: InfoPanelProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '20px', height: '20px', borderRadius: '50%',
          border: '1px solid var(--gray-300)', background: 'var(--white)',
          fontSize: '11px', fontWeight: 500, color: 'var(--gray-500)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        i
      </button>
      {open && (
        <div style={{
          background: '#F8FFFE',
          border: '1px solid #9FE1CB',
          borderRadius: '8px',
          padding: '10px 12px',
          marginTop: '8px',
          fontSize: '12px',
          color: 'var(--gray-700)',
          lineHeight: 1.6,
          position: 'absolute',
          right: 0,
          top: '100%',
          zIndex: 100,
          width: '320px',
          boxShadow: '0 4px 16px rgba(0,0,0,.1)',
        }}>
          <div style={{ marginBottom: '6px' }}>
            <b style={{ fontWeight: 500, color: 'var(--gray-900)' }}>What:</b> {info.what}
          </div>
          <div style={{ marginBottom: '6px' }}>
            <b style={{ fontWeight: 500, color: 'var(--gray-900)' }}>Why it matters:</b> {info.why}
          </div>
          <div>
            <b style={{ fontWeight: 500, color: 'var(--gray-900)' }}>Calculation:</b> {info.calc}
          </div>
        </div>
      )}
    </div>
  )
}
