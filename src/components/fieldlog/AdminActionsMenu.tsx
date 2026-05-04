'use client'

/**
 * Collapses the three admin-only actions in the Field Log header
 * (Daily briefing, Helper view, Field capture tokens) into a single
 * `⋯` dropdown. Frees space in the header for the date picker and
 * locale toggle without removing any functionality.
 *
 * Admins still reach every action in one tap; the menu closes on any
 * outside click or Escape.
 */

import { useEffect, useRef, useState } from 'react'
import DailyBriefingExport from './DailyBriefingExport'
import FieldCapturePreviewButton from './FieldCapturePreviewButton'
import FieldCaptureTokenButton from './FieldCaptureTokenButton'
import OptionsSetupButton from './OptionsSetupButton'

interface Props {
  assessmentId: string
  plantId: string
}

export default function AdminActionsMenu({ assessmentId, plantId }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="More actions"
        aria-expanded={open}
        style={{
          padding: '6px 10px', minHeight: '36px', minWidth: '36px',
          background: open ? '#E1F5EE' : '#fff',
          color: open ? '#0F6E56' : '#555',
          border: `1px solid ${open ? '#0F6E56' : '#d1d5db'}`,
          borderRadius: '8px',
          fontSize: '18px', fontWeight: 600, cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', insetInlineEnd: 0,
          background: '#fff', border: '1px solid #e5e5e5',
          borderRadius: '10px', padding: '6px',
          boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          zIndex: 100, minWidth: '200px',
          display: 'flex', flexDirection: 'column', gap: '2px',
        }}>
          {/* Each child component renders its own trigger button + internal
              modal. Don't auto-close the menu on click: closing unmounts the
              child, which throws away the modal state it just set. The
              menu's outside-click handler closes things when the user
              interacts with the modal backdrop. */}
          <DailyBriefingExport assessmentId={assessmentId} />
          <OptionsSetupButton assessmentId={assessmentId} />
          <FieldCapturePreviewButton assessmentId={assessmentId} plantId={plantId} />
          <FieldCaptureTokenButton assessmentId={assessmentId} plantId={plantId} />
        </div>
      )}
    </div>
  )
}
