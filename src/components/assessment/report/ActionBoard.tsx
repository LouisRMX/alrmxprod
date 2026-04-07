'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActionItem {
  id: string
  assessment_id: string
  text: string
  status: 'todo' | 'in_progress' | 'done'
  assignee_id: string | null
  assignee?: { full_name: string | null; email: string } | null
  source: 'ai' | 'manual'
  value: string | null
  dimension?: string | null
  created_at: string
}

interface BoardMember {
  user_id: string
  role: string
  profile: { full_name: string | null; email: string } | null
}

interface ActionBoardProps {
  assessmentId: string
  customerId: string
  focusActions: string[]
  focusActionLosses?: number[]
  focusActionDimensions?: (string | null)[]
  focusActionFormulas?: (string | null)[]
  canEdit: boolean
  financialBottleneck?: string | null
  recoverable?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLUMNS: { key: ActionItem['status']; label: string }[] = [
  { key: 'todo',        label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done',        label: 'Done' },
]

function initials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

// ── Mock data for demo ────────────────────────────────────────────────────────

function makeDemoItems(focusActions: string[]): ActionItem[] {
  return focusActions.filter(Boolean).map((text, i) => ({
    id: `demo-${i}`,
    assessment_id: 'demo',
    text,
    status: 'todo',
    assignee_id: null,
    assignee: null,
    source: 'ai',
    value: null,
    created_at: new Date().toISOString(),
  }))
}

const DEMO_MEMBERS: BoardMember[] = [
  { user_id: 'dm1', role: 'manager', profile: { full_name: 'Ahmed Al-Rashid', email: 'ahmed@example.com' } },
  { user_id: 'dm2', role: 'owner',   profile: { full_name: 'Sarah Hassan', email: 'sarah@example.com' } },
]

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--gray-900)', color: '#fff',
      padding: '9px 18px', borderRadius: '8px',
      fontSize: '13px', fontWeight: 500, zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {message}
    </div>
  )
}

// ── Card Detail Modal ─────────────────────────────────────────────────────────

const STATUS_COLOR: Record<ActionItem['status'], string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  done: 'var(--green)',
}

