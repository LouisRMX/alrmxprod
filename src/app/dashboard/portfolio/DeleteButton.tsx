'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function DeleteButton({ assessmentId }: { assessmentId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function handleDelete() {
    setDeleting(true)
    const { error } = await supabase
      .from('assessments')
      .delete()
      .eq('id', assessmentId)

    if (error) {
      console.error('Delete error:', error)
      setDeleting(false)
      setConfirming(false)
      return
    }

    router.refresh()
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            fontSize: '11px', color: '#fff', background: '#C0392B',
            border: 'none', borderRadius: '4px', padding: '4px 8px',
            cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font)',
            opacity: deleting ? 0.6 : 1
          }}
        >
          {deleting ? 'Deleting…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          style={{
            fontSize: '11px', color: 'var(--gray-500)', background: 'none',
            border: '1px solid var(--border)', borderRadius: '4px',
            padding: '4px 8px', cursor: 'pointer', fontFamily: 'var(--font)'
          }}
        >
          Cancel
        </button>
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
      onMouseEnter={e => (e.currentTarget.style.color = '#C0392B')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--gray-400)')}
    >
      Delete
    </button>
  )
}
