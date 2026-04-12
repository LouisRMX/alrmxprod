'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PriorityMatrix, PriorityMatrixRow, Quadrant } from '@/lib/priority-matrix'

interface PriorityMatrixViewProps {
  matrix: PriorityMatrix
  assessmentId: string
  isAdmin?: boolean
}

const QUADRANT_CONFIG: Record<Quadrant, { label: string; bg: string; border: string; color: string; description: string }> = {
  DO_FIRST:       { label: 'Do First',        bg: '#e8f5ee', border: '#0F6E56', color: '#0F6E56', description: 'High impact, low complexity' },
  PLAN_CAREFULLY: { label: 'Plan Carefully',   bg: '#fff8e1', border: '#b8860b', color: '#b8860b', description: 'High impact, high complexity' },
  QUICK_WIN:      { label: 'Quick Wins',       bg: '#f0f4ff', border: '#4a6fa5', color: '#4a6fa5', description: 'Lower impact, low complexity' },
  DONT_DO:        { label: 'Not Now',          bg: '#f5f5f5', border: '#999',    color: '#888',    description: 'Lower impact, high complexity' },
}

const QUADRANTS: Quadrant[] = ['DO_FIRST', 'PLAN_CAREFULLY', 'QUICK_WIN', 'DONT_DO']

function fmtK(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`
}

export default function PriorityMatrixView({ matrix, assessmentId, isAdmin }: PriorityMatrixViewProps) {
  const [rows, setRows] = useState<PriorityMatrixRow[]>(matrix.rows)
  const [saving, setSaving] = useState<string | null>(null)
  const [editingReason, setEditingReason] = useState<string | null>(null)
  const [reasonText, setReasonText] = useState('')

  // Load overrides on mount
  useEffect(() => {
    if (assessmentId === 'demo') return
    fetch(`/api/priority-overrides?assessmentId=${assessmentId}`)
      .then(r => r.json())
      .then(({ overrides }) => {
        if (!overrides?.length) return
        setRows(prev => prev.map(row => {
          const override = overrides.find((o: { issue_title: string }) => o.issue_title === row.issue_title)
          if (!override) return row
          return {
            ...row,
            quadrant: override.override_quadrant as Quadrant,
            quadrant_source: 'consultant' as const,
            override_reason: override.override_reason,
          }
        }))
      })
      .catch(() => {})
  }, [assessmentId])

  const handleQuadrantChange = useCallback(async (issueTitle: string, originalQuadrant: Quadrant, newQuadrant: Quadrant) => {
    // Update locally
    setRows(prev => prev.map(r =>
      r.issue_title === issueTitle
        ? { ...r, quadrant: newQuadrant, quadrant_source: 'consultant' as const }
        : r
    ))
    setEditingReason(issueTitle)
    setReasonText('')

    if (assessmentId === 'demo') return

    setSaving(issueTitle)
    await fetch('/api/priority-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentId,
        issueTitle,
        originalQuadrant,
        overrideQuadrant: newQuadrant,
        overrideReason: null,
      }),
    })
    setSaving(null)
  }, [assessmentId])

  const handleSaveReason = useCallback(async (issueTitle: string) => {
    setRows(prev => prev.map(r =>
      r.issue_title === issueTitle ? { ...r, override_reason: reasonText } : r
    ))
    setEditingReason(null)

    if (assessmentId === 'demo') return

    const row = rows.find(r => r.issue_title === issueTitle)
    if (!row) return
    await fetch('/api/priority-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentId,
        issueTitle,
        originalQuadrant: row.quadrant,
        overrideQuadrant: row.quadrant,
        overrideReason: reasonText,
      }),
    })
  }, [assessmentId, reasonText, rows])

  const quadrantRows = (q: Quadrant) => rows.filter(r => r.quadrant === q)

  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '12px' }}>
        Priority Matrix
      </div>

      {/* 2x2 Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
        {QUADRANTS.map(q => {
          const cfg = QUADRANT_CONFIG[q]
          const qRows = quadrantRows(q)
          return (
            <div key={q} style={{
              background: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: '10px',
              padding: '12px', minHeight: '120px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '2px' }}>
                {cfg.label}
              </div>
              <div style={{ fontSize: '9px', color: '#888', marginBottom: '10px' }}>{cfg.description}</div>

              {qRows.length === 0 && (
                <div style={{ fontSize: '11px', color: '#bbb', fontStyle: 'italic' }}>No items</div>
              )}

              {qRows.map(row => (
                <div key={row.issue_title} style={{
                  background: '#fff', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px',
                  border: row.quadrant_source === 'consultant' ? '1.5px dashed #b8860b' : '1px solid #e0e0e0',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#1a1a1a', marginBottom: '3px', lineHeight: 1.3 }}>
                    {row.issue_title.length > 60 ? row.issue_title.slice(0, 57) + '...' : row.issue_title}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#888', marginBottom: '4px', flexWrap: 'wrap' }}>
                    {row.loss_addressed > 0 && <span>{fmtK(row.loss_addressed)}/mo</span>}
                    {row.constraint_note && <span style={{ color: '#0F6E56' }}>{row.constraint_note}</span>}
                    <span>{(row.impact_score * 100).toFixed(0)}% impact</span>
                    <span>C:{row.complexity_score}/10</span>
                    <span>{row.org_level}</span>
                  </div>

                  {row.quadrant_source === 'consultant' && row.override_reason && (
                    <div style={{ fontSize: '10px', color: '#b8860b', fontStyle: 'italic', marginBottom: '4px' }}>
                      * {row.override_reason}
                    </div>
                  )}

                  {/* Override dropdown — admin only */}
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                      <select
                        value={row.quadrant}
                        onChange={e => handleQuadrantChange(row.issue_title, row.quadrant, e.target.value as Quadrant)}
                        disabled={saving === row.issue_title}
                        style={{
                          fontSize: '10px', padding: '2px 4px', borderRadius: '4px',
                          border: '1px solid #d1d5db', background: '#fff', color: '#555',
                        }}
                      >
                        {QUADRANTS.map(opt => (
                          <option key={opt} value={opt}>{QUADRANT_CONFIG[opt].label}</option>
                        ))}
                      </select>
                      {saving === row.issue_title && <span style={{ fontSize: '9px', color: '#888' }}>saving...</span>}
                    </div>
                  )}

                  {/* Reason input — shown after quadrant change */}
                  {editingReason === row.issue_title && (
                    <div style={{ marginTop: '6px' }}>
                      <input
                        value={reasonText}
                        onChange={e => setReasonText(e.target.value)}
                        placeholder="Why this override?"
                        style={{ width: '100%', fontSize: '10px', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                      />
                      <button
                        onClick={() => handleSaveReason(row.issue_title)}
                        style={{ marginTop: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #0F6E56', background: '#e8f5ee', color: '#0F6E56', cursor: 'pointer' }}
                      >
                        Save reason
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#888' }}>
        <span>Do First: {fmtK(rows.filter(r => r.quadrant === 'DO_FIRST').reduce((s, r) => s + r.loss_addressed, 0))}/mo</span>
        <span>Plan: {fmtK(rows.filter(r => r.quadrant === 'PLAN_CAREFULLY').reduce((s, r) => s + r.loss_addressed, 0))}/mo</span>
        <span>Quick Wins: {fmtK(rows.filter(r => r.quadrant === 'QUICK_WIN').reduce((s, r) => s + r.loss_addressed, 0))}/mo</span>
        <span>Total: {fmtK(matrix.total_loss)}/mo</span>
      </div>
    </div>
  )
}