function CardDetailModal({
  item,
  members,
  canEdit,
  onClose,
  onEdit,
  onSaveNotes,
  onAssign,
  onMove,
  onDelete,
}: {
  item: ActionItem
  members: BoardMember[]
  canEdit: boolean
  onClose: () => void
  onEdit: (id: string, text: string) => void
  onSaveNotes: (id: string, value: string) => void
  onAssign: (id: string, userId: string | null) => void
  onMove: (id: string, status: ActionItem['status']) => void
  onDelete: (id: string) => void
}) {
  const [titleDraft, setTitleDraft] = useState(item.text)
  const [editingTitle, setEditingTitle] = useState(false)
  const [notesDraft, setNotesDraft] = useState(item.value ?? '')
  const [showAssignee, setShowAssignee] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLTextAreaElement>(null)
  const assigneeDropdownRef = useRef<HTMLDivElement>(null)

  // Keep notesDraft in sync if item.value changes externally
  const prevItemId = useRef(item.id)
  useEffect(() => {
    if (prevItemId.current !== item.id) {
      setNotesDraft(item.value ?? '')
      setTitleDraft(item.text)
      prevItemId.current = item.id
    }
  }, [item.id, item.value, item.text])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  // Escape key to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Close assignee dropdown on outside click
  useEffect(() => {
    if (!showAssignee) return
    function handleClick(e: MouseEvent) {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) {
        setShowAssignee(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAssignee])

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === backdropRef.current) onClose()
  }

  function commitTitle() {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== item.text) onEdit(item.id, trimmed)
    else setTitleDraft(item.text)
    setEditingTitle(false)
  }

  function handleNotesBlur() {
    if (notesDraft !== (item.value ?? '')) onSaveNotes(item.id, notesDraft)
  }

  function handleSave() {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== item.text) onEdit(item.id, trimmed)
    if (notesDraft !== (item.value ?? '')) onSaveNotes(item.id, notesDraft)
    setEditingTitle(false)
    onClose()
  }

  const assignee = item.assignee
  const assigneeLabel = assignee?.full_name || assignee?.email || null

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '16px', overflowY: 'auto',
        fontFamily: 'var(--font)',
      }}
    >
      <div style={{
        background: 'var(--white)', borderRadius: '12px',
        width: '100%', maxWidth: '540px',
        maxHeight: 'calc(100vh - 64px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.24)',
        position: 'relative',
        padding: '24px',
        overflowY: 'auto',
      }}>
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute', top: '14px', right: '14px',
            width: '28px', height: '28px', borderRadius: '50%',
            background: 'var(--gray-100)', border: 'none', cursor: 'pointer',
            fontSize: '18px', color: 'var(--gray-500)', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font)',
          }}
        >
          ×
        </button>

        {/* AI badge */}
        {item.source === 'ai' && (
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px',
            color: 'var(--phase-workshop)', background: 'var(--phase-workshop-bg)',
            padding: '2px 6px', borderRadius: '3px',
            display: 'inline-block', marginBottom: '10px',
          }}>
            AI
          </span>
        )}

        {/* Title */}
        {editingTitle ? (
          <textarea
            ref={titleInputRef}
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTitle() }
              if (e.key === 'Escape') { setTitleDraft(item.text); setEditingTitle(false) }
            }}
            style={{
              width: '100%', fontSize: '16px', fontWeight: 600, lineHeight: 1.4,
              border: '1px solid var(--green)', borderRadius: '6px',
              padding: '6px 8px', fontFamily: 'var(--font)',
              resize: 'none', outline: 'none',
              color: 'var(--gray-900)', marginBottom: '18px',
            }}
            rows={2}
          />
        ) : (
          <h2
            onClick={() => canEdit && setEditingTitle(true)}
            title={canEdit ? 'Click to edit' : undefined}
            style={{
              fontSize: '16px', fontWeight: 600, lineHeight: 1.4,
              color: 'var(--gray-900)', margin: '0 0 18px 0',
              cursor: canEdit ? 'text' : 'default',
              paddingRight: '32px',
            }}
          >
            {item.text}
          </h2>
        )}

        {/* Body: Description + Sidebar */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

          {/* Left: Description */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: 'var(--gray-500)', marginBottom: '6px',
            }}>
              Description
            </div>
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder={canEdit ? 'Add a description...' : 'No description.'}
              readOnly={!canEdit}
              style={{
                width: '100%', minHeight: '110px', fontSize: '13px', lineHeight: 1.6,
                border: '1px solid var(--border)', borderRadius: '7px',
                padding: '8px 10px', fontFamily: 'var(--font)',
                resize: 'vertical', outline: 'none',
                color: 'var(--gray-900)',
                background: canEdit ? 'var(--white)' : 'var(--gray-50)',
              }}
            />
          </div>

          {/* Right: Status + Assignee */}
          <div style={{ width: '148px', flexShrink: 0 }}>

            {/* Status */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{
                fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.5px', color: 'var(--gray-500)', marginBottom: '6px',
              }}>
                Status
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {COLUMNS.map(col => (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => canEdit && onMove(item.id, col.key)}
                    style={{
                      padding: '6px 10px', fontSize: '12px', fontWeight: 500,
                      border: '1.5px solid',
                      borderColor: item.status === col.key ? STATUS_COLOR[col.key] : 'var(--border)',
                      borderRadius: '6px',
                      background: item.status === col.key ? STATUS_COLOR[col.key] : 'transparent',
                      color: item.status === col.key ? '#fff' : 'var(--gray-600)',
                      cursor: canEdit ? 'pointer' : 'default',
                      fontFamily: 'var(--font)', textAlign: 'left',
                      transition: 'background 0.1s, border-color 0.1s',
                    }}
                  >
                    {col.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee */}
            <div>
              <div style={{
                fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.5px', color: 'var(--gray-500)', marginBottom: '6px',
              }}>
                Assignee
              </div>
              <div ref={assigneeDropdownRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => canEdit && setShowAssignee(p => !p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    width: '100%', padding: '7px 9px',
                    background: 'var(--gray-50)', border: '1px solid var(--border)',
                    borderRadius: '7px', cursor: canEdit ? 'pointer' : 'default',
                    fontFamily: 'var(--font)',
                  }}
                >
                  {assigneeLabel ? (
                    <>
                      <span style={{
                        width: '20px', height: '20px', borderRadius: '50%',
                        background: 'var(--green)', color: '#fff',
                        fontSize: '9px', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {initials(assignee?.full_name, assignee?.email ?? '')}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--gray-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {assigneeLabel}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                      {canEdit ? 'Assign...' : 'Unassigned'}
                    </span>
                  )}
                </button>

                {showAssignee && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: 'var(--white)', border: '1px solid var(--border)',
                    borderRadius: '8px', padding: '4px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    marginTop: '4px',
                  }}>
                    <button
                      type="button"
                      onClick={() => { onAssign(item.id, null); setShowAssignee(false) }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '7px 10px', fontSize: '12px', color: 'var(--gray-500)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--font)', borderRadius: '5px',
                      }}
                    >
                      Unassign
                    </button>
                    {members.map(m => (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => { onAssign(item.id, m.user_id); setShowAssignee(false) }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '7px 10px', fontSize: '12px', color: 'var(--gray-900)',
                          background: item.assignee_id === m.user_id ? 'var(--green-pale)' : 'none',
                          border: 'none', cursor: 'pointer',
                          fontFamily: 'var(--font)', borderRadius: '5px',
                        }}
                      >
                        {m.profile?.full_name || m.profile?.email}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer: save + delete */}
        {canEdit && (
          <div style={{
            marginTop: '20px', paddingTop: '16px',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <button
              type="button"
              onClick={() => { onDelete(item.id); onClose() }}
              style={{
                padding: '6px 14px', fontSize: '12px', fontWeight: 500,
                color: 'var(--red)', background: 'none',
                border: '1px solid var(--red)', borderRadius: '6px',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Delete task
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '6px 16px', fontSize: '12px', fontWeight: 600,
                color: '#fff', background: 'var(--green)',
                border: 'none', borderRadius: '6px',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

function TaskCard({
  item,
  canEdit,
  isDragging,
  onDragStart,
  onDragEnd,
  onDelete,
  onOpenModal,
}: {
  item: ActionItem
  canEdit: boolean
  isDragging: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDelete: (id: string) => void
  onOpenModal: () => void
}) {
  const assignee = item.assignee
  const assigneeLabel = assignee?.full_name || assignee?.email || null
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)

  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); onDragStart(item.id) }}
      onDragEnd={onDragEnd}
      onMouseDown={(e) => { mouseDownPos.current = { x: e.clientX, y: e.clientY } }}
      onMouseUp={(e) => {
        if (!mouseDownPos.current) return
        const dx = Math.abs(e.clientX - mouseDownPos.current.x)
        const dy = Math.abs(e.clientY - mouseDownPos.current.y)
        mouseDownPos.current = null
        if (dx < 6 && dy < 6) onOpenModal()
      }}
      style={{
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '10px 12px',
        marginBottom: '8px',
        position: 'relative',
        opacity: isDragging ? 0.4 : 1,
        cursor: canEdit ? 'grab' : 'pointer',
        transition: 'opacity 0.15s, box-shadow 0.12s',
        userSelect: 'none',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Top row: source badge */}
      {item.source === 'ai' && (
        <div style={{ marginBottom: '5px' }}>
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px',
            color: 'var(--phase-workshop)', background: 'var(--phase-workshop-bg)',
            padding: '1px 5px', borderRadius: '3px',
          }}>
            AI
          </span>
        </div>
      )}

      {/* Text */}
      <div style={{
        fontSize: '13px', lineHeight: 1.5, color: 'var(--gray-900)',
        wordBreak: 'break-word',
      }}>
        {item.text}
      </div>

      {/* Inline subtitle: first line of description */}
      {item.value && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
          {item.value.split('\n')[0].slice(0, 90)}{item.value.split('\n')[0].length > 90 ? '…' : ''}
        </div>
      )}

      {/* Footer: assignee chip (read-only) + delete */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', gap: '6px' }}>
        {assigneeLabel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: 'var(--green)', color: '#fff',
              fontSize: '9px', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {initials(assignee?.full_name, assignee?.email ?? '')}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--gray-700)' }}>{assigneeLabel}</span>
          </div>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--gray-300)', fontStyle: 'italic' }}>
            {canEdit ? 'Click to open' : 'Unassigned'}
          </span>
        )}

        {canEdit && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => { e.stopPropagation(); onDelete(item.id) }}
            title="Delete"
            style={{ ...iconBtnStyle, color: 'var(--red)', flexShrink: 0 }}
          >×</button>
        )}
      </div>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: '22px', height: '22px',
  background: 'var(--gray-100)', border: 'none', borderRadius: '4px',
  cursor: 'pointer', fontSize: '13px', color: 'var(--gray-500)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font)', lineHeight: 1,
}

