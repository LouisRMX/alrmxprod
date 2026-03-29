'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function DeleteButton({ assessmentId, plantName }: { assessmentId: string; plantName: string }) {
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const canDelete = typed.toLowerCase() === plantName.toLowerCase()

  async function handleDelete() {
    if (!canDelete) return
    setDeleting(true)
    const { error } = await supabase
      .from('assessments')
      .delete()
      .eq('id', assessmentId)

    if (error) {
      console.error('Delete error:', error)
      setDeleteError('Failed to delete — please try again.')
      setDeleting(false)
      return
    }

    router.refresh()
  }

  if (confirming) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.4)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}
        onClick={() => { if (!deleting) { setConfirming(false); setTyped('') } }}
      >
        <div
          style={{
            background: '#fff', borderRadius: '12px', padding: '28px',
            width: '100%', maxWidth: '400px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--gray-900)', marginBottom: '8px' }}>
            Delete assessment
          </div>
          <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '16px', lineHeight: '1.5' }}>
            This will permanently delete this assessment, its report, and all action items. This cannot be undone.
          </p>
          <p style={{ fontSize: '13px', color: 'var(--gray-600)', marginBottom: '12px' }}>
            Type <strong style={{ color: 'var(--red)' }}>{plantName}</strong> to confirm:
          </p>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={plantName}
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
              borderRadius: '8px', fontSize: '14px', fontFamily: 'var(--font)',
              outline: 'none', marginBottom: '16px', color: 'var(--gray-900)'
            }}
          />
          {deleteError && (
            <div style={{
              background: 'var(--error-bg)', border: '1px solid var(--error-border)',
              borderRadius: '8px', padding: '8px 12px', marginBottom: '12px',
              fontSize: '12px', color: 'var(--red)'
            }}>
              {deleteError}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setConfirming(false); setTyped('') }}
              disabled={deleting}
              style={{
                fontSize: '13px', color: 'var(--gray-600)', background: 'none',
                border: '1px solid var(--border)', borderRadius: '8px',
                padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--font)'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              style={{
                fontSize: '13px', color: '#fff',
                background: canDelete ? 'var(--red)' : '#e0a8a4',
                border: 'none', borderRadius: '8px', padding: '8px 16px',
                cursor: canDelete && !deleting ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font)', fontWeight: '500',
                transition: 'background .15s'
              }}
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      style={{
        fontSize: '11px', color: 'var(--gray-400)', background: 'none',
        border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
        padding: '4px 6px', borderRadius: '4px', transition: 'color .15s'
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--gray-400)')}
    >
      Delete
    </button>
  )
}
