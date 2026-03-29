'use client'

import { useState } from 'react'
import type { Issue } from '@/lib/issues'

function fmt(n: number): string {
  return '$' + n.toLocaleString()
}

interface FindingCardProps {
  issue: Issue
  index: number
  /** True if this is a bottleneck finding whose loss overlaps with a larger bottleneck finding */
  isOverlap?: boolean
}

export default function FindingCard({ issue, index, isOverlap = false }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isRed = issue.sev === 'red'

  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', marginBottom: '8px', overflow: 'hidden',
      borderLeft: `3px solid ${isRed ? 'var(--red)' : '#D68910'}`,
    }}>
      <div
        style={{ padding: '12px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{
            fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--gray-300)',
            marginTop: '2px', minWidth: '20px',
          }}>
            #{index + 1}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--gray-900)', lineHeight: 1.4 }}>
              {issue.t}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '3px', fontWeight: 500 }}>
              {issue.action}
            </div>
          </div>
          {issue.loss > 0 && (
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <div style={{
                fontSize: '14px', fontWeight: 600, fontFamily: 'var(--mono)',
                color: isOverlap ? 'var(--gray-400)' : (isRed ? 'var(--red)' : '#B7950B'),
              }}>
                {isOverlap ? '~' : ''}{fmt(issue.loss)}/mo
              </div>
              {isOverlap && (
                <div style={{ fontSize: '9px', color: 'var(--gray-400)', marginTop: '1px' }}>
                  Overlap — included in bottleneck
                </div>
              )}
            </div>
          )}
          <span style={{ fontSize: '12px', color: 'var(--gray-300)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
            ▾
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 12px 46px', borderTop: '1px solid var(--gray-50)' }}>
          <div style={{ fontSize: '12px', color: 'var(--gray-700)', lineHeight: 1.6, marginTop: '8px' }}>
            {issue.rec}
          </div>
          {issue.formula && (
            <div style={{
              fontSize: '11px', color: 'var(--gray-500)', marginTop: '8px',
              padding: '6px 10px', background: 'var(--gray-50)', borderRadius: '6px',
              fontFamily: 'var(--mono)', lineHeight: 1.5,
            }}>
              {issue.formula}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