// ── Main ActionBoard ──────────────────────────────────────────────────────────

export default function ActionBoard({ assessmentId, customerId, focusActions, focusActionLosses, focusActionDimensions, focusActionFormulas, canEdit, financialBottleneck, recoverable }: ActionBoardProps) {
  const isDemo = assessmentId === 'demo'

  const [items, setItems] = useState<ActionItem[]>([])
  const [members, setMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [addingText, setAddingText] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<ActionItem['status'] | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  const selectedItem = selectedItemId ? (items.find(i => i.id === selectedItemId) ?? null) : null

  const dimMap = useMemo(() => {
    const m: Record<string, string | null> = {}
    focusActions.forEach((text, i) => { m[text] = focusActionDimensions?.[i] ?? null })
    return m
  }, [focusActions, focusActionDimensions])

  const formulaMap = useMemo(() => {
    const m: Record<string, string | null> = {}
    focusActions.forEach((text, i) => { m[text] = focusActionFormulas?.[i] ?? null })
    return m
  }, [focusActions, focusActionFormulas])

  useEffect(() => {
    if (showAdd) addInputRef.current?.focus()
  }, [showAdd])

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isDemo) {
      setMembers(DEMO_MEMBERS)
      setItems(makeDemoItems(focusActions))
      setLoading(false)
      return
    }

    async function load() {
      const resp = await fetch(`/api/action-items?assessmentId=${encodeURIComponent(assessmentId)}&customerId=${encodeURIComponent(customerId)}`)
      if (!resp.ok) { setLoading(false); return }
      const { items: itemData, members: memberData } = await resp.json()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalizedMembers: BoardMember[] = (memberData ?? []).map((m: any) => ({
        ...m,
        profile: Array.isArray(m.profile) ? m.profile[0] ?? null : m.profile,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalizedItems: ActionItem[] = (itemData ?? []).map((row: any) => {
        const member = normalizedMembers.find((m: BoardMember) => m.user_id === row.assignee_id)
        return {
          ...row,
          source: (row.source ?? 'manual') as 'ai' | 'manual',
          value: row.value ?? null,
          assignee: member?.profile ?? null,
        }
      })

      setMembers(normalizedMembers)

      // AI pre-population: if no items yet and focusActions available
      if (normalizedItems.length === 0 && focusActions.filter(Boolean).length > 0) {
        const toInsert = focusActions.filter(Boolean).map(text => ({
          assessment_id: assessmentId,
          text,
          status: 'todo' as const,
          source: 'ai' as const,
          dimension: dimMap[text] ?? null,
        }))
        const insertResp = await fetch('/api/action-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: toInsert }),
        })
        if (insertResp.ok) {
          const { items: inserted } = await insertResp.json()
          if (inserted) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setItems(inserted.map((row: any) => ({
              ...row,
              source: (row.source ?? 'ai') as 'ai' | 'manual',
              value: row.value ?? null,
              assignee: null,
            })))
            setToast('Tasks created from report findings')
          }
        }
      } else {
        setItems(normalizedItems)
      }

      setLoading(false)
    }

    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId, customerId])

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async function addItem() {
    const text = addingText.trim()
    if (!text) return
    setAddingText('')
    setShowAdd(false)

    if (isDemo) {
      const newItem: ActionItem = {
        id: `demo-${Date.now()}`,
        assessment_id: 'demo',
        text,
        status: 'todo',
        assignee_id: null,
        assignee: null,
        source: 'manual',
        value: null,
        created_at: new Date().toISOString(),
      }
      setItems(prev => [...prev, newItem])
      return
    }

    const resp = await fetch('/api/action-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessment_id: assessmentId, text, status: 'todo' }),
    })
    if (resp.ok) {
      const { item } = await resp.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = item as any
      setItems(prev => [...prev, {
        ...row,
        source: (row.source ?? 'manual') as 'ai' | 'manual',
        value: row.value ?? null,
        assignee: null,
      }])
    } else {
      // Optimistic fallback
      setItems(prev => [...prev, {
        id: `optimistic-${Date.now()}`,
        assessment_id: assessmentId,
        text,
        status: 'todo' as const,
        assignee_id: null,
        assignee: null,
        source: 'manual' as const,
        value: null,
        created_at: new Date().toISOString(),
      }])
    }
  }

  async function moveItem(id: string, targetStatus: ActionItem['status']) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: targetStatus } : i))
    if (!isDemo) {
      await fetch('/api/action-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: targetStatus }),
      })
    }
  }

  async function assignItem(id: string, userId: string | null) {
    const member = userId ? members.find(m => m.user_id === userId) : null
    setItems(prev => prev.map(i => i.id === id ? {
      ...i,
      assignee_id: userId,
      assignee: member?.profile ?? null,
    } : i))
    if (!isDemo) {
      await fetch('/api/action-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, assignee_id: userId }),
      })
    }
  }

  async function editItem(id: string, text: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, text } : i))
    if (!isDemo) {
      await fetch('/api/action-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text }),
      })
    }
  }

  async function saveNotes(id: string, value: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, value } : i))
    if (!isDemo) {
      await fetch('/api/action-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value }),
      })
    }
  }

  async function deleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    if (!isDemo) {
      await fetch('/api/action-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--gray-300)', fontSize: '13px' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'var(--font)' }}>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {selectedItem && (
        <CardDetailModal
          item={selectedItem}
          members={members}
          canEdit={canEdit}
          onClose={() => setSelectedItemId(null)}
          onEdit={editItem}
          onSaveNotes={saveNotes}
          onAssign={assignItem}
          onMove={moveItem}
          onDelete={deleteItem}
        />
      )}

      {/* Board header */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: '8px' }}>
          This Week
        </div>

        {/* Bottleneck bridge line */}
        {financialBottleneck && recoverable && recoverable > 0 && (
          <div style={{
            background: 'var(--white)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--green)',
            borderRadius: '7px',
            padding: '9px 12px',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-900)', marginBottom: '2px' }}>
              Primary constraint: {financialBottleneck === 'Fleet' ? 'Logistics' : financialBottleneck}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              Fixing this recovers ~${Math.round(recoverable / 1000)}k/month
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {COLUMNS.map(col => {
          const colItems = items.filter(i => i.status === col.key)
          const isOver = dragOverCol === col.key && dragId !== null
          return (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); if (dragId) setDragOverCol(col.key) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                if (id) moveItem(id, col.key)
                setDragOverCol(null)
                setDragId(null)
              }}
            >
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '8px',
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {col.label}
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: 600,
                  color: col.key === 'done' ? 'var(--phase-complete)' : 'var(--gray-300)',
                  background: col.key === 'done' ? 'var(--phase-complete-bg)' : 'var(--gray-100)',
                  padding: '1px 7px', borderRadius: '10px',
                }}>
                  {colItems.length}
                </span>
              </div>

              {/* Drop zone / cards */}
              <div style={{
                minHeight: '48px',
                borderRadius: '8px',
                border: isOver ? '2px dashed var(--green)' : '2px solid transparent',
                background: isOver ? 'var(--green-pale)' : 'transparent',
                transition: 'border-color 0.1s, background 0.1s',
                padding: isOver ? '4px' : '0',
              }}>
                {colItems.length === 0 && !isOver ? (
                  <div style={{
                    border: '1px dashed var(--border)', borderRadius: '8px',
                    padding: '16px', textAlign: 'center',
                    fontSize: '12px', color: 'var(--gray-300)',
                  }}>
                    Empty
                  </div>
                ) : (
                  colItems.map(item => (
                    <TaskCard
                      key={item.id}
                      item={item}
                      canEdit={canEdit}
                      isDragging={dragId === item.id}
                      onDragStart={setDragId}
                      onDragEnd={() => { setDragId(null); setDragOverCol(null) }}
                      onDelete={deleteItem}
                      onOpenModal={() => setSelectedItemId(item.id)}
                    />
                  ))
                )}
              </div>

              {/* Add task, only on To Do column */}
              {col.key === 'todo' && canEdit && (
                <div style={{ marginTop: '6px' }}>
                  {showAdd ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        ref={addInputRef}
                        value={addingText}
                        onChange={e => setAddingText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') { setShowAdd(false); setAddingText('') } }}
                        placeholder="Task description..."
                        style={{
                          flex: 1, fontSize: '13px', padding: '7px 10px',
                          border: '1px solid var(--green)', borderRadius: '7px',
                          fontFamily: 'var(--font)', outline: 'none',
                          color: 'var(--gray-900)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={addItem}
                        style={{
                          padding: '7px 12px', background: 'var(--green)', color: '#fff',
                          border: 'none', borderRadius: '7px', fontSize: '13px',
                          cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600,
                        }}
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      style={{
                        width: '100%', padding: '7px', background: 'none',
                        border: '1px dashed var(--border)', borderRadius: '7px',
                        fontSize: '12px', color: 'var(--gray-500)', cursor: 'pointer',
                        fontFamily: 'var(--font)',
                      }}
                    >
                      + Add task
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
