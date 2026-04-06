'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActionItem {
  id: string
  assessment_id: string
  text: string
  status: 'todo' | 'in_progress' | 'done'
  assignee_id: string | null
  assignee?: { full_name: string | null; email: string } | null
  source: 'ai' | 'manual'
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
  canEdit: boolean
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

function nextStatus(s: ActionItem['status']): ActionItem['status'] {
  return s === 'todo' ? 'in_progress' : 'done'
}
function prevStatus(s: ActionItem['status']): ActionItem['status'] {
  return s === 'done' ? 'in_progress' : 'todo'
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

// ── Card ──────────────────────────────────────────────────────────────────────

function TaskCard({
  item,
  members,
  canEdit,
  onMove,
  onAssign,
  onEdit,
  onDelete,
}: {
  item: ActionItem
  members: BoardMember[]
  canEdit: boolean
  onMove: (id: string, dir: 'forward' | 'back') => void
  onAssign: (id: string, userId: string | null) => void
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const [showAssignee, setShowAssignee] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // Close assignee dropdown on outside click
  useEffect(() => {
    if (!showAssignee) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAssignee(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAssignee])

  function commitEdit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.text) onEdit(item.id, trimmed)
    setEditing(false)
  }

  const assignee = item.assignee
  const assigneeLabel = assignee?.full_name || assignee?.email || null

  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '10px 12px',
      marginBottom: '8px',
      position: 'relative',
    }}>
      {/* Source badge */}
      {item.source === 'ai' && (
        <span style={{
          fontSize: '10px', fontWeight: 600, letterSpacing: '0.5px',
          color: 'var(--phase-workshop)', background: 'var(--phase-workshop-bg)',
          padding: '1px 5px', borderRadius: '3px',
          display: 'inline-block', marginBottom: '5px',
        }}>
          AI
        </span>
      )}

      {/* Text */}
      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() } if (e.key === 'Escape') { setDraft(item.text); setEditing(false) } }}
          style={{
            width: '100%', fontSize: '13px', lineHeight: 1.5,
            border: '1px solid var(--green)', borderRadius: '5px',
            padding: '4px 6px', fontFamily: 'var(--font)',
            resize: 'none', outline: 'none', minHeight: '56px',
          }}
          rows={2}
        />
      ) : (
        <div
          onClick={() => canEdit && setEditing(true)}
          style={{
            fontSize: '13px', lineHeight: 1.5, color: 'var(--gray-900)',
            cursor: canEdit ? 'text' : 'default',
            wordBreak: 'break-word',
          }}
        >
          {item.text}
        </div>
      )}

      {/* Footer: assignee + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', gap: '6px' }}>
        {/* Assignee */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => canEdit && setShowAssignee(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'none', border: 'none', cursor: canEdit ? 'pointer' : 'default',
              padding: 0, fontFamily: 'var(--font)',
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
                <span style={{ fontSize: '11px', color: 'var(--gray-700)' }}>{assigneeLabel}</span>
              </>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--gray-300)', fontStyle: 'italic' }}>
                {canEdit ? 'Assign...' : 'Unassigned'}
              </span>
            )}
          </button>

          {showAssignee && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, zIndex: 100,
              background: 'var(--white)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '4px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: '180px',
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

        {/* Move + delete */}
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            {item.status !== 'todo' && (
              <button
                type="button"
                onClick={() => onMove(item.id, 'back')}
                title="Move back"
                style={iconBtnStyle}
              >←</button>
            )}
            {item.status !== 'done' && (
              <button
                type="button"
                onClick={() => onMove(item.id, 'forward')}
                title="Move forward"
                style={iconBtnStyle}
              >→</button>
            )}
            <button
              type="button"
              onClick={() => onDelete(item.id)}
              title="Delete"
              style={{ ...iconBtnStyle, color: 'var(--red)' }}
            >×</button>
          </div>
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

export default function ActionBoard({ assessmentId, customerId, focusActions, canEdit }: ActionBoardProps) {
  const isDemo = assessmentId === 'demo'
  const supabase = createClient()

  const [items, setItems] = useState<ActionItem[]>([])
  const [members, setMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [addingText, setAddingText] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showAdd) addInputRef.current?.focus()
  }, [showAdd])

  // ── Load ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isDemo) {
      setMembers(DEMO_MEMBERS)
      const seeded = makeDemoItems(focusActions)
      setItems(seeded)
      setLoading(false)
      return
    }

    async function load() {
      const [{ data: itemData }, { data: memberData }] = await Promise.all([
        supabase
          .from('action_items')
          .select('*, assignee:profiles!assignee_id(full_name, email)')
          .eq('assessment_id', assessmentId)
          .order('created_at', { ascending: true }),
        supabase
          .from('customer_members')
          .select('user_id, role, profile:profiles(full_name, email)')
          .eq('customer_id', customerId),
      ])

      const normalizedItems: ActionItem[] = (itemData ?? []).map((row: ActionItem & { assignee: unknown }) => ({
        ...row,
        assignee: Array.isArray(row.assignee) ? row.assignee[0] ?? null : row.assignee,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const normalizedMembers: BoardMember[] = (memberData ?? []).map((m: any) => ({
        ...m,
        profile: Array.isArray(m.profile) ? m.profile[0] ?? null : m.profile,
      }))

      setMembers(normalizedMembers)

      // AI pre-population: if no items yet and focusActions available
      if (normalizedItems.length === 0 && focusActions.filter(Boolean).length > 0) {
        const toInsert = focusActions.filter(Boolean).map(text => ({
          assessment_id: assessmentId,
          text,
          status: 'todo' as const,
          source: 'ai' as const,
        }))
        const { data: inserted } = await supabase
          .from('action_items')
          .insert(toInsert)
          .select('*, assignee:profiles!assignee_id(full_name, email)')
        if (inserted) {
          setItems(inserted.map((row: ActionItem & { assignee: unknown }) => ({
            ...row,
            assignee: Array.isArray(row.assignee) ? row.assignee[0] ?? null : row.assignee,
          })))
          setToast('Tasks created from report findings')
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
        created_at: new Date().toISOString(),
      }
      setItems(prev => [...prev, newItem])
      return
    }

    const { data } = await supabase
      .from('action_items')
      .insert({ assessment_id: assessmentId, text, status: 'todo', source: 'manual' })
      .select('*, assignee:profiles!assignee_id(full_name, email)')
      .single()
    if (data) {
      const row = data as ActionItem & { assignee: unknown }
      setItems(prev => [...prev, { ...row, assignee: Array.isArray(row.assignee) ? row.assignee[0] ?? null : row.assignee }])
    }
  }

  async function moveItem(id: string, dir: 'forward' | 'back') {
    const item = items.find(i => i.id === id)
    if (!item) return
    const newStatus = dir === 'forward' ? nextStatus(item.status) : prevStatus(item.status)

    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i))

    if (!isDemo) {
      await supabase.from('action_items').update({ status: newStatus }).eq('id', id)
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
      await supabase.from('action_items').update({ assignee_id: userId }).eq('id', id)
    }
  }

  async function editItem(id: string, text: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, text } : i))
    if (!isDemo) {
      await supabase.from('action_items').update({ text }).eq('id', id)
    }
  }

  async function deleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    if (!isDemo) {
      await supabase.from('action_items').delete().eq('id', id)
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

      <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: '14px' }}>
        Action Board
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {COLUMNS.map(col => {
          const colItems = items.filter(i => i.status === col.key)
          return (
            <div key={col.key}>
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

              {/* Cards */}
              {colItems.length === 0 ? (
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
                    members={members}
                    canEdit={canEdit}
                    onMove={moveItem}
                    onAssign={assignItem}
                    onEdit={editItem}
                    onDelete={deleteItem}
                  />
                ))
              )}

              {/* Add task — only on To Do column */}
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
